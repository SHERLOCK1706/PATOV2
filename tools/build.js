// Monta a página única (dist/sistema-pato.html) a partir dos fontes em src/.
const fs = require('fs'), path = require('path');
const src = p => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const html = src('index.template.html')
  .replace('/*ENGINE*/', () => src('engine.js'))
  .replace('/*IMPORTER*/', () => src('importer.js'))
  .replace('/*APP*/', () => src('app.js'));
fs.mkdirSync(path.join(__dirname, '..', 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'sistema-pato.html'), html);
console.log('dist/sistema-pato.html gerado (' + html.length + ' bytes)');
