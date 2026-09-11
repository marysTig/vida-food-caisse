import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTables() {
  const { data, error } = await supabase.from('tables').select('*');
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Tables in DB:", JSON.stringify(data, null, 2));
  }
}

checkTables();
