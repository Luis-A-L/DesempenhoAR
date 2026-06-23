import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nukddxkiffzghnppsjwi.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4ODM3NjksImV4cCI6MjA5NzQ1OTc2OX0.GiPVsDKA66mB9d7T5ec8Y5g3bdq8LOq5tKA4KKzfEg8'
);

async function main() {
  console.log('--- LIMPANDO ESTAGIÁRIO "Livre 1" DO BANCO ---');

  // 1. Apagar registros de produtividade
  const { data: entriesDeleted, error: err1 } = await supabase
    .from('productivity_entries')
    .delete()
    .eq('estagiario_id', 'livre_1');

  if (err1) {
    console.error('Erro ao deletar entries de livre_1:', err1);
  } else {
    console.log('Registros de produtividade de livre_1 apagados com sucesso.');
  }

  // 2. Apagar o perfil do estagiário
  const { data: estDeleted, error: err2 } = await supabase
    .from('estagiarios')
    .delete()
    .eq('id', 'livre_1');

  if (err2) {
    console.error('Erro ao deletar perfil do estagiário livre_1:', err2);
  } else {
    console.log('Perfil de estagiário livre_1 apagado com sucesso.');
  }

  console.log('\n--- LIMPEZA CONCLUÍDA ---');
}

main().catch(console.error);
