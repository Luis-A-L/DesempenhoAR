import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'googleSheet')
    .single();

  if (error) {
    console.error('Erro ao ler settings:', error);
    return;
  }

  console.log('Google Sheet Settings:');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
