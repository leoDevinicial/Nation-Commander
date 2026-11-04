import { create } from 'zustand';
import { applyTranslator } from './dom.ts';
import { LANGS, Translator, type Dict, type Lang } from './translate.ts';

export { LANGS, LANG_LABEL, type Lang } from './translate.ts';

/**
 * Idioma do jogo (04/11): português (original), inglês ou espanhol. Na primeira visita o idioma sai da região do
 * jogador (país do IP, informado pela Vercel em `/api/geo`; sem ele, o idioma do navegador). A escolha no menu fica
 * salva e passa a valer sempre.
 */
const KEY = 'nc.lang.v1';

/** Países de língua espanhola e portuguesa (ISO 3166-1); o resto do mundo recebe inglês. */
const ES = new Set(['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ', 'AD']);
const PT = new Set(['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL']);

export function langForCountry(country: string | null | undefined): Lang | null {
  if (!country) return null;
  const c = country.toUpperCase();
  return PT.has(c) ? 'pt' : ES.has(c) ? 'es' : /^[A-Z]{2}$/.test(c) ? 'en' : null;
}

export function langForBrowser(langs: readonly string[]): Lang {
  for (const l of langs) {
    const p = l.toLowerCase().slice(0, 2);
    if (p === 'pt' || p === 'es' || p === 'en') return p;
  }
  return 'en';
}

interface Saved {
  /** Escolhida pelo jogador no menu (manda sempre). */
  chosen?: Lang;
  /** Detectada pela região na primeira visita. */
  detected?: Lang;
}

function readSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Saved;
    return { chosen: LANGS.includes(raw.chosen as Lang) ? raw.chosen : undefined, detected: LANGS.includes(raw.detected as Lang) ? raw.detected : undefined };
  } catch {
    return {};
  }
}

function writeSaved(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

interface LangState {
  lang: Lang;
  /** O jogador escolheu (true) ou veio da região (false). */
  chosen: boolean;
  setLang: (l: Lang) => void;
}

export const useLangStore = create<LangState>((set) => ({
  lang: 'pt',
  chosen: false,
  setLang: (l) => {
    writeSaved({ ...readSaved(), chosen: l });
    set({ lang: l, chosen: true });
    void activate(l);
  },
}));

const loaders: Record<Exclude<Lang, 'pt'>, () => Promise<Dict>> = {
  en: () => import('./en.ts').then((m) => m.EN),
  es: () => import('./es.ts').then((m) => m.ES),
};
const translators = new Map<Lang, Translator>();
let current: Translator | null = null;

/** Tradução de um texto fora do DOM (nomes desenhados no 3D, mensagens montadas no código). */
export function t(text: string): string {
  return current ? current.t(text) : text;
}

async function activate(l: Lang): Promise<void> {
  document.documentElement.lang = l === 'pt' ? 'pt-BR' : l;
  if (l === 'pt') {
    current = null;
    applyTranslator(null);
    return;
  }
  let tr = translators.get(l);
  if (!tr) {
    tr = new Translator(await loaders[l]());
    translators.set(l, tr);
  }
  if (useLangStore.getState().lang !== l) return; // trocou de novo enquanto carregava
  current = tr;
  applyTranslator(tr);
}

/** Pergunta a região ao servidor do site (cabeçalho de país da Vercel); 1,5 s no máximo. */
async function detectCountry(): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch('/api/geo', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!r.ok) return null;
    const j = (await r.json()) as { country?: unknown };
    return typeof j.country === 'string' ? j.country : null;
  } catch {
    return null;
  }
}

/** Chamado uma vez na abertura: aplica o idioma salvo ou detecta pela região. */
export async function initI18n(): Promise<void> {
  const saved = readSaved();
  if (saved.chosen) {
    useLangStore.setState({ lang: saved.chosen, chosen: true });
    return activate(saved.chosen);
  }
  // enquanto a região não responde, usa o último idioma detectado (ou o do navegador)
  const guess = saved.detected ?? langForBrowser(navigator.languages ?? [navigator.language]);
  useLangStore.setState({ lang: guess, chosen: false });
  void activate(guess);
  const byIp = langForCountry(await detectCountry());
  const lang = byIp ?? guess;
  writeSaved({ ...readSaved(), detected: lang });
  if (!useLangStore.getState().chosen && lang !== useLangStore.getState().lang) {
    useLangStore.setState({ lang });
    await activate(lang);
  }
}
