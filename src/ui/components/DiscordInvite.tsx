import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Frame } from './Frame.tsx';

/** Servidor da comunidade no Discord (21/11). */
export const DISCORD_URL = 'https://discord.gg/pqZqTG8QXB';

/**
 * Convite para o Discord (21/11, pedido do responsável): aparece uma vez no aparelho, ao entrar no menu, e depois
 * fica só o botão do menu. Sem acesso ao armazenamento (aba privada bloqueada), não mostra, para não repetir a cada visita.
 */
const KEY = 'nc.discord.seen.v1';

export function discordInviteSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

function markDiscordSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Logotipo do Discord (marca do serviço, só para o botão que leva até ele). */
export function DiscordLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.52.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.23-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.89.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08.01c.12.1.24.2.37.29a.08.08 0 0 1-.01.13c-.6.35-1.22.65-1.87.89a.08.08 0 0 0-.04.11c.36.7.77 1.36 1.22 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z" />
    </svg>
  );
}

/** O popup em si; `ready` = nada mais aberto por cima (as novidades da versão vêm antes). */
export function DiscordInvite({ ready }: { ready: boolean }) {
  const [open, setOpen] = useState(() => !discordInviteSeen());
  const close = () => {
    markDiscordSeen();
    setOpen(false);
  };
  const show = open && ready;
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-[2px]" onClick={close}>
      <Frame className="w-full max-w-[460px]" innerClassName="flex flex-col gap-3 p-4 sm:p-5">
        <div role="dialog" aria-modal="true" aria-labelledby="discord-title" className="contents" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] border border-[#5865f2]/70 bg-[#5865f2]/15 text-[#8c96ff]">
              <DiscordLogo size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="nc-kicker">Comunidade</div>
              <h2 id="discord-title" className="font-display text-xl font-bold tracking-wide text-ink-100 uppercase">
                Entre no nosso Discord
              </h2>
            </div>
            <button className="nc-icon-btn" onClick={close} aria-label="Fechar" title="Fechar">
              <X size={16} aria-hidden />
            </button>
          </div>
          <p className="text-sm leading-snug text-ink-200">
            Ache parceiros e rivais para partidas, troque estratégias com outros comandantes, conte o que achou do jogo e acompanhe as novidades antes de todo mundo.
          </p>
          <p className="text-xs text-ink-400">O botão do Discord fica sempre no menu principal.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn" onClick={close}>
              Agora não
            </button>
            <a className="btn btn-primary" href={DISCORD_URL} target="_blank" rel="noopener noreferrer" onClick={close} autoFocus>
              <DiscordLogo size={15} className="mr-1.5 inline-block align-[-2px]" />
              Entrar no Discord
              <ExternalLink size={13} className="ml-1.5 inline-block align-[-1px]" aria-hidden />
            </a>
          </div>
        </div>
      </Frame>
    </div>
  );
}
