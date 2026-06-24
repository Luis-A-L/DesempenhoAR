/**
 * insert_dia16.ts
 * Insere manualmente os dados de produtividade do dia 16/06/2026
 * Baseado na planilha compartilhada pelo usuário (linha azul).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Carrega .env
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
if (!url || !key) { console.error('Credenciais não encontradas'); process.exit(1); }

const sb = createClient(url, key);
const DATE = '2026-06-16';

// Dados lidos da imagem da planilha (linha azul - 16/06/2026)
// Ordem das colunas visíveis na planilha:
// Alana | Diogo | [?] | Gabrielly | Gustavo | Henrique | Iasmin | Leticia | Julia | Marina | Nelson | Vinicius | Sara | Victoria | Taynara | Pietro
const ENTRIES = [
  { estagiario_id: 'alana',     count: 22 },
  { estagiario_id: 'diogo',     count: 1  },
  { estagiario_id: 'gabrielly', count: 0  }, // coluna destacada em azul — valor incerto, ajuste se necessário
  { estagiario_id: 'gustavo',   count: 2  },
  { estagiario_id: 'ademar',    count: 5  },
  { estagiario_id: 'henrique',  count: 0  },
  { estagiario_id: 'iasmin',    count: 5  },
  { estagiario_id: 'leticia',   count: 14 },
  { estagiario_id: 'julia',     count: 15 },
  { estagiario_id: 'marina',    count: 19 },
  { estagiario_id: 'nelson',    count: 14 },
  { estagiario_id: 'vinicius',  count: 22 },
  { estagiario_id: 'sara',      count: 15 },
  { estagiario_id: 'victoria',  count: 6  },
  { estagiario_id: 'taynara',   count: 3  },
  { estagiario_id: 'pietro',    count: 0  },
].filter(e => e.count > 0); // só insere quem tem produção

console.log(`\n📅 Inserindo dados de ${DATE}:`);
console.log('─'.repeat(40));
const total = ENTRIES.reduce((s, e) => s + e.count, 0);
console.log(`Total planejado para inserção: ${total} processos`);
console.log('');

const rows = ENTRIES.map(e => ({
  estagiario_id: e.estagiario_id,
  date: DATE,
  count: e.count,
}));

// Mostra o que será inserido
rows.forEach(r => console.log(`  ${r.estagiario_id}: ${r.count}`));

console.log('\n⏳ Enviando ao Supabase...');

const { data, error } = await sb
  .from('productivity_entries')
  .upsert(rows, { onConflict: 'estagiario_id,date' })
  .select();

if (error) {
  console.error('❌ Erro ao inserir:', error);
  process.exit(1);
}

console.log(`\n✅ Inserção concluída! ${rows.length} registros salvos no banco.`);
console.log('Total de processos inseridos:', total);
