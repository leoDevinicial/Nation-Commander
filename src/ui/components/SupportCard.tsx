import { ExternalLink, HeartHandshake, Server } from 'lucide-react';

/** Página do projeto no Patreon (22/11). */
export const PATREON_URL = 'https://patreon.com/NationsCommander?utm_medium=unknown&utm_source=join_link&utm_campaign=creatorshare_creator&utm_content=copyLink';

/**
 * Convite para apoiar o jogo no menu (22/11, pedido do responsável): caixa translúcida ao lado do herói, sobre o globo,
 * em tom amistoso, pedindo ajuda para contratar servidores melhores, com o botão para o Patreon.
 */
export function SupportCard() {
  return (
    <aside
      className="w-full max-w-[440px] border border-brass-400/35 bg-ink-950/45 p-4 shadow-[0_18px_50px_rgb(0_0_0/0.45)] backdrop-blur-md sm:p-5 md:mr-[4%] [@media(max-height:520px)]:p-3"
      style={{ clipPath: 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)' }}
      aria-labelledby="support-title"
    >
      <div className="flex items-center gap-2 font-display text-[11px] font-semibold tracking-[0.28em] text-brass-400 uppercase">
        <HeartHandshake size={15} aria-hidden />
        Apoie o jogo
      </div>
      <h2 id="support-title" className="mt-2 font-display text-2xl leading-tight font-bold tracking-wide text-ink-100 uppercase [@media(max-height:520px)]:text-lg">
        Ajude a gente a ter servidores melhores
      </h2>
      <p className="mt-2 text-sm leading-snug text-ink-200 [@media(max-height:520px)]:text-xs">
        O Nations Commander é grátis e feito com a comunidade. Queremos contratar servidores mais fortes, com menos quedas e partidas mais lisas, e para isso contamos com você. Qualquer apoio já faz diferença!
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400 [@media(max-height:520px)]:hidden">
        <Server size={13} aria-hidden />
        Sem vantagem na partida: só agradecimentos e novidades.
      </p>
      <a className="btn btn-primary mt-3 min-h-10 w-full justify-center sm:w-auto" href={PATREON_URL} target="_blank" rel="noopener noreferrer">
        <HeartHandshake size={16} className="mr-1.5 inline-block align-[-3px]" aria-hidden />
        Apoiar no Patreon
        <ExternalLink size={13} className="ml-1.5 inline-block align-[-1px]" aria-hidden />
      </a>
    </aside>
  );
}
