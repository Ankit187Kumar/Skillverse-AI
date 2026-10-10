"""Phase 5: speech-to-text and text-to-speech.

Providers:
* "browser"            — the browser's own Web Speech APIs; nothing reaches this server.
* "openai_compatible"  — any server exposing /audio/transcriptions and /audio/speech
                         (OpenAI, Groq, or a self-hosted faster-whisper / Speaches / Kokoro server).

Audio uploaded for transcription is held in memory only for the duration of the request,
forwarded to the configured STT service, and discarded. It is never written to disk or the database.
"""

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import get_current_user
from ..models import User
from ..security import limiter

router = APIRouter(prefix="/api/voice", tags=["voice"])

AUDIO_TYPES = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/wave", "audio/mp4", "audio/mpeg",
               "audio/m4a", "audio/x-m4a", "video/webm"}  # some browsers label webm audio as video/webm
LANG_CODES = {"English": "en", "Hindi": "hi", "Hinglish": "hi", "Spanish": "es", "French": "fr", "German": "de",
              "Portuguese": "pt", "Arabic": "ar", "Japanese": "ja", "Bengali": "bn", "Tamil": "ta", "Telugu": "te",
              "Marathi": "mr"}


def voice_rate_limit(user: User = Depends(get_current_user)) -> None:
    limiter.check(f"voice:{user.id}", 40)


class SpeakIn(BaseModel):
    text: str = Field(min_length=1, max_length=1500)


@router.get("/config")
def config(user: User = Depends(get_current_user)):
    s = get_settings()
    return {
        "stt": s.stt_provider, "tts": s.tts_provider, "max_audio_mb": s.max_audio_mb,
        "stt_note": {
            "browser": "Speech recognition runs in your browser. Chrome and Edge send audio to their vendor's cloud service; "
                       "Safari may process it on-device. Firefox doesn't support it.",
            "openai_compatible": "Audio is sent to this app's speech-to-text service for transcription and then discarded.",
            "none": "Voice answers are turned off on this server.",
        }[s.stt_provider],
    }


@router.post("/transcribe", dependencies=[Depends(voice_rate_limit)])
def transcribe(audio: UploadFile = File(...), language: str = Form(default="English"),
               user: User = Depends(get_current_user)):
    s = get_settings()
    if s.stt_provider != "openai_compatible":
        raise HTTPException(409, "Server-side transcription isn't enabled; use your browser's speech recognition.")
    ctype = (audio.content_type or "").split(";")[0].strip().lower()
    if ctype not in AUDIO_TYPES:
        raise HTTPException(415, "Unsupported audio format.")
    max_bytes = s.max_audio_mb * 1024 * 1024
    data = audio.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(413, f"Recording is larger than {s.max_audio_mb} MB. Keep answers under about two minutes.")
    if len(data) < 1000:
        raise HTTPException(400, "The recording is empty. Check that your microphone is working.")
    ext = {"audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mp4": "m4a",
           "audio/m4a": "m4a", "audio/x-m4a": "m4a", "audio/mpeg": "mp3"}.get(ctype, "webm")
    form = {"model": s.stt_model, "response_format": "json"}
    if LANG_CODES.get(language):
        form["language"] = LANG_CODES[language]
    headers = {"Authorization": f"Bearer {s.stt_api_key}"} if s.stt_api_key else {}
    try:
        r = httpx.post(f"{s.stt_base_url.rstrip('/')}/audio/transcriptions", data=form, headers=headers,
                       files={"file": (f"answer.{ext}", data, ctype)}, timeout=120)
    except httpx.HTTPError as e:
        raise HTTPException(503, "The speech-to-text service isn't reachable.") from e
    finally:
        del data  # the audio is not kept anywhere
    if r.status_code >= 400:
        raise HTTPException(503, f"Transcription failed (HTTP {r.status_code}).")
    try:
        text = (r.json().get("text") or "").strip()
    except ValueError:
        text = r.text.strip()
    return {"text": text}


@router.post("/speak", dependencies=[Depends(voice_rate_limit)])
def speak(body: SpeakIn, user: User = Depends(get_current_user)):
    s = get_settings()
    if s.tts_provider != "openai_compatible":
        raise HTTPException(409, "Server-side speech isn't enabled; the browser's voice is used instead.")
    headers = {"Authorization": f"Bearer {s.tts_api_key}"} if s.tts_api_key else {}
    try:
        r = httpx.post(f"{s.tts_base_url.rstrip('/')}/audio/speech", headers=headers, timeout=60,
                       json={"model": s.tts_model, "voice": s.tts_voice, "input": body.text, "response_format": "mp3"})
    except httpx.HTTPError as e:
        raise HTTPException(503, "The text-to-speech service isn't reachable.") from e
    if r.status_code >= 400:
        raise HTTPException(503, f"Speech synthesis failed (HTTP {r.status_code}).")
    return Response(r.content, media_type=r.headers.get("content-type", "audio/mpeg"),
                    headers={"Cache-Control": "no-store"})
