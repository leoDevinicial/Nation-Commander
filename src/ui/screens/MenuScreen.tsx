import { useEffect, useState } from 'react';
import type { PublicRoomSummary } from '../../../shared/protocol.ts';
import { MAP_TYPE_INFO } from '../../../shared/sim/matchMap.ts';
import { gameClient } from '../../net/client.ts';
import { localAdvisorStore, type Advice } from '../../game/perf/advisor.ts';
import { PRESET_LABELS } from '../../lib/graphics.ts';
import { useSettingsStore } from '../../state/useSettingsStore.ts';
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

  const create = (mode: 'pvp' | 'vs_ai' | 'sandbox', isPublic = false) => {
    autoFullscreen();
    gameClient.send({ t: 'create_room', mode, countryId: preferredCountry(), ...(isPublic ? { isPublic: true } : {}) });
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

      <PresetAdvice />

      <div className="space-y-2">
        <button className="btn btn-primary btn-hero w-full" disabled={!online} title={offlineHint} onClick={() => create('vs_ai')}>
          <span aria-hidden>▶</span>
          <span className="flex flex-col">
            <span>Nova Partida</span>
            <span className="font-sans text-[11px] font-medium tracking-normal opacity-75">Contra um governo controlado pela IA</span>
          </span>
        </button>
        <button className="btn btn-hero w-full" disabled={!online} title={offlineHint} onClick={() => create('sandbox')}>
          <span aria-hidden>🧪</span>
          <span className="flex flex-col">
            <span>Modo Sandbox</span>
            <span className="font-sans text-[11px] font-medium tracking-normal text-ink-400">Livre: recursos ilimitados, tudo liberado, crie tropas e teste o jogo</span>
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
        <PublicRooms online={online} onCreate={() => create('pvp', true)} />
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

/**
 * Consultor de preset (KAICS Adaptables+ · C6): depois de uma partida que passou a maior parte do
 * tempo abaixo da meta, recomenda outro preset com motivo e números. Nunca troca sozinho.
 */
function PresetAdvice() {
  const quality = useSettingsStore((s) => s.quality);
  const update = useSettingsStore((s) => s.update);
  const [advice, setAdvice] = useState<Advice | null>(() => localAdvisorStore().advice());
  // o jogador já trocou de preset por conta própria: a recomendação perdeu o sentido
  if (!advice || advice.from !== quality) return null;
  const close = () => {
    localAdvisorStore().saveAdvice(null);
    setAdvice(null);
  };
  return (
    <div className="mb-4 rounded border border-brass-400/50 bg-ink-850/90 p-3 text-sm" role="status">
      <div className="font-semibold text-brass-400">Desempenho na última partida</div>
      <p className="mt-1 text-xs text-ink-200">{advice.reason}</p>
      <p className="mt-1 text-xs text-ink-200">
        Recomendado para a próxima: <b className="text-ink-100">{PRESET_LABELS[advice.to]}</b> — {advice.basis}. Os presets mudam só o visual, nunca as regras.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          className="btn btn-primary min-h-9 px-3"
          onClick={() => {
            update({ quality: advice.to });
            close();
          }}
        >
          Usar {PRESET_LABELS[advice.to]}
        </button>
        <button className="btn min-h-9 px-3" onClick={close}>
          Manter {PRESET_LABELS[advice.from]}
        </button>
      </div>
    </div>
  );
}

/**
 * Salas públicas: salas multijogador no lobby, com vaga, que o anfitrião deixou abertas. A lista é pedida ao servidor
 * a cada 5 s enquanto o menu está aberto; "Entrar" usa o código da sala com o país preferido do jogador.
 */
function PublicRooms({ online, onCreate }: { online: boolean; onCreate: () => void }) {
  const [rooms, setRooms] = useState<PublicRoomSummary[] | null>(null);
  useEffect(() => {
    if (!online) return;
    const off = gameClient.on((msg) => {
      if (msg.t === 'room_list') setRooms(msg.rooms);
    });
    const ask = () => gameClient.send({ t: 'list_rooms' });
    ask();
    const timer = window.setInterval(ask, 5000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [online]);
  const join = (code: string) => {
    autoFullscreen();
    gameClient.send({ t: 'join_room', code, countryId: preferredCountry() });
  };
  return (
    <section className="rounded border border-ink-700 bg-ink-850/60 p-2" aria-label="Salas públicas">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="font-display text-xs font-semibold tracking-[0.2em] text-brass-400 uppercase">Salas públicas</h2>
        <button className="btn min-h-8 px-2.5 py-1 text-xs" disabled={!online} onClick={onCreate} title="Cria uma sala multijogador aberta: aparece nesta lista para qualquer comandante entrar">
          + Criar sala pública
        </button>
      </div>
      {!online ? (
        <p className="px-1 py-2 text-xs text-ink-400">Aguardando conexão com o servidor…</p>
      ) : rooms === null ? (
        <p className="px-1 py-2 text-xs text-ink-400">Procurando salas…</p>
      ) : rooms.length === 0 ? (
        <p className="px-1 py-2 text-xs text-ink-400">Nenhuma sala aberta agora. Crie uma e aguarde outros comandantes.</p>
      ) : (
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {rooms.map((r) => (
            <li key={r.code} className="flex items-center gap-2 rounded bg-ink-800/70 px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-ink-100">Sala de {r.hostName}</span>
                <span className="block truncate text-ink-400">
                  {r.mapType === 'random' ? 'Mapa sorteado' : MAP_TYPE_INFO[r.mapType].label} · {r.countries.map((c) => countryName(c)).join(', ')}
                </span>
              </span>
              <span className="shrink-0 font-mono text-ink-200" title="Nações ocupadas / vagas">
                {r.players}/{r.maxPlayers}
              </span>
              <button className="btn btn-primary min-h-8 shrink-0 px-3 py-1 text-xs" onClick={() => join(r.code)}>
                Entrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
