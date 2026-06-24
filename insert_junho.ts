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

const sb = createClient(
  vars['VITE_SUPABASE_URL'],
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51a2RkeGtpZmZ6Z2hucHBzandpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTg4Mzc2OSwiZXhwIjoyMDk3NDU5NzY5fQ.M7-GwFYHmqsZeHHuVmDOLM7SYKmJlUSzSwzUrKztUt4'
);

const CSV_DATA = `Data,Ademar,Alana,Diogo,Gabrielly,Gustavo,Henrique,Iasmin,Letícia,Julia,Marina,Nelson,Vinicius,Sara,Victória,Taynara,Pietro
01/06/2026,14,16,28,4,13,17,20,0,24,17,20,19,9,7,16,0
02/06/2026,12,0,17,3,23,27,23,0,30,23,0,16,12,22,21,0
03/06/2026,31,0,36,4,21,8,25,0,13,15,8,5,6,34,16,0
04/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
05/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
06/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
07/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
08/06/2026,11,13,11,5,7,8,7,0,4,20,21,3,5,0,0,0
09/06/2026,7,1,14,5,3,11,27,22,7,20,20,2,8,0,0,0
10/06/2026,21,5,60,1,28,21,18,14,18,18,26,7,5,0,0,0
11/06/2026,28,11,41,4,34,45,25,19,21,20,20,6,8,0,0,0
12/06/2026,29,4,49,6,12,15,22,23,31,17,15,9,10,0,0,0
13/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
14/06/2026,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
15/06/2026,40,0,30,3,31,36,20,0,23,20,22,14,8,0,0,0
16/06/2026,22,1,0,2,5,5,14,15,19,14,22,15,6,0,0,0
17/06/2026,24,9,26,0,31,37,15,20,30,21,18,16,11,0,0,0
18/06/2026,45,11,20,3,31,26,16,21,52,22,22,12,8,0,0,0
19/06/2026,49,11,6,7,68,28,20,16,39,20,11,4,14,0,0,0`;

const COLUMNS = ['ademar','alana','diogo','gabrielly','gustavo','henrique','iasmin','leticia','julia','marina','nelson','vinicius','sara','victoria','taynara','pietro'];

const parseDateToISO = (dateStr: string): string => {
  const [d, m, y] = dateStr.split('/');
  return `${y}-${m}-${d}`;
};

const parseCSV = (csv: string) => {
  const lines = csv.trim().split('\n');
  const entries: Array<{ estagiario_id: string; date: string; count: number }> = [];
  const summary: Array<{ date: string; total: number }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',');
    const date = parseDateToISO(cells[0].trim());
    let dayTotal = 0;
    for (let j = 1; j < cells.length; j++) {
      const count = parseInt(cells[j].trim(), 10);
      if (isNaN(count)) continue;
      dayTotal += count;
      const estId = COLUMNS[j - 1];
      entries.push({ estagiario_id: estId, date, count });
    }
    summary.push({ date, total: dayTotal });
  }
  return { entries, summary };
};

const main = async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   INSERÇÃO CORRETIVA: Junho/2026 (01 a 19)         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const { entries, summary } = parseCSV(CSV_DATA);

  const grandTotal = entries.reduce((s, e) => s + e.count, 0);
  console.log('📊 Resumo por data:');
  console.log('─'.repeat(70));
  for (const { date, total } of summary) {
    const dayOfWeek = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' });
    console.log(`  ${date} (${dayOfWeek}): ${total} processos`);
  }
  console.log('─'.repeat(70));
  console.log(`  TOTAL GERAL: ${grandTotal} processos em ${entries.length} registros\n`);

  console.log('⏳ Inserindo/Upserting no Supabase...');
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const { error } = await sb
      .from('productivity_entries')
      .upsert(chunk, { onConflict: 'estagiario_id,date' });
    if (error) {
      console.error(`❌ Erro no chunk ${i}:`, error.message);
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`\n✅ CONCLUÍDO! ${inserted}/${entries.length} registros salvos.`);
  console.log(`   Total de processos: ${grandTotal}\n`);

  const { data: check } = await sb
    .from('productivity_entries')
    .select('date, count')
    .gte('date', '2026-06-01')
    .lte('date', '2026-06-19')
    .order('date');

  if (check && check.length > 0) {
    const byDate = new Map<string, number>();
    check.forEach((e: any) => byDate.set(e.date, (byDate.get(e.date) || 0) + e.count));
    console.log('📋 Verificação no banco (totais por dia):');
    [...byDate.entries()].sort().forEach(([d, t]) => console.log(`   ${d}: ${t} processos`));
    const bankTotal = [...byDate.values()].reduce((a, b) => a + b, 0);
    console.log(`   TOTAL NO BANCO: ${bankTotal}`);
  }
};

main().catch(err => {
  console.error('\n❌ Erro fatal:', err.message || err);
  process.exit(1);
});
