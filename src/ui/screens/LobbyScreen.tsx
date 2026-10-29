import { useState } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import { DIFFICULTIES, DIFFICULTY } from '../../../shared/sim/difficulty.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { factionColor } from '../../game/factions.ts';
import { MAP_TYPE_INFO, MAP_TYPES, MAX_NATIONS_FREE, MAX_NATIONS_SUBSCRIBER, REGION_INFO, mapSizeFor, regionOf } from '../../../shared/sim/matchMap.ts';
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
  const canStart = isHost && room.players.length >= 2 && others.every((p) => p.ready || p.isAI);
  const sandbox = room.mode === 'sandbox';
  const limit = room.nationLimit ?? 2;
  const canTeam = (p: (typeof room.players)[number]) => (p.isAI ? isHost : p.userId === me.id);

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
                        ) : p.isAI && isHost ? (
                          <div className="mt-1 max-w-xs">
                            <CountrySelect
                              value={p.countryId}
                              random
                              label={`País de ${p.name}`}
                              taken={room.players.filter((x) => x !== p).map((x) => x.countryId)}
                              onChange={(countryId) => gameClient.send({ t: 'set_bot_country', slot: p.slot, countryId })}
                            />
                          </div>
                        ) : (
                          <div className="text-xs text-ink-400">{countryName(p.countryId)}</div>
                        )}
                        <div className="mt-0.5 text-[11px] text-ink-400" title={REGION_INFO[regionOf(p.countryId)].text}>
                          Região inicial: {REGION_INFO[regionOf(p.countryId)].label}
                        </div>
                      </div>
                      {!sandbox && room.maxPlayers > 2 && (
                        <select
                          className="field w-auto py-1 text-xs"
                          aria-label={`Time de ${p.name}`}
                          value={p.team ?? 0}
                          disabled={!canTeam(p)}
                          onChange={(e) => gameClient.send({ t: 'set_team', slot: p.slot, team: Number(e.target.value) || null })}
                        >
                          <option value={0}>Sem time</option>
                          <option value={1}>Time A</option>
                          <option value={2}>Time B</option>
                          <option value={3}>Time C</option>
                        </select>
                      )}
                      {p.isAI && isHost && !sandbox && (room.mode === 'pvp' || room.players.filter((x) => x.isAI).length > 1) && (
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => gameClient.send({ t: 'remove_bot', slot: p.slot })} title="Remover este bot">
                          ✖
                        </button>
                      )}
                      <span className={`text-xs font-semibold ${p.ready || p.userId === room.hostUserId ? 'text-signal-green' : 'text-ink-400'}`}>
                        {p.userId === room.hostUserId ? 'Anfitrião' : p.ready ? '✔ Pronto' : '… Aguardando'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-ink-400">{room.mode === 'pvp' ? 'Vaga aberta — compartilhe o código ou adicione um bot.' : 'Vaga aberta para um bot.'}</span>
                      {isHost && (
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => gameClient.send({ t: 'add_bot' })}>
                          + Bot (IA)
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {!sandbox && (
            <fieldset className="mt-4 rounded border border-ink-700 p-3">
              <legend className="label px-1">Nações e mapa</legend>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-300">Nações na partida:</span>
                {Array.from({ length: Math.max(0, limit - 1) }, (_, i) => i + 2).map((n) => (
                  <button
                    key={n}
                    className={`btn min-h-7 px-2.5 py-0.5 text-xs ${room.maxPlayers === n ? 'btn-primary' : ''}`}
                    disabled={!isHost || n < room.players.length}
                    aria-pressed={room.maxPlayers === n}
                    onClick={() => gameClient.send({ t: 'set_room', maxPlayers: n })}
                  >
                    {n}
                  </button>
                ))}
                <span className="text-[11px] text-ink-400">
                  {limit >= MAX_NATIONS_SUBSCRIBER ? `Assinante: até ${MAX_NATIONS_SUBSCRIBER} nações.` : `Versão grátis: até ${MAX_NATIONS_FREE} nações (assinantes: até ${MAX_NATIONS_SUBSCRIBER}).`} Mapa de{' '}
                  {mapSizeFor(room.maxPlayers)}×{mapSizeFor(room.maxPlayers)} células.
                </span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {([...MAP_TYPES, 'random'] as const).map((t) => {
                  const on = (room.mapType ?? 'continental') === t;
                  const info = t === 'random' ? { label: 'Sorteado', description: 'Um dos tipos acima, sorteado no início da partida.' } : MAP_TYPE_INFO[t];
                  return (
                    <label key={t} className={`flex cursor-pointer gap-2 rounded border p-2 text-xs ${on ? 'border-brass-400 bg-ink-850' : 'border-ink-700'} ${isHost ? '' : 'cursor-default opacity-80'}`}>
                      <input type="radio" name="mapType" className="mt-0.5 accent-[#e0b44c]" checked={on} disabled={!isHost} onChange={() => gameClient.send({ t: 'set_room', mapType: t })} />
                      <span>
                        <span className="block font-semibold text-ink-100">{info.label}</span>
                        <span className="text-ink-400">{info.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                Times: quem está no mesmo time começa aliado e não pode declarar guerra ao parceiro. Oceano Central e Arquipélago chegam com o conteúdo naval.
              </p>
            </fieldset>
          )}
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
          {(room.mode !== 'pvp' || room.players.some((p) => p.isAI)) && (
            <fieldset className="mt-4 rounded border border-ink-700 p-3">
              <legend className="label px-1">Dificuldade da IA</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {DIFFICULTIES.map((d) => {
                  const on = (room.difficulty ?? 'normal') === d;
                  return (
                    <label key={d} className={`flex cursor-pointer gap-2 rounded border p-2 text-xs ${on ? 'border-brass-400 bg-ink-850' : 'border-ink-700'} ${isHost ? '' : 'cursor-default opacity-80'}`}>
                      <input type="radio" name="difficulty" className="mt-0.5 accent-[#e0b44c]" checked={on} disabled={!isHost} onChange={() => gameClient.send({ t: 'set_difficulty', difficulty: d })} />
                      <span>
                        <span className="block font-semibold text-ink-100">{DIFFICULTY[d].label}</span>
                        <span className="text-ink-400">{DIFFICULTY[d].description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">Em todos os níveis a IA joga com as mesmas regras e a mesma névoa de guerra que você; o bônus do Brutal é o único extra.</p>
            </fieldset>
          )}
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
