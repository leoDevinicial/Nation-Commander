const fs = require('fs'); const path = require('path');
const dir = __dirname;
const CUSTOM = {
  ingot: '<svg class="i" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18h18l-3.5-7h-11z"/><path d="M6.5 11 8.5 7h7l2 4"/><path d="M8.5 7 7 11"/></svg>',
};
const icon0 = (n) => CUSTOM[n] ?? fs.readFileSync(path.join(dir, 'node_modules/lucide-static/icons', n + '.svg'), 'utf8').replace(/<!--.*?-->/s, '').replace('<svg', '<svg class="i"').replace(/\s*class="lucide[^"]*"/, '').replace(/\n\s*/g, ' ');
const icon = (n) => icon0(n).replace('<svg class="i"', `<svg class="i" data-n="${n}"`);
const tpl = (f, vars) => { let s = fs.readFileSync(path.join(dir, f), 'utf8'); s = s.replace(/\{\{i:([a-z0-9-]+)\}\}/g, (_, n) => icon(n)); for (const [k, v] of Object.entries(vars)) s = s.split(`{{${k}}}`).join(v); return s; };
fs.writeFileSync(path.join(dir, 'hud.html'), tpl('hud.tpl.html', { BODY: '', TIPX: '905' }));
fs.writeFileSync(path.join(dir, 'hud-cine.html'), tpl('hud.tpl.html', { BODY: 'show-cine', TIPX: '-999' }));
if (fs.existsSync(path.join(dir, 'folha.tpl.html'))) fs.writeFileSync(path.join(dir, 'folha.html'), tpl('folha.tpl.html', {}));
console.log('ok');
