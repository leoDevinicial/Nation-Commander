import { useState } from 'react';
import { gameClient } from '../../net/client.ts';
import { preferredCountry, signOut } from '../../app/session.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { Shell } from '../components/Shell.tsx';

export function MenuScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.connStatus);
  const user = useAppStore((s) => s.serverUser);
  const profile = useAppStore((s) => s.profile);
  const guest = useAppStore((s) => s.guest);
  const [code, setCode] = useState('');
  const online = status === 'connected';

  const create = (mode: 'pvp' | 'vs_ai') => gameClient.send({ t: 'create_room', mode, countryId: preferredCountry() });
  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length === 5) gameClient.send({ t: 'join_room', code: c, countryId: preferredCountry() });
  };

  return (
    <Shell>
      <div className="mb-6 text-center">
        <div className="text-xs font-semibold tracking-[0.3em] text-brass-400">RTS GEOPOLÍTICO 3D</div>
        <h1 className="mt-1 text-3xl font-black tracking-wide">Nation Commander</h1>
        <p className="mt-2 text-sm text-ink-400">
          Comandante: <span className="font-semibold text-ink-100">{user?.name ?? profile?.display_name ?? guest?.name ?? '—'}</span>
          {guest && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase">convidado</span>}
        </p>
      </div>

      <div className="space-y-2">
        <button className="btn btn-primary w-full py-3" disabled={!online} onClick={() => create('vs_ai')}>
          Nova partida contra a IA
        </button>
        <button className="btn w-full py-3" disabled={!online} onClick={() => create('pvp')}>
          Criar sala multijogador
        </button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            join();
          }}
        >
          <input
            className="field font-mono tracking-[0.3em] uppercase"
            placeholder="CÓDIGO"
            aria-label="Código da sala"
            value={code}
            maxLength={5}
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
          />
          <button className="btn shrink-0" disabled={!online || code.length !== 5}>
            Entrar na sala
          </button>
        </form>
        <button className="btn w-full" disabled title="Partidas em andamento são retomadas automaticamente ao reconectar">
          Continuar (automático ao reconectar)
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="btn" onClick={() => setScreen('profile')} disabled={!profile} title={profile ? undefined : 'Disponível para contas registradas'}>
          Perfil
        </button>
        <button className="btn" onClick={() => setScreen('settings')}>
          Configurações
        </button>
        <button className="btn" onClick={() => setScreen('credits')}>
          Créditos
        </button>
      </div>
      <div className="mt-6 flex items-center justify-between border-t border-ink-700 pt-4">
        <ConnectionBadge />
        <button className="text-xs text-ink-400 underline hover:text-ink-100" onClick={() => void signOut()}>
          Sair da conta
        </button>
      </div>
    </Shell>
  );
}
