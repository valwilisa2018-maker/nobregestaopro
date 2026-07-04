
-- Normaliza para a forma "com 9" (13 dígitos) qualquer número BR de 12 dígitos que tenha par
-- correspondente com 9. Estratégia: para cada usuário, se existir tanto a versão de 12 quanto
-- a de 13 dígitos, mover referências e apagar a versão curta.
WITH pairs AS (
  SELECT short.id AS short_id, long.id AS long_id, short.user_id
  FROM public.contacts short
  JOIN public.contacts long
    ON long.user_id = short.user_id
   AND length(short.phone) = 12 AND left(short.phone, 2) = '55'
   AND long.phone = left(short.phone, 4) || '9' || substring(short.phone from 5)
)
UPDATE public.broadcast_recipients br
   SET contact_id = p.long_id
  FROM pairs p
 WHERE br.contact_id = p.short_id;

DELETE FROM public.contacts c
 USING (
   SELECT short.id AS short_id
   FROM public.contacts short
   JOIN public.contacts long
     ON long.user_id = short.user_id
    AND length(short.phone) = 12 AND left(short.phone, 2) = '55'
    AND long.phone = left(short.phone, 4) || '9' || substring(short.phone from 5)
 ) dup
WHERE c.id = dup.short_id;

-- Índice único por usuário + telefone (evita duplicados exatos)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_phone_unique
  ON public.contacts (user_id, phone);
