import { useEffect, useState } from 'react';
import { REGIONS, multiRegion, probeRegions, regionPings, regionPreference, setRegionPreference } from '../../net/regionState.ts';
import { bestRegion } from '../../net/regions.ts';

/**
 * KNPS-08: região onde as salas novas são criadas. Só aparece com mais de um servidor configurado. "Automático" usa o
 * de menor ping medido agora; o jogador pode fixar uma região (ex.: para jogar com amigos de outro continente).
 */
export function RegionPicker() {
  const [pref, setPref] = useState(regionPreference);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!multiRegion) return;
    void probeRegions(true).then(() => setTick((t) => t + 1));
  }, []);
  if (!multiRegion) return null;
  const ms = (letter: string) => {
    const p = regionPings.get(letter);
    return p === undefined ? '…' : p === null ? 'sem resposta' : `${p} ms`;
  };
  const best = bestRegion(REGIONS, regionPings);
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-ink-400">
      Região das salas novas:
      <select
        className="field min-h-8 py-0 text-xs"
        value={pref}
        onChange={(e) => {
          setPref(e.target.value);
          setRegionPreference(e.target.value);
        }}
      >
        <option value="auto">
          Automático ({best.label}, {ms(best.letter)})
        </option>
        {REGIONS.map((r) => (
          <option key={r.letter} value={r.letter}>
            {r.label} ({ms(r.letter)})
          </option>
        ))}
      </select>
    </label>
  );
}
