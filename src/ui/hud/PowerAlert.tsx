import { useState } from 'react';
import { ArrowUpCircle, Eye, Zap, X } from 'lucide-react';
import { BUILDINGS } from '../../../shared/sim/config.ts';
import type { GameRuntime } from '../../game/GameRuntime.ts';
import { netShort } from '../../game/render/PowerGridLayer.ts';
import { useHudStore } from '../../state/useHudStore.ts';

/**
 * Alerta de apagão com ação (23/11): enquanto alguma rede do país tem falta de energia, um cartão diz quanto falta e
 * onde ("rede de Brasília") e oferece o que fazer: ver a rede (câmera + visão da rede elétrica), construir a usina mais
 * forte já liberada ou subir o nível do parque eólico ou da usina solar daquela rede. Fechado, volta se o consumo mudar.
 */
export function PowerAlert({ runtime }: { runtime: GameRuntime }) {
  useHudStore((s) => s.tick);
  // fechado vale para esta falta: rede e consumo iguais (consumo novo ou outra rede, o alerta volta)
  const [dismissed, setDismissed] = useState<string | null>(null);
  const short = runtime
    .powerNets()
    .filter(netShort)
    .sort((a, b) => b.demand - b.served - (a.demand - a.served));
  const worst = short[0];
  if (!worst || dismissed === `${worst.at}:${worst.demand}`) return null;
  const fix = runtime.powerFix(worst);
  const missing = Math.max(0, Math.ceil(worst.demand - worst.supply));
  const where = fix.city ? `na rede de ${fix.city}` : 'numa rede do país';
  const text = missing > 0 ? `Faltam ${missing} de energia ${where}` : `${worst.dark} construção(ões) sem luz ${where}`;
  return (
    <div className="panel pointer-events-auto absolute top-28 right-2 z-20 w-[min(20rem,calc(100vw-1rem))] border-red-400/40 p-2.5 text-xs sm:top-24 sm:right-3" role="alert">
      <div className="flex items-start gap-2">
        <Zap size={18} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink-100">{text}</div>
          <div className="mt-0.5 text-ink-400">
            Geração {Math.round(worst.supply)} · consumo {Math.round(worst.demand)} · {worst.dark} parada(s). As mais novas apagam primeiro.
          </div>
        </div>
        <button className="nc-icon-btn -mt-1 -mr-1" onClick={() => setDismissed(`${worst.at}:${worst.demand}`)} aria-label="Fechar">
          <X size={14} aria-hidden />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn px-2 py-1 text-xs" onClick={() => runtime.focusPowerNet(worst.cx, worst.cy)}>
          <Eye size={14} aria-hidden /> Ver rede
        </button>
        {fix.build && (
          <button className="btn btn-primary px-2 py-1 text-xs" onClick={() => runtime.startPlacement(fix.build!)}>
            <Zap size={14} aria-hidden /> Construir {BUILDINGS[fix.build].label}
          </button>
        )}
        {fix.upgrade !== null && (
          <button className="btn px-2 py-1 text-xs" onClick={() => runtime.focusBuilding(fix.upgrade!)} title="Selecione e use Melhorar: +40% de energia por nível">
            <ArrowUpCircle size={14} aria-hidden /> Subir nível da usina
          </button>
        )}
      </div>
    </div>
  );
}
