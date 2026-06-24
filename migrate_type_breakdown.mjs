/**
 * Script para adicionar coluna type_breakdown na tabela productivity_entries
 * Executar com: node migrate_type_breakdown.mjs
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Carrega .env manualmente
const envContent = readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) env[key.trim()] = vals.join('=').trim();
});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Credenciais Supabase não encontradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
  console.log('🔄 Verificando se a coluna type_breakdown já existe...');
  
  // Verifica se a coluna já existe fazendo uma query de teste
  const { data: testData, error: testError } = await supabase
    .from('productivity_entries')
    .select('type_breakdown')
    .limit(1);
  
  if (!testError) {
    console.log('✅ Coluna type_breakdown já existe! Nenhuma migração necessária.');
    return;
  }
  
  if (testError.message && testError.message.includes('does not exist')) {
    console.log('⚠️  Coluna não existe. É necessário adicionar via Supabase Dashboard SQL Editor.');
    console.log('\n📋 Execute o seguinte SQL no Supabase Dashboard:');
    console.log('   https://supabase.com/dashboard/project/nukddxkiffzghnppsjwi/sql/new\n');
    console.log('ALTER TABLE productivity_entries ADD COLUMN IF NOT EXISTS type_breakdown JSONB DEFAULT \'{}\';');
    console.log('\n✅ Após executar o SQL, rode o sistema novamente.');
  } else {
    console.log('❓ Erro inesperado ao verificar coluna:', testError.message);
  }
}

migrate().catch(console.error);
