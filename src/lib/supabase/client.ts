// Server-side Supabase client using the service role key.
// Only import this in API routes — never in client components.
import { createClient } from '@supabase/supabase-js';

const url = process.env.PRICES_URL;
const key = process.env.PRICES_SERVICE_ROLE_KEY;

export const IS_SUPABASE = !!(url && key);

export function getSupabase() {
  if (!url || !key) throw new Error('Supabase env vars not set (PRICES_URL, PRICES_SERVICE_ROLE_KEY)');
  return createClient(url, key, { auth: { persistSession: false } });
}
