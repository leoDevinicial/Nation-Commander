// HUD compacta (21/11): monta uma página por estado e aparelho a partir de hud-compacta.tpl.html
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const icons = path.join(dir, '../../../node_modules/lucide-static/icons');
const icon = (n) =>
  fs.readFileSync(path.join(icons, n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace('<svg', `<svg class="i" data-n="${n}"`).replace(/\s*class="lucide[^"]*"/, '').replace(/\n\s*/g, ' ');
const tpl = fs.readFileSync(path.join(dir, 'hud-compacta.tpl.html'), 'utf8');
// roda: botões num arco de 90° (da esquerda para cima) em volta do botão central de 70 px; rótulo para fora
const TOOLS = [
  ['hammer', 'Construir', 'B'],
  ['flask-conical', 'Pesquisa', 'R'],
  ['landmark', 'Nação', 'G'],
  ['globe', 'Diplomacia', ''],
  ['handshake', 'Comércio', ''],
];
// no celular os botões têm tamanho fixo de toque (núcleo 54 px, botões 44 px) e o raio é menor
const toolsFor = (cel) => {
  const R = cel ? 128 : 200;
  const core = cel ? 54 : 70;
  const btn = cel ? 44 : 56;
  return TOOLS.map(([ic, label, key], k) => {
    const a = Math.PI + (k / (TOOLS.length - 1)) * (Math.PI / 2);
    const right = (core / 2 - btn / 2 - R * Math.cos(a)).toFixed(1);
    const bottom = (core / 2 - btn / 2 - R * Math.sin(a)).toFixed(1);
    const side = k >= TOOLS.length - 2 ? 'u' : 'l';
    return `  <div class="tool" style="right:${right}px; bottom:${bottom}px"><div class="t">{{i:${ic}}}</div><span class="${side}">${label}${key ? `<kbd>${key}</kbd>` : ''}</span></div>`;
  }).join('\n');
};
const pages = {
  'compacta-vazio-pc': { STATE: 's-vazio', DEVICE: 'pc', BG: 'compacta-cena-pc.jpg', TOAST: '' },
  'compacta-roda-pc': { STATE: 's-roda', DEVICE: 'pc', BG: 'compacta-cena-pc.jpg', TOAST: 'display:none' },
  'compacta-predio-pc': { STATE: 's-predio', DEVICE: 'pc', BG: 'compacta-cena-predio-pc.jpg', TOAST: 'display:none' },
  'compacta-tropas-pc': { STATE: 's-tropas', DEVICE: 'pc', BG: 'compacta-cena-tropas-pc.jpg', TOAST: 'display:none' },
  'compacta-vazio-cel': { STATE: 's-vazio', DEVICE: 'cel', BG: 'compacta-cena-cel.jpg', TOAST: 'display:none' },
  'compacta-roda-cel': { STATE: 's-roda', DEVICE: 'cel', BG: 'compacta-cena-cel.jpg', TOAST: 'display:none' },
  'compacta-predio-cel': { STATE: 's-predio', DEVICE: 'cel', BG: 'compacta-cena-predio-cel.jpg', TOAST: 'display:none' },
};
for (const [name, v] of Object.entries(pages)) {
  let s = tpl.split('{{TOOLS}}').join(toolsFor(v.DEVICE === 'cel')).split('{{WHEELICON}}').join(v.STATE === 's-roda' ? 'x' : 'layout-grid');
  for (const [k, val] of Object.entries(v)) s = s.split(`{{${k}}}`).join(val);
  s = s.replace(/\{\{i:([a-z0-9-]+)\}\}/g, (_, n) => icon(n));
  fs.writeFileSync(path.join(dir, name + '.html'), s);
}
console.log('ok', Object.keys(pages).length);
