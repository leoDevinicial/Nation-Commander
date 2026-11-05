import { LogIn, Plus, Radar, RefreshCw, Star } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PublicRoomSummary } from '../../../shared/protocol.ts';
import { countryName } from '../../../shared/data/countries.ts';
import { MAP_TYPE_INFO } from '../../../shared/sim/matchMap.ts';
import { gameClient } from '../../net/client.ts';
import { preferredCountry } from '../../app/session.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { Shell } from '../components/Shell.tsx';
import { autoFullscreen } from '../components/FullscreenButton.tsx';
import { REGIONS, multiRegion } from '../../net/regionState.ts';
import { httpBase, regionForCode } from '../../net/regions.ts';
import { prepareJoin, prepareNewRoom } from '../../net/regionFlow.ts';

/** KNPS-08: salas públicas das outras regiões (a do servidor atual chega pelo próprio WebSocket). */
async function otherRegionRooms(): Promise<PublicRoomSummary[]> {
  const others = REGIONS.filter((r) => r.url !== gameClient.serverUrl);
  const lists = await Promise.all(
    others.map(async (r) => {
      try {
        const res = await fetch(`${httpBase(r.url)}/knps/rooms`, { cache: 'no-store' });
        if (!res.ok) return [];
        const body = (await res.json()) as { rooms?: PublicRoomSummary[] };
        // só aceita códigos da própria região (uma resposta não decide a sala de outro servidor)
        return (body.rooms ?? []).filter((x) => typeof x.code === 'string' && x.code.startsWith(r.letter));
      } catch {
        return [];
      }
    }),
  );
  return lists.flat();
}

/**
 * Navegador de salas (como o lobby de salas do Rise of Nations ou do Among Us): a lista das salas multijogador
 * públicas, ainda no lobby e com vaga, atualizada a cada 5 s. Dá para filtrar, entrar numa sala (clique em "Entrar"
 * ou duplo clique na linha), criar uma sala pública ou entrar com um código de sala privada.
 */
