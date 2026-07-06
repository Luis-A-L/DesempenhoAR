import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

const viniciusExpected = [
  19, 16, 5, 0, 0, 0, 0, 3, 2, 7, 6, 9, 0, 0, 14, 15, 16, 12, 4, 0, 0, 25, 29, 26
];

const saraExpected = [
  9, 12, 6, 0, 0, 0, 0, 5, 8, 5, 8, 10, 0, 0, 8, 6, 11, 8, 14, 0, 0, 10, 15, 12
];

async function checkAndFix(estagiarioId: string, expected: number[]) {
  console.log(`\n=== BUSCANDO DADOS DE: ${estagiarioId.toUpperCase()} ===`);
  const { data: entries, error } = await supabase
    .from('productivity_entries')
    .select('*')
    .eq('estagiario_id', estagiarioId)
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-24');

  if (error) {
    console.error(`Erro ao buscar dados de ${estagiarioId}:`, error);
    return;
  }

  const entriesMap = new Map<string, any>();
  entries?.forEach(e => {
    entriesMap.set(e.date, e);
  });

  for (let day = 1; day <= 24; day++) {
    const dateStr = `2026-06-${day.toString().padStart(2, '0')}`;
    const expectedValue = expected[day - 1];
    const existing = entriesMap.get(dateStr);

    if (existing) {
      if (existing.count !== expectedValue) {
        console.log(`  Dia ${dateStr}: BD tem ${existing.count}, esperado ${expectedValue}. Atualizando...`);
        const { error: updateError } = await supabase
          .from('productivity_entries')
          .update({ count: expectedValue })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error(`  Erro ao atualizar dia ${dateStr}:`, updateError);
        } else {
          console.log(`  Dia ${dateStr} atualizado para ${expectedValue}.`);
        }
      } else {
        console.log(`  Dia ${dateStr}: BD tem ${existing.count} (OK)`);
      }
    } else {
      console.log(`  Dia ${dateStr}: Registro nao existe. Inserindo com valor ${expectedValue}...`);
      const { error: insertError } = await supabase
        .from('productivity_entries')
        .insert({
          estagiario_id: estagiarioId,
          date: dateStr,
          count: expectedValue
        });

      if (insertError) {
        console.error(`  Erro ao inserir dia ${dateStr}:`, insertError);
      } else {
        console.log(`  Dia ${dateStr} inserido.`);
      }
    }
  }
}

async function main() {
  await checkAndFix('vinicius', viniciusExpected);
  await checkAndFix('sara', saraExpected);
  console.log('\nProcesso finalizado!');
}

main().catch(console.error);
