import type { ReactNode } from 'react';
import { FullscreenButton } from './FullscreenButton.tsx';

/** Moldura das telas fora da partida, sobre o globo de fundo (ver GlobeBackdrop). */
export function Shell({
  title,
  children,
  back,
  wide,
  align = 'center',
  enter = false,
}: {
  title?: string;
  children: ReactNode;
  back?: () => void;
  wide?: boolean | 'xl';
  /** 'start': painel à esquerda em telas largas, deixando o globo à vista. */
  align?: 'center' | 'start';
  /** Entrada animada do painel (usada pelo manual, para não ser um corte seco após o login). */
  enter?: boolean;
}) {
  return (
    <div
      className={`relative z-10 flex h-full w-full items-start justify-center overflow-auto px-3 pt-4 pb-16 sm:items-center sm:p-6 ${
        align === 'start' ? 'hero:justify-start hero:pl-[5vw] xl:pl-[7vw]' : ''
      }`}
    >
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(rgba(125,142,163,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(125,142,163,0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className={`panel panel-frame relative my-auto w-full ${wide === 'xl' ? 'max-w-6xl' : wide ? 'max-w-4xl' : 'max-w-lg'} p-4 sm:p-6 ${enter ? 'shell-enter' : ''}`}>
        {(title || back) && (
          <div className="mb-5 flex items-center justify-between gap-4">
            {title && <h1 className="font-display text-lg font-bold tracking-wide text-ink-100 uppercase">{title}</h1>}
            {back && (
              <button className="btn" onClick={back}>
                ← Voltar
              </button>
            )}
          </div>
        )}
        {children}
      </div>
      <FullscreenButton variant="floating" />
    </div>
  );
}
