// Script para salvar a aba alvo nas configurações do banco de dados
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  // 1. Ler configuração atual
  const { data: existing, error: readErr } = await supabase
    .from('settings')
    .select('*')
    .eq('key', 'googleSheet')
    .single();

  if (readErr) { console.error('Erro ao ler settings:', readErr); return; }

  const currentValue = existing?.value || {};
  console.log('Configuração atual:', JSON.stringify(currentValue, null, 2));

  // 2. Atualizar adicionando o campo selectedSheetName
  const newValue = {
    ...currentValue,
    selectedSheetName: 'Controle detalhado',
  };

  const { error: updateErr } = await supabase
    .from('settings')
    .update({ value: newValue })
    .eq('key', 'googleSheet');

  if (updateErr) {
    console.error('Erro ao atualizar settings:', updateErr);
    return;
  }

  console.log('\n✅ Configuração atualizada com sucesso!');
  console.log('Novo valor:', JSON.stringify(newValue, null, 2));
}

main().catch(console.error);
