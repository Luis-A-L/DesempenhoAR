/**
 * sync_junho_inteligente.ts
 *
 * Compara os dados do banco com os dados da imagem da planilha
 * (aba "Controle", dias 01-19/06/2026) e atualiza APENAS as 
 * entradas que diferem. Mantém o que já está correto.
 *
 * Uso: npx tsx sync_junho_inteligente.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ─── SUPABASE com Service Role ───────────────────────────────
const env = readFileSync('.env', 'utf8');
const vars: Record<string, string> = {};
env.split('\n').forEach(line => {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const eq = t.indexOf('=');
  if (eq === -1) return;
  vars[t.substring(0, eq).trim()] = t.substring(eq + 1).trim().replace(/^["']|["']$/g, '');
});

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg4Mzc2OSwiZXhwIjoyMDk3NDU5NzY5fQ.M7-GwFYHmqsZeHHuVmDOLM7SYKmJlUSzSwzUrKztUt4';

const sb = createClient(vars['VITE_SUPABASE_URL'], SERVICE_ROLE_KEY);

// ─── DADOS DA IMAGEM (Aba "Controle") ────────────────────────
// Valores extraídos da imagem fornecida pelo usuário.
// Apenas dias com produção são incluídos (feriados/fins de semana não têm dados).
type DayData = Record<string, number>;

const DADOS_JUNHO: Array<[string, DayData]> = [
  // 01/06 - Segunda
  ['2026-06-01', {
    ademar: 14, alana: 16, diogo: 28, gabrielly: 4, gustavo: 13,
    henrique: 17, iasmin: 20, leticia: 0, julia: 24, marina: 17,
    nelson: 20, vinicius: 19, sara: 9, victoria: 0, taynara: 16,
  }],
  // 02/06 - Terça
  ['2026-06-02', {
    ademar: 12, alana: 0, diogo: 36, gabrielly: 0, gustavo: 21,
    henrique: 0, iasmin: 8, leticia: 25, julia: 0, marina: 15,
    nelson: 0, vinicius: 5, sara: 6, victoria: 22, taynara: 34,
  }],
  // 03/06 - Quarta
  ['2026-06-03', {
    ademar: 31, alana: 0, diogo: 0, gabrielly: 0, gustavo: 0,
    henrique: 0, iasmin: 0, leticia: 0, julia: 0, marina: 0,
    nelson: 0, vinicius: 0, sara: 0, victoria: 0, taynara: 0,
  }],
  // 04-07/06 → Feriado/fim de semana = zeros (não inserir)
  // 08/06 - Segunda
  ['2026-06-08', {
    ademar: 11, alana: 13, diogo: 11, gabrielly: 5, gustavo: 7,
    henrique: 8, iasmin: 7, leticia: 0, julia: 4, marina: 20,
    nelson: 21, vinicius: 3, sara: 5, victoria: 0, taynara: 0,
  }],
  // 09/06 - Terça
  ['2026-06-09', {
    ademar: 7, alana: 0, diogo: 0, gabrielly: 0, gustavo: 0,
    henrique: 0, iasmin: 0, leticia: 0, julia: 0, marina: 0,
    nelson: 0, vinicius: 0, sara: 0, victoria: 0, taynara: 0,
  }],
  // 10/06 - Quarta
  ['2026-06-10', {
    ademar: 21, alana: 5, diogo: 60, gabrielly: 1, gustavo: 28,
    henrique: 21, iasmin: 18, leticia: 14, julia: 18, marina: 18,
    nelson: 26, vinicius: 7, sara: 5, victoria: 0, taynara: 0,
  }],
  // 11/06 - Quinta
  ['2026-06-11', {
    ademar: 28, alana: 0, diogo: 11, gabrielly: 4, gustavo: 3,
    henrique: 45, iasmin: 20, leticia: 22, julia: 45, marina: 22,
    nelson: 18, vinicius: 20, sara: 9, victoria: 2, taynara: 8,
  }],
  // 12/06 - Sexta
  ['2026-06-12', {
    ademar: 25, alana: 0, diogo: 49, gabrielly: 6, gustavo: 12,
    henrique: 45, iasmin: 27, leticia: 23, julia: 31, marina: 17,
    nelson: 20, vinicius: 15, sara: 9, victoria: 10, taynara: 0,
  }],
  // 13-14/06 → Fim de semana
  // 15/06 - Segunda
  ['2026-06-15', {
    ademar: 40, alana: 0, diogo: 30, gabrielly: 3, gustavo: 31,
    henrique: 36, iasmin: 20, leticia: 0, julia: 23, marina: 20,
    nelson: 22, vinicius: 14, sara: 8, victoria: 0, taynara: 0,
  }],
  // 16/06 - Terça
  ['2026-06-16', {
    ademar: 22, alana: 1, diogo: 0, gabrielly: 2, gustavo: 5,
    henrique: 5, iasmin: 14, leticia: 15, julia: 19, marina: 14,
    nelson: 22, vinicius: 15, sara: 6, victoria: 3, taynara: 0,
  }],
  // 17/06 - Quarta
  ['2026-06-17', {
    ademar: 24, alana: 9, diogo: 26, gabrielly: 0, gustavo: 31,
    henrique: 37, iasmin: 15, leticia: 20, julia: 30, marina: 21,
    nelson: 18, vinicius: 16, sara: 11, victoria: 0, taynara: 0,
  }],
  // 18/06 - Quinta
  ['2026-06-18', {
    ademar: 45, alana: 11, diogo: 20, gabrielly: 3, gustavo: 31,
    henrique: 26, iasmin: 16, leticia: 21, julia: 52, marina: 22,
    nelson: 22, vinicius: 12, sara: 8, victoria: 0, taynara: 0,
  }],
  // 19/06 - Sexta
  ['2026-06-19', {
    ademar: 49, alana: 11, diogo: 6, gabrielly: 7, gustavo: 68,
    henrique: 20, iasmin: 16, leticia: 18, julia: 20, marina: 4,
    nelson: 22, vinicius: 15, sara: 6, victoria: 0, taynara: 0,
  }],
];

// ─── MAIN ─────────────────────────────────────────────────────
const main = async () => {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   SYNC INTELIGENTE: Junho/2026 (01-19)                   ║');
  console.log('║   Compara banco vs. planilha → só atualiza diferenças    ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // 1. Buscar entradas existentes do banco (01-19/06)
  const { data: existing, error: fetchErr } = await sb
    .from('productivity_entries')
    .select('estagiario_id, date, count')
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-19');

  if (fetchErr) {
    console.error('❌ Erro ao buscar dados do banco:', fetchErr);
    process.exit(1);
  }

  // Mapa de referência: "estagiario_id|date" → count atual no banco
  const bankMap = new Map<string, number>();
  existing?.forEach((e: any) => bankMap.set(`${e.estagiario_id}|${e.date}`, e.count));
  console.log(`📦 Banco possui ${bankMap.size} entradas no período 01-19/06/2026\n`);

  // 2. Calcular diffs
  const toInsert: Array<{ estagiario_id: string; date: string; count: number }> = [];
  const toUpdate: Array<{ estagiario_id: string; date: string; count: number; from: number }> = [];
  const toDelete: Array<{ estagiario_id: string; date: string; count: number }> = [];

  // Construir mapa esperado (da planilha)
  const expectedMap = new Map<string, number>();
  for (const [date, dayData] of DADOS_JUNHO) {
    for (const [id, count] of Object.entries(dayData)) {
      if (count > 0) {
        expectedMap.set(`${id}|${date}`, count);
      }
    }
  }

  // O que está na planilha mas não no banco (ou com valor diferente)?
  for (const [key, expectedCount] of expectedMap.entries()) {
    const [id, date] = key.split('|');
    const bankCount = bankMap.get(key);
    if (bankCount === undefined) {
      toInsert.push({ estagiario_id: id, date, count: expectedCount });
    } else if (bankCount !== expectedCount) {
      toUpdate.push({ estagiario_id: id, date, count: expectedCount, from: bankCount });
    }
  }

  // O que está no banco mas NÃO deveria estar (zero na planilha)?
  // Apenas para os estagiários e dias cobertos pela imagem
  const coveredDates = new Set(DADOS_JUNHO.map(([d]) => d));
  const coveredIds = new Set(['ademar','alana','diogo','gabrielly','gustavo','henrique','iasmin','leticia','julia','marina','nelson','vinicius','sara','victoria','taynara']);
  
  for (const [key, bankCount] of bankMap.entries()) {
    const [id, date] = key.split('|');
    if (!coveredDates.has(date) || !coveredIds.has(id)) continue; // fora do escopo
    if (!expectedMap.has(key) && bankCount > 0) {
      toDelete.push({ estagiario_id: id, date, count: bankCount });
    }
  }

  // 3. Mostrar diff
  console.log('📋 DIFERENÇAS ENCONTRADAS:');
  console.log('─'.repeat(70));

  if (toInsert.length === 0 && toUpdate.length === 0 && toDelete.length === 0) {
    console.log('  ✅ Banco está IGUAL à planilha! Nenhuma alteração necessária.');
    process.exit(0);
  }

  if (toInsert.length > 0) {
    console.log(`\n➕ INSERIR (${toInsert.length} novas entradas):`);
    toInsert.forEach(e => console.log(`   ${e.date} | ${e.estagiario_id}: ${e.count}`));
  }

  if (toUpdate.length > 0) {
    console.log(`\n✏️  ATUALIZAR (${toUpdate.length} entradas com valor diferente):`);
    toUpdate.forEach(e => console.log(`   ${e.date} | ${e.estagiario_id}: ${e.from} → ${e.count}`));
  }

  if (toDelete.length > 0) {
    console.log(`\n🗑️  ZERAR (${toDelete.length} entradas que deveriam ser 0 na planilha):`);
    toDelete.forEach(e => console.log(`   ${e.date} | ${e.estagiario_id}: ${e.count} → 0`));
  }

  console.log('\n─'.repeat(70));

  // 4. Aplicar mudanças
  let applied = 0;

  // Inserções
  if (toInsert.length > 0) {
    console.log('\n⏳ Inserindo novas entradas...');
    const { error } = await sb
      .from('productivity_entries')
      .upsert(toInsert.map(e => ({ estagiario_id: e.estagiario_id, date: e.date, count: e.count })),
              { onConflict: 'estagiario_id,date' });
    if (error) console.error('❌ Erro ao inserir:', error.message);
    else { applied += toInsert.length; console.log(`   ✅ ${toInsert.length} entradas inseridas.`); }
  }

  // Atualizações
  if (toUpdate.length > 0) {
    console.log('\n⏳ Atualizando entradas divergentes...');
    const { error } = await sb
      .from('productivity_entries')
      .upsert(toUpdate.map(e => ({ estagiario_id: e.estagiario_id, date: e.date, count: e.count })),
              { onConflict: 'estagiario_id,date' });
    if (error) console.error('❌ Erro ao atualizar:', error.message);
    else { applied += toUpdate.length; console.log(`   ✅ ${toUpdate.length} entradas atualizadas.`); }
  }

  // Zeramentos (atualiza count para 0 ou deleta?)
  // Aqui vamos DELETAR as entradas que a planilha marca como 0
  if (toDelete.length > 0) {
    console.log('\n⏳ Removendo entradas que devem ser 0...');
    for (const e of toDelete) {
      const { error } = await sb
        .from('productivity_entries')
        .delete()
        .eq('estagiario_id', e.estagiario_id)
        .eq('date', e.date);
      if (error) console.error(`❌ Erro ao deletar ${e.estagiario_id}/${e.date}:`, error.message);
      else applied++;
    }
    console.log(`   ✅ ${toDelete.length} entradas removidas.`);
  }

  // 5. Verificação final
  console.log('\n─'.repeat(70));
  console.log(`\n✅ CONCLUÍDO! ${applied} operações realizadas.`);

  const { data: final } = await sb
    .from('productivity_entries')
    .select('date, count')
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-19')
    .order('date');

  if (final) {
    const byDate = new Map<string, number>();
    final.forEach((e: any) => byDate.set(e.date, (byDate.get(e.date) || 0) + e.count));
    console.log('\n📊 Totais finais por dia no banco:');
    [...byDate.entries()].sort().forEach(([d, t]) => {
      const dayOfWeek = new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
      console.log(`   ${d} (${dayOfWeek}): ${t} processos`);
    });
    const total = [...byDate.values()].reduce((a, b) => a + b, 0);
    console.log(`\n   TOTAL NO BANCO (01-19/06): ${total} processos`);
  }
};

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message || err);
  process.exit(1);
});
