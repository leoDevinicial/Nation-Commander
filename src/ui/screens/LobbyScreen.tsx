import { Anchor, Bot, Check, CircleCheck, Copy, Crown, Dices, Feather, Hourglass, Landmark, LogOut, Mountain, Play, Scale, Shield, SignalHigh, SignalLow, SignalMedium, Skull, Sun, Swords, TreePalm, Trees, Waves, X, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import { DIFFICULTIES, DIFFICULTY } from '../../../shared/sim/difficulty.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { factionColor } from '../../game/factions.ts';
import { MAP_TYPE_INFO, MAP_TYPES, type MapType, MAX_NATIONS_FREE, MAX_NATIONS_SUBSCRIBER, REGION_INFO, mapSizeFor, regionOf } from '../../../shared/sim/matchMap.ts';
import { ChatBox } from '../components/ChatBox.tsx';
import { CountrySelect } from '../components/CountrySelect.tsx';
import { CountryCard } from '../components/CountryCard.tsx';
import { autoFullscreen } from '../components/FullscreenButton.tsx';
import { NationBadge } from '../components/NationBadge.tsx';
import { Shell } from '../components/Shell.tsx';

/** Tipo usado para o tamanho do mapa (o sorteado mostra o do continente). */
const sizeType = (t: MapType | 'random' | undefined): MapType => (t === undefined || t === 'random' ? 'continental' : t);

/** Ícone de cada tipo de mapa e de cada nível da IA nos cartões de escolha. */
const MAP_ICON: Record<MapType | 'random', LucideIcon> = { continental: Trees, rivers: Waves, mountains: Mountain, desert: Sun, ocean: Anchor, islands: TreePalm, random: Dices };
const DIFF_ICON: Record<string, LucideIcon> = { easy: Feather, normal: Shield, hard: Swords, brutal: Skull };

/** Cartão de escolha (mapa, regra, dificuldade): rádio escondido, borda e ícone de latão quando escolhido. */
function ChoiceCard({ name, on, disabled, icon: Icon, title, text, onPick }: { name: string; on: boolean; disabled: boolean; icon?: LucideIcon; title: string; text: string; onPick: () => void }) {
  return (
    <label
      className={`relative flex gap-2.5 rounded-[3px] border p-2.5 text-xs transition-colors focus-within:ring-2 focus-within:ring-brass-400/60 ${on ? 'border-brass-400 bg-brass-400/[0.07]' : 'border-ink-700 bg-ink-950/40 hover:border-ink-500'} ${disabled ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
    >
      <input type="radio" name={name} className="sr-only" checked={on} disabled={disabled} onChange={onPick} />
      {Icon && <Icon size={18} className={`mt-0.5 shrink-0 ${on ? 'text-brass-400' : 'text-ink-400'}`} aria-hidden />}
      <span className="min-w-0">
        <span className={`block font-semibold ${on ? 'text-brass-400' : 'text-ink-100'}`}>{title}</span>
        <span className="text-ink-400">{text}</span>
      </span>
      {on && <Check size={13} className="absolute top-2 right-2 text-brass-400" aria-hidden />}
    </label>
  );
}

/** Selo de estado da vaga: anfitrião, pronto ou aguardando. */
function SeatState({ host, ready }: { host: boolean; ready: boolean }) {
  if (host)
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-brass-400/50 px-1.5 py-0.5 text-[11px] font-semibold text-brass-400">
        <Crown size={12} aria-hidden /> Anfitrião
      </span>
    );
  return ready ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-signal-green/50 px-1.5 py-0.5 text-[11px] font-semibold text-signal-green">
      <CircleCheck size={12} aria-hidden /> Pronto
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-ink-600 px-1.5 py-0.5 text-[11px] font-semibold text-ink-400">
      <Hourglass size={12} aria-hidden /> Aguardando…
    </span>
  );
}

/** Ping em barras de sinal (KNPS): verde até 150 ms, latão até 250, vermelho acima. */
function Ping({ ms }: { ms: number }) {
  const Icon = ms > 250 ? SignalLow : ms > 150 ? SignalMedium : SignalHigh;
  return (
    <span className={`ml-2 inline-flex items-center gap-0.5 font-mono text-[11px] ${ms > 250 ? 'text-red-300' : ms > 150 ? 'text-brass-400' : 'text-signal-green'}`} title="Ping de rede até o servidor desta sala, medido pelo servidor (KNPS)">
      <Icon size={13} aria-hidden />
      {ms} ms
    </span>
  );
}

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
    <Shell title={room.mode === 'sandbox' ? 'Modo Sandbox' : room.mode === 'vs_ai' ? 'Operação contra a IA' : (room.name ?? 'Sala multijogador')} wide="xl">
      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div>
          {room.mode === 'pvp' && (
            <div className="mb-4 flex items-center gap-3 rounded-[3px] border border-brass-400/30 bg-ink-950 p-3">
              <span className="nc-kicker">Código da sala</span>
              <span className="nc-num text-2xl font-bold tracking-[0.35em] text-brass-400" translate="no">
                {room.code}
              </span>
              <button className="btn ml-auto" onClick={() => void copy()}>
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          )}
          {room.mode === 'pvp' && <RoomNameField name={room.name ?? ''} isHost={isHost} />}
          <ul className="space-y-2">
            {Array.from({ length: room.maxPlayers }, (_, slot) => {
              const p = room.players.find((x) => x.slot === slot);
              return (
                <li key={slot} className="relative flex items-center gap-3 overflow-hidden rounded-[3px] border border-ink-700 bg-ink-850 p-3 pl-4">
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: factionColor(slot), boxShadow: `0 0 10px ${factionColor(slot)}` }} aria-hidden />
                  {p ? <NationBadge slot={slot} countryId={p.countryId} /> : <span className="grid h-8 w-12 shrink-0 place-items-center rounded-[3px] border border-dashed border-ink-600 text-ink-500" aria-hidden><Bot size={15} /></span>}
                  {p ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">
                          <span translate="no">{p.name}</span>
                          {p.isAI && <span className="ml-1.5 text-xs text-ink-400">(IA)</span>}
                          {p.ping !== undefined && <Ping ms={p.ping} />}
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
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => gameClient.send({ t: 'remove_bot', slot: p.slot })} title="Remover este bot" aria-label="Remover este bot">
                          <X size={14} aria-hidden />
                        </button>
                      )}
                      <SeatState host={p.userId === room.hostUserId} ready={!!p.ready || !!p.isAI} />
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm text-ink-400">
                        {room.mode === 'pvp' ? 'Vaga aberta para um jogador' + (isHost ? ' — ou preencha com um bot' : '') : 'Vaga aberta para um bot.'}
                      </span>
                      {isHost && (
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => gameClient.send({ t: 'add_bot' })}>
                          <Bot size={14} aria-hidden /> Bot (IA)
                        </button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <fieldset className="mt-4 rounded-[3px] border border-ink-700 p-3">
              <legend className="nc-kicker px-1.5">{sandbox ? 'Mapa' : 'Nações e mapa'}</legend>
              {room.mode === 'pvp' && (
                <label className={`mb-2 flex items-center gap-2 text-xs ${isHost ? 'cursor-pointer' : 'opacity-80'}`}>
                  <input type="checkbox" className="accent-[#e0b44c]" checked={!!room.isPublic} disabled={!isHost} onChange={(e) => gameClient.send({ t: 'set_room', isPublic: e.target.checked })} />
                  <span>
                    <span className="font-semibold text-ink-100">Sala pública</span>
                    <span className="text-ink-400"> — aparece em "Salas públicas" no menu; sem marcar, só entra quem tiver o código</span>
                  </span>
                </label>
              )}
              {!sandbox && <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-ink-300">Vagas na sala:</span>
                <span className="nc-seg" role="group" aria-label="Vagas na sala">
                  {Array.from({ length: Math.max(0, limit - 1) }, (_, i) => i + 2).map((n) => (
                    <button
                      key={n}
                      className={`nc-icon-btn ${room.maxPlayers === n ? 'is-on' : ''}`}
                      disabled={!isHost || n < room.players.length}
                      aria-pressed={room.maxPlayers === n}
                      onClick={() => gameClient.send({ t: 'set_room', maxPlayers: n })}
                    >
                      {n}
                    </button>
                  ))}
                </span>
                <span className="text-[11px] text-ink-400">
                  {limit >= MAX_NATIONS_SUBSCRIBER ? `Assinante: até ${MAX_NATIONS_SUBSCRIBER} nações.` : `Versão grátis: até ${MAX_NATIONS_FREE} nações (assinantes: até ${MAX_NATIONS_SUBSCRIBER}).`} Mapa de{' '}
                  {mapSizeFor(room.maxPlayers, sizeType(room.mapType))}×{mapSizeFor(room.maxPlayers, sizeType(room.mapType))} células.
                </span>
              </div>}
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {([...MAP_TYPES, 'random'] as const).map((t) => {
                  const on = (room.mapType ?? 'continental') === t;
                  const info = t === 'random' ? { label: 'Sorteado', description: 'Um dos tipos acima, sorteado no início da partida.' } : MAP_TYPE_INFO[t];
                  return (
                    <ChoiceCard key={t} name="mapType" on={on} disabled={!isHost} icon={MAP_ICON[t]} title={info.label} text={info.description} onPick={() => gameClient.send({ t: 'set_room', mapType: t })} />
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-ink-400">
                {sandbox ? 'O Sandbox usa o mapa escolhido aqui.' : 'Times: quem está no mesmo time começa aliado e não pode declarar guerra ao parceiro.'} No Arquipélago, o contato entre as ilhas é por navio de transporte (Porto) e por avião.
              </p>
            </fieldset>
          <fieldset className="mt-4 rounded-[3px] border border-ink-700 p-3">
            <legend className="nc-kicker px-1.5">Regra do teatro de operações</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['parity', 'Paridade econômica', 'A logística do teatro depende da parcela do PIB investida em defesa, como se todos tivessem a mesma escala econômica. Recomendado para disputas equilibradas.'],
                  ['realistic', 'Escala real', 'A logística depende do gasto de defesa real de cada país. Grandes economias têm vantagem — a dificuldade emerge dos dados.'],
                ] as const
              ).map(([mode, title, desc]) => (
                <ChoiceCard key={mode} name="balance" on={room.balanceMode === mode} disabled={!isHost} icon={mode === 'parity' ? Scale : Landmark} title={title} text={desc} onPick={() => gameClient.send({ t: 'set_balance', mode })} />
              ))}
            </div>
            {!isHost && <p className="mt-1 text-[11px] text-ink-400">Só o anfitrião escolhe a regra.</p>}
          </fieldset>
          {(room.mode !== 'pvp' || room.players.some((p) => p.isAI)) && (
            <fieldset className="mt-4 rounded-[3px] border border-ink-700 p-3">
              <legend className="nc-kicker px-1.5">Dificuldade da IA</legend>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {DIFFICULTIES.map((d) => {
                  const on = (room.difficulty ?? 'normal') === d;
                  return (
                    <ChoiceCard key={d} name="difficulty" on={on} disabled={!isHost} icon={DIFF_ICON[d]} title={DIFFICULTY[d].label} text={DIFFICULTY[d].description} onPick={() => gameClient.send({ t: 'set_difficulty', difficulty: d })} />
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
                <Play size={15} aria-hidden /> Iniciar Operação
              </button>
            ) : (
              <button
                className={`btn ${mine?.ready ? '' : 'btn-primary'}`}
                onClick={() => {
                  if (!mine?.ready) autoFullscreen();
                  gameClient.send({ t: 'set_ready', ready: !mine?.ready });
                }}
              >
                {mine?.ready ? <X size={15} aria-hidden /> : <CircleCheck size={15} aria-hidden />}
                {mine?.ready ? 'Cancelar Pronto' : 'Estou Pronto'}
              </button>
            )}
            <button className="btn btn-danger ml-auto" onClick={() => gameClient.send({ t: 'leave_room' })}>
              <LogOut size={15} aria-hidden /> Sair da Sala
            </button>
          </div>
        </div>
        <ChatBox />
      </div>
    </Shell>
  );
}

/** Nome da sala: o anfitrião edita (envia ao sair do campo ou com Enter); os outros só veem. */
function RoomNameField({ name, isHost }: { name: string; isHost: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;
  const commit = () => {
    if (draft !== null && draft.trim() !== name) gameClient.send({ t: 'set_room', name: draft.trim() });
    setDraft(null);
  };
  return (
    <label className="mb-4 block">
      <span className="label">Nome da sala</span>
      <input
        className="field"
        value={value}
        maxLength={32}
        disabled={!isHost}
        placeholder="Ex.: Guerra Fria — só veteranos"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      {!isHost && <span className="mt-0.5 block text-[11px] text-ink-400">Só o anfitrião muda o nome.</span>}
    </label>
  );
}
