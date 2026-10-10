"""HTTP API: upload a song, poll the job, get the chord sheet."""

from __future__ import annotations

import hmac
import os
import shutil
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .pipeline import analyze

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "200"))
JOB_TTL_SECONDS = int(os.environ.get("JOB_TTL_SECONDS", str(60 * 60)))
API_KEY = os.environ.get("API_KEY", "")
ALLOWED_SUFFIXES = {".mp4", ".m4a", ".mov", ".mp3", ".wav", ".aac", ".ogg", ".flac", ".webm", ".mkv", ".3gp"}

app = FastAPI(title="Cifra API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Analysis is CPU-bound; one at a time keeps small servers responsive.
_executor = ThreadPoolExecutor(max_workers=int(os.environ.get("WORKERS", "1")))
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def require_key(x_api_key: str = Header(default="")) -> None:
    if API_KEY and not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Chave de acesso inválida.")


def _update(job_id: str, **fields) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields, updated=time.time())


def _purge_old_jobs() -> None:
    cutoff = time.time() - JOB_TTL_SECONDS
    with _lock:
        for job_id in [j for j, v in _jobs.items() if v["updated"] < cutoff and v["status"] in ("done", "error")]:
            del _jobs[job_id]


def _run(job_id: str, src: str, workdir: str, title: str, language: str | None) -> None:
    def progress(stage: str, fraction: float) -> None:
        _update(job_id, stage=stage, progress=fraction)

    try:
        _update(job_id, status="processing")
        result = analyze(src, workdir, title, language, progress)
        _update(job_id, status="done", stage="Pronto", progress=1.0, result=result)
    except Exception as exc:  # noqa: BLE001
        _update(job_id, status="error", error=str(exc) or exc.__class__.__name__)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)  # never keep users' uploads


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/api/analyze", dependencies=[Depends(require_key)])
async def start_analysis(file: UploadFile = File(...), language: str | None = Form(default=None)) -> dict:
    original = file.filename or "musica"
    suffix = Path(original).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail="Formato não suportado. Envie mp4, m4a, mp3, wav ou similar.")

    _purge_old_jobs()
    job_id = uuid.uuid4().hex
    workdir = tempfile.mkdtemp(prefix=f"cifra-{job_id[:8]}-")
    src = str(Path(workdir) / f"upload{suffix}")  # never use the client-supplied name on disk
    limit = MAX_UPLOAD_MB * 1024 * 1024
    written = 0
    try:
        with open(src, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                written += len(chunk)
                if written > limit:
                    raise HTTPException(status_code=413, detail=f"Arquivo maior que {MAX_UPLOAD_MB} MB.")
                out.write(chunk)
    except BaseException:
        shutil.rmtree(workdir, ignore_errors=True)
        raise

    title = Path(original).stem[:120] or "Música"
    with _lock:
        _jobs[job_id] = {
            "status": "queued",
            "stage": "Na fila",
            "progress": 0.0,
            "result": None,
            "error": None,
            "updated": time.time(),
        }
    lang = (language or "").strip().lower() or None
    _executor.submit(_run, job_id, src, workdir, title, lang)
    return {"job_id": job_id}


@app.get("/api/jobs/{job_id}", dependencies=[Depends(require_key)])
def get_job(job_id: str) -> dict:
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Análise não encontrada (pode ter expirado).")
        return {k: v for k, v in job.items() if k != "updated"}
