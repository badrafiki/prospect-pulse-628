
-- 1. Plans table
CREATE TABLE public.plans (
  id text PRIMARY KEY,
  name text NOT NULL,
  search_limit integer NOT NULL,
  email_discovery_limit integer NOT NULL,
  result_limit integer NOT NULL,
  can_use_mailchimp boolean NOT NULL DEFAULT false,
  can_use_ai_extraction boolean NOT NULL DEFAULT false,
  can_use_directory_import boolean NOT NULL DEFAULT false,
  price_monthly integer NOT NULL,
  stripe_price_id text
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read plans" ON public.plans FOR SELECT TO public USING (true);

INSERT INTO public.plans (id, name, search_limit, email_discovery_limit, result_limit, can_use_mailchimp, can_use_ai_extraction, can_use_directory_import, price_monthly) VALUES
  ('free', 'Free', 5, 0, 10, false, false, false, 0),
  ('pro', 'Pro', 50, 500, 50, true, true, true, 4900),
  ('agency', 'Agency', 200, 2000, 100, true, true, true, 14900);

-- 2. Subscriptions table
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_id text NOT NULL REFERENCES public.plans(id) DEFAULT 'free',
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. Usage events table
CREATE TABLE public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_events_lookup ON public.usage_events (user_id, event_type, created_at);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage" ON public.usage_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 4. Global companies table
CREATE TABLE public.global_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  name text,
  website text,
  summary text,
  industries text[],
  confidence_score numeric,
  last_scraped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_companies ENABLE ROW LEVEL SECURITY;

-- 5. Global emails table
CREATE TABLE public.global_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_company_id uuid REFERENCES public.global_companies(id) ON DELETE CASCADE,
  domain text NOT NULL,
  email_address text NOT NULL,
  context text,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain, email_address)
);

CREATE INDEX idx_global_emails_domain ON public.global_emails (domain);

ALTER TABLE public.global_emails ENABLE ROW LEVEL SECURITY;

-- 6. Usage function
CREATE OR REPLACE FUNCTION public.get_current_usage(p_user_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT json_build_object(
    'searches_used', (
      SELECT count(*) FROM public.usage_events
      WHERE user_id = p_user_id
        AND event_type = 'search'
        AND created_at >= date_trunc('month', now())
    ),
    'email_discoveries_used', (
      SELECT count(*) FROM public.usage_events
      WHERE user_id = p_user_id
        AND event_type = 'email_discovery'
        AND created_at >= date_trunc('month', now())
    )
  );
$$;

-- 7. Auto-create subscription on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();
