import type { CSSProperties, ReactNode } from 'react';

/**
 * Moldura de comando da identidade "Sala de Situação" (05/11, `docs/ui_maquete`): canto chanfrado no alto à esquerda
 * e embaixo à direita, borda fina em degradê e colchetes de latão nos outros cantos. O recorte corta o que sai dela:
 * menus e dicas que abrem para fora ficam fora da moldura.
 */
export function Frame({ children, className = '', innerClassName = '', style, cut }: { children: ReactNode; className?: string; innerClassName?: string; style?: CSSProperties; cut?: number }) {
  return (
    <div className={`nc-frame ${className}`} style={cut !== undefined ? { ...style, ['--cut' as string]: `${cut}px` } : style}>
      <div className={`nc-frame-in ${innerClassName}`}>{children}</div>
      <span className="nc-brk nc-brk-tr" aria-hidden />
      <span className="nc-brk nc-brk-bl" aria-hidden />
    </div>
  );
}
