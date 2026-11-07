import { Activity, Bot, Clock, Gamepad2, MessageSquare, RefreshCw, Star, Swords, Trophy, Users, UserRound, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { REGIONS } from '../../net/regionState.ts';
import { httpBase } from '../../net/regions.ts';
import { Frame } from '../components/Frame.tsx';

/**
 * Painel de números (06/11), só por link direto: `/painel#<STATS_TOKEN>`. O token fica no fragmento do link (o navegador
 * não o envia a servidor nenhum) e segue no cabeçalho Authorization para o `/stats` de cada região. Sem token válido, a
 * página não mostra nada. Não há link para ela em lugar nenhum do jogo, e ela pede para não ser indexada.
 */
interface RegionStats {
  now: string;
  region: string | null;
  online: number;
  inMatches: number;
  matchesRunning: number;
  db: {
    accounts: number | null;
    today: { matches: number; avgSeconds: number | null } | null;
    week: { matches: number; avgSeconds: number | null } | null;
    error?: string;
  };
  server: { since: string; today: { matches: number; avgSeconds: number | null; guestOnly: number } };
}

type Result = { label: string; ok: true; data: RegionStats } | { label: string; ok: false; status: number | null };

/** Detalhes (07/11, só com a chave de detalhes): feedbacks e últimas partidas. */
interface MatchPlayer {
  name: string;
  ai: boolean;
  guest?: boolean;
  country: string;
  result: string;
}
interface RecentMatch {
  endedAt: string;
  durationSeconds: number;
  mode: string;
  map: string | null;
  reason: string;
  players: MatchPlayer[];
}
interface FeedbackRow {
  id: number;
  created_at: string;
  display_name: string;
  guest: boolean;
  category: string;
  rating: number | null;
  message: string;
  game_version: string;
}
interface RegionDetails {
  region: string | null;
  recent: RecentMatch[];
  db: { feedback: FeedbackRow[] | null; matches: { ended_at: string; duration_seconds: number; mode: string; end_reason: string; players: MatchPlayer[] }[] | null; error?: string };
}
type Details = { label: string; data: RegionDetails };

const CATEGORY: Record<string, string> = { bug: 'Bug', suggestion: 'Sugestão', balance: 'Balanceamento', praise: 'Elogio', other: 'Outro' };
const MODE: Record<string, string> = { vs_ai: 'Contra a IA', pvp: 'Multijogador' };
const REASON: Record<string, string> = { hq_destroyed: 'QG destruído', forfeit: 'Rendição', disconnect: 'Desconexão', draw: 'Empate' };
const MAP: Record<string, string> = { continental: 'Continental', rivers: 'Rios e Pontes', mountains: 'Montanhoso', desert: 'Deserto', ocean: 'Oceano Central', islands: 'Arquipélago' };

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const REFRESH_MS = 20_000;

function duration(sec: number | null | undefined): string {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min ${String(s).padStart(2, '0')} s`;
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('pt-BR'));

function Tile({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note?: string }) {
  return (
    <Frame className="min-w-0" innerClassName="flex flex-col gap-1 p-4">
      <div className="flex items-center gap-2">
        <Icon size={16} className="text-brass-400" aria-hidden />
        <span className="nc-kicker">{label}</span>
      </div>
      <span className="nc-num text-4xl font-bold text-ink-100">{value}</span>
      {note && <span className="text-xs text-ink-400">{note}</span>}
    </Frame>
  );
}

export function StatsPage() {
  const [token] = useState(() => decodeURIComponent(location.hash.replace(/^#/, '')));
  const [results, setResults] = useState<Result[] | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [details, setDetails] = useState<Details[]>([]);

  useEffect(() => {
    document.title = 'Painel · Nation Commander';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const out = await Promise.all(
      REGIONS.map(async (r): Promise<Result> => {
        try {
          const res = await fetch(`${httpBase(r.url)}/stats`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
          if (!res.ok) return { label: r.label, ok: false, status: res.status };
          return { label: r.label, ok: true, data: (await res.json()) as RegionStats };
        } catch {
          return { label: r.label, ok: false, status: null };
        }
      }),
    );
    const det = await Promise.all(
      REGIONS.map(async (r): Promise<Details | null> => {
        try {
          const res = await fetch(`${httpBase(r.url)}/stats/details`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
          return res.ok ? { label: r.label, data: (await res.json()) as RegionDetails } : null;
        } catch {
          return null;
        }
      }),
    );
    setDetails(det.filter((d): d is Details => !!d));
    setResults(out);
    setUpdated(new Date());
    setLoading(false);
  }, [token]);

  useEffect(() => {
    // primeira leitura logo depois de montar (fora do corpo do efeito) e depois a cada REFRESH_MS
    const first = setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const ok = (results ?? []).filter((r): r is Extract<Result, { ok: true }> => r.ok);
  const denied = !!results && results.length > 0 && ok.length === 0;
  // sem token ou sem acesso, a página não diz nada sobre o que existe aqui
  if (!token || denied)
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-950 text-sm text-ink-400">
        <span>Página não encontrada.</span>
      </div>
    );

  const db = ok.find((r) => r.data.db.accounts !== null)?.data.db ?? ok[0]?.data.db;
  const online = ok.reduce((a, r) => a + r.data.online, 0);
  const inMatches = ok.reduce((a, r) => a + r.data.inMatches, 0);
  const running = ok.reduce((a, r) => a + r.data.matchesRunning, 0);
  const srvToday = ok.reduce((a, r) => a + r.data.server.today.matches, 0);
  const srvGuest = ok.reduce((a, r) => a + r.data.server.today.guestOnly, 0);
  const srvSeconds = ok.reduce((a, r) => a + (r.data.server.today.avgSeconds ?? 0) * r.data.server.today.matches, 0);

  return (
    <div className="h-full w-full overflow-auto bg-ink-950 px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-brass-400/25 pb-3">
          <div>
            <div className="nc-kicker">Sala de Situação · uso restrito</div>
            <h1 className="nc-title text-2xl text-ink-100">Painel do jogo</h1>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span>
              {updated ? `Atualizado às ${updated.toLocaleTimeString('pt-BR')}` : 'Carregando…'} · a cada {REFRESH_MS / 1000} s · dia no horário de Brasília
            </span>
            <button className="nc-icon-btn" onClick={() => void load()} disabled={loading} aria-label="Atualizar agora">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} aria-hidden />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile icon={UserRound} label="Contas registradas" value={num(db?.accounts)} note={db?.error ?? 'Perfis no Supabase'} />
          <Tile icon={Users} label="Jogadores online" value={num(online)} note={`${num(inMatches)} em partida · ${num(running)} ${running === 1 ? 'partida rodando' : 'partidas rodando'}`} />
          <Tile icon={Swords} label="Partidas hoje" value={num(db?.today?.matches)} note="Gravadas no banco (com pelo menos uma conta registrada)" />
          <Tile icon={Clock} label="Duração média hoje" value={duration(db?.today?.avgSeconds)} note={`Últimos 7 dias: ${duration(db?.week?.avgSeconds)} em ${num(db?.week?.matches)} partidas`} />
        </div>

        <Frame className="mt-4" innerClassName="p-4">
          <div className="mb-2 flex items-center gap-2">
            <Activity size={16} className="text-brass-400" aria-hidden />
            <span className="nc-kicker">Contagem dos servidores (inclui convidados)</span>
          </div>
          <p className="mb-3 text-xs text-ink-400">
            O banco só grava partidas com pelo menos uma conta registrada. Aqui entram todas as partidas encerradas hoje em cada servidor desde o último reinício (o Sandbox não conta).
          </p>
          <div className="flex flex-wrap gap-6 text-sm">
            <span>
              <span className="nc-num text-xl text-ink-100">{num(srvToday)}</span> <span className="text-ink-400">partidas hoje</span>
            </span>
            <span>
              <span className="nc-num text-xl text-ink-100">{num(srvGuest)}</span> <span className="text-ink-400">só de convidados</span>
            </span>
            <span>
              <span className="nc-num text-xl text-ink-100">{duration(srvToday ? Math.round(srvSeconds / srvToday) : null)}</span> <span className="text-ink-400">duração média</span>
            </span>
          </div>
          <table className="mt-4 w-full text-left text-xs">
            <thead className="text-ink-400">
              <tr className="border-b border-ink-700">
                <th className="py-1.5 font-semibold">Região</th>
                <th className="py-1.5 font-semibold">Online</th>
                <th className="py-1.5 font-semibold">Em partida</th>
                <th className="py-1.5 font-semibold">Partidas hoje</th>
                <th className="py-1.5 font-semibold">No ar desde</th>
              </tr>
            </thead>
            <tbody>
              {(results ?? []).map((r) => (
                <tr key={r.label} className="border-b border-ink-800">
                  <td className="py-1.5 text-ink-200">
                    <Gamepad2 size={12} className="mr-1 inline-block align-[-1px] text-ink-400" aria-hidden />
                    {r.label}
                  </td>
                  {r.ok ? (
                    <>
                      <td className="nc-num py-1.5">{num(r.data.online)}</td>
                      <td className="nc-num py-1.5">{num(r.data.inMatches)}</td>
                      <td className="nc-num py-1.5">{num(r.data.server.today.matches)}</td>
                      <td className="py-1.5 text-ink-400">{new Date(r.data.server.since).toLocaleString('pt-BR')}</td>
                    </>
                  ) : (
                    <td className="py-1.5 text-red-300" colSpan={4}>
                      Sem resposta{r.status ? ` (${r.status})` : ''}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Frame>

        {details.length > 0 && <DetailsPanels details={details} />}
      </div>
    </div>
  );
}

function Players({ players }: { players: MatchPlayer[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
      {players.map((p, i) => (
        <span key={i} className={p.result === 'win' ? 'text-ink-100' : 'text-ink-400'} translate="no">
          {p.ai ? <Bot size={12} className="mr-0.5 inline-block align-[-1px]" aria-label="IA" /> : null}
          {p.result === 'win' ? <Trophy size={12} className="mr-0.5 inline-block align-[-1px] text-brass-400" aria-label="Venceu" /> : null}
          {p.name}
          <span className="ml-1 text-[10px] text-ink-400 uppercase">
            {p.country}
            {p.guest ? ' · convidado' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

function DetailsPanels({ details }: { details: Details[] }) {
  const [tab, setTab] = useState<'recent' | 'db'>('recent');
  // o banco é o mesmo para todas as regiões: vale a primeira resposta com dados
  const db = details.find((d) => d.data.db.feedback || d.data.db.matches)?.data.db ?? details[0]!.data.db;
  const recent = details
    .flatMap((d) => d.data.recent.map((m) => ({ ...m, region: d.label })))
    .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
    .slice(0, 40);
  const feedback = db.feedback ?? [];
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Frame className="min-w-0" innerClassName="flex max-h-[34rem] flex-col p-4">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare size={16} className="text-brass-400" aria-hidden />
          <span className="nc-kicker">Feedbacks</span>
          <span className="ml-auto text-xs text-ink-400">{db.feedback ? `${feedback.length} mais recentes` : (db.error ?? 'Sem dados')}</span>
        </div>
        <ul className="-mr-2 flex flex-col gap-2 overflow-y-auto pr-2">
          {feedback.length === 0 && <li className="text-xs text-ink-400">Nenhum feedback ainda.</li>}
          {feedback.map((f) => (
            <li key={f.id} className="border-l-2 border-brass-400/40 bg-ink-900/60 px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-semibold text-ink-100" translate="no">
                  {f.display_name}
                </span>
                {f.guest && <span className="text-ink-400">convidado</span>}
                <span className="border border-ink-600 px-1 text-[10px] tracking-wide text-ink-200 uppercase">{CATEGORY[f.category] ?? f.category}</span>
                {f.rating !== null && (
                  <span className="flex items-center text-brass-400" aria-label={`${f.rating} de 5`}>
                    {Array.from({ length: f.rating }, (_, i) => (
                      <Star key={i} size={11} fill="currentColor" aria-hidden />
                    ))}
                  </span>
                )}
                <span className="ml-auto text-ink-400">
                  {when(f.created_at)} · v{f.game_version}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap text-ink-200" translate="no">
                {f.message}
              </p>
            </li>
          ))}
        </ul>
      </Frame>

      <Frame className="min-w-0" innerClassName="flex max-h-[34rem] flex-col p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Swords size={16} className="text-brass-400" aria-hidden />
          <span className="nc-kicker">Últimas partidas</span>
          <div className="nc-seg ml-auto flex text-xs">
            <button className={`px-2 py-1 ${tab === 'recent' ? 'text-brass-400' : 'text-ink-400'}`} aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>
              Servidores (todas)
            </button>
            <button className={`px-2 py-1 ${tab === 'db' ? 'text-brass-400' : 'text-ink-400'}`} aria-pressed={tab === 'db'} onClick={() => setTab('db')}>
              Banco (com conta)
            </button>
          </div>
        </div>
        <p className="mb-2 text-xs text-ink-400">
          {tab === 'recent' ? 'Encerradas desde o último reinício de cada servidor, inclusive só de convidados (o Sandbox não entra).' : 'Gravadas no Supabase: só partidas com pelo menos uma conta registrada.'}
        </p>
        <div className="-mr-2 overflow-y-auto pr-2">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-400">
              <tr className="border-b border-ink-700">
                <th className="py-1.5 pr-2 font-semibold">Fim</th>
                <th className="py-1.5 pr-2 font-semibold">Duração</th>
                <th className="py-1.5 pr-2 font-semibold">Comandantes</th>
                <th className="py-1.5 font-semibold">Partida</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'recent'
                ? recent.map((m, i) => (
                    <tr key={i} className="border-b border-ink-800 align-top">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-ink-200">{when(m.endedAt)}</td>
                      <td className="nc-num py-1.5 pr-2 whitespace-nowrap">{duration(m.durationSeconds)}</td>
                      <td className="py-1.5 pr-2">
                        <Players players={m.players} />
                      </td>
                      <td className="py-1.5 text-ink-400">
                        {MODE[m.mode] ?? m.mode} · {m.map ? (MAP[m.map] ?? m.map) : '—'} · {REASON[m.reason] ?? m.reason} · {m.region}
                      </td>
                    </tr>
                  ))
                : (db.matches ?? []).map((m, i) => (
                    <tr key={i} className="border-b border-ink-800 align-top">
                      <td className="py-1.5 pr-2 whitespace-nowrap text-ink-200">{when(m.ended_at)}</td>
                      <td className="nc-num py-1.5 pr-2 whitespace-nowrap">{duration(m.duration_seconds)}</td>
                      <td className="py-1.5 pr-2">
                        <Players players={m.players} />
                      </td>
                      <td className="py-1.5 text-ink-400">
                        {MODE[m.mode] ?? m.mode} · {REASON[m.end_reason] ?? m.end_reason}
                      </td>
                    </tr>
                  ))}
              {(tab === 'recent' ? recent.length === 0 : !(db.matches ?? []).length) && (
                <tr>
                  <td colSpan={4} className="py-3 text-ink-400">
                    {tab === 'db' && db.error ? db.error : 'Nenhuma partida ainda.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Frame>
    </div>
  );
}
