CREATE TABLE public.admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;

-- No public read policy - only edge functions with service role can access
CREATE POLICY "No direct access" ON public.admin_notes FOR ALL USING (false);
