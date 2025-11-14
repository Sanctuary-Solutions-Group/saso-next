
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jmlxocjqtryzanlfizhs.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptbHhvY2pxdHJ5emFubGZpemhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg4MzM0NDksImV4cCI6MjA3NDQwOTQ0OX0.k4KaViPCtfmgn0xa1s7ezkEWvpnesrLK_c0aEX7CQLo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
