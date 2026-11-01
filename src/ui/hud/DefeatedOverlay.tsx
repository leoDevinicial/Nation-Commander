import { useState } from 'react';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { useHudStore } from '../../state/useHudStore.ts';

/**
 * Nação derrotada com a partida ainda em andamento (outros jogadores seguem lutando). A derrota tira do mapa todas as
 * tropas e edifícios da nação, e sem eles não há visão: antes o jogador ficava num mapa escuro e vazio, sem aviso,
 * parecendo um erro. Agora a tela diz o que houve e oferece a saída; dá para continuar olhando, com a faixa no topo.
 * Não abre a visão do mapa (o derrotado não pode passar informação a quem ainda joga).
 */
export function DefeatedOverlay({ mySlot }: { mySlot: number }) {
  const defeated = useHudStore((s) => s.players.find((p) => p.slot === mySlot)?.defeated ?? false);
  const matchEnd = useAppStore((s) => s.matchEnd);
  const [watching, setWatching] = useState(false);
  if (!defeated || matchEnd) return null;
  const leave = () => {
    gameClient.send({ t: 'leave_room' });
    useAppStore.setState({ screen: 'menu', match: null, matchEnd: null, room: null, chat: [] });
  };
  if (watching)
    return (
      <div className="absolute top-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded border border-red-400/60 bg-ink-900/90 px-3 py-1.5 text-sm">
        <span className="text-red-300">Sua nação foi derrotada</span>
        <button className="btn min-h-8 px-3 py-1 text-xs" onClick={leave}>
          Voltar ao menu
        </button>
      </div>
    );
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-ink-950/75 p-4">
      <div className="panel w-full max-w-md p-6 text-center" role="dialog" aria-label="Nação derrotada">
        <div className="text-3xl font-black tracking-wide text-red-300">Derrota</div>
        <p className="mt-3 text-sm text-ink-200">
          O Centro de Comando caiu e as forças restantes da sua nação se renderam. A partida continua entre as outras nações; o resultado final aparece quando ela terminar.
        </p>
        <div className="mt-5 flex gap-2">
          <button className="btn btn-primary flex-1" onClick={leave}>
            Voltar ao menu
          </button>
          <button className="btn flex-1" onClick={() => setWatching(true)}>
            Continuar na partida
          </button>
        </div>
      </div>
    </div>
  );
}
