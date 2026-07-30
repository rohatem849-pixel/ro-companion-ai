ALTER TABLE public.telegram_users
  ADD COLUMN IF NOT EXISTS last_image_at timestamptz,
  ADD COLUMN IF NOT EXISTS window_start timestamptz,
  ADD COLUMN IF NOT EXISTS window_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscribed boolean NOT NULL DEFAULT false;