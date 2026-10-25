import { countryName } from '../../../shared/data/countries.ts';
import { gameClient } from '../../net/client.ts';
import { formatDuration, formatPct, formatSigned, formatUsd } from '../../lib/format.ts';
import { TECHNOLOGIES } from '../../../shared/strategic/technologies.ts';
import { factionColor } from '../../game/factions.ts';
import { useAppStore } from '../../state/useAppStore.ts';

const REASON = {
  hq_destroyed: 'Quartel-general destruído',
  forfeit: 'Rendição',
  disconnect: 'Abandono por desconexão',
  draw: 'Empate',
} as const;

export function ResultsOverlay() {
  const end = useAppStore((s) => s.matchEnd);
  const mySlot = useAppStore((s) => s.match?.yourSlot);
  const guest = useAppStore((s) => s.guest);
  if (!end) return null;
  const me = end.players.find((p) => p.slot === mySlot);
  const title = me?.result === 'win' ? 'Vitória' : me?.result === 'loss' ? 'Derrota' : 'Empate';

  const back = () => {
    gameClient.send({ t: 'leave_room' });
    useAppStore.setState({ screen: 'menu', match: null, matchEnd: null, room: null, chat: [] });
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/80 p-4">
      <div className="panel w-full max-w-2xl p-6" role="dialog" aria-label="Resultado da partida">
        <div className="text-center">
          <div className={`text-4xl font-black tracking-wide ${me?.result === 'win' ? 'text-signal-green' : me?.result === 'loss' ? 'text-red-300' : ''}`}>{title}</div>
          <div className="mt-1 text-sm text-ink-400">
            {REASON[end.reason]} · duração {formatDuration(end.durationSeconds)}
          </div>
        </div>
        <table className="mt-5 w-full text-left text-sm">
          <thead className="text-xs text-ink-400">
            <tr>
              <th className="py-1">Comandante</th>
              <th>Produzidas</th>
              <th>Abates</th>
              <th>Perdas</th>
              <th>Estruturas destruídas</th>
              <th>Suprimentos coletados</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {end.players.map((p) => (
              <tr key={p.slot} className="border-t border-ink-800">
                <td className="py-1.5 font-sans">
                  <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: factionColor(p.slot) }} aria-hidden />
                  {p.name} <span className="text-xs text-ink-400">({countryName(p.countryId)})</span>
                </td>
                <td>{p.stats.unitsProduced}</td>
                <td>{p.stats.unitsKilled}</td>
                <td>{p.stats.unitsLost}</td>
                <td>{p.stats.structuresDestroyed}</td>
                <td>{Math.round(p.stats.resourcesGathered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {end.players.some((p) => p.national) && (
          <>
            <h3 className="mt-5 text-xs font-semibold tracking-wider text-ink-400 uppercase">Desempenho nacional (linha histórica alternativa)</h3>
            <table className="mt-1 w-full text-left text-sm">
              <thead className="text-xs text-ink-400">
                <tr>
                  <th className="py-1">País</th>
                  <th>PIB final</th>
                  <th>Variação</th>
                  <th>Aprovação</th>
                  <th>Dívida/PIB</th>
                  <th>Inflação</th>
                  <th>Pesquisas</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {end.players.map((p) =>
                  p.national ? (
                    <tr key={p.slot} className="border-t border-ink-800">
                      <td className="py-1.5 font-sans">{countryName(p.national.countryId)}</td>
                      <td>{formatUsd(p.national.gdpEndUsd)}</td>
                      <td>{formatSigned(((p.national.gdpEndUsd / p.national.gdpStartUsd) - 1) * 100, 1, '%')}</td>
                      <td>{formatPct(p.national.approvalEnd, 0)}</td>
                      <td>{formatPct(p.national.debtPctGdpEnd, 0)}</td>
                      <td>{formatPct(p.national.inflationEndPct)}</td>
                      <td className="font-sans text-xs" title={p.national.researchDone.map((t) => TECHNOLOGIES[t].label).join(', ')}>
                        {p.national.researchDone.length}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-ink-400">
              {end.players.find((p) => p.national)?.national?.days ?? 0} dias simulados a partir de 01/01/2026.
            </p>
          </>
        )}
        <p className="mt-4 text-center text-xs text-ink-400">
          {end.recorded ? '✔ Partida registrada no seu perfil.' : guest ? 'Partida de convidado: estatísticas não são salvas.' : '⚠ Não foi possível registrar esta partida.'}
        </p>
        <div className="mt-4 text-center">
          <button className="btn btn-primary" onClick={back}>
            Voltar ao Menu
          </button>
        </div>
      </div>
    </div>
  );
}
