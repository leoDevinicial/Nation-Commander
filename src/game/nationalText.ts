import { countryName } from '../../shared/data/countries.ts';
import type { NationalEvent } from '../../shared/strategic/NationalSimulation.ts';
import { TECHNOLOGIES } from '../../shared/strategic/technologies.ts';
import { formatPct } from '../lib/format.ts';

const INDICATOR = { debt: 'Dívida pública', inflation: 'Inflação', approval: 'Aprovação do governo', growth: 'Crescimento do PIB' } as const;

/**
 * Texto de um evento nacional. Cada frase deriva só dos campos do evento: números vêm do
 * registro, causas só são citadas quando o motor as registrou.
 */
export function describeNationalEvent(
  e: NationalEvent,
  mySlot: number,
  countryOf: (slot: number) => string,
): { text: string; tone: 'info' | 'good' | 'warn' | 'bad' } | null {
  const mine = e.slot === mySlot;
  const who = mine ? 'Nosso país' : countryName(countryOf(e.slot));
  switch (e.type) {
    case 'research_completed':
      return { text: `${mine ? 'Pesquisa concluída' : `${who} concluiu pesquisa`}: ${TECHNOLOGIES[e.techId].label}`, tone: mine ? 'good' : 'warn' };
    case 'protest': {
      const causes = e.causes.map((c) => c.label.toLowerCase()).join(', ');
      return {
        text: `Protestos em ${mine ? 'nosso país' : countryName(countryOf(e.slot))} (aprovação ${formatPct(e.approval, 0)})${causes ? ` — principais fatores negativos: ${causes}` : ''}`,
        tone: mine ? 'bad' : 'info',
      };
    }
    case 'threshold': {
      if (!mine) return null;
      const label = INDICATOR[e.indicator];
      if (e.indicator === 'growth') {
        return e.direction === 'down'
          ? { text: `Economia em contração: crescimento anualizado de ${formatPct(e.value)}`, tone: 'bad' }
          : { text: `Economia volta a crescer: ${formatPct(e.value)} anualizado`, tone: 'good' };
      }
      const bad = e.indicator === 'approval' ? e.direction === 'down' : e.direction === 'up';
      const verb = e.direction === 'up' ? 'ultrapassou' : 'caiu abaixo de';
      const unit = e.indicator === 'debt' ? '% do PIB' : '%';
      return { text: `${label} ${verb} ${e.threshold}${unit} (agora ${formatPct(e.value)})`, tone: bad ? 'bad' : 'good' };
    }
    case 'budget_changed':
      return mine ? { text: `Novo orçamento em vigor: saldo de ${formatPct(-e.deficitPctGdp)} do PIB`, tone: 'info' } : null;
  }
}
