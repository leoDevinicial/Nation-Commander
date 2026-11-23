import { inviteUrl } from '../../lib/invite.ts';
import {
  Anchor,
  Bot,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  Crosshair,
  Crown,
  Dices,
  Feather,
  Hourglass,
  Info,
  CloudLightning,
  CircleOff,
  LogOut,
  Map as MapIcon,
  MessageSquare,
  Mountain,
  Pencil,
  Play,
  Plus,
  Shield,
  SignalHigh,
  SignalLow,
  SignalMedium,
  Skull,
  Sun,
  Swords,
  TreePalm,
  Trees,
  Users,
  Waves,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { countryName } from '../../../shared/data/countries.ts';
import { DIFFICULTIES, DIFFICULTY } from '../../../shared/sim/difficulty.ts';
import { VICTORY } from '../../../shared/sim/config.ts';
import { countryReference } from '../../../shared/strategic/reference.ts';
import type { RoomInfo } from '../../../shared/protocol.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { factionColor } from '../../game/factions.ts';
import { formatPct, formatUsd } from '../../lib/format.ts';
import { MAP_TYPE_INFO, MAP_TYPES, type MapType, MAX_NATIONS_FREE, MAX_NATIONS_SUBSCRIBER, REGION_INFO, mapSizeFor, regionOf } from '../../../shared/sim/matchMap.ts';
import { ChatBox } from '../components/ChatBox.tsx';
import { CountrySelect } from '../components/CountrySelect.tsx';
import { CountryCard } from '../components/CountryCard.tsx';
import { Frame } from '../components/Frame.tsx';
import { autoFullscreen, FullscreenButton } from '../components/FullscreenButton.tsx';
import { NationBadge } from '../components/NationBadge.tsx';

/**
 * Lobby (16/11, maquete aprovada em `docs/ui_maquete/6–8`): tudo numa tela, sem rolar a página. Cabeçalho com o nome
 * da sala e o código em destaque; três colunas (Nações, Operação, Canal da sala) a partir de 1280 px e abas abaixo
 * disso; barra de ação fixa com quem está pronto, o que falta, o resumo da operação e o Iniciar.
 */

type Player = RoomInfo['players'][number];

/** Tipo usado para o tamanho do mapa (o sorteado mostra o do continente). */
const sizeType = (t: MapType | 'random' | undefined): MapType => (t === undefined || t === 'random' ? 'continental' : t);

const MAP_ICON: Record<MapType | 'random', LucideIcon> = { continental: Trees, rivers: Waves, mountains: Mountain, desert: Sun, ocean: Anchor, islands: TreePalm, random: Dices };
const MAP_SHORT: Record<MapType | 'random', string> = { continental: 'Continental', rivers: 'Rios', mountains: 'Montanhoso', desert: 'Deserto', ocean: 'Oceano', islands: 'Arquipélago', random: 'Sorteado' };
const DIFF_ICON: Record<string, LucideIcon> = { easy: Feather, normal: Shield, hard: Swords, brutal: Skull };
const TEAM_LABEL = ['Sem time', 'Time A', 'Time B', 'Time C'];
/** Como se vence (16/11): o anfitrião escolhe se o domínio territorial também encerra a partida. */
const VICTORY_MODE = {
  territory: {
    icon: MapIcon,
    title: 'Eliminação ou território',
    short: 'Eliminação ou território',
    text: `Vence quem eliminar os outros (destruir o QG de todos) ou quem controlar ${Math.round(VICTORY.territoryShare * 100)}% do território do mapa por ${VICTORY.territorySeconds / 60} minutos seguidos.`,
  },
  elimination: {
    icon: Crosshair,
    title: 'Só eliminação',
    short: 'Só eliminação',
    text: 'Só vence quem eliminar os outros (destruir o QG de todos); dominar o território não encerra a partida.',
  },
} as const;

/** Ping em barras de sinal (KNPS): verde até 150 ms, latão até 250, vermelho acima. */
function Ping({ ms }: { ms: number }) {
  const Icon = ms > 250 ? SignalLow : ms > 150 ? SignalMedium : SignalHigh;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[11px] ${ms > 250 ? 'text-red-300' : ms > 150 ? 'text-brass-400' : 'text-signal-green'}`} title="Ping de rede até o servidor desta sala, medido pelo servidor (KNPS)">
      <Icon size={13} aria-hidden />
      {ms} ms
    </span>
  );
}

/** Selo de estado da vaga. */
function Chip({ tone, icon: Icon, children }: { tone: 'host' | 'ok' | 'wait'; icon: LucideIcon; children: ReactNode }) {
  const cls = tone === 'host' ? 'border-brass-400/50 text-brass-400' : tone === 'ok' ? 'border-signal-green/50 text-signal-green' : 'border-signal-amber/50 text-signal-amber';
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      <Icon size={12} aria-hidden /> {children}
    </span>
  );
}

/** Opção escolhível (mapa, regra, dificuldade): rádio escondido, latão quando escolhida. */
function Pick({ name, on, disabled, icon: Icon, label, title, onPick, tile }: { name: string; on: boolean; disabled: boolean; icon: LucideIcon; label: string; title?: string; onPick: () => void; tile?: boolean }) {
  return (
    <label
      title={title}
      className={`flex items-center gap-1.5 rounded-[3px] border text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-brass-400/60 ${tile ? 'flex-col justify-center px-1 py-2 text-center text-[11.5px]' : 'px-2 py-2'} ${
        on ? 'border-brass-400 bg-brass-400/[0.08] text-brass-400' : 'border-ink-700 bg-ink-950/40 text-ink-200 hover:border-ink-500'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <input type="radio" name={name} className="sr-only" checked={on} disabled={disabled} onChange={onPick} />
      <Icon size={tile ? 19 : 15} className={on ? 'text-brass-400' : 'text-ink-400'} aria-hidden />
      <span className="min-w-0">{label}</span>
    </label>
  );
}

/** Rótulo de seção com o traço de latão. */
function Kicker({ children }: { children: ReactNode }) {
  return (
    <span className="nc-kicker flex items-center gap-1.5">
      <span className="h-0.5 w-2.5 bg-brass-400" aria-hidden />
      {children}
    </span>
  );
}

export function LobbyScreen() {
  const room = useAppStore((s) => s.room);
  const me = useAppStore((s) => s.serverUser);
  const lastChat = useAppStore((s) => s.chat.at(-1)?.id ?? -1);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'nations' | 'ops' | 'chat'>('nations');
  const [seenChat, setSeenChat] = useState(-1);
  const [open, setOpen] = useState<number | null>(null);
  if (!room || !me) return null;

  const isHost = room.hostUserId === me.id;
  const mine = room.players.find((p) => p.userId === me.id);
  const others = room.players.filter((p) => p.userId !== room.hostUserId);
  const canStart = isHost && room.players.length >= 2 && others.every((p) => p.ready || p.isAI);
  const sandbox = room.mode === 'sandbox';
  const pvp = room.mode === 'pvp';
  const limit = room.nationLimit ?? 2;
  const canTeam = (p: Player) => (p.isAI ? isHost : p.userId === me.id);
  const mapType = room.mapType ?? 'continental';
  const victoryMode = room.victoryMode ?? 'territory';
  const globalEvents = room.globalEvents ?? true;
  const size = mapSizeFor(room.maxPlayers, sizeType(room.mapType));
  const showDifficulty = room.mode !== 'pvp' || room.players.some((p) => p.isAI);
  const ready = (p: Player) => !!p.ready || !!p.isAI || p.userId === room.hostUserId;
  const waiting = room.players.filter((p) => !ready(p));
  const unread = tab !== 'chat' && lastChat > seenChat ? Math.min(9, lastChat - seenChat) : 0;
  const teams = room.players.map((p) => p.team ?? 0);
  const teamCounts = [1, 2, 3].map((t) => teams.filter((x) => x === t).length).filter((n) => n > 0);
  const kicker = sandbox ? 'Sala de Situação · Sandbox' : room.mode === 'vs_ai' ? 'Sala de Situação · Contra a IA' : 'Sala de Situação · Multijogador';
  const title = sandbox ? 'Modo Sandbox' : room.mode === 'vs_ai' ? 'Operação contra a IA' : (room.name ?? 'Sala multijogador');

  const copy = async () => {
    try {
      // 23/11: o link de convite já entra direto na sala (o código continua no link)
      await navigator.clipboard.writeText(inviteUrl(room.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const showTab = (t: typeof tab) => {
    setTab(t);
    if (t === 'chat') setSeenChat(lastChat);
  };
  // abaixo de 1280 px as colunas viram abas; a escolhida aparece, as outras somem
  const col = (t: typeof tab) => (tab === t ? '' : 'max-xl:hidden');

  return (
    <div className="lobby relative z-10 h-full w-full">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{ backgroundImage: 'linear-gradient(rgba(125,142,163,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125,142,163,0.06) 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />
      <div className="relative mx-auto flex h-full max-w-[1600px] flex-col gap-2 p-2 sm:gap-3 sm:p-4 xl:p-5">
        {/* cabeçalho: nome, abas (abaixo de 1280 px), código e fatos da sala */}
        <Frame innerClassName="lb-head flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 sm:px-5 sm:py-3">
          <div className="lb-name min-w-0 flex-1 sm:flex-none">
            <div className="lb-kicker nc-kicker hidden sm:block">{kicker}</div>
            {pvp ? <RoomName name={room.name ?? ''} isHost={isHost} /> : <h1 className="lb-title nc-title truncate text-lg text-ink-100 sm:mt-1.5 sm:text-2xl">{title}</h1>}
          </div>
          <div className="flex gap-0.5 xl:hidden" role="tablist" aria-label="Seções do lobby">
            {(
              [
                ['nations', Users, 'Nações'],
                ['ops', MapIcon, 'Operação'],
                ['chat', MessageSquare, 'Canal'],
              ] as const
            ).map(([id, Icon, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="nc-tab !flex-none px-2.5" onClick={() => showTab(id)}>
                <Icon size={14} aria-hidden />
                <span>{label}</span>
                {id === 'chat' && unread > 0 && <span className="nc-num ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brass-400 px-1 text-[10px] font-bold text-ink-950">{unread}</span>}
              </button>
            ))}
          </div>
          {pvp && (
            <div className="ml-auto flex items-center gap-3 border border-brass-400/35 bg-brass-400/[0.05] py-1 pr-1.5 pl-3" style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}>
              <span className="lb-codelabel nc-kicker hidden leading-tight sm:block">
                Código
                <br />
                da sala
              </span>
              <span className="lb-code nc-num text-xl font-bold tracking-[0.32em] text-brass-400 sm:text-3xl" translate="no" style={{ textShadow: '0 0 14px rgb(226 181 77 / 0.35)' }}>
                {room.code}
              </span>
              <button className="btn" onClick={() => void copy()}>
                {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                <span className="lb-copytext max-sm:hidden">{copied ? 'Link copiado!' : 'Copiar convite'}</span>
              </button>
            </div>
          )}
          {pvp && (
            <label className={`flex items-center gap-2 text-xs font-semibold ${isHost ? 'cursor-pointer' : 'opacity-70'}`} title='Sala pública: aparece em "Salas públicas" no menu; sem marcar, só entra quem tiver o código'>
              <input type="checkbox" className="accent-[#e0b44c]" checked={!!room.isPublic} disabled={!isHost} onChange={(e) => gameClient.send({ t: 'set_room', isPublic: e.target.checked })} />
              Pública
            </label>
          )}
          <FullscreenButton />
          <dl className={`hidden grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs text-ink-400 2xl:grid ${pvp ? '' : 'ml-auto'}`}>
            <dt>Nações</dt>
            <dd className="nc-num text-ink-100">
              {room.players.length} / {room.maxPlayers}
            </dd>
            <dt>Mapa</dt>
            <dd className="nc-num text-ink-100">
              {size}×{size}
            </dd>
          </dl>
        </Frame>

        {/* corpo: três colunas no computador, abas no celular */}
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[1.45fr_1fr_0.72fr]">
          {/* nações */}
          <Frame className={`min-h-0 ${col('nations')}`} innerClassName="flex flex-col gap-2 overflow-y-auto p-2.5 sm:p-3.5">
            <div className="flex items-center gap-2">
              <Kicker>Nações</Kicker>
              {!sandbox && (
                <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-400" title={limit >= MAX_NATIONS_SUBSCRIBER ? `Assinante: até ${MAX_NATIONS_SUBSCRIBER} nações.` : `Versão grátis: até ${MAX_NATIONS_FREE} nações (assinantes: até ${MAX_NATIONS_SUBSCRIBER}).`}>
                  Vagas
                  <span className="nc-seg" role="group" aria-label="Vagas na sala">
                    {Array.from({ length: Math.max(0, limit - 1) }, (_, i) => i + 2).map((n) => (
                      <button key={n} className={`nc-icon-btn ${room.maxPlayers === n ? 'is-on' : ''}`} disabled={!isHost || n < room.players.length} aria-pressed={room.maxPlayers === n} onClick={() => gameClient.send({ t: 'set_room', maxPlayers: n })}>
                        {n}
                      </button>
                    ))}
                  </span>
                </span>
              )}
            </div>
            {Array.from({ length: room.maxPlayers }, (_, slot) => {
              const p = room.players.find((x) => x.slot === slot);
              return p ? (
                <Seat
                  key={slot}
                  p={p}
                  room={room}
                  isMe={p === mine}
                  isHost={isHost}
                  canTeam={canTeam(p)}
                  open={open === slot}
                  onToggle={() => setOpen(open === slot ? null : slot)}
                  ready={ready(p)}
                />
              ) : (
                <div key={slot} className="flex items-center gap-3 border border-dashed border-ink-600 px-3 py-2.5" style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}>
                  <span className="grid h-8 w-12 shrink-0 place-items-center rounded-[3px] border border-dashed border-ink-600 text-ink-500" aria-hidden>
                    <Bot size={15} />
                  </span>
                  <span className="flex-1 text-sm text-ink-400">{pvp ? 'Vaga aberta: aguardando um jogador' + (isHost ? ' (ou um bot)' : '') : 'Vaga aberta para um bot.'}</span>
                  {isHost && (
                    <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => gameClient.send({ t: 'add_bot' })}>
                      <Plus size={14} aria-hidden /> Bot (IA)
                    </button>
                  )}
                </div>
              );
            })}
            <p className="lb-hint mt-auto flex items-start gap-1.5 pt-1 text-[11px] text-ink-400">
              <Info size={13} className="mt-px shrink-0" aria-hidden />
              {sandbox ? 'Toque numa nação para ver a ficha completa do país.' : 'Toque numa nação para ver a ficha completa do país. Times: quem está no mesmo time começa aliado e não pode declarar guerra ao parceiro.'}
            </p>
          </Frame>

          {/* operação */}
          <Frame className={`min-h-0 ${col('ops')}`} innerClassName="flex flex-col gap-3 overflow-y-auto p-2.5 sm:p-3.5">
            <div className="flex items-center gap-2">
              <Kicker>Operação</Kicker>
              <span className="ml-auto text-[11px] text-ink-400">
                Mapa{' '}
                <span className="nc-num text-ink-200">
                  {size}×{size}
                </span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-4 gap-1.5">
                {([...MAP_TYPES, 'random'] as const).map((t) => (
                  <Pick
                    key={t}
                    tile
                    name="mapType"
                    on={mapType === t}
                    disabled={!isHost}
                    icon={MAP_ICON[t]}
                    label={MAP_SHORT[t]}
                    title={t === 'random' ? 'Um dos tipos, sorteado no início da partida.' : MAP_TYPE_INFO[t].description}
                    onPick={() => gameClient.send({ t: 'set_room', mapType: t })}
                  />
                ))}
              </div>
              <p className="text-xs text-ink-400">
                <span className="font-semibold text-ink-200">{mapType === 'random' ? 'Sorteado' : MAP_TYPE_INFO[mapType].label}:</span>{' '}
                {mapType === 'random' ? 'um dos tipos acima, sorteado no início da partida.' : MAP_TYPE_INFO[mapType].description}
                {(mapType === 'islands' || mapType === 'random') && ' No Arquipélago, o contato entre as ilhas é por navio de transporte (Porto) e por avião.'}
              </p>
            </div>
            {!sandbox && (
              <div className="flex flex-col gap-1.5 border-t border-ink-700 pt-3">
                <Kicker>Vitória</Kicker>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['territory', 'elimination'] as const).map((v) => (
                    <Pick key={v} name="victoryMode" on={victoryMode === v} disabled={!isHost} icon={VICTORY_MODE[v].icon} label={VICTORY_MODE[v].title} onPick={() => gameClient.send({ t: 'set_room', victoryMode: v })} />
                  ))}
                </div>
                <p className="text-xs text-ink-400">{VICTORY_MODE[victoryMode].text}</p>
              </div>
            )}
            {!sandbox && (
              <div className="flex flex-col gap-1.5 border-t border-ink-700 pt-3">
                <Kicker>Eventos globais</Kicker>
                <div className="grid grid-cols-2 gap-1.5">
                  <Pick name="globalEvents" on={globalEvents} disabled={!isHost} icon={CloudLightning} label="Ligados" onPick={() => gameClient.send({ t: 'set_room', globalEvents: true })} />
                  <Pick name="globalEvents" on={!globalEvents} disabled={!isHost} icon={CircleOff} label="Desligados" onPick={() => gameClient.send({ t: 'set_room', globalEvents: false })} />
                </div>
                <p className="text-xs text-ink-400">
                  {globalEvents
                    ? 'De tempos em tempos o mundo muda para todos: crise do petróleo, inverno rigoroso ou alta das commodities, por alguns minutos.'
                    : 'Sem crises nem mudanças no mundo: a economia segue estável a partida toda.'}
                </p>
              </div>
            )}
            {showDifficulty && (
              <div className="flex flex-col gap-1.5 border-t border-ink-700 pt-3">
                <Kicker>Dificuldade da IA</Kicker>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {DIFFICULTIES.map((d) => (
                    <Pick key={d} name="difficulty" on={(room.difficulty ?? 'normal') === d} disabled={!isHost} icon={DIFF_ICON[d] ?? Shield} label={DIFFICULTY[d].label} title={DIFFICULTY[d].description} onPick={() => gameClient.send({ t: 'set_difficulty', difficulty: d })} />
                  ))}
                </div>
                <p className="text-xs text-ink-400">{DIFFICULTY[room.difficulty ?? 'normal'].description} Mesmas regras e mesma névoa de guerra que você; só o Brutal tem bônus.</p>
              </div>
            )}
            <p className="lb-hint mt-auto flex items-center gap-1.5 text-[11px] text-ink-400">
              <Crown size={13} className="shrink-0" aria-hidden />
              {isHost ? 'Você é o anfitrião: só você altera a operação.' : 'Só o anfitrião altera a operação.'}
            </p>
          </Frame>

          {/* canal */}
          <Frame className={`min-h-0 ${col('chat')}`} innerClassName="flex flex-col gap-2 p-2.5 sm:p-3.5">
            <div className="max-xl:hidden">
              <Kicker>Canal da sala</Kicker>
            </div>
            <div className="min-h-0 flex-1">
              <ChatBox fill />
            </div>
          </Frame>
        </div>

        {/* barra de ação: quem está pronto, o que falta, resumo e os botões */}
        <Frame innerClassName="lb-act flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 sm:px-5 sm:py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex gap-1" aria-hidden>
              {room.players.map((p) => (
                <span key={p.slot} className="h-1.5 w-6" style={ready(p) ? { background: factionColor(p.slot) } : { border: '1px solid var(--color-signal-amber)' }} />
              ))}
            </div>
            <div>
              <div className="text-sm font-semibold">
                {room.players.filter(ready).length} de {room.players.length} prontos
              </div>
              {waiting.length > 0 ? (
                <div className="flex items-center gap-1 text-xs text-signal-amber max-sm:hidden">
                  <Hourglass size={12} aria-hidden /> Aguardando <span translate="no">{waiting.map((p) => p.name).join(', ')}</span>
                </div>
              ) : room.players.length < 2 ? (
                <div className="text-xs text-signal-amber max-sm:hidden">Precisa de pelo menos 2 nações</div>
              ) : null}
            </div>
          </div>
          <div className="hidden flex-wrap gap-1.5 lg:flex">
            {(() => {
              const MapI = MAP_ICON[mapType];
              const DiffI = DIFF_ICON[room.difficulty ?? 'normal'] ?? Shield;
              return (
                <>
                  <SummaryChip icon={MapI}>
                    {MAP_SHORT[mapType]} {size}×{size}
                  </SummaryChip>
                  {!sandbox && <SummaryChip icon={VICTORY_MODE[victoryMode].icon}>{VICTORY_MODE[victoryMode].short}</SummaryChip>}
                  {showDifficulty && <SummaryChip icon={DiffI}>IA {DIFFICULTY[room.difficulty ?? 'normal'].label}</SummaryChip>}
                  {teamCounts.length > 1 && <SummaryChip icon={Users}>{teamCounts.join(' × ')}</SummaryChip>}
                </>
              );
            })()}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="btn btn-danger" onClick={() => gameClient.send({ t: 'leave_room' })}>
              <LogOut size={15} aria-hidden /> Sair
            </button>
            {isHost ? (
              <button
                className="btn btn-primary btn-hero"
                disabled={!canStart}
                title={canStart ? undefined : waiting.length ? `Aguardando ${waiting.map((p) => p.name).join(', ')}` : 'Precisa de pelo menos 2 nações'}
                onClick={() => {
                  autoFullscreen();
                  gameClient.send({ t: 'start' });
                }}
              >
                <Play size={16} aria-hidden /> Iniciar operação
              </button>
            ) : (
              <button
                className={`btn btn-hero ${mine?.ready ? '' : 'btn-primary'}`}
                onClick={() => {
                  if (!mine?.ready) autoFullscreen();
                  gameClient.send({ t: 'set_ready', ready: !mine?.ready });
                }}
              >
                {mine?.ready ? <X size={16} aria-hidden /> : <CircleCheck size={16} aria-hidden />}
                {mine?.ready ? 'Cancelar pronto' : 'Estou pronto'}
              </button>
            )}
          </div>
        </Frame>
      </div>
    </div>
  );
}

function SummaryChip({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[3px] border border-ink-600 px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-300">
      <Icon size={13} aria-hidden /> {children}
    </span>
  );
}

/** Uma vaga ocupada: nação, jogador, país, time, ficha resumida (e a completa ao abrir) e o estado. */
function Seat({ p, room, isMe, isHost, canTeam, open, onToggle, ready }: { p: Player; room: RoomInfo; isMe: boolean; isHost: boolean; canTeam: boolean; open: boolean; onToggle: () => void; ready: boolean }) {
  const sandbox = room.mode === 'sandbox';
  const color = factionColor(p.slot);
  const ref = countryReference(p.countryId);
  const region = REGION_INFO[regionOf(p.countryId)];
  const host = p.userId === room.hostUserId;
  return (
    <div
      className={`relative border px-2.5 py-2 pl-4 sm:px-3 ${isMe ? 'border-brass-400/30 bg-gradient-to-r from-brass-400/[0.06] to-ink-950/45' : 'border-ink-700 bg-ink-950/45'}`}
      style={{ clipPath: 'polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px)' }}
    >
      <span className="absolute top-[7px] bottom-0 left-0 w-[3px]" style={{ background: color, boxShadow: `0 0 10px ${color}` }} aria-hidden />
      <div className="flex items-center gap-3">
        <button type="button" className="shrink-0 rounded-[3px] focus-visible:ring-2 focus-visible:ring-brass-400/60" onClick={onToggle} aria-expanded={open} title="Ficha do país">
          <NationBadge slot={p.slot} countryId={p.countryId} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate font-semibold" translate="no">
              {p.name}
            </span>
            {p.isAI && <span className="text-[10px] font-semibold tracking-wider text-ink-400">BOT</span>}
            {p.ping !== undefined && <Ping ms={p.ping} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <div className="w-full max-w-[13rem] [&_.field]:py-1 [&_.field]:text-[13px]">
              {isMe ? (
                <CountrySelect value={p.countryId} onChange={(countryId) => gameClient.send({ t: 'set_country', countryId })} />
              ) : p.isAI && isHost ? (
                <CountrySelect
                  value={p.countryId}
                  random
                  label={`País de ${p.name}`}
                  taken={room.players.filter((x) => x !== p).map((x) => x.countryId)}
                  onChange={(countryId) => gameClient.send({ t: 'set_bot_country', slot: p.slot, countryId })}
                />
              ) : (
                <div className="py-1 text-sm text-ink-200">{countryName(p.countryId)}</div>
              )}
            </div>
            {!sandbox && room.maxPlayers > 2 && (
              <select
                className="field w-auto py-1 font-mono text-[11px]"
                aria-label={`Time de ${p.name}`}
                value={p.team ?? 0}
                disabled={!canTeam}
                onChange={(e) => gameClient.send({ t: 'set_team', slot: p.slot, team: Number(e.target.value) || null })}
              >
                {TEAM_LABEL.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button type="button" onClick={onToggle} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-left text-[11.5px] text-ink-400 hover:text-ink-300" aria-expanded={open}>
            <span>
              PIB <span className="nc-num text-ink-200">{formatUsd(ref.values.gdpUsd.value)}</span>
            </span>
            <span>
              Defesa <span className="nc-num text-ink-200">{formatPct(ref.values.militaryPctGdp.value)}</span>
            </span>
            <span title={region.text}>
              Região <span className="text-ink-200">{region.label}</span>
            </span>
            {open ? <ChevronUp size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
          </button>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
          {host ? (
            <Chip tone="host" icon={Crown}>
              Anfitrião
            </Chip>
          ) : ready ? (
            <Chip tone="ok" icon={CircleCheck}>
              Pronto
            </Chip>
          ) : (
            <Chip tone="wait" icon={Hourglass}>
              Aguardando
            </Chip>
          )}
          {p.isAI && isHost && !sandbox && (room.mode === 'pvp' || room.players.filter((x) => x.isAI).length > 1) && (
            <button className="btn min-h-6 px-1.5 py-0 text-xs" onClick={() => gameClient.send({ t: 'remove_bot', slot: p.slot })} title="Remover este bot" aria-label="Remover este bot">
              <X size={13} aria-hidden />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-2">
          <CountryCard id={p.countryId} />
        </div>
      )}
    </div>
  );
}

/** Nome da sala no cabeçalho: o anfitrião edita no próprio título (envia ao sair do campo ou com Enter). */
function RoomName({ name, isHost }: { name: string; isHost: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;
  const commit = () => {
    if (draft !== null && draft.trim() !== name) gameClient.send({ t: 'set_room', name: draft.trim() });
    setDraft(null);
  };
  if (!isHost) return <h1 className="lb-title nc-title truncate text-lg text-ink-100 sm:mt-1.5 sm:text-2xl">{name || 'Sala multijogador'}</h1>;
  return (
    <label className="flex items-center gap-2 sm:mt-1.5" title="Nome da sala (só o anfitrião muda)">
      <input
        className="lb-title nc-title w-full min-w-0 border-b border-transparent bg-transparent text-lg text-ink-100 outline-none placeholder:text-ink-500 focus:border-brass-400/60 sm:w-[22ch] sm:text-2xl"
        value={value}
        maxLength={32}
        aria-label="Nome da sala"
        placeholder="Nome da sala"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <Pencil size={15} className="shrink-0 text-ink-400" aria-hidden />
    </label>
  );
}
