// Maquete do lobby (16/11): monta lobby.html (computador) e lobby-celular.html com os ícones Lucide embutidos.
// Ícones e fontes vêm do node_modules da raiz do projeto (npm i --no-save lucide-static).
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const icons = path.join(dir, '../../../node_modules/lucide-static/icons');
const icon = (n) => fs.readFileSync(path.join(icons, n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace('<svg', '<svg class="i"').replace(/\s*class="lucide[^"]*"/, '').replace(/\n\s*/g, ' ');
const tpl = (vars, file = 'lobby.tpl.html') => {
  let s = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\{\{i:([a-z0-9-]+)\}\}/g, (_, n) => icon(n));
  for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(v);
  return s;
};
fs.writeFileSync(path.join(dir, 'lobby.html'), tpl({ BODY: '' }));
fs.writeFileSync(path.join(dir, 'lobby-celular.html'), tpl({ BODY: 'cel' }));
// menu inicial (16/11): mesma base visual (base-maquete.css)
fs.writeFileSync(path.join(dir, 'menu.html'), tpl({ BODY: '' }, 'menu.tpl.html'));
fs.writeFileSync(path.join(dir, 'menu-celular.html'), tpl({ BODY: 'cel' }, 'menu.tpl.html'));
console.log('ok');
