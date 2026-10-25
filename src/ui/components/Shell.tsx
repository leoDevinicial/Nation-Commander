import type { ReactNode } from 'react';

/** Moldura das telas fora da partida. */
export function Shell({ title, children, back, wide }: { title?: string; children: ReactNode; back?: () => void; wide?: boolean }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto bg-ink-950 p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(125,142,163,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(125,142,163,0.07) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className={`panel relative w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} p-6`}>
        {(title || back) && (
          <div className="mb-5 flex items-center justify-between gap-4">
            {title && <h1 className="text-lg font-bold tracking-wide text-ink-100">{title}</h1>}
            {back && (
              <button className="btn" onClick={back}>
                ← Voltar
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
