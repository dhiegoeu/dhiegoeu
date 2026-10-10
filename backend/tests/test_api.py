import subprocess
import time

import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app import lyrics, main
from app.lyrics import Word, group_words_into_lines
from tests.synth import SR, progression


@pytest.fixture()
def client(monkeypatch):
    def fake_transcribe(path, language=None):
        words = [Word(2.2, 2.6, "Parabéns"), Word(2.6, 3.0, "pra"), Word(3.0, 3.6, "você")]
        return group_words_into_lines(words), "pt"

    monkeypatch.setattr(lyrics, "transcribe", fake_transcribe)
    return TestClient(main.app)


@pytest.fixture()
def mp4(tmp_path):
    wav = tmp_path / "x.wav"
    sf.write(wav, progression(["C", "Am", "F", "G"], repeats=2), SR)
    out = tmp_path / "Minha Música.mp4"
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(wav), "-c:a", "aac", str(out)], check=True)
    return out


def wait(client, job_id, timeout=120):
    end = time.time() + timeout
    while time.time() < end:
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.3)
    raise TimeoutError


def test_upload_mp4_returns_chord_sheet(client, mp4):
    with open(mp4, "rb") as f:
        r = client.post("/api/analyze", files={"file": (mp4.name, f, "video/mp4")})
    assert r.status_code == 200
    job = wait(client, r.json()["job_id"])
    assert job["status"] == "done", job
    res = job["result"]
    assert res["title"] == "Minha Música"
    assert res["key"] == "C"
    assert res["language"] == "pt" and res["has_lyrics"]
    lyric = [l for l in res["lines"] if l["type"] == "lyric"][0]
    assert lyric["text"] == "Parabéns pra você"
    assert lyric["chords"][0]["chord"] == "Am"  # chord sounding at 2.2s (C 0-2s, Am 2-4s)
    assert "Parabéns pra você" in res["text"]


def test_rejects_unsupported_extension(client):
    r = client.post("/api/analyze", files={"file": ("virus.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 415


def test_corrupt_media_reports_error(client):
    r = client.post("/api/analyze", files={"file": ("x.mp4", b"not really a video", "video/mp4")})
    job = wait(client, r.json()["job_id"])
    assert job["status"] == "error" and "áudio" in job["error"]


def test_unknown_job_is_404(client):
    assert client.get("/api/jobs/nope").status_code == 404


def test_upload_size_limit(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_MB", 0)
    r = client.post("/api/analyze", files={"file": ("x.mp4", b"1234", "video/mp4")})
    assert r.status_code == 413


def test_api_key_enforced_when_configured(client, monkeypatch):
    monkeypatch.setattr(main, "API_KEY", "segredo")
    assert client.get("/api/jobs/x").status_code == 401
    assert client.get("/api/jobs/x", headers={"x-api-key": "segredo"}).status_code == 404
