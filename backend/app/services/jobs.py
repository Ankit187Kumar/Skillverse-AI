"""Small in-process background job runner.

Long AI tasks (course outlines, lessons, research runs, roadmaps) run in a thread pool so HTTP
requests return immediately; the UI polls GET /api/jobs/{id}. Job state lives in the database,
so progress survives page reloads. Jobs interrupted by a restart are marked failed on startup.

For multi-instance deployments, swap this for a real queue (RQ, Celery, Arq) — the `submit`
signature is the only thing callers use.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import update
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import SessionLocal
from ..models import utcnow
from ..models_platform import Job
from .llm import LLMError

log = logging.getLogger(__name__)
_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()


class JobContext:
    def __init__(self, db: Session, job: Job):
        self.db = db
        self.job = job

    def progress(self, pct: int, message: str) -> None:
        self.job.progress = max(0, min(100, pct))
        self.job.message = message[:255]
        self.db.commit()


JobFn = Callable[[Session, JobContext], None]
OnFail = Callable[[Session, str], None]


def _pool() -> ThreadPoolExecutor:
    global _executor
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=get_settings().job_workers, thread_name_prefix="job")
        return _executor


def _run(job_id: int, fn: JobFn, on_fail: OnFail | None) -> None:
    with SessionLocal() as db:
        job = db.get(Job, job_id)
        if not job:
            return
        job.status, job.message = "running", "Starting"
        db.commit()
        ctx = JobContext(db, job)
        try:
            fn(db, ctx)
            job.status, job.progress, job.message = "succeeded", 100, "Done"
            db.commit()
        except Exception as e:  # noqa: BLE001 — every failure must be recorded on the job
            db.rollback()
            msg = str(e) if isinstance(e, (LLMError, ValueError)) else "Unexpected error while processing."
            if not isinstance(e, (LLMError, ValueError)):
                log.exception("Job %s (%s) failed", job_id, job.kind)
            job = db.get(Job, job_id)
            job.status, job.error, job.message = "failed", msg[:2000], "Failed"
            db.commit()
            if on_fail:
                try:
                    on_fail(db, msg)
                    db.commit()
                except Exception:  # noqa: BLE001
                    db.rollback()
                    log.exception("on_fail handler for job %s failed", job_id)


def submit(db: Session, user_id: int, kind: str, fn: JobFn, *, ref_type: str | None = None,
           ref_id: int | None = None, on_fail: OnFail | None = None) -> Job:
    job = Job(user_id=user_id, kind=kind, ref_type=ref_type, ref_id=ref_id)
    db.add(job)
    db.commit()
    db.refresh(job)
    if get_settings().jobs_inline:
        _run(job.id, fn, on_fail)
        db.refresh(job)
    else:
        _pool().submit(_run, job.id, fn, on_fail)
    return job


def active_job(db: Session, user_id: int, kind: str, ref_type: str, ref_id: int) -> Job | None:
    return db.query(Job).filter(
        Job.user_id == user_id, Job.kind == kind, Job.ref_type == ref_type, Job.ref_id == ref_id,
        Job.status.in_(("queued", "running")),
    ).order_by(Job.id.desc()).first()


def recover_interrupted() -> None:
    """Mark jobs left running by a previous process as failed."""
    from ..models_learning import Course
    from ..models_research import ResearchProject

    msg = "The server restarted while this was running. Please try again."
    with SessionLocal() as db:
        db.execute(update(Job).where(Job.status.in_(("queued", "running"))).values(
            status="failed", error=msg, message="Failed", updated_at=utcnow()))
        db.execute(update(Course).where(Course.status == "generating").values(status="failed", error=msg))
        db.execute(update(ResearchProject).where(ResearchProject.status.in_(("planning", "running")))
                   .values(status="failed", error=msg))
        db.commit()
