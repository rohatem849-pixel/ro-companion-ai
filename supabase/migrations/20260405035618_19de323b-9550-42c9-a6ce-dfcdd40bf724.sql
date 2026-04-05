BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_profile_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.username := lower(btrim(NEW.username));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_profile_username_trigger ON public.profiles;
CREATE TRIGGER normalize_profile_username_trigger
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.normalize_profile_username();

UPDATE public.profiles
SET username = lower(btrim(username))
WHERE username IS DISTINCT FROM lower(btrim(username));

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY post_id, user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.post_likes
)
DELETE FROM public.post_likes p
USING ranked r
WHERE p.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY comment_id, user_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.comment_likes
)
DELETE FROM public.comment_likes c
USING ranked r
WHERE c.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY post_id, reporter_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.reports
  WHERE post_id IS NOT NULL
)
DELETE FROM public.reports x
USING ranked r
WHERE x.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY comment_id, reporter_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.reports
  WHERE comment_id IS NOT NULL
)
DELETE FROM public.reports x
USING ranked r
WHERE x.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY follower_id, following_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.follows
)
DELETE FROM public.follows f
USING ranked r
WHERE f.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid, row_number() OVER (PARTITION BY blocker_id, blocked_id ORDER BY created_at DESC, id DESC) AS rn
  FROM public.blocks
)
DELETE FROM public.blocks b
USING ranked r
WHERE b.ctid = r.ctid AND r.rn > 1;

WITH ranked AS (
  SELECT ctid,
         row_number() OVER (
           PARTITION BY LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
           ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END, created_at DESC, id DESC
         ) AS rn
  FROM public.message_requests
)
DELETE FROM public.message_requests mr
USING ranked r
WHERE mr.ctid = r.ctid AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique_idx
ON public.profiles (lower(username));

CREATE UNIQUE INDEX IF NOT EXISTS post_likes_post_user_unique_idx
ON public.post_likes (post_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS comment_likes_comment_user_unique_idx
ON public.comment_likes (comment_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS follows_unique_pair_idx
ON public.follows (follower_id, following_id);

CREATE UNIQUE INDEX IF NOT EXISTS blocks_unique_pair_idx
ON public.blocks (blocker_id, blocked_id);

CREATE UNIQUE INDEX IF NOT EXISTS reports_post_reporter_unique_idx
ON public.reports (post_id, reporter_id)
WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reports_comment_reporter_unique_idx
ON public.reports (comment_id, reporter_id)
WHERE comment_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS message_requests_pair_unique_idx
ON public.message_requests (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id));

CREATE INDEX IF NOT EXISTS conversations_user_pinned_updated_idx
ON public.conversations (user_id, pinned DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS direct_messages_sender_receiver_created_idx
ON public.direct_messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS direct_messages_receiver_sender_created_idx
ON public.direct_messages (receiver_id, sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_active_feed_idx
ON public.posts (expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_user_created_idx
ON public.posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS post_comments_post_created_idx
ON public.post_comments (post_id, created_at DESC);

COMMIT;