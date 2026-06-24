// Script para ver TODAS as entradas de hoje (23/06/2026) no banco
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  const DATE = '2026-06-23';
  
  const { data, error } = await supabase
    .from('productivity_entries')
    .select('id, estagiario_id, date, count')
    .eq('date', DATE)
    .order('estagiario_id');

  if (error) { console.error(error); return; }
  
  console.log(`=== Entradas de ${DATE} no banco ===\n`);
  if (!data || data.length === 0) {
    console.log('Nenhuma entrada encontrada para hoje (23/06/2026).');
  } else {
    data.forEach(r => console.log(`  ${r.estagiario_id} | count=${r.count}`));
    console.log(`\nTotal: ${data.length} registros`);
  }

  // Verificar também configurações da planilha salvas
  const { data: settings } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'googleSheet')
    .single();

  console.log(`\n=== Configuração salva no banco ===`);
  console.log(JSON.stringify(settings?.value, null, 2));
}

main().catch(console.error);
