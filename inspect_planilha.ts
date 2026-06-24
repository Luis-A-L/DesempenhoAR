import fetch from 'node-fetch';

async function inspectSheet(sheetName: string) {
  const spreadsheetId = "1hTAx1DO1x4rI8vJ0IQUKEyZqrws2FtcJMSPwFtt-r78";
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  
  console.log(`\n--- INSPECIONANDO ABA: "${sheetName}" ---`);
  try {
    const res = await fetch(url);
    const text = await res.text();
    
    if (!res.ok) {
      console.log(`Erro HTTP ${res.status}:`, text);
      return;
    }
    
    if (text.startsWith("<!DOCTYPE") || text.startsWith("<html")) {
      console.log("Planilha privada! (Retornou login HTML)");
      return;
    }
    
    const lines = text.split(/\r?\n/);
    console.log(`Total de linhas retornadas: ${lines.length}`);
    console.log("Primeiras 15 linhas no formato original:");
    lines.slice(0, 15).forEach((line, idx) => {
      console.log(`L${idx}: ${line}`);
    });
  } catch (error) {
    console.error("Erro ao baixar aba:", error);
  }
}

async function main() {
  await inspectSheet("Controle");
  await inspectSheet("Controle detalhado");
}

main();
