"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "./api";

export interface VoiceConfig {
  stt: "none" | "browser" | "openai_compatible";
  tts: "browser" | "openai_compatible";
  max_audio_mb: number;
  stt_note: string;
}

const BCP47: Record<string, string> = {
  English: "en-US", Hindi: "hi-IN", Hinglish: "en-IN", Spanish: "es-ES", French: "fr-FR", German: "de-DE",
  Portuguese: "pt-BR", Arabic: "ar-SA", Japanese: "ja-JP", Bengali: "bn-IN", Tamil: "ta-IN", Telugu: "te-IN", Marathi: "mr-IN",
};

// Minimal typing for the Web Speech API (not in TypeScript's DOM lib everywhere).
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function useVoiceConfig() {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  useEffect(() => {
    api<VoiceConfig>("/voice/config").then(setConfig).catch(() => setConfig(null));
  }, []);
  // Read browser support only on the client so server and client renders match.
  const browserSttSupported = useSyncExternalStore(
    () => () => {},
    () => !!recognitionCtor(),
    () => false,
  );
  const sttAvailable = !!config && (config.stt === "openai_compatible" || (config.stt === "browser" && browserSttSupported));
  return { config, sttAvailable, browserSttSupported };
}

export type RecState = "idle" | "recording" | "transcribing";

/**
 * Speech-to-text for answers. Recording only happens between an explicit start() and stop().
 * Server mode uploads the clip once for transcription (the server discards it); browser mode uses Web Speech.
 */
export function useDictation(config: VoiceConfig | null, language: string, onText: (text: string) => void) {
  const [state, setState] = useState<RecState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    setError("");
    if (!config || config.stt === "none") return setError("Voice answers are turned off on this server.");
    if (config.stt === "browser") {
      const Ctor = recognitionCtor();
      if (!Ctor) return setError("This browser doesn't support speech recognition. Try Chrome, Edge or Safari, or type your answer.");
      const rec = new Ctor();
      rec.lang = BCP47[language] ?? "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e) => {
        let finalText = "";
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript;
          else interimText += r[0].transcript;
        }
        if (finalText.trim()) onTextRef.current(finalText.trim());
        setInterim(interimText);
      };
      rec.onerror = (e) => {
        setError(e.error === "not-allowed" ? "Microphone permission was denied." : e.error === "no-speech" ? "No speech was detected." : `Speech recognition error: ${e.error}`);
      };
      rec.onend = () => {
        setState("idle");
        setInterim("");
      };
      recRef.current = rec;
      try {
        rec.start();
        setState("recording");
      } catch {
        setError("Couldn't start speech recognition.");
      }
      return;
    }
    // Server-side transcription
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return setError("Recording needs a secure (HTTPS) page and a modern browser.");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunks.current, { type: mr.mimeType || "audio/webm" });
        chunks.current = [];
        if (blob.size > (config.max_audio_mb ?? 10) * 1024 * 1024) {
          setState("idle");
          return setError("That recording is too long. Keep answers under about two minutes.");
        }
        setState("transcribing");
        const fd = new FormData();
        fd.append("audio", blob, `answer.${(mr.mimeType || "audio/webm").includes("mp4") ? "m4a" : (mr.mimeType || "").includes("ogg") ? "ogg" : "webm"}`);
        fd.append("language", language);
        try {
          const r = await api<{ text: string }>("/voice/transcribe", { method: "POST", body: fd });
          if (r.text) onTextRef.current(r.text);
          else setError("No speech was detected.");
        } catch (e) {
          setError(e instanceof Error ? e.message : "Transcription failed.");
        } finally {
          setState("idle");
        }
      };
      mediaRef.current = mr;
      mr.start();
      setState("recording");
    } catch (e) {
      cleanupStream();
      setError(e instanceof DOMException && e.name === "NotAllowedError" ? "Microphone permission was denied." : "Couldn't start recording.");
    }
  }, [config, language]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    mediaRef.current = null;
  }, []);

  useEffect(
    () => () => {
      recRef.current?.abort();
      if (mediaRef.current?.state === "recording") mediaRef.current.stop();
      cleanupStream();
    },
    [],
  );

  return { state, interim, error, start, stop, clearError: () => setError("") };
}

/** Speaks text with the configured TTS provider (server) or the browser's voices. */
export function useSpeaker(config: VoiceConfig | null, language: string) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const cancel = useCallback(() => {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      cancel();
      if (config?.tts === "openai_compatible") {
        try {
          const res = await fetch("/api/voice/speak", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", "X-SkillVerse-Client": "web" },
            body: JSON.stringify({ text: text.slice(0, 1500) }),
          });
          if (res.ok) {
            const url = URL.createObjectURL(await res.blob());
            const a = new Audio(url);
            audioRef.current = a;
            a.onended = () => {
              URL.revokeObjectURL(url);
              setSpeaking(false);
            };
            await a.play();
            setSpeaking(true);
            return;
          }
        } catch {
          /* fall back to the browser voice */
        }
      }
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = BCP47[language] ?? "en-US";
      // Prefer a male-sounding voice in the right language so it matches the avatar.
      const voices = window.speechSynthesis.getVoices();
      const male = /\bmale\b|david|mark|george|guy|ryan|daniel|alex|james|richard|ravi|prabhat|hemant|madhur|rishi|google uk english male/i;
      const notMale = /female/i;
      const isMale = (name: string) => male.test(name) && !notMale.test(name);
      const inLang = voices.filter((v) => v.lang.toLowerCase().startsWith(u.lang.slice(0, 2).toLowerCase()));
      const pick = inLang.find((v) => isMale(v.name)) ?? voices.find((v) => isMale(v.name));
      if (pick) u.voice = pick;
      else u.pitch = 0.75; // no male voice installed: lower the default voice so it sounds less female
      u.onstart = () => setSpeaking(true);
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    },
    [config, language, cancel],
  );

  useEffect(() => cancel, [cancel]);
  return { speak, cancel, speaking };
}
