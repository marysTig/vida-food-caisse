-- Script à exécuter dans le SQL Editor de Supabase pour créer la table `printers`

CREATE TABLE IF NOT EXISTS public.printers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    type text NOT NULL CHECK (type IN ('caisse', 'plaque', 'four')),
    mac_address text,
    enabled boolean DEFAULT true,
    categories text[] DEFAULT '{}',
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Active RLS mais autorise tout pour la démonstration (ou ajuster selon l'authentification existante)
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;

-- Politique pour tout autoriser (à sécuriser en prod)
CREATE POLICY "Allow all access on printers"
    ON public.printers
    FOR ALL
    USING (true);

-- Active le temps réel (Realtime) sur cette table
ALTER PUBLICATION supabase_realtime ADD TABLE public.printers;
