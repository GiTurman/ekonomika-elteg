
CREATE TABLE public.app_state (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read app_state" ON public.app_state FOR SELECT USING (true);
CREATE POLICY "Public write app_state" ON public.app_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_state" ON public.app_state FOR UPDATE USING (true);

CREATE TABLE public.app_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.app_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read backups" ON public.app_backups FOR SELECT USING (true);
CREATE POLICY "Public write backups" ON public.app_backups FOR INSERT WITH CHECK (true);
CREATE POLICY "Public delete backups" ON public.app_backups FOR DELETE USING (true);
CREATE INDEX idx_backups_created ON public.app_backups(created_at DESC);
