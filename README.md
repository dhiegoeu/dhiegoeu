# Cifra

App mobile (iOS/Android) em que você envia uma música (mp4 e outros formatos) e recebe a
**cifra com a letra**: os acordes aparecem acima da sílaba em que cada um troca.

- `mobile/` app Expo / React Native (TypeScript)
- `backend/` servidor Python (FastAPI) que reconhece acordes e transcreve a letra

```
celular ──(upload mp4)──▶ servidor ──▶ ffmpeg ─▶ acordes (cromagrama) ─┐
   ▲                                          └▶ letra (Whisper) ──────┼─▶ cifra
   └────────────────(JSON com a cifra)◀────────────────────────────────┘
```

## Começando

1. **Servidor**: veja [`backend/README.md`](backend/README.md).
2. **App**:
   ```bash
   cd mobile
   npm install
   npx expo start
   ```
   Abra no Expo Go (celular) ou num emulador. Na tela inicial, em **Servidor**, informe o
   endereço do backend: no celular, o IP do computador na sua rede (ex. `http://192.168.0.10:8000`);
   no emulador Android, `http://10.0.2.2:8000`.

## Recursos do app

- Escolher arquivo (mp4, m4a, mp3, wav…) e idioma da letra
- Cifra com acordes alinhados à letra, também em telas estreitas
- Transposição de tom (−6 a +5 semitons), com bemóis/sustenidos conforme o tom
- Tamanho da letra, copiar e compartilhar como texto
- Histórico local das cifras salvas (segure para apagar)

## Limitações

A cifra é gerada automaticamente e **pode ter erros**:

- Acordes: análise de áudio clássica (não é rede neural). Funciona melhor com violão/piano/banda
  de harmonia clara; distorção pesada, mixagens densas e harmonias muito ricas reduzem a precisão.
  Reconhece maior, menor, com sétima e menor com sétima; extensões e inversões viram o acorde-base.
- Letra: o Whisper foi feito para fala. Com instrumentos altos por cima da voz a transcrição pode
  falhar ou errar palavras. Separar a voz antes (ex. Demucs) melhoraria bastante.
- Os arquivos são enviados ao **seu** servidor; nada é enviado a terceiros.

## Publicar

O app em modo de desenvolvimento aceita `http://` na rede local. Para builds de produção use um
servidor com **HTTPS** (iOS e Android bloqueiam HTTP aberto). Troque `com.example.cifra` em
`mobile/app.json` pelo seu identificador de app antes de publicar.
