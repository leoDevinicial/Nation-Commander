import { MODS } from '../../shared/sim/modernization.ts';
import { AIRCRAFT, type AircraftType } from '../../shared/sim/air.ts';
import { BUILDINGS, CARAVAN, MILITARY_RESEARCH, RESOURCE_LABELS, TICK_RATE, UNITS, VICTORY, type BuildingType, type UnitType } from '../../shared/sim/config.ts';
import type { BuildingStatus } from '../../shared/sim/types.ts';

const HALT_TEXT: Partial<Record<BuildingStatus, string>> = {
  no_workers: 'parado sem trabalhadores',
  storage_full: 'armazenamento cheio, produção pausada',
  no_tank: 'sem tanque de petróleo ao alcance',
  outside_territory: 'recursos fora do território',
  unpaid: 'manutenção não paga',
  no_input: 'sem matéria-prima',
};
import type { SimEvent } from '../../shared/sim/types.ts';
import { specDef, type SpecId } from '../../shared/sim/upgrades.ts';
import { RANK_DAMAGE, RANK_HP, RANKS } from '../../shared/sim/veterancy.ts';
import { ERAS } from '../../shared/sim/eras.ts';

function specLabel(type: BuildingType, spec: SpecId): string {
  return specDef(type, spec)?.label ?? spec;
}

