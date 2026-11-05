import { audio } from '../../game/audio/AudioService.ts';

/** US$ por dia curto para o cartão: "21 mil", "1,2 mi". */
export function usdDay(v: number): string {
  const a = Math.abs(v);
  return a >= 1e6 ? `${(a / 1e6).toFixed(1).replace('.', ',')} mi` : `${a >= 1e4 ? Math.round(a / 1e3) : (a / 1e3).toFixed(1).replace('.', ',')} mil`;
}

/**
 * Cartão de ação: miniatura 3D (ou ícone), nome, conteúdo extra (custo) e motivo de bloqueio.
 * `blocked` deixa o cartão clicável (o toque explica o motivo), `disabled` não.
 */
export function CardButton({
  thumb,
  icon,
  hotkey,
  label,
  title,
  onClick,
  blocked,
  disabled,
  short,
  badge,
  count,
  net,
  locked,
  children,
}: {
  thumb?: string;
  icon?: string;
  hotkey?: string;
  label: string;
  title: string;
  onClick: () => void;
  blocked?: boolean;
  disabled?: boolean;
  short?: string | null;
  /** Selo no canto superior direito (nível, progresso). */
  badge?: string;
  /** Quantos já estão na fila. */
  count?: number;
  /**
   * Saldo por dia no caixa do país se for construído (05/11): verde se rende mais do que custa, vermelho se só custa.
   * `null`/ausente: não mostra.
   */
  net?: number | null;
  /** Falta era, pesquisa ou nível do QG (hachurado); só recurso faltando não tranca o cartão (o custo fica vermelho). */
  locked?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <button
      className={`cmd-btn cmd-card shrink-0 ${blocked ? 'is-blocked' : ''} ${locked ? 'is-locked' : ''}`}
      aria-disabled={blocked || undefined}
      disabled={disabled}
      onClick={() => {
        audio.ui(blocked ? 'error' : 'click');
        onClick();
      }}
      title={title}
      aria-label={label}
    >
      {hotkey && <span className="hotkey z-10">{hotkey}</span>}
      {badge && <span className="absolute top-0.5 right-0.5 z-10 rounded bg-ink-950/80 px-1 font-mono text-[9px] text-brass-400">{badge}</span>}
      {count !== undefined && count > 0 && (
        <span className="absolute top-0.5 right-0.5 z-10 rounded-full bg-brass-400 px-1.5 text-[10px] leading-4 font-bold text-ink-950" aria-label={`${count} na fila`}>
          ×{count}
        </span>
      )}
      <span className="cmd-card-view" aria-hidden>
        {thumb ? <img src={thumb} alt="" draggable={false} /> : <span className="text-xl text-ink-200">{icon}</span>}
      </span>
      <span className="cmd-card-label">{label}</span>
      {children}
      {short && <span className="cmd-card-short">{short}</span>}
      {net !== undefined && net !== null && (
        <span className={`cmd-card-net ${net >= 0 ? 'is-pos' : 'is-neg'}`} aria-label={`${net >= 0 ? 'Rende' : 'Custa'} ${usdDay(net)} por dia`}>
          <b>$</b>
          {net >= 0 ? '+' : '−'}
          {usdDay(net)}/dia
        </span>
      )}
    </button>
  );
}
