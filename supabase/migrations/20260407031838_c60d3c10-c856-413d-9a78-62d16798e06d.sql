
ALTER TABLE public.direct_messages 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'sent',
ADD COLUMN IF NOT EXISTS media_url text,
ADD COLUMN IF NOT EXISTS media_type text;

CREATE TABLE IF NOT EXISTS public.deleted_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 days')
);
ALTER TABLE public.deleted_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public deleted_conversations" ON public.deleted_conversations FOR ALL USING (true);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  link_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public notifications" ON public.notifications FOR ALL USING (true);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visible_in_search boolean NOT NULL DEFAULT true;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
