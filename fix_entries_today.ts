// Corrige valores de hoje usando upsert com onConflict igual ao app
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  const corrections = [
    { estagiario_id: 'ademar',   date: '2026-06-22', count: 56 },
    { estagiario_id: 'henrique', date: '2026-06-22', count: 31 },
    { estagiario_id: 'vinicius', date: '2026-06-22', count: 25 },
  ];

  console.log('Aplicando correções via upsert...\n');

  const { error, data } = await supabase
    .from('productivity_entries')
    .upsert(corrections, { onConflict: 'estagiario_id,date' })
    .select();

  if (error) {
    console.error('❌ Erro:', error);
    return;
  }

  console.log('✅ Upsert executado. Registros afetados:', data?.length ?? 0);

  // Verificar resultado
  const { data: check } = await supabase
    .from('productivity_entries')
    .select('estagiario_id, date, count')
    .eq('date', '2026-06-22')
    .in('estagiario_id', ['ademar', 'henrique', 'vinicius'])
    .order('estagiario_id');

  console.log('\n=== Resultado no banco ===');
  check?.forEach(r => console.log(`${r.estagiario_id} (${r.date}): count = ${r.count}`));
}

main().catch(console.error);
