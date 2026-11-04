import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { EN } from '../src/i18n/en.ts';
import { ES } from '../src/i18n/es.ts';
import { Translator } from '../src/i18n/translate.ts';
import { execSync } from 'node:child_process';
const R = process.cwd();
const files = execSync(`cd ${R} && git ls-files 'src/**/*.ts' 'src/**/*.tsx' 'shared/**/*.ts' 'server/**/*.ts' 'src/*.tsx' 'src/*.ts'`).toString().split('\n').filter((f) => f && !/test|\.d\.ts|kac\/|knps\/|scripts\//.test(f));
const skipAttr = new Set(['className', 'key', 'id', 'type', 'href', 'src', 'role', 'name', 'htmlFor', 'value', 'style', 'd', 'fill', 'stroke', 'viewBox', 'mode', 'kind']);
const out = new Map<string, Set<string>>();
const PT = /[áéíóúãõçâêôàÁÉÍÓÚÃÕÇÂÊÔ]|\b(de|do|da|dos|das|para|com|sem|não|nao|seu|sua|por|uma|um|em|no|na|os|as|ou|que|mais|menos)\b/i;
const looksText = (s: string) => {
  const t = s.trim();
  if (t.length < 2 || !/[a-zA-ZÀ-ÿ]/.test(t)) return false;
  if (/^[a-z0-9_.\-/:#]+$/.test(t)) return false; // identificadores, caminhos, cores
  if (/^(flex|grid|text-|bg-|border|px-|py-|w-|h-|font-|rounded|absolute|relative|pointer)/.test(t)) return false;
  if (/^(https?:|\/|#|rgba?\(|M\d)/.test(t)) return false;
  return /[A-ZÀ-Ý]/.test(t[0]!) || PT.test(t) || t.includes(' ');
};
const add = (s: string, f: string) => { const k = s.replace(/\s+/g, ' ').trim(); if (!looksText(k)) return; (out.get(k) ?? out.set(k, new Set()).get(k)!).add(f); };
for (const f of files) {
  const src = ts.createSourceFile(f, readFileSync(`${R}/${f}`, 'utf8'), ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isJsxAttribute(n) && skipAttr.has(n.name.getText())) return;
    if (ts.isCallExpression(n) && /console\.|require|import|log\.|logger|Error|kacJournal|\.warn|\.debug/.test(n.expression.getText())) return;
    if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.initializer) && /^(type|kind|resource|icon|color|hotkey|id|key|cls|tone|accent)$/.test(n.name.getText())) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (p && (ts.isLiteralTypeNode(p) || ts.isElementAccessExpression(p) || (ts.isBinaryExpression(p) && /===|!==|==|!=/.test(p.operatorToken.getText())) || ts.isCaseClause(p))) return;
      add(n.text, f);
    } else if (ts.isTemplateExpression(n)) {
      let s = n.head.text; n.templateSpans.forEach((sp, i) => { s += `{${i}}` + sp.literal.text; });
      add(s, f);
    } else if (ts.isJsxText(n)) add(n.text, f);
    ts.forEachChild(n, visit);
  };
  visit(src);
}
// textos da interface sem tradução (o que o tradutor devolve igual, em português)
const ex = ['shared/data/cities.ts', 'shared/data/reference'];
const tr = { en: new Translator(EN), es: new Translator(ES) };
let missing = 0;
for (const [s, fs] of out) {
  if ([...fs].every((f) => ex.some((e) => f.startsWith(e)))) continue;
  if (/void main|uniform |varying |gl_|px\b.*sans|^[A-Z_0-9]+$/.test(s)) continue;
  const probe = s.replace(/\{\d+\}/g, '7');
  const miss = (['en', 'es'] as const).filter((l) => tr[l].t(probe) === probe && /[a-zà-ÿ]{3}/i.test(probe));
  if (miss.length === 2) {
    missing++;
    console.log(`${[...fs][0]}\t${s}`);
  }
}
console.log(`\n${missing} texto(s) sem tradução em en/es. Acrescente em src/i18n/en.ts e es.ts (chave = texto em português).`);
