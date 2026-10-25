import { countryName } from '../../shared/data/countries.ts';
import type { TreatyType } from '../../shared/strategic/Diplomacy.ts';
import type { NationalEvent } from '../../shared/strategic/NationalSimulation.ts';
import { TECHNOLOGIES } from '../../shared/strategic/technologies.ts';
import { formatPct, formatUsd } from '../lib/format.ts';

const INDICATOR = { debt: 'Dívida pública', inflation: 'Inflação', approval: 'Aprovação do governo', growth: 'Crescimento do PIB' } as const;

export const TREATY_LABEL: Record<TreatyType, string> = {
  trade: 'Acordo comercial',
  alliance: 'Acordo de defesa',
  sanctions: 'Sanções',
};

const PROPOSAL_LABEL: Record<string, string> = { trade: 'acordo comercial', alliance: 'acordo de defesa', sanctions: 'pedido de sanções' };

/**
 * Texto de um evento nacional. Cada frase deriva só dos campos do evento: números vêm do
 * registro, causas só são citadas quando o motor as registrou.
 * `nameOf` devolve o nome do país de uma nação (jogador ou governo da IA).
 */
export function describeNationalEvent(e: NationalEvent, mySlot: number, nameOf: (id: number) => string): { text: string; tone: 'info' | 'good' | 'warn' | 'bad' } | null {
  if (e.type === 'diplomacy') return describeDiplomatic(e.event, mySlot, nameOf);
  const mine = e.slot === mySlot;
  const who = mine ? 'Nosso país' : nameOf(e.slot);
  switch (e.type) {
    case 'research_completed':
      return { text: `${mine ? 'Pesquisa concluída' : `${who} concluiu pesquisa`}: ${TECHNOLOGIES[e.techId].label}`, tone: mine ? 'good' : 'warn' };
    case 'protest': {
      // protestos em países fora da partida não poluem o painel
      if (e.slot >= 100) return null;
      const causes = e.causes.map((c) => c.label.toLowerCase()).join(', ');
      return {
        text: `Protestos em ${mine ? 'nosso país' : nameOf(e.slot)} (aprovação ${formatPct(e.approval, 0)})${causes ? ` — principais fatores negativos: ${causes}` : ''}`,
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

function describeDiplomatic(
  e: Extract<NationalEvent, { type: 'diplomacy' }>['event'],
  mySlot: number,
  nameOf: (id: number) => string,
): { text: string; tone: 'info' | 'good' | 'warn' | 'bad' } | null {
  switch (e.type) {
    case 'treaty_signed': {
      const t = e.treaty;
      if (t.type === 'sanctions') {
        if (t.b === mySlot) return { text: `${nameOf(t.a)} impôs sanções contra nosso país`, tone: 'bad' };
        if (t.a === mySlot) return { text: `Sanções contra ${nameOf(t.b)} em vigor`, tone: 'info' };
        return { text: `${nameOf(t.a)} impôs sanções contra ${nameOf(t.b)}`, tone: t.b < 100 ? 'good' : 'info' };
      }
      const involved = t.a === mySlot || t.b === mySlot;
      const other = t.a === mySlot ? t.b : t.a;
      return involved
        ? { text: `${TREATY_LABEL[t.type]} assinado com ${nameOf(other)} (até o dia ${t.endDay})`, tone: 'good' }
        : { text: `${nameOf(t.a)} e ${nameOf(t.b)} assinaram ${TREATY_LABEL[t.type].toLowerCase()}`, tone: 'warn' };
    }
    case 'proposal_rejected': {
      if (e.from !== mySlot) return null;
      const neg = e.reasons.filter((r) => r.value < 0).map((r) => r.label.toLowerCase());
      return { text: `${nameOf(e.to)} recusou o ${PROPOSAL_LABEL[e.proposal] ?? e.proposal}${neg.length ? ` — pesaram contra: ${neg.join(', ')}` : ' — interesse insuficiente'}`, tone: 'warn' };
    }
    case 'treaty_ended': {
      const t = e.treaty;
      if (t.a !== mySlot && t.b !== mySlot) return null;
      const other = t.a === mySlot ? t.b : t.a;
      return { text: `${TREATY_LABEL[t.type]} com ${nameOf(other)} ${e.reason === 'expired' ? 'expirou' : 'foi encerrado'}`, tone: 'info' };
    }
    case 'aid_sent':
      return e.from === mySlot ? { text: `Ajuda de ${formatUsd(e.amountUsd)} enviada a ${nameOf(e.to)}`, tone: 'info' } : null;
  }
}

export function makeNameOf(players: { slot: number; countryId: string }[], npcs: { id: number; countryId: string }[]): (id: number) => string {
  return (id) => {
    const p = players.find((x) => x.slot === id);
    if (p) return countryName(p.countryId);
    const n = npcs.find((x) => x.id === id);
    return n ? countryName(n.countryId) : `#${id}`;
  };
}
