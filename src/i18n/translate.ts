/**
 * Tradução da interface (04/11). O jogo foi escrito em português e o texto continua no código: os dicionários
 * (`en.ts`, `es.ts`) mapeiam o texto em português para o outro idioma. Três formas de casar um texto:
 *  1. exato (sem espaços sobrando);
 *  2. molde com lacunas: a chave `Nível {0}: especialização` casa "Nível 3: especialização", e o que caiu em cada
 *     lacuna também é traduzido (nomes de prédios, recursos...);
 *  3. prefixo conhecido seguido de pontuação ("Tempo: 12 s" usa a chave "Tempo:").
 * Sem tradução, o texto fica em português (nunca some).
 */
export type Lang = 'pt' | 'en' | 'es';
export const LANGS: readonly Lang[] = ['pt', 'en', 'es'];
export const LANG_LABEL: Record<Lang, string> = { pt: 'Português (Brasil)', en: 'English', es: 'Español' };

export type Dict = Record<string, string>;

interface Mold {
  re: RegExp;
  out: string;
  holes: number;
  /** Letras fixas do molde: os mais específicos são testados primeiro. */
  weight: number;
}

export class Translator {
  private exact = new Map<string, string>();
  /** Moldes pelo primeiro caractere fixo (para não testar milhares de expressões a cada texto). */
  private molds = new Map<string, Mold[]>();
  private loose: Mold[] = [];
  /** Prefixos (chaves de 4+ letras), do maior para o menor. */
  private prefixes: [string, string][] = [];
  private cache = new Map<string, string>();

  constructor(dict: Dict) {
    for (const [k, v] of Object.entries(dict)) {
      const key = norm(k);
      if (!key || !v) continue;
      if (/\{\d+\}/.test(key)) this.addMold(key, v);
      else {
        this.exact.set(key, v);
        if (key.length >= 4 && /[A-Za-zÀ-ÿ]/.test(key)) this.prefixes.push([key, v]);
      }
    }
    this.prefixes.sort((a, b) => b[0].length - a[0].length);
    for (const list of this.molds.values()) list.sort((a, b) => b.weight - a.weight);
    this.loose.sort((a, b) => b.weight - a.weight);
  }

  private addMold(key: string, out: string): void {
    const parts = key.split(/(\{\d+\})/);
    const weight = parts.filter((p) => !/^\{\d+\}$/.test(p)).join('').replace(/[^A-Za-zÀ-ÿ]/g, '').length;
    // molde curto que começa por lacuna ("{0} de {1}", "{0} qps") casaria com qualquer frase: aí as lacunas só
    // aceitam números e símbolos ("3 de 5" → "3 of 5"), nunca palavras
    const hole = !/^\{/.test(key) || weight >= 8 ? '([\\s\\S]*?)' : '([^A-Za-zÀ-ÿ]*?)';
    let src = '^';
    let holes = 0;
    const order: number[] = [];
    for (const p of parts) {
      const m = /^\{(\d+)\}$/.exec(p);
      if (m) {
        src += hole;
        order.push(Number(m[1]));
        holes++;
      } else src += escapeRe(p);
    }
    src += '$';
    // a saída usa os índices originais; a captura n corresponde a order[n]
    let o = out;
    order.forEach((idx, n) => (o = o.split(`{${idx}}`).join(`\u0000${n}\u0000`)));
    const mold: Mold = { re: new RegExp(src), out: o, holes, weight };
    const first = firstWord(parts[0] ?? '');
    if (first) (this.molds.get(first) ?? this.molds.set(first, []).get(first)!).push(mold);
    else this.loose.push(mold);
  }

  /** Traduz um texto (com espaços nas pontas preservados). */
  t(text: string): string {
    if (!text || !/[A-Za-zÀ-ÿ]/.test(text)) return text;
    const hit = this.cache.get(text);
    if (hit !== undefined) return hit;
    const lead = /^\s*/.exec(text)![0];
    const tail = /\s*$/.exec(text)![0];
    const core = norm(text);
    const out = lead + (this.core(core, 0) ?? core) + tail;
    if (this.cache.size > 20000) this.cache.clear();
    this.cache.set(text, out);
    return out;
  }

  private core(s: string, depth: number): string | null {
    const ex = this.exact.get(s);
    if (ex !== undefined) return ex;
    if (depth > 3) return null;
    const list = [...(this.molds.get(firstWord(s)) ?? []), ...this.loose];
    for (const m of list) {
      const r = m.re.exec(s);
      if (!r) continue;
      let o = m.out;
      for (let n = 0; n < m.holes; n++) {
        const g = r[n + 1] ?? '';
        o = o.split(`\u0000${n}\u0000`).join(this.core(g.trim(), depth + 1) !== null ? spaced(g, this.core(g.trim(), depth + 1)!) : g);
      }
      return o;
    }
    // lista separada por " · " (custos, resumos): traduz cada parte
    if (s.includes(' · ')) {
      const parts = s.split(' · ');
      const tr = parts.map((p) => this.core(p, depth + 1));
      if (tr.some((x) => x !== null)) return parts.map((p, i) => tr[i] ?? p).join(' · ');
    }
    // número seguido de nome ("300 comida", "+2 suprimentos/s")
    const num = /^([+\-−]?[\d.,]+%?\s+)(.+)$/.exec(s);
    if (num) {
      const tr = this.core(num[2]!, depth + 1);
      if (tr !== null) return num[1] + tr;
    }
    // prefixo conhecido seguido de pontuação ou número: traduz o prefixo e tenta o resto
    for (const [k, v] of this.prefixes) {
      if (s.length <= k.length || !s.startsWith(k)) continue;
      const next = s.charAt(k.length);
      if (/[A-Za-zÀ-ÿ]/.test(next) && !/[:.·—–(]$/.test(k)) continue;
      const rest = s.slice(k.length);
      // "Fazenda: armazenamento cheio" — a pontuação logo depois do prefixo fica e o resto é traduzido à parte
      const lp = /^\s*[:·—–]\s*/.exec(rest)?.[0] ?? '';
      const body = rest.slice(lp.length);
      const tr = this.core(body.trim(), depth + 1);
      return v + lp + (tr !== null ? spaced(body, tr) : body);
    }
    return null;
  }
}

function spaced(orig: string, tr: string): string {
  return (/^\s/.test(orig) ? ' ' : '') + tr + (/\s$/.test(orig) ? ' ' : '');
}

export function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Grupo do molde: o primeiro caractere fixo (vazio quando o molde começa por lacuna). */
function firstWord(s: string): string {
  const c = norm(s).charAt(0);
  return c === '{' ? '' : c.toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
