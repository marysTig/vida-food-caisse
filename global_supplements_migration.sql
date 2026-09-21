-- Table: global_supplements
CREATE TABLE IF NOT EXISTS public.global_supplements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    price NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Active RLS
ALTER TABLE public.global_supplements ENABLE ROW LEVEL SECURITY;

-- Policies for global_supplements
CREATE POLICY "Enable read access for all users" ON public.global_supplements FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON public.global_supplements FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update for authenticated users only" ON public.global_supplements FOR UPDATE USING (true);
CREATE POLICY "Enable delete for authenticated users only" ON public.global_supplements FOR DELETE USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_supplements;

-- Add column to table_orders
ALTER TABLE public.table_orders
ADD COLUMN IF NOT EXISTS global_supplements JSONB DEFAULT '[]'::jsonb;
