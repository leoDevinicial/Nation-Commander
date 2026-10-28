/**
 * Densidade da decoração (árvores, arbustos e pedras) para o KGPS: cada instância tem uma posição
 * fixa numa fila (pela sua posição no mapa), e uma densidade d mantém só as que estão abaixo de d.
 * Assim o subconjunto é sempre o mesmo e encaixado — quem fica com 50% também fica com 75% — e
 * nenhuma árvore some e volta ao mudar de nível ("pisca").
 */
export function decorRank(x: number, z: number): number {
  const v = Math.sin(x * 41.37 + z * 289.13) * 15731.743;
  return v - Math.floor(v);
}

export function decorKept(x: number, z: number, density: number): boolean {
  return density >= 1 || decorRank(x, z) < density;
}
