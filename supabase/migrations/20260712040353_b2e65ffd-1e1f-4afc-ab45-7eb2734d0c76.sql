-- 1) Consolidar conversas duplicadas antes de criar travas de unicidade
WITH ranked AS (
  SELECT
    id,
    user_id,
    connection_id,
    metadata->>'remoteJid' AS remote_jid,
    row_number() OVER (
      PARTITION BY user_id, connection_id, metadata->>'remoteJid'
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, created_at DESC, id
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY user_id, connection_id, metadata->>'remoteJid'
      ORDER BY COALESCE(last_message_at, updated_at, created_at) DESC, created_at DESC, id
    ) AS keep_id
  FROM public.conversations
  WHERE metadata ? 'remoteJid'
), moved_messages AS (
  UPDATE public.messages m
  SET conversation_id = r.keep_id
  FROM ranked r
  WHERE m.conversation_id = r.id
    AND r.rn > 1
  RETURNING m.id
), moved_audio AS (
  UPDATE public.audio_messages a
  SET conversation_id = r.keep_id
  FROM ranked r
  WHERE a.conversation_id = r.id
    AND r.rn > 1
  RETURNING a.id
), moved_jobs AS (
  UPDATE public.video_jobs v
  SET conversation_id = r.keep_id
  FROM ranked r
  WHERE v.conversation_id = r.id
    AND r.rn > 1
  RETURNING v.id
)
DELETE FROM public.conversations c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- 2) Consolidar cards duplicados do Pipeline por contato
WITH ranked_deals AS (
  SELECT
    id,
    user_id,
    contact_id,
    row_number() OVER (
      PARTITION BY user_id, contact_id
      ORDER BY COALESCE(last_interaction_at, updated_at, created_at) DESC, created_at DESC, id
    ) AS rn,
    first_value(id) OVER (
      PARTITION BY user_id, contact_id
      ORDER BY COALESCE(last_interaction_at, updated_at, created_at) DESC, created_at DESC, id
    ) AS keep_id
  FROM public.pipeline_deals
  WHERE contact_id IS NOT NULL
), moved_activities AS (
  UPDATE public.pipeline_activities a
  SET deal_id = r.keep_id
  FROM ranked_deals r
  WHERE a.deal_id = r.id
    AND r.rn > 1
  RETURNING a.id
), moved_attachments AS (
  UPDATE public.pipeline_attachments a
  SET deal_id = r.keep_id
  FROM ranked_deals r
  WHERE a.deal_id = r.id
    AND r.rn > 1
  RETURNING a.id
)
DELETE FROM public.pipeline_deals d
USING ranked_deals r
WHERE d.id = r.id
  AND r.rn > 1;

-- 3) Travas definitivas contra multiplicação por corrida/webhook/importação
CREATE UNIQUE INDEX IF NOT EXISTS connections_instance_name_unique_idx
  ON public.connections (instance_name);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_connection_remote_jid_unique_idx
  ON public.conversations (user_id, connection_id, (metadata->>'remoteJid'))
  WHERE connection_id IS NOT NULL AND metadata ? 'remoteJid';

CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_remote_jid_no_connection_unique_idx
  ON public.conversations (user_id, (metadata->>'remoteJid'))
  WHERE connection_id IS NULL AND metadata ? 'remoteJid';

CREATE UNIQUE INDEX IF NOT EXISTS pipeline_deals_user_contact_unique_idx
  ON public.pipeline_deals (user_id, contact_id)
  WHERE contact_id IS NOT NULL;