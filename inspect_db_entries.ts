import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  const date = '2026-06-22';
  console.log('Querying entries for:', date);
  const { data, error } = await supabase
    .from('productivity_entries')
    .select('*')
    .eq('date', date);

  if (error) { console.error('Error:', error); return; }
  console.log(`Total entries on ${date}:`, data.length);
  data.forEach(r => {
    console.log(`  estagiario_id=${r.estagiario_id} | count=${r.count}`);
  });
}

main().catch(console.error);
