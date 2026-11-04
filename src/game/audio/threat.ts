/**
 * Estado de ameaça para a trilha sonora (04/11). Três níveis:
 *  - `calm`: economia e construção (Architect of the Horizon / The Last Perimeter);
 *  - `combat`: ataque convencional, tiros envolvendo o jogador (The War Board);
 *  - `massive`: ataque em massa, perdas pesadas, cidade tomada ou guerra nuclear (Strike at Zero).
 * Subir de nível é imediato; descer só depois de um tempo sem novos sinais (histerese), para a música não ficar
 * trocando a cada tiro. Só usa o que o jogador já vê (eventos e unidades do snapshot).
 */
export type Threat = 'calm' | 'combat' | 'massive';

export const THREAT = {
  /** Segundos de calma até a música de combate voltar à de construção. */
  combatHold: 25,
  /** Segundos até a música de ataque massivo baixar para a de combate. */
  massiveHold: 40,
  /** Guerra nuclear: o clima pesado dura mais. */
  nuclearHold: 90,
  /** Inimigos à vista perto das nossas construções para virar ataque massivo. */
  massiveEnemies: 16,
  /** Perdas nossas (unidades e construções) numa janela para virar ataque massivo. */
  massiveLosses: 8,
  lossWindow: 20,
  /** Tiros envolvendo o jogador numa janela para virar batalha pesada. */
  massiveShots: 80,
  shotWindow: 12,
};

const RANK: Record<Threat, number> = { calm: 0, combat: 1, massive: 2 };

export class ThreatTracker {
  private combatUntil = -Infinity;
  private massiveUntil = -Infinity;
  private losses: number[] = [];
  private shots: number[] = [];

  /** Combate convencional: ataque sofrido, tiro nosso, míssil vindo, incidente de fronteira. */
  combat(now: number): void {
    this.combatUntil = Math.max(this.combatUntil, now + THREAT.combatHold);
  }

  /** Ataque massivo ou guerra nuclear (com o tempo de permanência). */
  massive(now: number, hold = THREAT.massiveHold): void {
    this.massiveUntil = Math.max(this.massiveUntil, now + hold);
    this.combat(now + hold);
  }

  /** Uma perda nossa (unidade ou construção): muitas em pouco tempo viram ataque massivo. */
  loss(now: number): void {
    this.combat(now);
    this.losses.push(now);
    this.losses = this.losses.filter((t) => now - t <= THREAT.lossWindow);
    if (this.losses.length >= THREAT.massiveLosses) this.massive(now);
  }

  /** Um tiro envolvendo o jogador: muitos em pouco tempo viram batalha pesada. */
  shot(now: number): void {
    this.combat(now);
    this.shots.push(now);
    if (this.shots.length > THREAT.massiveShots * 2)
      this.shots = this.shots.slice(-THREAT.massiveShots);
    this.shots = this.shots.filter((t) => now - t <= THREAT.shotWindow);
    if (this.shots.length >= THREAT.massiveShots) this.massive(now);
  }

  /** Inimigos à vista perto das nossas construções (amostrado a cada segundo). */
  enemiesNear(count: number, now: number): void {
    if (count >= THREAT.massiveEnemies) this.massive(now);
    else if (count > 0) this.combat(now);
  }

  level(now: number): Threat {
    if (now < this.massiveUntil) return 'massive';
    if (now < this.combatUntil) return 'combat';
    return 'calm';
  }
}

export function threatRank(t: Threat): number {
  return RANK[t];
}
