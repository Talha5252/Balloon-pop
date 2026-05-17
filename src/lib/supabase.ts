import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://myxvwtgmigebwnjguulc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15eHZ3dGdtaWdlYnduamd1dWxjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNjUzMjIsImV4cCI6MjA5MzY0MTMyMn0.J6bewb4eVt5PsZKjCh3gWuiLJZ7egCZWZW-FtdNeGuI';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
