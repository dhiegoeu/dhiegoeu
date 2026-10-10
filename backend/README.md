# Cifra: servidor de análise

Recebe um arquivo de áudio/vídeo (mp4, m4a, mp3, wav…), reconhece **acordes** e transcreve a
**letra**, e devolve a cifra com cada acorde posicionado sobre a sílaba em que ele troca.

## Como funciona

| Etapa | Arquivo | Técnica |
|---|---|---|
| Extrair áudio | `app/pipeline.py` | `ffmpeg` → WAV mono 22 kHz |
| Acordes | `app/chords.py` | parte harmônica → cromagrama CQT → janelas por batida → *template matching* (maior, menor, 7, m7) com bônus para acordes da tonalidade → suavização Viterbi |
| Letra | `app/lyrics.py` | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) com timestamps por palavra |
| Cifra | `app/chordsheet.py` | alinha acordes e palavras pelo tempo; trechos sem voz viram linhas só de acordes |

## Rodar

Requer Python 3.10+ e `ffmpeg` instalado.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Na primeira análise o modelo Whisper é baixado (≈460 MB para `small`).
Ou com Docker: `docker build -t cifra-api . && docker run -p 8000:8000 cifra-api`.

## Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|---|---|---|
| `WHISPER_MODEL` | `small` | `tiny`/`base`/`small`/`medium`/`large-v3`. Maior = letra melhor, porém mais lento |
| `WHISPER_LANGUAGE` | automático | força o idioma (`pt`, `en`, `es`…) |
| `WHISPER_DEVICE` | `auto` | `cpu` ou `cuda` |
| `API_KEY` | vazio | se definida, exige o cabeçalho `x-api-key` |
| `MAX_UPLOAD_MB` | `200` | tamanho máximo do arquivo |
| `WORKERS` | `1` | análises simultâneas |

**Defina `API_KEY` e use HTTPS antes de expor o servidor na internet.** Os arquivos enviados são
apagados assim que a análise termina; os resultados ficam em memória por 1 hora.

## API

- `POST /api/analyze` (multipart: `file`, opcional `language`) → `{"job_id": "..."}`
- `GET /api/jobs/{job_id}` → `{status: queued|processing|done|error, stage, progress, result, error}`
- `GET /health`

## Testes

```bash
pip install -r requirements-dev.txt
pytest
```

Os testes usam áudio sintético (progressões de acordes geradas em código) e simulam o Whisper,
então rodam sem baixar modelo.
