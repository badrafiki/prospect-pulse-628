
CREATE TABLE public.crawled_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  url text NOT NULL,
  source text NOT NULL DEFAULT 'unknown',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);

ALTER TABLE public.crawled_urls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crawled urls" ON public.crawled_urls FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own crawled urls" ON public.crawled_urls FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own crawled urls" ON public.crawled_urls FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_crawled_urls_user_url ON public.crawled_urls (user_id, url);
