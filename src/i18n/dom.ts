import type { Translator } from './translate.ts';

/**
 * Aplica a tradução no DOM (04/11): textos e os atributos title, placeholder, aria-label e alt. Guarda o original
 * em português de cada nó para trocar de idioma (ou voltar ao português) a qualquer momento. Quando o React muda um
 * texto, o novo valor vira o original e é traduzido de novo. Áreas marcadas com `translate="no"` (chat dos
 * jogadores, nomes digitados, seletor de idioma) ficam como estão.
 */
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'CANVAS', 'svg']);

const origText = new WeakMap<Text, string>();
const wroteText = new WeakMap<Text, string>();
const origAttr = new WeakMap<Element, Record<string, string>>();
const wroteAttr = new WeakMap<Element, Record<string, string>>();

let tr: Translator | null = null;
let observer: MutationObserver | null = null;
let busy = false;

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (e.getAttribute('translate') === 'no') return true;
  }
  return false;
}

function doText(n: Text): void {
  const cur = n.nodeValue ?? '';
  // o React escreveu um texto novo (ou é a primeira vez): esse é o original
  if (wroteText.get(n) !== cur) origText.set(n, cur);
  const orig = origText.get(n) ?? cur;
  const next = tr ? tr.t(orig) : orig;
  if (next !== cur) n.nodeValue = next;
  wroteText.set(n, next);
}

function doAttrs(el: Element): void {
  for (const a of ATTRS) {
    const cur = el.getAttribute(a);
    if (cur === null) continue;
    const o = origAttr.get(el) ?? {};
    const w = wroteAttr.get(el) ?? {};
    if (w[a] !== cur) o[a] = cur;
    const next = tr ? tr.t(o[a] ?? cur) : (o[a] ?? cur);
    if (next !== cur) el.setAttribute(a, next);
    w[a] = next;
    origAttr.set(el, o);
    wroteAttr.set(el, w);
  }
}

function walk(root: Node): void {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!skipped(root.parentElement)) doText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (skipped(el)) return;
  doAttrs(el);
  const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.nodeType === Node.ELEMENT_NODE && (SKIP_TAGS.has((n as Element).tagName) || (n as Element).getAttribute('translate') === 'no') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = it.nextNode(); n; n = it.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
    else doAttrs(n as Element);
  }
}

/** Liga (ou troca) o tradutor; `null` volta ao português original. */
export function applyTranslator(next: Translator | null): void {
  tr = next;
  busy = true;
  try {
    walk(document.body);
  } finally {
    busy = false;
  }
  if (!observer) {
    observer = new MutationObserver((list) => {
      if (busy) return;
      busy = true;
      try {
        for (const m of list) {
          if (m.type === 'characterData') {
            const n = m.target as Text;
            if (!skipped(n.parentElement)) doText(n);
          } else if (m.type === 'attributes') {
            const el = m.target as Element;
            if (!skipped(el)) doAttrs(el);
          } else m.addedNodes.forEach((n) => walk(n));
        }
      } finally {
        busy = false;
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  }
}
