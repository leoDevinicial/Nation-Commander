import { useState } from 'react';
import { gameClient } from '../../net/client.ts';
import { preferredCountry, signOut } from '../../app/session.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { countryName } from '../../../shared/data/countries.ts';
import { GAME_TITLE } from '../../../shared/version.ts';
import { ConnectionBadge } from '../components/ConnectionBadge.tsx';
import { Shell } from '../components/Shell.tsx';
import { autoFullscreen } from '../components/FullscreenButton.tsx';

export function MenuScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.connStatus);
  const user = useAppStore((s) => s.serverUser);
  const profile = useAppStore((s) => s.profile);
  const guest = useAppStore((s) => s.guest);
  const [code, setCode] = useState('');
  const online = status === 'connected';
  const offlineHint = online ? undefined : 'Aguardando conexão com o servidor de jogo';

  const create = (mode: 'pvp' | 'vs_ai') => {
    autoFullscreen();
    gameClient.send({ t: 'create_room', mode, countryId: preferredCountry() });
  };
  const join = () => {
    const c = code.trim().toUpperCase();
    if (c.length !== 5) return;
    autoFullscreen();
    gameClient.send({ t: 'join_room', code: c, countryId: preferredCountry() });
  };

  return (
    <Shell align="start">
      <div className="mb-6 [@media(max-height:520px)]:mb-3">
        <div className="font-display text-[11px] font-semibold tracking-[0.32em] text-brass-400 uppercase">Comando Estratégico · RTS 3D</div>
        <h1 className="font-display mt-2 text-[1.7rem] leading-[1.1] font-bold tracking-wide text-ink-100 sm:text-[2.1rem] [@media(max-height:520px)]:text-xl">{GAME_TITLE}</h1>
        <p className="mt-3 text-sm text-ink-400">
          Comandante: <span className="font-semibold text-ink-100">{user?.name ?? profile?.display_name ?? guest?.name ?? '—'}</span>
          {guest && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] uppercase">Convidado</span>}
          <span className="ml-2 text-ink-400">· {countryName(preferredCountry())}</span>
        </p>
      </div>

      <div className="space-y-2">
        <button className="btn btn-primary btn-hero w-full" disabled={!online} title={offlineHint} onClick={() => create('vs_ai')}>
          <span aria-hidden>▶</span>
          <span className="flex flex-col">
            <span>Nova Partida</span>
            <span className="font-sans text-[11px] font-medium tracking-normal opacity-75">Contra um governo controlado pela IA</span>
          </span>
        </button>
        <button className="btn btn-hero w-full" disabled={!online} title={offlineHint} onClick={() => create('pvp')}>
          <span aria-hidden>⚑</span>
          <span className="flex flex-col">
            <span>Criar Sala Multijogador</span>
            <span className="font-sans text-[11px] font-medium tracking-normal text-ink-400">Gera um código para outro comandante entrar</span>
          </span>
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
            autoCapitalize="characters"
            onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
          />
          <button className="btn shrink-0" disabled={!online || code.length !== 5} title={offlineHint}>
            Entrar em Sala
          </button>
        </form>
        <button className="btn w-full" disabled title="Partidas em andamento são retomadas automaticamente ao reconectar com a mesma conta">
          Continuar Partida <span className="text-xs font-normal text-ink-400">(automático ao reconectar)</span>
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button className="btn" onClick={() => setScreen('manual')} title="O básico do jogo em 7 cartões curtos">
          Manual
        </button>
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
        <button className="btn px-3 py-1 text-xs" onClick={() => void signOut()}>
          Sair da Conta
        </button>
      </div>
    </Shell>
  );
}