/** Mensagens do painel de eventos, derivadas exclusivamente de eventos da simulação. */
export function describeEvent(e: SimEvent, mySlot: number): { text: string; tone: 'info' | 'good' | 'warn' | 'bad' } | null {
  switch (e.type) {
    case 'construction_started':
      return e.owner === mySlot ? { text: `Construção iniciada: ${BUILDINGS[e.buildingType].label}`, tone: 'info' } : null;
    case 'construction_completed':
      return e.owner === mySlot ? { text: `Construção concluída: ${BUILDINGS[e.buildingType].label}`, tone: 'good' } : null;
    case 'unit_produced':
      return e.owner === mySlot ? { text: `Pronta para o combate: ${UNITS[e.unitType].label}`, tone: 'good' } : null;
    case 'demolished':
      if (e.owner !== mySlot) return null;
      return e.buildingType
        ? { text: `Demolido: ${BUILDINGS[e.buildingType].label}`, tone: 'info' }
        : { text: `${e.roads ?? 1} célula(s) de estrada demolida(s)`, tone: 'info' };
    case 'world':
      return null; // alerta mundial: faixa própria no topo (GameRuntime)
    case 'under_attack':
      return e.owner === mySlot ? { text: 'Nossas forças estão sob ataque!', tone: 'bad' } : null;
    case 'destroyed': {
      const label = e.entity === 'unit' ? UNITS[e.entityType as UnitType].label : BUILDINGS[e.entityType as BuildingType].label;
      if (e.owner === mySlot) return { text: e.entity === 'unit' ? `Unidade perdida: ${label}` : `Estrutura destruída: ${label}`, tone: 'bad' };
      if (e.killerOwner === mySlot && e.entity === 'building') return { text: `Estrutura inimiga destruída: ${label}`, tone: 'good' };
      return null;
    }
    case 'citizen_trained':
      return e.owner === mySlot ? { text: 'Novo cidadão na força de trabalho', tone: 'good' } : null;
    case 'recruit_trained':
      return e.owner === mySlot ? { text: 'Novo recruta na reserva militar', tone: 'good' } : null;
    case 'production_halted':
      return e.owner === mySlot ? { text: `${BUILDINGS[e.buildingType].label}: ${HALT_TEXT[e.reason] ?? 'produção parada'}`, tone: 'warn' } : null;
    case 'deposit_depleted':
      return e.owner === mySlot ? { text: `${BUILDINGS[e.buildingType].label}: depósito esgotado`, tone: 'warn' } : null;
    case 'storage_lost':
      return e.owner === mySlot
        ? { text: `Perda de ${e.amount} de ${RESOURCE_LABELS[e.resource].toLowerCase()} (${e.reason === 'destroyed' ? 'depósito destruído' : e.reason === 'attack' ? 'depósito atingido por ataque' : 'sem espaço de armazenamento'})`, tone: 'bad' }
        : null;
    case 'blackout':
      return e.owner === mySlot
        ? {
            text:
              e.reason === 'supply'
                ? `Apagão: ${e.dark} construção(ões) parada(s) por falta de energia — construa outra usina ou mais carvão`
                : `Sem energia: ${e.dark} construção(ões) longe da rede — ligue com estrada a uma usina ou ao QG`,
            tone: 'bad',
          }
        : null;
    case 'fuel':
      return e.owner === mySlot
        ? e.state === 'out'
          ? { text: 'Sem combustível ⛽: veículos e navios andam a meia velocidade — produza petróleo ou combustível na Refinaria', tone: 'bad' }
          : { text: 'Combustível restabelecido ⛽: veículos e navios voltam à velocidade normal', tone: 'good' }
        : null;
    case 'shortage':
      return e.owner === mySlot
        ? {
            text:
              e.resource === 'food'
                ? 'Fome: sem comida em estoque, a produção cai pela metade'
                : e.resource === 'oil'
                  ? 'Falta petróleo para a manutenção: edifícios mecanizados pararam'
                  : 'Faltam suprimentos para a manutenção: edifícios com manutenção em atraso pararam',
            tone: 'bad',
          }
        : null;
    case 'upgrade_started':
      return e.owner === mySlot ? { text: `Obra de melhoria iniciada: ${BUILDINGS[e.buildingType].label} → nível ${e.toLevel}${e.spec ? ` (${specLabel(e.buildingType, e.spec)})` : ''}`, tone: 'info' } : null;
    case 'upgrade_completed':
      return e.owner === mySlot
        ? { text: `Melhoria concluída: ${BUILDINGS[e.buildingType].label} agora no nível ${e.level}${e.spec ? ` · ${specLabel(e.buildingType, e.spec)}` : ''}`, tone: 'good' }
        : null;
    case 'military_research_completed': {
      if (e.owner !== mySlot) return null;
      const unit = (Object.keys(UNITS) as UnitType[]).find((u) => UNITS[u].requires === e.researchId);
      return { text: `Pesquisa militar concluída: ${MILITARY_RESEARCH[e.researchId].label}${unit ? ` — ${UNITS[unit].label} liberado` : ''}`, tone: 'good' };
    }
    case 'upgrade_cancelled':
      return e.owner === mySlot ? { text: `Obra de melhoria cancelada: ${BUILDINGS[e.buildingType].label} (devolução parcial)`, tone: 'warn' } : null;
    case 'attrition':
      return e.owner === mySlot ? { text: 'Tropas sofrendo atrito em território inimigo: leve um blindado de transporte para manter o suprimento', tone: 'warn' } : null;
    case 'trade_listed':
      return e.seller !== mySlot ? { text: `Novo anúncio ${e.kind === 'sale' ? 'de venda' : 'de contrato'} no comércio (Nação → Comércio)`, tone: 'info' } : null;
    case 'trade_sold':
      if (e.seller === mySlot) return { text: e.kind === 'sale' ? 'Seu anúncio foi comprado: a carga está saindo' : 'Seu contrato foi assinado: a primeira entrega está saindo', tone: 'good' };
      return null;
    case 'contract_update':
      if (e.seller !== mySlot && e.buyer !== mySlot) return null;
      return { text: `Contrato de ${e.seller === mySlot ? 'fornecimento' : 'compra'} encerrado: ${e.text}`, tone: 'warn' };
    case 'shipment_delivered': {
      const r = RESOURCE_LABELS[e.resource as keyof typeof RESOURCE_LABELS] ?? e.resource;
      const usd = e.usd >= 1e6 ? `US$ ${(e.usd / 1e6).toFixed(1).replace('.', ',')} mi` : `US$ ${Math.round(e.usd / 1000)} mil`;
      if (e.buyer === mySlot) return { text: `Carga recebida: ${e.quantity} de ${r} (pago ${usd})`, tone: 'good' };
      if (e.seller === mySlot) return { text: `Carga entregue: ${e.quantity} de ${r} (recebido ${usd})`, tone: 'good' };
      return null;
    }
    case 'shipment_lost':
      return e.seller === mySlot || e.buyer === mySlot ? { text: `Carga perdida: ${e.reason}`, tone: 'bad' } : null;
    case 'embarked':
      return null; // um por tropa: o painel do navio já mostra a carga
    case 'unloaded':
      if (e.owner === mySlot) return { text: `${e.count} ${e.count === 1 ? 'tropa desembarcou' : 'tropas desembarcaram'} na costa`, tone: 'good' };
      return { text: 'Desembarque inimigo avistado na costa!', tone: 'bad' };
    case 'road_destroyed': {
      const what = e.highway ? 'Rodovia' : 'Estrada';
      if (e.owner === mySlot) return { text: `${what} cortada por forças inimigas: energia, caravanas e cargas que passavam por ali param`, tone: 'bad' };
      if (e.by === mySlot) return { text: `${what} inimiga destruída`, tone: 'good' };
      return null;
    }
    case 'caravan_lost':
      return e.owner === mySlot
        ? { text: `Caravana de ${e.city} destruída por forças inimigas; outra sai do Centro de Comando em ${CARAVAN.respawnSeconds} s`, tone: 'bad' }
        : { text: `Caravana inimiga destruída perto de ${e.city}`, tone: 'good' };
    case 'modernize_started':
      return e.owner === mySlot ? { text: `Modernização iniciada: ${UNITS[e.unitType].label} recebendo ${MODS[e.mod].label}`, tone: 'info' } : null;
    case 'unit_modernized':
      return e.owner === mySlot ? { text: `${UNITS[e.unitType].label} modernizado: ${MODS[e.mod].label}`, tone: 'good' } : null;
    case 'modernize_cancelled':
      return e.owner === mySlot
        ? {
            text:
              e.reason === 'facility_lost'
                ? `Modernização interrompida: a instalação foi destruída (${MODS[e.mod].label}, devolução parcial)`
                : `Modernização cancelada: ${MODS[e.mod].label} (devolução parcial)`,
            tone: 'warn',
          }
        : null;
    case 'air_mission':
      return e.owner === mySlot ? { text: e.phase === 'launched' ? e.text : `Missão aérea: ${e.text}`, tone: e.phase === 'launched' ? 'info' : 'good' } : null;
    case 'drone': {
      if (e.owner !== mySlot) return e.phase === 'impact' || e.phase === 'detonated' ? { text: 'Drone inimigo explodiu perto das nossas posições', tone: 'warn' } : null;
      if (e.phase === 'launched') return { text: 'Drone lançado: clique nele ou aperte T nos próximos segundos para pilotar em primeira pessoa', tone: 'info' };
      if (e.phase === 'shot_down') return { text: 'Drone derrubado pela antiaérea inimiga', tone: 'bad' };
      if (e.phase === 'battery') return { text: 'Drone caiu sem bateria', tone: 'warn' };
      const hit = (e.damage ?? 0) > 0;
      return hit
        ? { text: `Drone atingiu o alvo: ${e.damage} de dano${e.kills ? `, ${e.kills} destruído(s)` : ''}`, tone: 'good' }
        : { text: 'Drone explodiu sem atingir inimigos', tone: 'warn' };
    }
    case 'aircraft_lost':
      return e.owner === mySlot ? { text: `Aeronave perdida: ${AIRCRAFT[e.aircraftType as AircraftType]?.label ?? e.aircraftType}`, tone: 'bad' } : null;
    case 'city_captured':
      if (e.owner === mySlot) return { text: `Cidade conquistada: ${e.city}${e.buildings ? ` e mais ${e.buildings} edifício(s)` : ''} agora são nossos`, tone: 'good' };
      if (e.victim === mySlot) return { text: `Cidade perdida: ${e.city} foi tomada pelo inimigo${e.buildings ? ` com mais ${e.buildings} edifício(s)` : ''}`, tone: 'bad' };
      return null;
    case 'dogfight':
      if (!e.kill) return null;
      if (e.owner === mySlot) return { text: 'Combate aéreo: aeronave inimiga abatida', tone: 'good' };
      return null;
    case 'air_strike':
      if (e.victim === mySlot)
        return { text: `Ataque aéreo inimigo: ${BUILDINGS[e.buildingType].label} atingido (${e.damage} de dano${e.oilLost ? `, ${e.oilLost} de petróleo perdidos` : ''}${e.destroyed ? ', destruído' : ''})`, tone: 'bad' };
      return null;
    case 'missile':
      if (e.owner === mySlot) return { text: e.text, tone: e.state === 'impact' ? 'good' : e.state === 'intercepted' || e.state === 'aborted' ? 'warn' : 'info' };
      if (e.targetOwner === mySlot)
        return e.state === 'flight'
          ? { text: 'ALERTA: míssil inimigo lançado contra o nosso território!', tone: 'bad' }
          : e.state === 'intercepted'
            ? { text: 'Míssil inimigo interceptado pela nossa antiaérea', tone: 'good' }
            : { text: 'Impacto de míssil inimigo no nosso território', tone: 'bad' };
      return null;
    case 'era': {
      const label = ERAS[e.era].label;
      if (e.owner === mySlot) {
        if (e.state === 'started') return { text: `Avanço para a era ${label} iniciado no Centro de Comando`, tone: 'info' };
        if (e.state === 'cancelled') return { text: `Avanço para a era ${label} cancelado (devolução parcial)`, tone: 'warn' };
        return { text: `Nova era: ${label}! As construções ganham o visual da era e novas tropas e construções foram liberadas`, tone: 'good' };
      }
      return e.state === 'completed' ? { text: `O inimigo entrou na era ${label}`, tone: 'warn' } : null;
    }
    case 'space':
      if (e.state === 'countdown') return { text: e.owner === mySlot ? 'Programa Espacial: lançamento autorizado, contagem regressiva iniciada' : 'Alerta: o inimigo iniciou a contagem de um lançamento espacial', tone: e.owner === mySlot ? 'info' : 'warn' };
      if (e.state === 'ascent') return { text: e.owner === mySlot ? 'Ignição! O foguete deixou a plataforma' : 'Um foguete inimigo decolou', tone: e.owner === mySlot ? 'good' : 'warn' };
      return null;
    case 'victory_progress': {
      const mine = e.slot === mySlot;
      if (e.kind === 'territory') {
        if (e.state === 'started')
          return mine
            ? { text: `Domínio territorial: controlamos ${Math.round(VICTORY.territoryShare * 100)}% do território. Mantenha por ${VICTORY.territorySeconds / 60} min para vencer`, tone: 'good' }
            : { text: `Alerta: o inimigo domina ${Math.round(VICTORY.territoryShare * 100)}% do território. Retome fronteiras em ${VICTORY.territorySeconds / 60} min ou perde a guerra`, tone: 'bad' };
        if (e.state === 'lost') return { text: mine ? 'Perdemos o domínio territorial: a contagem parou' : 'O domínio territorial do inimigo foi quebrado', tone: mine ? 'warn' : 'good' };
        return null;
      }
      if (e.state === 'started')
        return mine
          ? { text: `Crise política: estabilidade abaixo de ${VICTORY.politicalStability}. Em ${VICTORY.politicalDays} dias o governo cai`, tone: 'bad' }
          : { text: 'O governo inimigo entrou em colapso de estabilidade', tone: 'good' };
      if (e.state === 'lost') return mine ? { text: 'A crise política foi contida', tone: 'good' } : null;
      return { text: mine ? 'Nosso governo caiu: colapso político' : 'O governo inimigo caiu: colapso político', tone: mine ? 'bad' : 'good' };
    }
    case 'mine':
      if (e.state === 'laid') return e.owner === mySlot ? { text: 'Mina antitanque instalada', tone: 'info' } : null;
      if (e.state === 'cleared')
        return e.by === mySlot ? { text: 'Engenheiro removeu uma mina inimiga', tone: 'good' } : e.owner === mySlot ? { text: 'Uma das nossas minas foi removida pelo inimigo', tone: 'warn' } : null;
      return e.owner === mySlot
        ? { text: 'Mina antitanque detonada sob um veículo inimigo', tone: 'good' }
        : e.by === mySlot
          ? { text: 'Um veículo nosso passou sobre uma mina inimiga', tone: 'bad' }
          : null;
    case 'unit_promoted':
      return e.owner === mySlot ? { text: `${UNITS[e.unitType].label} promovido a ${RANKS[e.rank]?.label ?? 'veterano'}: +${Math.round(RANK_DAMAGE * e.rank * 100)}% de dano e +${Math.round(RANK_HP * e.rank * 100)}% de vida`, tone: 'good' } : null;
    case 'border_incident': {
      const secs = Math.round((e.untilTick - e.tick) / TICK_RATE);
      if (e.victim === mySlot) return { text: `Incidente de fronteira: tropas inimigas atacam a nossa borda. Podemos revidar por ${secs} s, sem guerra declarada.`, tone: 'bad' };
      if (e.aggressor === mySlot) return { text: `Incidente de fronteira provocado: troca de tiros por ${secs} s, sem guerra declarada.`, tone: 'warn' };
      return null;
    }
    case 'player_defeated':
      return { text: e.slot === mySlot ? 'Nosso QG caiu.' : 'Forças inimigas derrotadas!', tone: e.slot === mySlot ? 'bad' : 'good' };
    default:
      return null;
  }
}

