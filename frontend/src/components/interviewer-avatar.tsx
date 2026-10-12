"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type AvatarState = "idle" | "speaking" | "thinking" | "listening";

export const INTERVIEWER_NAME = "Ankit";

/** The interviewer's portrait and talking clip, served from public/avatar. */
const PHOTO_SRC = "/avatar/ava.jpg";
const VIDEO_SRC = "/avatar/Interview_speaking.mp4";

/** Photo avatar: breathes while idle/thinking/listening, switches to a looping talking clip while speaking. */
export function InterviewerAvatar({ state, className }: { state: AvatarState; className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const speaking = state === "speaking";

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (speaking) {
      video.currentTime = 0;
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [speaking]);

  const media = "absolute inset-0 h-full w-full object-cover object-top";

  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden bg-[#0B1020]", className)}>
      <style>{`
        @keyframes avatar-breathe { 0%,100% { transform: scale(1.02) translateY(0) } 50% { transform: scale(1.035) translateY(-2px) } }
        @keyframes avatar-wave { 0%,100% { height: 25% } 50% { height: 90% } }
      `}</style>
      <div className="absolute inset-0" style={{ animation: "avatar-breathe 6s ease-in-out infinite", transformOrigin: "50% 80%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO_SRC} alt={`${INTERVIEWER_NAME}, your AI interviewer`} className={cn(media, "transition-opacity duration-150", speaking ? "opacity-0" : "opacity-100")} />
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          className={cn(media, "transition-opacity duration-150", speaking ? "opacity-100" : "opacity-0")}
        />
      </div>
      {state === "thinking" && <div className="absolute inset-0 bg-black/15" />}
      {state === "speaking" && (
        <div className="absolute bottom-3 right-3 flex h-5 items-end gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="w-1 rounded-sm bg-white/90"
              style={{ animation: `avatar-wave ${0.6 + i * 0.07}s ease-in-out infinite`, animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}
      <span className="absolute bottom-2 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        {state === "speaking" ? `${INTERVIEWER_NAME} is speaking` : state === "thinking" ? `${INTERVIEWER_NAME} is thinking…` : `${INTERVIEWER_NAME} is listening`}
      </span>
    </div>
  );
}
