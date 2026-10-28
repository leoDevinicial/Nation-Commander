// Teste de fumaça no navegador: entra como convidado, escolhe um país novo, inicia uma partida
// contra a IA, deixa os dias correrem e fotografa o menu, a sala, o jogo, o Noticiário e o globo.
// Uso: servidor (ALLOW_GUESTS=true) em :8787 e cliente (VITE_ALLOW_GUESTS=true) em :5173, depois
//   node scripts/e2e-screenshots.mjs <pasta-de-saída> [país]
// Sai com código 1 se houver erro de página ou se algum passo falhar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const OUT = process.argv[2] ?? 'e2e-shots';
const COUNTRY = process.argv[3] ?? 'IRN';
const BASE = process.env.E2E_URL ?? 'http://localhost:5173';
mkdirSync(OUT, { recursive: true });

const log = [];
const note = (s) => {
  log.push(s);
  console.log(s);
};
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('nc.settings.v1', JSON.stringify({ quality: 'low', reducedMotion: true, autoFullscreen: false })));
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});
const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  note(`foto: ${name}.png`);
};

try {
  await page.goto(BASE);
  await page.mouse.click(10, 10); // pula a abertura
  await page.fill('#guest', 'Teste E2E');
  await page.click('text=Jogar');
  await page.waitForSelector('text=Nova Partida');
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Nova Partida'))?.hasAttribute('disabled'), null, { timeout: 20_000 });
  await shot('01-menu');

  await page.click('text=Nova Partida');
  await page.waitForSelector('text=Iniciar Operação');
  await page.selectOption('select.field', COUNTRY);
  await page.waitForTimeout(800);
  await shot('02-sala-pais-novo');

  await page.click('text=Iniciar Operação');
  await page.waitForSelector('[aria-label="Globo"]', { timeout: 30_000 });
  await page.waitForTimeout(3000);
  // velocidade máxima, para os dias correrem
  for (let i = 0; i < 2; i++) {
    const b = page.locator('button[aria-label^="Velocidade"]');
    if (await b.count()) await b.first().click();
  }
  await shot('03-partida');

  // painel nacional → orçamento impopular, para gerar acontecimentos e consequências
  await page.keyboard.press('KeyG');
  await page.waitForSelector('[aria-label="Painel nacional"]');
  await shot('04-painel-nacional');

  const waitSec = Number(process.env.E2E_WAIT_SECONDS ?? 120);
  note(`aguardando ${waitSec} s de partida…`);
  await page.waitForTimeout(waitSec * 1000);

  await page.click('[role=tab]:has-text("Noticiário")');
  await page.waitForTimeout(600);
  const cards = await page.locator('[aria-label="Painel nacional"] article').count();
  note(`notícias na aba: ${cards}`);
  await shot('05-noticiario');
  // abre o contexto da primeira notícia que tiver ligações
  const withLinks = page.locator('[aria-label="Painel nacional"] article button[aria-expanded]');
  if (await withLinks.count()) {
    await withLinks.first().click();
    await page.waitForTimeout(400);
    await shot('06-noticiario-contexto');
  }
  for (const f of ['Econômicas', 'Diplomáticas']) {
    await page.click(`[aria-label="Painel nacional"] button:has-text("${f}")`);
    await page.waitForTimeout(300);
    note(`filtro ${f}: ${await page.locator('[aria-label="Painel nacional"] article').count()} notícias`);
  }
  await page.click('[aria-label="Painel nacional"] button:has-text("Todas")');

  await page.click('[role=tab]:has-text("Visão Geral")');
  await page.waitForTimeout(400);
  await shot('07-visao-geral');
  await page.click('[role=tab]:has-text("Dados")');
  await page.waitForTimeout(400);
  await shot('08-dados');

  await page.keyboard.press('KeyG');
  await page.click('[aria-label="Globo"]');
  await page.waitForTimeout(2500);
  await shot('09-globo');
} catch (e) {
  errors.push(`passo falhou: ${e.message.split('\n')[0]}`);
  await shot('erro').catch(() => {});
}

await browser.close();
note(`erros: ${errors.length}`);
for (const e of errors) note(`  ${e}`);
writeFileSync(`${OUT}/relatorio.txt`, log.join('\n') + '\n');
process.exit(errors.length ? 1 : 0);
