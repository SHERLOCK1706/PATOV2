// Critério de aceite: o motor precisa reproduzir uma planilha PATO aprovada.
// Uso: node tests/conferencia.js caminho/para/PATO.xlsx
// A planilha não fica no repositório (orçamento de referência pode ser sigiloso).
const fs = require('fs');
const XLSX = require('xlsx');
const IMP = require('../src/importer.js');
const E = require('../src/engine.js');
const arq = process.argv[2];
if (!arq || !fs.existsSync(arq)) { console.error('Informe o caminho da planilha PATO: node tests/conferencia.js arquivo.xlsx'); process.exit(2); }
const wb = XLSX.read(fs.readFileSync(arq), { cellFormula: true, cellDates: true });
const { estado, avisos } = IMP.importarPATO(wb, XLSX);
const R = E.compute(estado);
const C = E.comparar(estado, R, estado.gabarito);
console.log('Linhas iguais à planilha: ' + C.linhasOk + ' de ' + C.linhasTotal);
C.totais.forEach(t => console.log((t.ok ? 'OK   ' : 'DIF  ') + t.nome + ': planilha ' + t.esperado + ' | sistema ' + t.obtido.toFixed(2)));
C.subtotais.forEach(s => console.log('Subtotal da planilha que não fecha: ' + s.item + ' (' + s.condicao + ') diferença ' + s.diferenca.toFixed(2)));
C.diffs.slice(0, 20).forEach(d => console.log('  ' + d.id + ' ' + d.campo + ': ' + d.esperado + ' -> ' + d.obtido));
if (avisos.length) console.log('Avisos da importação:\n  ' + avisos.join('\n  '));
console.log('\nValidações (Res. DNIT nº 8/2023):');
E.validar(estado, R).forEach(v => console.log('  [' + v.status.toUpperCase() + '] ' + v.id + ' ' + v.art + ' — ' + v.titulo));
process.exit(C.linhasOk === C.linhasTotal && C.totais[0].ok ? 0 : 1);
