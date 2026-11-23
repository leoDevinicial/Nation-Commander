import { Crown, Medal, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLangStore } from '../../i18n/index.ts';
import { gameClient } from '../../net/client.ts';
import { LOCAL_URL } from '../../net/localSocket.ts';
import { httpBase } from '../../net/regions.ts';
import { SERVER_CANDIDATES } from '../../net/servers.ts';
import { env } from '../../lib/env.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { Shell } from '../components/Shell.tsx';

interface Row {
  name: string;
  wins: number;
  played: number;
}
interface Board {
  season: { label: string; start: string; end: string };
  rows: Row[];
  last: { label: string; champions: (Row & { title: string })[] };
}

/** Servidor remoto de onde vem o ranking (na partida local, o principal). */
function rankingBase(): string {
  const url = gameClient.serverUrl === LOCAL_URL ? (SERVER_CANDIDATES[0] ?? env.gameServerUrl) : gameClient.serverUrl;
  return httpBase(url);
}

/** Nome do mês no idioma da tela (a temporada é o mês). */
function monthName(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso));
}

/**
 * Ranking (23/11): a temporada do mês, por vitórias de quem tem conta (partidas gravadas pelo servidor; contra a IA no
 * aparelho não conta), e os campeões da temporada passada com o título. Vem do servidor (`GET /leaderboard`).
 */
export function RankingScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const lang = useLangStore((s) => s.lang);
  const [board, setBoard] = useState<Board | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`${rankingBase()}/leaderboard`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Board>) : Promise.reject(new Error(String(r.status)))))
      .then((b) => live && setBoard(b))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const lastStart = board ? new Date(new Date(board.season.start).getTime() - 86_400_000).toISOString() : null;
  return (
    <Shell title="Ranking" back={() => setScreen('menu')}>
      {!board && !failed && <p className="text-sm text-ink-400">Carregando o ranking…</p>}
      {failed && <p className="text-sm text-ink-400">Ranking indisponível agora. Tente de novo em alguns minutos.</p>}
      {board && (
        <div className="space-y-4 text-sm">
          {board.last.champions.length > 0 && lastStart && (
            <section>
              <h2 className="label mb-1.5">Campeões da temporada de {monthName(lastStart, lang)}</h2>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {board.last.champions.map((c, i) => (
                  <div key={c.name + i} className="flex items-center gap-2 rounded-[3px] border border-brass-400/40 bg-brass-400/[0.06] px-2 py-1.5">
                    <Crown size={16} className={i === 0 ? 'text-brass-400' : 'text-ink-300'} aria-hidden />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-100" translate="no">
                        {c.name}
                      </div>
                      <div className="text-xs text-ink-400">
                        {c.title} · {c.wins} vitória(s)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section>
            <h2 className="label mb-1.5 flex items-center gap-1.5">
              <Trophy size={15} className="text-brass-400" aria-hidden /> Temporada de {monthName(board.season.start, lang)}
            </h2>
            <p className="mb-2 text-xs text-ink-400">
              Vitórias de quem joga com conta, no multijogador e contra a IA no servidor (a partida contra a IA no aparelho não conta). Os três primeiros do mês
              ganham o título da temporada.
            </p>
            {board.rows.length === 0 ? (
              <p className="text-ink-400">Ninguém venceu ainda neste mês. A primeira vitória abre o ranking.</p>
            ) : (
              <ol className="divide-y divide-ink-800 rounded-[3px] border border-ink-700">
                {board.rows.map((r, i) => (
                  <li key={r.name + i} className="flex items-center gap-2 px-2 py-1.5">
                    <span className={`nc-num w-6 text-right ${i < 3 ? 'text-brass-400' : 'text-ink-400'}`}>{i + 1}</span>
                    {i < 3 ? <Medal size={14} className="text-brass-400" aria-hidden /> : <span className="w-[14px]" />}
                    <span className="min-w-0 flex-1 truncate text-ink-100" translate="no">
                      {r.name}
                    </span>
                    <span className="nc-num text-ink-200">{r.wins} V</span>
                    <span className="nc-num w-20 text-right text-xs text-ink-400">
                      {r.played} partida(s) · {Math.round((r.wins / Math.max(1, r.played)) * 100)}%
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </Shell>
  );
}
