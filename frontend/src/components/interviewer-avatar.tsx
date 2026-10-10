"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type AvatarState = "idle" | "speaking" | "thinking" | "listening";

export const INTERVIEWER_NAME = "Ankit";

/** The interviewer's portrait, served from public/avatar. */
const PHOTO_SRC = "/avatar/ava.jpg";
/** Where the mouth sits in the 4:3 frame (percent of width/height). Tune these to match the portrait. */
const MOUTH_X = 49.5;
const MOUTH_Y = 64;

/** Photo avatar: breathes while idle, and the jaw moves in a speech rhythm while speaking. */
export function InterviewerAvatar({ state, className }: { state: AvatarState; className?: string }) {
  const [wobble, setWobble] = useState(0);
  useEffect(() => {
    if (state !== "speaking") return;
    const id = setInterval(() => setWobble(Math.random() < 0.18 ? 0.1 : 0.25 + Math.random() * 0.75), 110);
    return () => clearInterval(id);
  }, [state]);
  const mouth = state === "speaking" ? wobble : 0;
  const mask = `radial-gradient(ellipse 20% 13% at ${MOUTH_X}% ${MOUTH_Y}%, #000 55%, transparent 100%)`;
  const img = "absolute inset-0 h-full w-full object-cover object-top";

  return (
    <div className={cn("relative aspect-[4/3] w-full overflow-hidden bg-[#0B1020]", className)}>
      <style>{`@keyframes avatar-breathe { 0%,100% { transform: scale(1.02) translateY(0) } 50% { transform: scale(1.035) translateY(-2px) } }`}</style>
      <div className="absolute inset-0" style={{ animation: "avatar-breathe 6s ease-in-out infinite", transformOrigin: "50% 80%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PHOTO_SRC} alt={`${INTERVIEWER_NAME}, your AI interviewer`} className={img} />
        {/* Jaw layer: the same photo, feathered around the mouth and nudged down in a speech rhythm. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={PHOTO_SRC}
          alt=""
          aria-hidden
          className={img}
          style={{ WebkitMaskImage: mask, maskImage: mask, transform: `translateY(${mouth * 4}px) scaleY(${1 + mouth * 0.03})`, transition: "transform 90ms linear" }}
        />
      </div>
      {state === "thinking" && <div className="absolute inset-0 bg-black/15" />}
      {state === "speaking" && (
        <div className="absolute bottom-3 right-3 flex h-5 items-end gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="w-1 rounded-sm bg-white/90 transition-all" style={{ height: `${25 + ((wobble * 100 + i * 37) % 75)}%` }} />
          ))}
        </div>
      )}
      <span className="absolute bottom-2 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        {state === "speaking" ? `${INTERVIEWER_NAME} is speaking` : state === "thinking" ? `${INTERVIEWER_NAME} is thinking…` : `${INTERVIEWER_NAME} is listening`}
      </span>
    </div>
  );
}
