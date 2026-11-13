-- Apply to the Assessment Hub Supabase SQL editor BEFORE deploying the linking features.
-- New protocol v2 deliberately does not import existing/old device links.
-- No student accounts, attempts, questions, or learning records are deleted.
CREATE TABLE IF NOT EXISTS public.eduspace_device_links (
    device_id text PRIMARY KEY,
    external_user_id text NOT NULL UNIQUE,
    eduspace_origin text NOT NULL,
    generation integer NOT NULL DEFAULT 2 CHECK (generation = 2),
    linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.eduspace_device_links ENABLE ROW LEVEL SECURITY;
-- No anonymous policies: only EdgeOne functions using the Supabase service key may read/write.
