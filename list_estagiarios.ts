import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Carrega .env manualmente
const env = readFileSync('.env', 'utf8');
const vars: Record<string, string> = {};
env.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) return;
  const k = trimmed.substring(0, eqIdx).trim();
  const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
  vars[k] = v;
});

const url = vars['VITE_SUPABASE_URL'];
const key = vars['VITE_SUPABASE_ANON_KEY'];

if (!url || !key) {
  console.error('Credenciais Supabase não encontradas no .env');
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb.from('estagiarios').select('id, name').order('name');
if (error) { console.error(error); process.exit(1); }
console.log('=== ESTAGIÁRIOS CADASTRADOS ===');
data?.forEach((e: any) => console.log(`  ${e.id} | ${e.name}`));
console.log('Total:', data?.length);
