/* ===== Supabase browser client =====
   The publishable/anon key is intentionally safe to ship in browser code. Database
   access is protected by the Row Level Security policies in supabase/migrations. */
const SUPABASE_URL = 'https://wrchpfusfxpxzpdvhmqk.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyY2hwZnVzZnhweHpwZHZobXFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTE3MjcsImV4cCI6MjEwMTc4NzcyN30.YhVDhlsIkiaCmeWJT0xNOTZ7QCD2remG4ET1x_IMJps';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
