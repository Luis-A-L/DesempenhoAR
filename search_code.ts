import fs from 'fs';

const content = fs.readFileSync('src/App.tsx', 'utf8');
const lines = content.split('\n');

function searchPattern(pattern: string) {
  console.log(`\n=== BUSCA POR: "${pattern}" ===`);
  let matches = 0;
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(pattern.toLowerCase())) {
      if (matches < 30) {
        console.log(`L${idx + 1}: ${line.trim()}`);
      }
      matches++;
    }
  });
  console.log(`Total de ocorrências: ${matches}`);
}

searchPattern('activetab');
searchPattern('setactivetab');
searchPattern('aba');
searchPattern('menu');
