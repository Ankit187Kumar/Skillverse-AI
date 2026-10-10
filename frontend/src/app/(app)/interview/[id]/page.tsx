"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  Lock,
  Mic,
  MicOff,
  Pause,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/field";
import { INTERVIEWER_NAME, InterviewerAvatar } from "@/components/interviewer-avatar";
import { AIThinking, Badge, ErrorState, ProgressBar, Skeleton, Tooltip } from "@/components/ui/feedback";
import { api, ApiError, errorMessage } from "@/lib/api";
import type { Interview, Turn } from "@/lib/types";
import { mediaErrorMessage, useMedia } from "@/lib/use-media";
import { useDictation, useSpeaker, useVoiceConfig } from "@/lib/use-voice";
import { cn, formatDuration } from "@/lib/utils";

type Phase = "answering" | "thinking" | "retry" | "done" | "ending";


export default function InterviewRoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const media = useMedia();
  const voice = useVoiceConfig();

  const [iv, setIv] = useState<Interview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [joined, setJoined] = useState(false);
  const [phase, setPhase] = useState<Phase>("answering");
  const [actionError, setActionError] = useState("");
  const [draft, setDraft] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speak, setSpeak] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const spokenId = useRef<number | null>(null);

  const fetchInterview = useCallback(
    () =>
      api<Interview>(`/interviews/${id}`)
        .then((data) => {
          if (data.status === "completed") {
            router.replace(`/interview/${id}/report`);
            return;
          }
          setIv(data);
          setSpeak(true); // The interviewer reads each question aloud; the speaker button turns it off
          setElapsed(data.elapsed_seconds);
          const last = data.turns.at(-1);
          if (last?.role === "candidate") setPhase(data.questions_asked >= data.target_questions ? "done" : "retry");
        })
        .catch((e) => setLoadError(errorMessage(e))),
    [id, router],
  );
  useEffect(() => {
    fetchInterview();
  }, [fetchInterview]);
  const load = () => {
    setLoadError("");
    fetchInterview();
  };

  // Timer: runs only while joined, not paused and the interview is active.
  const running = joined && !paused && (phase === "answering" || phase === "thinking" || phase === "retry");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Attach the camera stream to the <video> element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = media.camera;
  }, [media.camera, joined]);

  const turns = useMemo(() => iv?.turns ?? [], [iv]);
  const lastTurn = turns.at(-1);
  const currentQuestion = lastTurn?.role === "interviewer" ? lastTurn : null;
  const questionNumber = iv ? Math.min(iv.questions_asked, iv.target_questions) : 0;
  const durationSec = (iv?.config.duration_minutes ?? 15) * 60;
  const overTime = elapsed > durationSec;

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [turns.length, phase]);

  const language = iv?.config.language ?? "English";
  const voiceMode = iv?.config.mode === "voice";
  const speaker = useSpeaker(voice.config, language);
  const appendDictation = useCallback((text: string) => setDraft((d) => (d ? `${d.trimEnd()} ${text}` : text)), []);
  const dictation = useDictation(voice.config, language, appendDictation);

  const stopDictation = dictation.stop;
  useEffect(() => {
    if (paused) stopDictation();
  }, [paused, stopDictation]);

  // Read each new question aloud (configured TTS provider or the browser's voice).
  useEffect(() => {
    if (!speak || !joined || !currentQuestion || spokenId.current === currentQuestion.id) return;
    spokenId.current = currentQuestion.id;
    speaker.speak(currentQuestion.content);
  }, [speak, joined, currentQuestion, speaker]);

  const submitAnswer = async () => {
    const answer = draft.trim();
    if (!iv || !answer || phase !== "answering" || paused) return;
    setActionError("");
    setPhase("thinking");
    const optimistic: Turn = { id: -Date.now(), role: "candidate", kind: "answer", content: answer, created_at: new Date().toISOString() };
    setIv({ ...iv, turns: [...iv.turns, optimistic] });
    setDraft("");
    try {
      const res = await api<{ interview: Interview; done: boolean }>(`/interviews/${iv.id}/answer`, {
        method: "POST",
        body: { answer, elapsed_seconds: elapsed },
      });
      setIv(res.interview);
      setPhase(res.done ? "done" : "answering");
    } catch (e) {
      // Was the answer saved before the failure? Re-read the interview to find out.
      let saved = false;
      try {
        const fresh = await api<Interview>(`/interviews/${iv.id}`);
        setIv(fresh);
        const last = fresh.turns.at(-1);
        saved = last?.role === "candidate" && last.content === answer;
      } catch {
        setIv(iv);
      }
      if (saved) {
        setPhase("retry");
        setActionError(
          e instanceof ApiError && e.isAIUnavailable
            ? `Your answer is saved, but the AI couldn't write the next question. ${e.message}`
            : `Your answer is saved, but the next question failed to load. ${errorMessage(e)}`,
        );
      } else {
        setDraft(answer);
        setPhase("answering");
        setActionError(errorMessage(e));
      }
    }
  };

  const retryNext = async () => {
    if (!iv) return;
    setActionError("");
    setPhase("thinking");
    try {
      const fresh = await api<Interview>(`/interviews/${iv.id}/next`, { method: "POST" });
      setIv(fresh);
      setPhase("answering");
    } catch (e) {
      setPhase("retry");
      setActionError(errorMessage(e));
    }
  };

  const endInterview = async () => {
    if (!iv) return;
    if (phase !== "done" && !confirm("End the interview now? Unanswered questions won't be scored, and you'll get a report on what you've answered so far.")) return;
    setActionError("");
    setPhase("ending");
    speaker.cancel();
    dictation.stop();
    media.stopAll();
    try {
      await api(`/interviews/${iv.id}/end`, { method: "POST", body: { elapsed_seconds: elapsed } });
      router.push(`/interview/${iv.id}/report`);
    } catch (e) {
      setPhase(turns.at(-1)?.role === "candidate" && iv.questions_asked >= iv.target_questions ? "done" : "answering");
      setActionError(errorMessage(e));
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <ErrorState message={loadError} onRetry={load} />
        <Link href="/interview" className="text-sm font-semibold text-purple dark:text-[#c4b5fd]">
          ← Back to interviews
        </Link>
      </div>
    );
  }
  if (!iv) {
    return (
      <div className="grid gap-4 lg:grid-cols-5" aria-busy="true">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80 lg:col-span-3" />
      </div>
    );
  }

  const cameraTile = (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[#0B1020]">
      {media.camera ? (
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full -scale-x-100 object-cover" aria-label="Your camera preview" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-white/60">
          <CameraOff className="h-8 w-8" aria-hidden />
          <span className="text-sm">Camera is off</span>
        </div>
      )}
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        {media.camera && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-[#F97373]" /> Camera on · not recorded
          </span>
        )}
        {media.mic && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <Mic className="h-3 w-3" /> Mic on
            <span className="ml-1 flex h-3 items-end gap-0.5" aria-hidden>
              {[0.15, 0.35, 0.6].map((t) => (
                <span key={t} className="w-1 rounded-sm bg-[#06B6D4] transition-all" style={{ height: media.level > t ? "100%" : "30%" }} />
              ))}
            </span>
          </span>
        )}
      </div>
    </div>
  );

  const deviceButtons = (
    <div className="flex flex-wrap gap-2">
      <Tooltip label={media.camera ? "Turn camera off" : "Turn camera on"}>
        <Button
          variant={media.camera ? "secondary" : "outline"}
          size="icon"
          onClick={media.camera ? media.disableCamera : media.enableCamera}
          aria-pressed={!!media.camera}
          aria-label={media.camera ? "Turn camera off" : "Turn camera on"}
        >
          {media.camera ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
        </Button>
      </Tooltip>
      <Tooltip label={media.mic ? "Turn microphone off" : "Turn microphone on"}>
        <Button
          variant={media.mic ? "secondary" : "outline"}
          size="icon"
          onClick={media.mic ? media.disableMic : media.enableMic}
          aria-pressed={!!media.mic}
          aria-label={media.mic ? "Turn microphone off" : "Turn microphone on"}
        >
          {media.mic ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </Button>
      </Tooltip>
      <Tooltip label={speak ? "Stop reading questions aloud" : "Read questions aloud"}>
        <Button
          variant={speak ? "secondary" : "outline"}
          size="icon"
          onClick={() => {
            if (speak) speaker.cancel();
            else spokenId.current = null;
            setSpeak((s) => !s);
          }}
          aria-pressed={speak}
          aria-label={speak ? "Stop reading questions aloud" : "Read questions aloud"}
        >
          {speak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </Button>
      </Tooltip>
    </div>
  );

  /* ---------- Pre-join: explicit device consent ---------- */
  if (!joined) {
    return (
      <div className="mx-auto max-w-4xl">
        <Link href="/interview" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-fg-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Interviews
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">Ready to begin?</h1>
        <p className="mt-1 text-fg-muted">
          {iv.config.interview_type} interview for <strong className="text-fg">{iv.config.role}</strong> · {iv.target_questions} questions · {iv.config.duration_minutes} min
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-5">
          <Card className="p-4 lg:col-span-3">
            {cameraTile}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {deviceButtons}
              <span className="text-xs text-fg-subtle">Camera and mic are optional and off until you turn them on.</span>
            </div>
            {media.error && <ErrorState className="mt-4" message={mediaErrorMessage(media.error)} />}
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h2 className="flex items-center gap-2 font-display font-semibold text-fg">
              <ShieldCheck className="h-5 w-5 text-success" /> Your privacy
            </h2>
            <ul className="mt-3 space-y-2.5 text-sm text-fg-muted">
              <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />Your camera preview stays on this device. It is never recorded, uploaded or analysed.</li>
              <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />The microphone only drives a local level meter so you can practise speaking. No audio is stored.</li>
              {voiceMode ? (
                <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />Voice answers: recording only runs while you press Record. {voice.config?.stt_note} You can edit the transcript before sending. Audio is never stored.</li>
              ) : (
                <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />You answer in text. Only your typed answers are saved and evaluated.</li>
              )}
              <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-purple" />Scores never come from your face, voice or emotions.</li>
            </ul>
            <Button size="lg" className="mt-6 w-full" onClick={() => setJoined(true)}>
              {iv.turns.some((t) => t.role === "candidate") ? "Resume interview" : "Start interview"}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  /* ---------- Interview room ---------- */
  const statusPill = paused
    ? { text: "Paused", cls: "bg-warning/15 text-warning" }
    : dictation.state === "recording"
      ? { text: "Recording your answer", cls: "bg-coral/15 text-coral" }
      : dictation.state === "transcribing"
        ? { text: "Transcribing", cls: "bg-blue/12 text-blue" }
    : phase === "thinking"
      ? { text: "Interviewer is thinking", cls: "bg-blue/12 text-blue" }
      : phase === "ending"
        ? { text: "Writing your report", cls: "bg-blue/12 text-blue" }
        : phase === "retry"
          ? { text: "Needs attention", cls: "bg-danger/12 text-danger" }
          : phase === "done"
            ? { text: "All questions answered", cls: "bg-success/12 text-success" }
            : { text: "Your turn to answer", cls: "bg-success/12 text-success" };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-4 shadow-card sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-lg font-bold text-fg">{iv.config.role}</h1>
            <Badge tone="brand">{iv.config.interview_type}</Badge>
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", statusPill.cls)} role="status">
              <span className="relative h-2 w-2 rounded-full bg-current">{phase === "thinking" && <span className="pulse-ring absolute inset-0 rounded-full" />}</span>
              {statusPill.text}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={(questionNumber / iv.target_questions) * 100} className="max-w-xs" label="Interview progress" />
            <span className="whitespace-nowrap text-xs font-semibold text-fg-muted">
              Question {questionNumber} of {iv.target_questions}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border px-3 font-display text-sm font-bold tabular-nums",
              overTime ? "border-coral/50 text-coral" : "border-line text-fg",
            )}
            aria-label={`Elapsed time ${formatDuration(elapsed)} of ${iv.config.duration_minutes} minutes`}
          >
            <Clock className="h-4 w-4" /> {formatDuration(elapsed)}
            <span className="font-sans text-xs font-medium text-fg-subtle">/ {iv.config.duration_minutes}:00</span>
          </span>
          <Button variant="outline" size="icon" onClick={() => setPaused((p) => !p)} disabled={phase === "ending" || phase === "done"} aria-label={paused ? "Resume" : "Pause"}>
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </Button>
          <Button variant="danger" size="sm" onClick={endInterview} loading={phase === "ending"} disabled={phase === "thinking"}>
            <Square className="h-4 w-4" /> End
          </Button>
        </div>
      </div>

      {overTime && phase === "answering" && (
        <p className="rounded-xl bg-coral/10 px-4 py-2.5 text-sm text-fg">
          You&apos;ve passed the planned time. Finish this answer and end whenever you&apos;re ready.
        </p>
      )}

      {/* Phones: question → transcript/answer → camera. Desktop: question + camera left, transcript right. */}
      <div className="grid gap-4 lg:grid-cols-5 lg:grid-rows-[auto_1fr]">
          <Card className="overflow-hidden lg:col-span-2 lg:col-start-1 lg:row-start-1">
            <InterviewerAvatar state={phase === "thinking" || phase === "ending" ? "thinking" : speaker.speaking ? "speaking" : "listening"} />
            <div className="flex items-center gap-3 bg-brand-gradient px-4 py-3 text-white">
              <div>
                <p className="font-display font-semibold">{INTERVIEWER_NAME} · AI Interviewer</p>
                <p className="text-xs text-white/80">Powered by {iv.model_name}</p>
              </div>
            </div>
            <div className="min-h-32 p-5" aria-live="polite">
              <AnimatePresence mode="wait">
                {phase === "thinking" ? (
                  <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <AIThinking label="Considering your answer" />
                  </motion.div>
                ) : phase === "done" || phase === "ending" ? (
                  <motion.div key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    <p className="flex items-center gap-2 font-semibold text-fg">
                      <CheckCircle2 className="h-5 w-5 text-success" /> That&apos;s all my questions. Thank you!
                    </p>
                    <p className="mt-1 text-sm text-fg-muted">End the interview to get your detailed feedback report.</p>
                  </motion.div>
                ) : currentQuestion ? (
                  <motion.div key={currentQuestion.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                    {currentQuestion.kind === "followup" && <Badge tone="brand" className="mb-2">Follow-up</Badge>}
                    <p className="text-[17px] font-medium leading-relaxed text-fg">{currentQuestion.content}</p>
                  </motion.div>
                ) : (
                  <p className="text-sm text-fg-muted">Waiting for the next question…</p>
                )}
              </AnimatePresence>
            </div>
          </Card>

        {/* Transcript + answer */}
        <Card className="flex min-h-[28rem] flex-col lg:col-span-3 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:h-[calc(100dvh-14rem)]">
          <div className="border-b border-line px-5 py-3">
            <h2 className="font-display text-sm font-semibold text-fg">Live transcript</h2>
          </div>
          <div ref={transcriptRef} className="flex-1 space-y-4 overflow-y-auto p-5" aria-label="Transcript">
            {turns.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn("flex", t.role === "candidate" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed",
                    t.role === "candidate" ? "rounded-br-md bg-brand-gradient text-white" : "rounded-bl-md bg-muted text-fg",
                  )}
                >
                  <p className="mb-0.5 text-[11px] font-bold uppercase tracking-wide opacity-70">
                    {t.role === "candidate" ? "You" : t.kind === "followup" ? "Interviewer · follow-up" : "Interviewer"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{t.content}</p>
                </div>
              </motion.div>
            ))}
            {phase === "thinking" && <AIThinking label="Interviewer is typing" />}
          </div>

          <div className="border-t border-line p-4">
            {actionError && (
              <ErrorState className="mb-3" message={actionError} onRetry={phase === "retry" ? retryNext : undefined} />
            )}
            {phase === "retry" && !actionError && (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-muted p-3 text-sm">
                <span className="text-fg">Your last answer is saved. Load the next question to continue.</span>
                <Button size="sm" variant="outline" onClick={retryNext}>
                  <RotateCcw className="h-4 w-4" /> Next question
                </Button>
              </div>
            )}
            {phase === "done" ? (
              <Button size="lg" className="w-full" onClick={endInterview}>
                <CheckCircle2 className="h-5 w-5" /> Finish and get my report
              </Button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitAnswer();
                }}
              >
                <label htmlFor="answer" className="sr-only">
                  Your answer
                </label>
                <Textarea
                  id="answer"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      submitAnswer();
                    }
                  }}
                  disabled={paused || phase !== "answering"}
                  placeholder={paused ? "Interview paused" : voiceMode ? "Press Record and speak, or type… (Ctrl/⌘ + Enter to send)" : "Type your answer… (Ctrl/⌘ + Enter to send)"}
                  maxLength={6000}
                  rows={4}
                  className="resize-none"
                />
                {dictation.interim && <p className="mt-2 text-sm italic text-fg-muted" aria-live="polite">{dictation.interim}…</p>}
                {dictation.error && <p className="mt-2 text-sm text-danger" role="alert">{dictation.error}</p>}
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-fg-subtle">{draft.length}/6000</span>
                  <div className="flex gap-2">
                    {voiceMode && voice.sttAvailable && (
                      <Button
                        type="button"
                        variant={dictation.state === "recording" ? "danger" : "outline"}
                        onClick={dictation.state === "recording" ? dictation.stop : dictation.start}
                        disabled={paused || phase !== "answering" || dictation.state === "transcribing"}
                        loading={dictation.state === "transcribing"}
                        aria-pressed={dictation.state === "recording"}
                      >
                        {dictation.state === "recording" ? (
                          <>
                            <span className="relative h-2.5 w-2.5 rounded-full bg-white">
                              <span className="pulse-ring absolute inset-0 rounded-full text-white" />
                            </span>
                            Stop recording
                          </>
                        ) : (
                          <>
                            <Mic className="h-4 w-4" /> {dictation.state === "transcribing" ? "Transcribing" : "Record"}
                          </>
                        )}
                      </Button>
                    )}
                    <Button type="submit" disabled={!draft.trim() || paused || phase !== "answering" || dictation.state !== "idle"} loading={phase === "thinking"}>
                      <Send className="h-4 w-4" /> Send answer
                    </Button>
                  </div>
                </div>
                {voiceMode && !voice.sttAvailable && voice.config && (
                  <p className="mt-2 text-xs text-fg-subtle">Voice input isn&apos;t available in this browser or on this server, so please type your answers.</p>
                )}
              </form>
            )}
          </div>
        </Card>
          <Card className="self-start p-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
            {cameraTile}
            <div className="mt-3 flex items-center justify-between gap-2">
              {deviceButtons}
              <span className="hidden text-xs text-fg-subtle sm:block">Preview only</span>
            </div>
            {media.error && <ErrorState className="mt-3" message={mediaErrorMessage(media.error)} />}
          </Card>
      </div>

      <AnimatePresence>
        {paused && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] grid place-items-center bg-[#0B1020]/60 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Interview paused"
          >
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-sm rounded-3xl bg-elevated p-6 text-center shadow-2xl">
              <Pause className="mx-auto h-10 w-10 text-purple" />
              <h2 className="mt-3 font-display text-xl font-bold text-fg">Interview paused</h2>
              <p className="mt-1 text-sm text-fg-muted">The timer is stopped. Take a breath.</p>
              <Button size="lg" className="mt-5 w-full" onClick={() => setPaused(false)} autoFocus>
                <Play className="h-5 w-5" /> Resume
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
