// Script para ver TODAS as entradas de hoje para os três usuários (inclusive duplicatas)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

const DATE = '2026-06-22';

async function main() {
  const { data, error } = await supabase
    .from('productivity_entries')
    .select('id, estagiario_id, date, count')
    .eq('date', DATE)
    .in('estagiario_id', ['ademar', 'henrique', 'vinicius'])
    .order('estagiario_id');

  if (error) { console.error(error); return; }
  
  console.log(`Todas as entradas de ${DATE} para os 3 usuários:\n`);
  data?.forEach(r => console.log(`id=${r.id} | ${r.estagiario_id} | count=${r.count}`));
  console.log(`\nTotal de linhas: ${data?.length}`);
}

main().catch(console.error);
