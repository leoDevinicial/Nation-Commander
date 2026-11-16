import { useEffect, useMemo, useState } from 'react';
import { Check, Megaphone, X } from 'lucide-react';
import { CHANGELOG } from '../changelog.ts';
import { Frame } from './Frame.tsx';

/**
 * Novidades ao entrar (16/11, pedido do responsável: "aparecer 1x pra cada jogador ao logar e depois já consta como
 * visto"). Guarda no aparelho, por jogador, a última versão vista; mostra o que saiu desde então (na primeira vez, só a
 * versão atual) e não volta até a próxima versão. Sem acesso ao armazenamento (aba privada bloqueada), não mostra.
 */
const KEY = 'nc.changelog.seen.v1';

function readSeen(): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return null;
  }
}

function markSeen(player: string): void {
  try {
    const seen = readSeen() ?? {};
    seen[player] = CHANGELOG[0]!.version;
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Versões novas para este jogador (vazio: nada a mostrar). */
export function unseenVersions(player: string, seen: Record<string, string> | null): typeof CHANGELOG {
  if (!seen || !CHANGELOG.length) return [];
  const last = seen[player];
  if (last === CHANGELOG[0]!.version) return [];
  const i = last ? CHANGELOG.findIndex((c) => c.version === last) : -1;
  // nunca viu (ou versão desconhecida): só a atual, para não despejar o histórico inteiro
  return i > 0 ? CHANGELOG.slice(0, Math.min(i, 3)) : CHANGELOG.slice(0, 1);
}

export function ChangelogPopup({ player, onOpenAll }: { player: string | null; onOpenAll: () => void }) {
  // fechado nesta sessão: não volta nem se o armazenamento falhar
  const [closed, setClosed] = useState<string | null>(null);
  const versions = useMemo(() => (player && closed !== player ? unseenVersions(player, readSeen()) : []), [player, closed]);
  const close = () => {
    if (player) markSeen(player);
    setClosed(player);
  };
  useEffect(() => {
    if (!versions.length) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  if (!versions.length) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-[2px]" onClick={close}>
      <Frame className="w-full max-w-[560px]" innerClassName="flex max-h-[85vh] flex-col gap-3 p-4 sm:p-5">
        <div role="dialog" aria-modal="true" aria-labelledby="changelog-title" className="contents" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[3px] border border-brass-400/60 bg-brass-400/10 text-brass-400" aria-hidden>
              <Megaphone size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="nc-kicker">Novidades</div>
              <h2 id="changelog-title" className="font-display text-xl font-bold tracking-wide text-ink-100 uppercase">
                {`O que mudou na versão ${versions[0]!.version}`}
              </h2>
            </div>
            <button className="nc-icon-btn" onClick={close} aria-label="Fechar" title="Fechar">
              <X size={16} aria-hidden />
            </button>
          </div>
          <div className="min-h-0 space-y-3 overflow-y-auto pr-1" onClick={(e) => e.stopPropagation()}>
            {versions.map((v) => (
              <section key={v.version}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="nc-num rounded-[2px] bg-brass-400 px-1.5 py-px text-[11px] font-bold text-ink-950">v{v.version}</span>
                  <span className="text-[11px] text-ink-400">{v.date}</span>
                </div>
                <ul className="space-y-1.5">
                  {v.items.map((it) => (
                    <li key={it} className="flex gap-2 text-sm text-ink-200">
                      <Check size={15} className="mt-0.5 shrink-0 text-brass-400" aria-hidden />
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn"
              onClick={() => {
                close();
                onOpenAll();
              }}
            >
              Ver tudo e dar opinião
            </button>
            <button className="btn btn-primary" onClick={close} autoFocus>
              Entendi
            </button>
          </div>
        </div>
      </Frame>
    </div>
  );
}
