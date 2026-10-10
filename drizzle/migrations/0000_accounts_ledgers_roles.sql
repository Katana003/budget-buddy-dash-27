CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower ON public.profiles (lower(username));
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE TABLE public.ledgers (
  user_id uuid PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ledgers TO authenticated;
GRANT ALL ON public.ledgers TO service_role;
ALTER TABLE public.ledgers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ledger select" ON public.ledgers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own ledger insert" ON public.ledgers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ledger update" ON public.ledgers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ledger delete" ON public.ledgers FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname text := coalesce(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1));
BEGIN
  INSERT INTO public.profiles (id, username) VALUES (NEW.id, uname);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  IF lower(uname) = 'xhizostrike' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.admin_user_stats()
RETURNS TABLE (username text, joined timestamptz, last_active timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY SELECT p.username, p.created_at, l.updated_at
    FROM public.profiles p LEFT JOIN public.ledgers l ON l.user_id = p.id
    ORDER BY p.created_at;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_user_stats() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_user_stats() TO authenticated;