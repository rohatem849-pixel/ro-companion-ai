ALTER TABLE public.telegram_users
  ADD COLUMN IF NOT EXISTS last_video_at timestamptz,
  ADD COLUMN IF NOT EXISTS videos_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_job_active boolean NOT NULL DEFAULT false;