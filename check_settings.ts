/**
 * check_settings.ts — Verifica settings salvas no banco
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env', 'utf8');
const vars: Record<string, string> = {};
env.split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  vars[t.substring(0, eq).trim()] = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
});

const sb = createClient(vars['VITE_SUPABASE_URL'], vars['VITE_SUPABASE_ANON_KEY']);
const { data } = await sb.from('settings').select('key, value');
console.log('=== Settings no banco ===');
data?.forEach((s: any) => {
  const val = JSON.stringify(s.value);
  const preview = val.length > 200 ? val.substring(0, 200) + '...' : val;
  console.log(`  [${s.key}]: ${preview}`);
});
