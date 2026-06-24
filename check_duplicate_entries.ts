import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  console.log('Buscando lançamentos recentes de produtividade para Ademar e Henrique...');
  
  const { data, error } = await supabase
    .from('productivity_entries')
    .select('*')
    .gte('date', '2026-06-20')
    .in('estagiario_id', ['ademar', 'henrique'])
    .order('date', { ascending: false })
    .order('estagiario_id');

  if (error) {
    console.error('Erro ao consultar banco:', error);
    return;
  }

  console.log(`Total de registros encontrados: ${data.length}`);
  data.forEach(r => {
    console.log(`Data: ${r.date} | Estagiário: ${r.estagiario_id} | Qtd: ${r.count} | ID Registro: ${r.id}`);
  });
}

main().catch(console.error);
