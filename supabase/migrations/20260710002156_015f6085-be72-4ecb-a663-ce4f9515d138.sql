
CREATE TABLE public.prompt_chat_threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Nova conversa',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_chat_threads TO authenticated;
GRANT ALL ON public.prompt_chat_threads TO service_role;
ALTER TABLE public.prompt_chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own threads" ON public.prompt_chat_threads FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX prompt_chat_threads_user_updated_idx ON public.prompt_chat_threads(user_id, updated_at DESC);
CREATE TRIGGER prompt_chat_threads_updated_at BEFORE UPDATE ON public.prompt_chat_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.prompt_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.prompt_chat_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prompt_chat_messages TO authenticated;
GRANT ALL ON public.prompt_chat_messages TO service_role;
ALTER TABLE public.prompt_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own messages" ON public.prompt_chat_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX prompt_chat_messages_thread_created_idx ON public.prompt_chat_messages(thread_id, created_at);
