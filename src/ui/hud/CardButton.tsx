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
  children?: React.ReactNode;
}) {
  return (
    <button className={`cmd-btn cmd-card shrink-0 ${blocked ? 'is-blocked' : ''}`} aria-disabled={blocked || undefined} disabled={disabled} onClick={onClick} title={title} aria-label={label}>
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
      {short && <span className="text-[9px] leading-tight font-semibold text-red-300">{short}</span>}
    </button>
  );
}
