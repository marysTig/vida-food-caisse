import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '[supabase] Missing environment variables VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.\n' +
    'On Vercel: add them in Project Settings → Environment Variables.',
  );
}

// Fallback to placeholder strings so createClient never throws with undefined args.
// Real requests will fail gracefully (auth error) rather than crashing the SSR pass.
export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
);