export function RoomsScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const status = useAppStore((s) => s.connStatus);
  const online = status === 'connected';
  const [rooms, setRooms] = useState<PublicRoomSummary[] | null>(null);
  const [updated, setUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [remote, setRemote] = useState<PublicRoomSummary[]>([]);

  const ask = () => gameClient.send({ t: 'list_rooms' });
  useEffect(() => {
    if (!online) return;
    const off = gameClient.on((msg) => {
      if (msg.t === 'room_list') {
        setRooms(msg.rooms);
        setUpdated(Date.now());
      }
    });
    let alive = true;
    const pull = () => {
      gameClient.send({ t: 'list_rooms' });
      if (multiRegion) void otherRegionRooms().then((r) => alive && setRemote(r));
    };
    pull();
    const timer = window.setInterval(pull, 5000);
    return () => {
      alive = false;
      off();
      window.clearInterval(timer);
    };
  }, [online]);
  const all = useMemo(() => (rooms ? [...rooms, ...remote.filter((r) => !rooms.some((x) => x.code === r.code))] : null), [rooms, remote]);

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return (all ?? []).filter(
      (r) =>
        (!onlyEmpty || r.maxPlayers - r.players >= 2) &&
        (!f || r.name.toLowerCase().includes(f) || r.hostName.toLowerCase().includes(f) || r.code.toLowerCase().includes(f) || r.countries.some((c) => countryName(c).toLowerCase().includes(f))),
    );
  }, [all, filter, onlyEmpty]);

  const join = async (c: string) => {
    autoFullscreen();
    if (!(await prepareJoin(c))) return;
    gameClient.send({ t: 'join_room', code: c, countryId: preferredCountry() });
  };
  const create = async () => {
    autoFullscreen();
    if (!(await prepareNewRoom())) return;
    gameClient.send({ t: 'create_room', mode: 'pvp', countryId: preferredCountry(), isPublic: true });
  };

  return (
    <Shell title="Salas Públicas" back={() => setScreen('menu')} wide="xl">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" disabled={!online} onClick={() => void create()} title="Cria uma sala multijogador aberta: aparece nesta lista para qualquer comandante entrar">
          <Plus size={15} aria-hidden /> Criar sala pública
        </button>
        <button className="btn" disabled={!online} onClick={ask} title="Atualiza a lista agora (ela também se atualiza sozinha a cada 5 s)">
          <RefreshCw size={14} className="inline-block align-[-2px]" aria-hidden /> Atualizar
        </button>
        <input className="field min-w-0 flex-1" placeholder="Filtrar por nome, anfitrião, país ou código" aria-label="Filtrar salas" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-300">
          <input type="checkbox" className="accent-[#e0b44c]" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
          Com 2 ou mais vagas
        </label>
      </div>

      <div className="mt-3 overflow-hidden rounded-[3px] border border-ink-700">
        <div className="hidden grid-cols-[1.4fr_1fr_2fr_auto_auto] gap-3 border-b border-brass-400/20 bg-ink-850 px-3 py-2 text-[10px] font-semibold tracking-[0.14em] text-ink-400 uppercase sm:grid">
          <span>Sala</span>
          <span>Mapa</span>
          <span>Nações</span>
          <span>Vagas</span>
          <span className="w-20" />
        </div>
        <ul className="max-h-[55vh] divide-y divide-ink-700 overflow-y-auto" role="listbox" aria-label="Salas abertas">
          {!online ? (
            <li className="px-3 py-6 text-center text-sm text-ink-400">Aguardando conexão com o servidor…</li>
          ) : rooms === null ? (
            <li className="px-3 py-6 text-center text-sm text-ink-400">Procurando salas…</li>
          ) : shown.length === 0 ? (
            <li className="flex flex-col items-center gap-2 px-3 py-8 text-center text-sm text-ink-400">
              <Radar size={26} className="text-ink-500" aria-hidden />
              {all!.length === 0 ? 'Nenhuma sala aberta agora. Crie uma e aguarde outros comandantes.' : 'Nenhuma sala com esse filtro.'}
            </li>
          ) : (
            shown.map((r) => (
              <li
                key={r.code}
                role="option"
                aria-selected={selected === r.code}
                className={`grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 px-3 py-2 text-sm sm:grid-cols-[1.4fr_1fr_2fr_auto_auto] ${selected === r.code ? 'bg-ink-800' : 'hover:bg-ink-850'}`}
                onClick={() => setSelected(r.code)}
                onDoubleClick={() => void join(r.code)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-100">{r.name}</span>
                  <span className="text-[11px] text-ink-400">
                    <Star size={11} className="inline-block align-[-2px]" aria-hidden /> {r.hostName} · <span className="font-mono">{r.code}</span>
                    {multiRegion && regionForCode(REGIONS, r.code) ? ` · ${regionForCode(REGIONS, r.code)!.label}` : ''}
                  </span>
                </span>
                <span className="hidden truncate text-ink-300 sm:block">{r.mapType === 'random' ? 'Sorteado' : MAP_TYPE_INFO[r.mapType].label}</span>
                <span className="col-span-2 truncate text-xs text-ink-300 sm:col-span-1 sm:text-sm">{r.countries.map((c) => countryName(c)).join(', ')}</span>
                <span className={`font-mono ${r.maxPlayers - r.players >= 2 ? 'text-signal-green' : 'text-brass-400'}`} title="Nações ocupadas / total da sala">
                  {r.players}/{r.maxPlayers}
                </span>
                <button
                  className="btn btn-primary min-h-8 w-20 px-3 py-1 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    void join(r.code);
                  }}
                >
                  Entrar
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="mt-1 text-right text-[11px] text-ink-400">
        {all ? `${all.length} ${all.length === 1 ? 'sala aberta' : 'salas abertas'}` : ''}
        {updated ? ` · atualizado às ${new Date(updated).toLocaleTimeString('pt-BR')}` : ''}
      </div>

      <form
        className="mt-4 flex gap-2 border-t border-ink-700 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c.length === 5) void join(c);
        }}
      >
        <input
          className="field font-mono tracking-[0.3em] uppercase"
          placeholder="CÓDIGO"
          aria-label="Código de sala privada"
          value={code}
          maxLength={5}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
        />
        <button className="btn shrink-0" disabled={!online || code.length !== 5}>
          <LogIn size={15} aria-hidden /> Entrar com código
        </button>
      </form>
    </Shell>
  );
}
