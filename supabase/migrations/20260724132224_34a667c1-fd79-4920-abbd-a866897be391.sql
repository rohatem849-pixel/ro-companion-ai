
CREATE TABLE public.telegram_users (
  chat_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  messages_used INT NOT NULL DEFAULT 0,
  images_used INT NOT NULL DEFAULT 0,
  reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_users TO service_role;
ALTER TABLE public.telegram_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.telegram_users FOR ALL USING (false) WITH CHECK (false);
