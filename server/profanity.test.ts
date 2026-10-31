import { describe, expect, it } from 'vitest';
import { filterProfanity, normalizeWord } from './profanity.ts';

describe('filtro de palavras ofensivas', () => {
  it('pega ofensas em vários idiomas e disfarces', () => {
    for (const t of ['seu filho da puta', 'fuck you', 'f u c k', 'p.u.t.a', 'P U T A', 'v1@d0', 'puuuuta', 'arrombadooo', 'hijo de puta', 'connard', 'сука блять', 'n1gg3r', 'Hurensohn', 'pidoras', 'orospu']) {
      const r = filterProfanity(t);
      expect(r.hits, t).toBeGreaterThan(0);
    }
  });

  it('não pega palavras comuns', () => {
    for (const t of ['Bora uma partida no mapa Montanhoso?', 'O computador pede reforços', 'carro negro', 'cubo', 'picada', 'macaco no zoológico', 'Niger e Nigéria', 'Ataque com cuidado', 'kkkkkk', 'documento', 'computação', 'recurso', 'skunk', 'Scunthorpe', 'class', 'assassino', 'passado', 'Saint-Étienne', 'Hitchcock']) {
      expect(filterProfanity(t).hits, t).toBe(0);
    }
  });

  it('troca a palavra por asteriscos e mantém o resto', () => {
    expect(filterProfanity('vai se foder fdp kkk').text).toBe('vai se foder *** kkk');
    expect(normalizeWord('V14D0')).toBe('viado');
  });
});
