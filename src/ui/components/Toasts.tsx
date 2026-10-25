import { useAppStore } from '../../state/useAppStore.ts';

export function Toasts() {
  const toasts = useAppStore((s) => s.toasts);
  const dismiss = useAppStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed top-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`panel pointer-events-auto max-w-md px-4 py-2 text-sm ${t.kind === 'error' ? 'border-signal-red text-red-100' : 'text-ink-100'}`}
        >
          {t.kind === 'error' ? '⚠ ' : 'ℹ '}
          {t.text}
        </button>
      ))}
    </div>
  );
}
