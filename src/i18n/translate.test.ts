import { describe, expect, it } from 'vitest';
import { Translator } from './translate.ts';
import { EN } from './en.ts';
import { ES } from './es.ts';
import { langForBrowser, langForCountry } from './index.ts';

describe('tradução da interface (04/11)', () => {
  const t = new Translator({ Construir: 'Build', 'Nível {0}: especialização': 'Level {0}: specialization', 'Tempo:': 'Time:', Fazenda: 'Farm', 'armazenamento cheio, produção pausada': 'storage full, production paused', 'Pesquisa: {0}': 'Research: {0}', 'Exige a pesquisa {0}': 'Requires the {0} research', Siderurgia: 'Steelmaking' });
  it('texto exato, com espaços nas pontas preservados', () => {
    expect(t.t('Construir')).toBe('Build');
    expect(t.t('  Construir ')).toBe('  Build ');
  });
  it('molde com lacunas e tradução do que caiu nas lacunas', () => {
    expect(t.t('Nível 6: especialização')).toBe('Level 6: specialization');
    expect(t.t('Pesquisa: Fazenda')).toBe('Research: Farm');
    expect(t.t('Exige a pesquisa Siderurgia')).toBe('Requires the Steelmaking research');
  });
  it('prefixo conhecido seguido de número', () => {
    expect(t.t('Tempo: 12 s')).toBe('Time: 12 s');
  });
  it('prefixo com dois-pontos e o resto traduzido (aviso de prédio parado, 05/11)', () => {
    expect(t.t('Fazenda: armazenamento cheio, produção pausada')).toBe('Farm: storage full, production paused');
  });
  it('sem tradução, fica o original; números puros não mudam', () => {
    expect(t.t('Texto desconhecido')).toBe('Texto desconhecido');
    expect(t.t('1.234')).toBe('1.234');
  });
  it('dicionários cobrem os textos principais e mantêm as lacunas', () => {
    const en = new Translator(EN);
    const es = new Translator(ES);
    expect(en.t('Configurações')).toBe('Settings');
    expect(es.t('Configurações')).toBe('Configuración');
    expect(en.t('Recursos insuficientes: faltam 20 petróleo')).toMatch(/^Not enough resources: missing 20/);
    for (const d of [EN, ES]) for (const [k, v] of Object.entries(d)) expect([...v.matchAll(/\{(\d+)\}/g)].length, k).toBeLessThanOrEqual([...k.matchAll(/\{(\d+)\}/g)].length);
  });
  it('idioma pela região do IP e pelo navegador', () => {
    expect(langForCountry('BR')).toBe('pt');
    expect(langForCountry('pt')).toBe('pt');
    expect(langForCountry('MX')).toBe('es');
    expect(langForCountry('AR')).toBe('es');
    expect(langForCountry('US')).toBe('en');
    expect(langForCountry('DE')).toBe('en');
    expect(langForCountry(null)).toBeNull();
    expect(langForBrowser(['es-419', 'en'])).toBe('es');
    expect(langForBrowser(['fr-FR'])).toBe('en');
  });
});
