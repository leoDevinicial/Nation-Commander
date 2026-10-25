import { countryName } from '../../../shared/data/countries.ts';
import { gameClient } from '../../net/client.ts';
import { formatDuration } from '../../lib/format.ts';
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
        <p className="mt-4 text-center text-xs text-ink-400">
          {end.recorded ? '✔ Partida registrada no seu perfil.' : guest ? 'Partida de convidado: estatísticas não são salvas.' : '⚠ Não foi possível registrar esta partida.'}
        </p>
        <div className="mt-4 text-center">
          <button className="btn btn-primary" onClick={back}>
            Voltar ao menu
          </button>
        </div>
      </div>
    </div>
  );
}
