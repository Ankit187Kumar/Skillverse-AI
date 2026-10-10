"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaError =
  | "insecure"
  | "unsupported"
  | "denied"
  | "not-found"
  | "in-use"
  | "unknown";

const MESSAGES: Record<MediaError, string> = {
  insecure: "Camera and microphone need a secure (HTTPS) connection. Open the app over HTTPS or on localhost.",
  unsupported: "This browser doesn't support camera or microphone access.",
  denied: "Permission was denied. You can allow it from your browser's site settings, or continue with text only.",
  "not-found": "No camera or microphone was found on this device.",
  "in-use": "The device is being used by another app. Close it and try again.",
  unknown: "The device couldn't be started. You can continue with text only.",
};

export const mediaErrorMessage = (e: MediaError) => MESSAGES[e];

function classify(err: unknown): MediaError {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "in-use";
  return "unknown";
}

/**
 * Camera + microphone, only ever started by an explicit user action.
 * Nothing is recorded or uploaded: the stream is shown locally and a mic level meter is computed in the browser.
 */
export function useMedia() {
  const [camera, setCamera] = useState<MediaStream | null>(null);
  const [mic, setMic] = useState<MediaStream | null>(null);
  const [error, setError] = useState<MediaError | null>(null);
  const [level, setLevel] = useState(0);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef<number | null>(null);

  const check = (): MediaError | null => {
    if (typeof window === "undefined") return "unsupported";
    if (!window.isSecureContext) return "insecure";
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    return null;
  };

  const stopMeter = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setLevel(0);
  };

  const startMeter = (stream: MediaStream) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      audioCtx.current = ctx;
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += ((v - 128) / 128) ** 2;
        setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      /* level meter is optional */
    }
  };

  const enableCamera = useCallback(async () => {
    const pre = check();
    if (pre) return setError(pre);
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      setError(null);
      setCamera(s);
    } catch (e) {
      setError(classify(e));
    }
  }, []);

  const disableCamera = useCallback(() => {
    setCamera((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const enableMic = useCallback(async () => {
    const pre = check();
    if (pre) return setError(pre);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      setError(null);
      setMic(s);
      startMeter(s);
    } catch (e) {
      setError(classify(e));
    }
  }, []);

  const disableMic = useCallback(() => {
    stopMeter();
    setMic((s) => {
      s?.getTracks().forEach((t) => t.stop());
      return null;
    });
  }, []);

  const stopAll = useCallback(() => {
    disableCamera();
    disableMic();
  }, [disableCamera, disableMic]);

  // Release devices when leaving the page.
  const latest = useRef({ camera, mic });
  useEffect(() => {
    latest.current = { camera, mic };
  }, [camera, mic]);
  useEffect(
    () => () => {
      latest.current.camera?.getTracks().forEach((t) => t.stop());
      latest.current.mic?.getTracks().forEach((t) => t.stop());
      if (raf.current) cancelAnimationFrame(raf.current);
      audioCtx.current?.close().catch(() => {});
    },
    [],
  );

  return { camera, mic, error, level, enableCamera, disableCamera, enableMic, disableMic, stopAll, clearError: () => setError(null) };
}
