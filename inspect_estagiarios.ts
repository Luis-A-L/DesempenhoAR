import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  console.log('Buscando todos os estagiários cadastrados no banco de dados...');
  const { data, error } = await supabase
    .from('estagiarios')
    .select('*');

  if (error) {
    console.error('Erro ao buscar estagiários:', error);
    return;
  }

  console.log(`Total de estagiários encontrados: ${data.length}`);
  console.log(JSON.stringify(data, null, 2));
}

main().catch(console.error);