/**
 * Alerta mundial (03/11): título, texto e tom da faixa do topo. `nameOf` dá o nome do país de cada jogador.
 * Do ponto de vista de quem recebe: "nós" quando é o próprio país, o nome dele nos outros casos.
 */
export function worldAlertText(
  e: Extract<SimEvent, { type: 'world' }>,
  mySlot: number,
  nameOf: (slot: number) => string,
): { icon: string; title: string; text: string; tone: 'info' | 'warn' | 'bad' } {
  const who = e.slot === mySlot ? 'Nosso país' : nameOf(e.slot);
  switch (e.kind) {
    case 'war': {
      const target = e.other === mySlot ? 'nós' : nameOf(e.other ?? -1);
      return { icon: '⚔', title: 'Declaração de guerra', text: `${who} declarou guerra a ${target}`, tone: e.other === mySlot ? 'bad' : 'warn' };
    }
    case 'era':
      return { icon: '⏫', title: 'Nova era', text: `${who} entrou na era ${ERAS[(e.era ?? 1) as keyof typeof ERAS]?.label ?? e.era}`, tone: e.slot === mySlot ? 'info' : 'warn' };
    case 'nuclear':
      return e.phase === 'started'
        ? { icon: '☢', title: 'Programa nuclear', text: `${who} começou a pesquisar armas nucleares`, tone: e.slot === mySlot ? 'info' : 'bad' }
        : { icon: '☢', title: 'Potência nuclear', text: `${who} agora tem armas nucleares`, tone: e.slot === mySlot ? 'info' : 'bad' };
    case 'project': {
      const label = e.buildingType ? BUILDINGS[e.buildingType].label : 'Grande Projeto';
      return e.phase === 'started'
        ? { icon: '🏛', title: 'Grande Projeto', text: `${who} começou a construir: ${label}`, tone: e.slot === mySlot ? 'info' : 'warn' }
        : { icon: '🏛', title: 'Grande Projeto concluído', text: `${who} concluiu: ${label}`, tone: e.slot === mySlot ? 'info' : 'warn' };
    }
  }
}
