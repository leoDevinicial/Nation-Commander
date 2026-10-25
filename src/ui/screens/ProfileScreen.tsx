import { useEffect, useState } from 'react';
import { countryName, DEFAULT_COUNTRY } from '../../../shared/data/countries.ts';
import { supabase, type MatchHistoryRow, type PlayerStatsRow } from '../../lib/supabase.ts';
import { loadProfile } from '../../app/session.ts';
import { formatDuration } from '../../lib/format.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { CountrySelect } from '../components/CountrySelect.tsx';
import { Shell } from '../components/Shell.tsx';

const RESULT = { win: 'Vitória', loss: 'Derrota', draw: 'Empate' } as const;

export function ProfileScreen() {
  const profile = useAppStore((s) => s.profile);
  const setScreen = useAppStore((s) => s.setScreen);
  const toast = useAppStore((s) => s.pushToast);
  const [stats, setStats] = useState<PlayerStatsRow | null>(null);
  const [history, setHistory] = useState<MatchHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '');
  const [country, setCountry] = useState(profile?.preferred_country ?? DEFAULT_COUNTRY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supabase || !profile) return;
    let cancelled = false;
    void (async () => {
      const [s, h] = await Promise.all([
        supabase.from('player_stats').select('*').eq('player_id', profile.id).maybeSingle(),
        supabase
          .from('match_players')
          .select('match_id, slot, result, country_id, units_killed, units_lost, matches(mode, ended_at, duration_seconds, end_reason)')
          .eq('player_id', profile.id)
          .order('match_id', { ascending: false })
          .limit(50),
      ]);
      if (cancelled) return;
      if (s.error) toast('error', s.error.message);
      if (h.error) toast('error', h.error.message);
      setStats((s.data as PlayerStatsRow | null) ?? null);
      const rows = ((h.data ?? []) as unknown as MatchHistoryRow[]).sort((a, b) => (b.matches?.ended_at ?? '').localeCompare(a.matches?.ended_at ?? ''));
      setHistory(rows.slice(0, 15));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, toast]);

  if (!profile || !supabase) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase!
      .from('profiles')
      .update({ display_name: displayName.trim().slice(0, 40) || null, preferred_country: country })
      .eq('id', profile.id);
    setSaving(false);
    if (error) toast('error', error.message);
    else {
      toast('info', 'Perfil atualizado. O novo nome vale a partir da próxima conexão.');
      useAppStore.setState({ profile: await loadProfile(profile.id) });
    }
  };

  const winRate = stats && stats.matches_played > 0 ? Math.round((stats.wins / stats.matches_played) * 100) : null;
  const hours = stats ? (stats.total_seconds_played / 3600).toFixed(1) : '0';

  return (
    <Shell title={`Perfil · @${profile.username}`} back={() => setScreen('menu')} wide>
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="dn">
              Nome de exibição
            </label>
            <input id="dn" className="field" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="pc">
              País preferido
            </label>
            <CountrySelect id="pc" value={country} onChange={setCountry} />
          </div>
          <button className="btn btn-primary w-full" disabled={saving} onClick={() => void save()}>
            {saving ? 'Salvando…' : 'Salvar Perfil'}
          </button>
          <p className="text-xs text-ink-400">Membro desde {new Date(profile.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
        <div>
          <h2 className="label">Estatísticas</h2>
          {loading ? (
            <p className="text-sm text-ink-400">Carregando…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Partidas" value={stats?.matches_played ?? 0} />
              <Stat label="Vitórias" value={stats?.wins ?? 0} />
              <Stat label="Derrotas" value={stats?.losses ?? 0} />
              <Stat label="Aproveitamento" value={winRate === null ? '—' : `${winRate}%`} />
              <Stat label="Abates" value={stats?.units_killed ?? 0} />
              <Stat label="Perdas" value={stats?.units_lost ?? 0} />
              <Stat label="Estruturas destruídas" value={stats?.structures_destroyed ?? 0} />
              <Stat label="Horas jogadas" value={hours} />
            </dl>
          )}
          <h2 className="label mt-6">Partidas recentes</h2>
          {history.length === 0 && !loading ? (
            <p className="text-sm text-ink-400">Nenhuma partida registrada ainda.</p>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="text-ink-400">
                <tr>
                  <th className="py-1">Data</th>
                  <th>Modo</th>
                  <th>País</th>
                  <th>Resultado</th>
                  <th>Abates/Perdas</th>
                  <th>Duração</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.match_id} className="border-t border-ink-800">
                    <td className="py-1.5">{h.matches ? new Date(h.matches.ended_at).toLocaleString('pt-BR') : '—'}</td>
                    <td>{h.matches?.mode === 'vs_ai' ? 'Contra IA' : 'Multijogador'}</td>
                    <td>{countryName(h.country_id)}</td>
                    <td className={h.result === 'win' ? 'text-signal-green' : h.result === 'loss' ? 'text-red-300' : ''}>{RESULT[h.result]}</td>
                    <td>
                      {h.units_killed}/{h.units_lost}
                    </td>
                    <td>{h.matches ? formatDuration(h.matches.duration_seconds) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-ink-700 bg-ink-850 p-2">
      <dt className="text-[10px] uppercase tracking-wider text-ink-400">{label}</dt>
      <dd className="font-mono text-lg font-bold">{value}</dd>
    </div>
  );
}
