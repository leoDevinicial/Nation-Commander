import { useState } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { factionColor } from '../../game/factions.ts';
import { ChatBox } from '../components/ChatBox.tsx';
import { CountrySelect } from '../components/CountrySelect.tsx';
import { CountryCard } from '../components/CountryCard.tsx';
import { autoFullscreen } from '../components/FullscreenButton.tsx';
import { Shell } from '../components/Shell.tsx';

export function LobbyScreen() {
  const room = useAppStore((s) => s.room);
  const me = useAppStore((s) => s.serverUser);
  const [copied, setCopied] = useState(false);
  if (!room || !me) return null;

  const isHost = room.hostUserId === me.id;
  const mine = room.players.find((p) => p.userId === me.id);
  const others = room.players.filter((p) => p.userId !== room.hostUserId);
  const canStart = isHost && room.players.length === room.maxPlayers && others.every((p) => p.ready);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Shell title={room.mode === 'sandbox' ? 'Modo Sandbox' : room.mode === 'vs_ai' ? 'Operação contra a IA' : 'Sala multijogador'} wide="xl">
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          {room.mode === 'pvp' && (
            <div className="mb-4 flex items-center gap-3 rounded border border-ink-700 bg-ink-950 p-3">
              <span className="label mb-0">Código da sala</span>
              <span className="font-mono text-2xl font-bold tracking-[0.35em] text-brass-400">{room.code}</span>
              <button className="btn ml-auto" onClick={() => void copy()}>
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          )}
          <ul className="space-y-2">
            {Array.from({ length: room.maxPlayers }, (_, slot) => {
              const p = room.players.find((x) => x.slot === slot);
              return (
                <li key={slot} className="flex items-center gap-3 rounded border border-ink-700 bg-ink-850 p-3">
                  <span className="inline-block h-8 w-1.5 rounded" style={{ background: factionColor(slot) }} aria-hidden />
                  {p ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          {p.name} {p.userId === room.hostUserId && <span className="text-xs text-brass-400">★ anfitrião</span>}
                          {p.isAI && <span className="ml-1 text-xs text-ink-400">(IA)</span>}
                        </div>
                        {p === mine ? (
                          <div className="mt-1 max-w-xs">
                            <CountrySelect value={p.countryId} onChange={(countryId) => gameClient.send({ t: 'set_country', countryId })} />
                          </div>
                        ) : (
                          <div className="text-xs text-ink-400">{countryName(p.countryId)}</div>
                        )}
                      </div>
                      <span className={`text-xs font-semibold ${p.ready || p.userId === room.hostUserId ? 'text-signal-green' : 'text-ink-400'}`}>
                        {p.userId === room.hostUserId ? 'Anfitrião' : p.ready ? '✔ Pronto' : '… Aguardando'}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-ink-400">Aguardando jogador — compartilhe o código.</span>
                  )}
                </li>
              );
            })}
          </ul>
          <fieldset className="mt-4 rounded border border-ink-700 p-3">
            <legend className="label px-1">Regra do teatro de operações</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['parity', 'Paridade econômica', 'A logística do teatro depende da parcela do PIB investida em defesa, como se todos tivessem a mesma escala econômica. Recomendado para disputas equilibradas.'],
                  ['realistic', 'Escala real', 'A logística depende do gasto de defesa real de cada país. Grandes economias têm vantagem — a dificuldade emerge dos dados.'],
                ] as const
              ).map(([mode, title, desc]) => (
                <label key={mode} className={`flex cursor-pointer gap-2 rounded border p-2 text-xs ${room.balanceMode === mode ? 'border-brass-400 bg-ink-850' : 'border-ink-700'} ${isHost ? '' : 'cursor-default opacity-80'}`}>
                  <input type="radio" name="balance" className="mt-0.5 accent-[#e0b44c]" checked={room.balanceMode === mode} disabled={!isHost} onChange={() => gameClient.send({ t: 'set_balance', mode })} />
                  <span>
                    <span className="block font-semibold text-ink-100">{title}</span>
                    <span className="text-ink-400">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
            {!isHost && <p className="mt-1 text-[11px] text-ink-400">Só o anfitrião escolhe a regra.</p>}
          </fieldset>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {room.players.map((p) => (
              <CountryCard key={p.slot} id={p.countryId} balanceMode={room.balanceMode} />
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {isHost ? (
              <button
                className="btn btn-primary"
                disabled={!canStart}
                onClick={() => {
                  autoFullscreen();
                  gameClient.send({ t: 'start' });
                }}
              >
                Iniciar Operação
              </button>
            ) : (
              <button
                className={`btn ${mine?.ready ? '' : 'btn-primary'}`}
                onClick={() => {
                  if (!mine?.ready) autoFullscreen();
                  gameClient.send({ t: 'set_ready', ready: !mine?.ready });
                }}
              >
                {mine?.ready ? 'Cancelar Pronto' : 'Estou Pronto'}
              </button>
            )}
            <button className="btn btn-danger ml-auto" onClick={() => gameClient.send({ t: 'leave_room' })}>
              Sair da Sala
            </button>
          </div>
        </div>
        <ChatBox />
      </div>
    </Shell>
  );
}
