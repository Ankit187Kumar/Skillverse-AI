"""Text extraction for the research document library (PDF, DOCX, TXT, Markdown)."""

from .resume_service import ResumeError, extract_text

TEXT_EXTS = (".txt", ".md", ".markdown")
ALLOWED = (".pdf", ".docx", *TEXT_EXTS)


def extract_document(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(TEXT_EXTS):
        if b"\x00" in data[:4096]:
            raise ResumeError("This doesn't look like a text file.")
        text = data.decode("utf-8", errors="replace").strip()
        if len(text) < 40:
            raise ResumeError("The file has too little text.")
        return text[:400_000]
    if name.endswith((".pdf", ".docx")):
        return extract_text(filename, data, max_pages=300, max_chars=400_000, label="PDFs")
    raise ResumeError("Supported formats: PDF, DOCX, TXT and Markdown.")
