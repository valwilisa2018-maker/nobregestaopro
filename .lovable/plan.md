# Fila de vídeos grandes

Hoje o webhook morre ao tentar baixar/descriptografar vídeos > 30 MB dentro do worker (128 MB de RAM, timeout curto). Solução: separar recebimento (rápido) do processamento (assíncrono e com streaming).

## Fluxo

```text
WhatsApp → Webhook (/api/public/evolution/:instance)
              │
              ├── insere `messages` (media_url = null, status "processing")
              └── insere `video_jobs` (directPath, mediaKey, sha256, mime, message_id)
                          │
                          ▼
              pg_cron a cada 1 min → POST /api/public/hooks/process-video-jobs
                          │
                          ├── pega 1 job pending, marca "running"
                          ├── fetch mmg.whatsapp.net (stream)
                          ├── decrypt AES-CBC + HKDF em chunks
                          ├── upload TUS resumable p/ bucket agent-media (6 MB/chunk)
                          ├── UPDATE messages SET media_url, metadata.storagePath
                          └── job "done" (ou "failed" + error, com retry até 3x)
```

## O que muda

### Banco (migração)
- Nova tabela `public.video_jobs`:
  - `id uuid pk`, `user_id`, `message_id`, `conversation_id`
  - `direct_path text`, `media_key text` (base64), `mime text`, `file_name text`
  - `kind text` (video/image/audio/document), `declared_bytes bigint`
  - `status text` ('pending'|'running'|'done'|'failed'), `attempts int default 0`, `error text`
  - `created_at`, `updated_at`
- GRANTs padrão + RLS (admin/service_role); sem policies para anon.
- Index em `(status, created_at)`.

### Webhook `src/routes/api/public/evolution.$instance.ts`
- Quando `videoMessage` (ou qualquer mídia) tem `declaredBytes > MAX_INLINE_MEDIA_BYTES` (25 MB) e vem com `directPath` + `mediaKey`:
  - Não tenta mais baixar inline.
  - Insere `messages` com `media_url = null`, `content = "Processando vídeo..."`, `metadata.pending = true`.
  - Insere linha em `video_jobs`.
- Mantém caminho atual para mídias pequenas.

### Novo endpoint `src/routes/api/public/hooks/process-video-jobs.ts`
- POST com `apikey` header.
- Pega até 1 job `pending` (`FOR UPDATE SKIP LOCKED` via RPC), marca `running`.
- Download em stream de `https://mmg.whatsapp.net{directPath}`.
- Descriptografa AES-256-CBC em chunks (mantendo o último bloco entre reads para IV do próximo) com HKDF derivado da mediaKey.
- Upload resumable (TUS) para `agent-media` em pedaços de 6 MB — memória fica baixa.
- Atualiza `messages.media_url`, `metadata.storagePath`, `metadata.pending = false`.
- Em erro: incrementa `attempts`; se >= 3, marca `failed` e atualiza mensagem com aviso.

### pg_cron
- `SELECT cron.schedule('process-video-jobs', '* * * * *', $$ SELECT net.http_post(url:='https://project--…lovable.app/api/public/hooks/process-video-jobs', headers:='{"apikey":"…"}'::jsonb, body:='{}'::jsonb); $$);`

### UI
- `messages.tsx` já mostra `media_url`; enquanto `metadata.pending = true`, exibe placeholder "⏳ Processando vídeo (pode levar 1-2 min)". Realtime já atualiza quando o job termina.

## Detalhes técnicos

- Streaming decrypt: acumula bytes, processa em múltiplos de 16 (bloco AES), guarda tail para próximo chunk; descarta os 10 bytes finais do MAC.
- TUS upload: usa `@supabase/storage-js` `uploadToSignedUrl` com `Tus-Resumable`. Alternativa mais simples: como storage aceita PUT direto até ~50 MB, para vídeos até 100 MB usar upload direto com `Content-Length` conhecido (ainda estoura RAM). **Vamos pelo TUS resumable** de fato.
- Limite operacional: 100 MB por vídeo (configurável). Acima disso o job falha com mensagem clara.
- Segurança: endpoint `/api/public/hooks/*` valida `apikey` = `SUPABASE_PUBLISHABLE_KEY`.

## Não vou fazer
- Transcodificar (ffmpeg não roda no worker). Vídeo é salvo no formato original que o WhatsApp entrega (`.enc` decodificado → mp4).
- Trocar de runtime (Cloudflare Worker fica).
