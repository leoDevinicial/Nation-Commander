import { useEffect } from 'react';
import { useHudStore } from '../../state/useHudStore.ts';

const TONE = { info: 'text-ink-200', good: 'text-signal-green', warn: 'text-brass-400', bad: 'text-red-300' } as const;
const ICON = { info: '•', good: '✔', warn: '!', bad: '✖' } as const;

export function EventLog() {
  const events = useHudStore((s) => s.events);
  const expire = useHudStore((s) => s.expireEvents);
  useEffect(() => {
    const id = setInterval(() => expire(12_000), 1000);
    return () => clearInterval(id);
  }, [expire]);
  return (
    <div className="pointer-events-none absolute top-16 left-3 w-80 space-y-1" aria-live="polite" aria-label="Eventos da operação">
      {events.map((e) => (
        <div key={e.id} className={`rounded bg-ink-950/80 px-2 py-1 text-xs ${TONE[e.tone]}`}>
          <span className="mr-1.5 font-mono" aria-hidden>
            {ICON[e.tone]}
          </span>
          {e.text}
        </div>
      ))}
    </div>
  );
}
