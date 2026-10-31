/**
 * Filtro de palavras muito ofensivas do chat da Comunidade (insultos graves, ofensas raciais, homofóbicas, sexuais e
 * de ódio), em português, inglês, espanhol, francês, italiano, alemão, russo (transliterado e cirílico), turco,
 * árabe transliterado e indonésio. Palavrões leves ("droga", "merda") não entram: o objetivo é barrar ofensa, não
 * linguagem informal.
 *
 * Contra disfarces, cada palavra é normalizada antes da comparação: minúsculas, sem acentos, números e símbolos
 * trocados pela letra que imitam (4→a, 3→e, 1/!→i, 0→o, 5/$→s, 7→t, @→a), comparada como veio e com as letras
 * repetidas reduzidas a uma, e
 * separadores no meio da palavra removidos ("p.u.t.a", "f u c k" viram uma palavra só quando são letras soltas).
 * Uma palavra é barrada se for igual a um termo da lista ou começar por uma das raízes (`ROOTS`), que só incluem
 * raízes longas e inequívocas, para não pegar palavras inocentes.
 */

/** Termos exatos (já normalizados). */
const WORDS = [
  // português
  'puta', 'puto', 'putas', 'putos', 'vadia', 'vagabunda', 'piranha', 'arrombado', 'arrombada', 'caralho', 'buceta', 'boceta',
  'cuzao', 'cu', 'viado', 'viadinho', 'bicha', 'sapatao', 'traveco', 'crioulo', 'crioula', 'neguinho',
  'retardado', 'retardada', 'mongoloide', 'fdp', 'pqp', 'vsf', 'vtnc', 'tnc', 'filhodaputa', 'desgracado', 'desgracada',
  'estupro', 'estuprador', 'pedofilo',
  // inglês
  'fuck', 'fucker', 'fucking', 'motherfucker', 'cunt', 'bitch', 'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'dyke',
  'tranny', 'retard', 'spic', 'chink', 'kike', 'wetback', 'gook', 'paki', 'rapist', 'pedo', 'pedophile', 'kys',
  // espanhol
  'puta', 'hijoputa', 'hijodeputa', 'pendejo', 'pendeja', 'cabron', 'cabrona', 'maricon', 'marica', 'joto', 'zorra', 'chinga',
  'chingada', 'chingado', 'culero', 'culera', 'gilipollas', 'malparido', 'malparida', 'negrata', 'sudaca', 'panchito',
  // francês
  'pute', 'salope', 'connard', 'connasse', 'encule', 'enculer', 'tapette', 'negre', 'bougnoule', 'youpin', 'nique', 'niquetamere',
  // italiano
  'troia', 'puttana', 'stronzo', 'stronza', 'frocio', 'finocchio', 'vaffanculo', 'cazzo', 'coglione',
  // alemão
  'hure', 'fotze', 'wichser', 'schwuchtel', 'neger', 'kanake', 'missgeburt', 'arschloch', 'hurensohn',
  // russo (transliterado e cirílico)
  'suka', 'blyat', 'blyad', 'pizdec', 'pizda', 'huy', 'hui', 'pidor', 'pidar', 'pidaras', 'gandon', 'mudak', 'chmo', 'ebat',
  'сука', 'блять', 'блядь', 'пизда', 'хуй', 'пидор', 'пидорас', 'мудак', 'гандон', 'ебать', 'уебок',
  // turco, árabe transliterado, indonésio
  'orospu', 'amk', 'siktir', 'ibne', 'gavat', 'sharmouta', 'sharmuta', 'kus', 'zebi', 'bangsat', 'kontol', 'memek',
];

/** Raízes longas: qualquer palavra que comece por elas é barrada (variações e plurais). */
const ROOTS = [
  'filhodaput', 'arrombad', 'vagabund', 'desgracad', 'estupr', 'pedofil', 'motherfuck', 'fucking', 'nigger', 'nigga', 'faggot', 'retardad',
  'hijodeput', 'hijoput', 'maricon', 'gilipoll', 'malparid', 'enculer', 'salope', 'puttan', 'vaffancul', 'schwuchtel', 'hurensohn', 'pidora',
  'blyad', 'blyat', 'пидор', 'хуй', 'бляд', 'пизд', 'orospu', 'sharmout', 'kontol',
];

/**
 * Termos curtos que só valem como palavra inteira (nunca como raiz): "cu", "kus" e "hui" aparecem dentro de palavras
 * comuns ("cubo", "kush", "huis"). Já estão em `WORDS`; a lista aqui documenta a decisão. Ficaram de fora palavras que
 * também são comuns e inocentes em algum idioma ("negro", "macaco", "pede", "pic", "niger", "kuss", "corno").
 */
export const WHOLE_WORD_ONLY = ['cu', 'kus', 'hui', 'huy', 'fag', 'tnc', 'amk', 'kys', 'paki'];

/** Letras repetidas viram uma ("puuuuta" → "puta"). */
const collapse = (w: string) => w.replace(/(\p{L})\1+/gu, '$1');
const WORD_SET = new Set(WORDS);

const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '1': 'i', '!': 'i', '|': 'i', '0': 'o', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g' };

/** Forma usada na comparação: minúsculas, sem acentos, leet trocado, só letras, sem letras repetidas. */
export function normalizeWord(w: string): string {
  const base = w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[4@31!|05$789]/g, (c) => LEET[c] ?? c)
    .replace(/[^\p{L}]/gu, '');
  return base;
}

/** Compara a palavra como veio e com as letras repetidas reduzidas (a lista fica como se escreve: "nigger" ≠ "niger"). */
function offensive(base: string): boolean {
  if (!base) return false;
  for (const w of new Set([base, collapse(base)])) {
    if (WORD_SET.has(w)) return true;
    if (ROOTS.some((r) => w.length >= r.length && w.startsWith(r))) return true;
  }
  return false;
}

/**
 * Procura ofensas no texto. Junta letras soltas separadas por espaço, ponto, hífen ou sublinhado ("f u c k",
 * "p.u.t.a") antes de comparar. Devolve o texto com cada palavra ofensiva trocada por asteriscos e quantas havia.
 */
export function filterProfanity(text: string): { text: string; hits: number } {
  let hits = 0;
  // 1) letras soltas em sequência ("f u c k", "p.u.t.a"): avalia a sequência inteira
  let out = text.replace(/(?:^|(?<=\s))(\p{L}[\s._-]){2,}\p{L}(?=\s|$)/gu, (seq) => {
    if (offensive(normalizeWord(seq))) {
      hits++;
      return '*'.repeat(Math.min(8, seq.replace(/[\s._-]/g, '').length));
    }
    return seq;
  });
  // 2) cada palavra (com números e símbolos de leet no meio)
  out = out.replace(/[\p{L}\p{N}@$!|]+(?:[._-][\p{L}\p{N}@$!|]+)*/gu, (word) => {
    if (offensive(normalizeWord(word))) {
      hits++;
      return '*'.repeat(Math.min(8, word.length));
    }
    return word;
  });
  return { text: out, hits };
}
