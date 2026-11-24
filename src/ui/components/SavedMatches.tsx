import { useEffect, useState } from 'react';
import { Bot, Play, Save, Trash2, Users } from 'lucide-react';
import { countryName } from '../../../shared/data/countries.ts';
import type { SavedMatchInfo } from '../../../shared/protocol.ts';
import { gameClient } from '../../net/client.ts';
import { ensureRemote, goLocal, isLocal } from '../../net/localMode.ts';
import { deleteLocalSaved, refreshLocalSaved } from '../../net/savedLocal.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useSavedStore } from '../../state/useSavedStore.ts';
import { Frame } from './Frame.tsx';

const when = (ms: number) => new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Partidas salvas no menu (24/11, pedido dos jogadores: "save and load"): as do servidor (multijogador e contra a IA
 * no servidor) e as contra a IA guardadas neste aparelho. Continuar reabre de onde parou; entre humanos, a partida
 * espera todos os comandantes voltarem.
 */
export function SavedMatches() {
  const status = useAppStore((s) => s.connStatus);
  const remote = useSavedStore((s) => s.remote);
  const local = useSavedStore((s) => s.local);
  const invite = useSavedStore((s) => s.invite);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  useEffect(() => {
    void refreshLocalSaved();
  }, []);
  useEffect(() => {
    // a lista do servidor vem do remoto (no servidor local, a do aparelho já vem do IndexedDB)
    if (status === 'connected' && !isLocal()) gameClient.send({ t: 'saved_list' });
  }, [status]);

  const items: (SavedMatchInfo & { where: 'local' | 'remote' })[] = [...local.map((m) => ({ ...m, where: 'local' as const })), ...(remote ?? []).map((m) => ({ ...m, where: 'remote' as const }))].sort(
    (a, b) => Number(!!b.waiting) - Number(!!a.waiting) || b.savedAt - a.savedAt,
  );

  const resume = async (m: SavedMatchInfo & { where: 'local' | 'remote' }) => {
    setBusy(m.code);
    const ok = m.where === 'local' ? await goLocal() : await ensureRemote();
    if (ok) gameClient.send({ t: 'saved_resume', code: m.code });
    setTimeout(() => setBusy(null), 4000);
  };
  const remove = async (m: SavedMatchInfo & { where: 'local' | 'remote' }) => {
    setConfirm(null);
    if (m.where === 'local') await deleteLocalSaved(m.code);
    else gameClient.send({ t: 'saved_delete', code: m.code });
  };

  if (!items.length && !invite) return null;
  return (
    <Frame innerClassName="flex flex-col gap-2 p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <Save size={15} className="text-brass-400" aria-hidden />
        <span className="nc-kicker">Partidas salvas</span>
      </div>
      {invite && !items.some((m) => m.code === invite.code) && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-brass-400/50 bg-brass-400/10 px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 text-ink-200">{`${invite.by} reabriu uma partida salva de vocês.`}</span>
          <button className="btn btn-primary min-h-7 px-3 text-xs" onClick={() => void resume({ code: invite.code, where: 'remote', mode: 'pvp', savedAt: 0, day: 0, players: [] })}>
            Entrar
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-1.5">
        {items.map((m) => {
          const me = m.players.find((p) => p.me);
          const others = m.players.filter((p) => !p.me);
          const humans = m.players.filter((p) => !p.isAI).length;
          return (
            <li key={`${m.where}:${m.code}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-800 pt-1.5 first:border-t-0 first:pt-0">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[3px] border border-ink-600 text-brass-400" aria-hidden>
                {humans > 1 ? <Users size={14} /> : <Bot size={14} />}
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="block truncate text-ink-100">
                  {me ? countryName(me.countryId) : '—'} × {others.map((p) => (p.isAI ? countryName(p.countryId) : p.name)).join(', ')}
                </span>
                <span className="block text-[11px] text-ink-400">
                  {m.waiting ? (
                    'Reaberta: esperando você'
                  ) : (
                    <>
                      <span>{humans > 1 ? 'Multijogador' : 'Contra a IA'}</span>
                      <span>{` · dia ${m.day} · salva em ${when(m.savedAt)}`}</span>
                    </>
                  )}
                </span>
              </span>
              {confirm === m.code ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="text-ink-300">Apagar para sempre?</span>
                  <button className="btn btn-danger min-h-7 px-2 text-xs" onClick={() => void remove(m)}>
                    Apagar
                  </button>
                  <button className="btn min-h-7 px-2 text-xs" onClick={() => setConfirm(null)}>
                    Não
                  </button>
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <button className="btn btn-primary min-h-7 px-3 text-xs" disabled={busy === m.code || (m.where === 'remote' && status !== 'connected')} onClick={() => void resume(m)}>
                    <Play size={13} aria-hidden /> {busy === m.code ? 'Abrindo…' : 'Continuar'}
                  </button>
                  {!m.waiting && (
                    <button className="nc-icon-btn" aria-label="Apagar partida salva" title="Apagar partida salva" onClick={() => setConfirm(m.code)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {items.some((m) => m.players.filter((p) => !p.isAI).length > 1) && (
        <p className="text-[11px] text-ink-400">Multijogador: a partida reaberta fica pausada até todos os comandantes entrarem (até 10 minutos).</p>
      )}
    </Frame>
  );
}
