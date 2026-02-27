
-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  domain TEXT,
  summary TEXT,
  products_services TEXT[],
  industries TEXT[],
  locations TEXT[],
  confidence_score NUMERIC(3,2),
  status TEXT NOT NULL DEFAULT 'New',
  processing_status TEXT NOT NULL DEFAULT 'Pending',
  source_search_term TEXT,
  notes TEXT,
  linkedin_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own companies" ON public.companies FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own companies" ON public.companies FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Emails table
CREATE TABLE public.emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  source_url TEXT,
  context TEXT DEFAULT 'General',
  validated BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own emails" ON public.emails FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own emails" ON public.emails FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own emails" ON public.emails FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own emails" ON public.emails FOR DELETE USING (auth.uid() = user_id);

-- People table
CREATE TABLE public.people (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  title TEXT,
  linkedin_url TEXT,
  source_url TEXT,
  confidence_score NUMERIC(3,2),
  notes TEXT,
  status TEXT DEFAULT 'New',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own people" ON public.people FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own people" ON public.people FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own people" ON public.people FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own people" ON public.people FOR DELETE USING (auth.uid() = user_id);
CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON public.people FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Searches table
CREATE TABLE public.searches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  search_term TEXT NOT NULL,
  country TEXT,
  industry TEXT,
  result_limit INTEGER DEFAULT 25,
  results_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own searches" ON public.searches FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own searches" ON public.searches FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Search Results
CREATE TABLE public.search_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  search_id UUID NOT NULL REFERENCES public.searches(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.search_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own search results" ON public.search_results FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.searches WHERE searches.id = search_results.search_id AND searches.user_id = auth.uid())
);
CREATE POLICY "Users can insert own search results" ON public.search_results FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.searches WHERE searches.id = search_results.search_id AND searches.user_id = auth.uid())
);

-- Indexes
CREATE INDEX idx_companies_user_id ON public.companies(user_id);
CREATE INDEX idx_companies_status ON public.companies(status);
CREATE INDEX idx_companies_domain ON public.companies(domain);
CREATE INDEX idx_emails_company_id ON public.emails(company_id);
CREATE INDEX idx_people_company_id ON public.people(company_id);
CREATE INDEX idx_searches_user_id ON public.searches(user_id);
CREATE INDEX idx_search_results_search_id ON public.search_results(search_id);
CREATE INDEX idx_search_results_company_id ON public.search_results(company_id);
