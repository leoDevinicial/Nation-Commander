const fs = require('fs'); const path = require('path');
const dir = __dirname;
const icon = (n) => fs.readFileSync(path.join(dir, 'node_modules/lucide-static/icons', n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace('<svg', '<svg class="i"').replace(/\s*class="lucide[^"]*"/, '').replace(/\n\s*/g, ' ');
const tpl = (f, vars) => { let s = fs.readFileSync(path.join(dir, f), 'utf8'); s = s.replace(/\{\{i:([a-z0-9-]+)\}\}/g, (_, n) => icon(n)); for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(v); return s; };
fs.writeFileSync(path.join(dir, 'hud.html'), tpl('hud.tpl.html', { BODY: '', TIPX: '622' }));
fs.writeFileSync(path.join(dir, 'hud-cine.html'), tpl('hud.tpl.html', { BODY: 'show-cine', TIPX: '-999' }));
if (fs.existsSync(path.join(dir, 'folha.tpl.html'))) fs.writeFileSync(path.join(dir, 'folha.html'), tpl('folha.tpl.html', {}));
console.log('ok');
