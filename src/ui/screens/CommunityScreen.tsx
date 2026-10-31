import { useEffect, useState } from 'react';
import type { FeedbackCategory } from '../../../shared/protocol.ts';
import { GAME_VERSION } from '../../../shared/version.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { CHANGELOG } from '../changelog.ts';
import { Shell } from '../components/Shell.tsx';

const CATEGORIES: { id: FeedbackCategory; label: string; hint: string }[] = [
  { id: 'bug', label: '🐞 Problema', hint: 'O que aconteceu, o que você esperava e como repetir (tela, prédio, tropa, celular ou computador).' },
  { id: 'suggestion', label: '💡 Sugestão', hint: 'Uma ideia de tropa, prédio, mapa, modo de jogo ou melhoria na interface.' },
  { id: 'balance', label: '⚖ Balanceamento', hint: 'Algo forte ou fraco demais: custo, dano, tempo de obra, IA, economia, energia.' },
  { id: 'praise', label: '⭐ Elogio', hint: 'O que você mais gostou de jogar.' },
  { id: 'other', label: '💬 Outro', hint: 'Qualquer outro recado para a equipe.' },
];

/** Links da comunidade (configurados no deploy por variáveis de ambiente; sem eles, a seção mostra só o que há no jogo). */
const LINKS = [
  { label: 'Discord', url: import.meta.env.VITE_COMMUNITY_DISCORD_URL as string | undefined },
  { label: 'Instagram', url: import.meta.env.VITE_COMMUNITY_INSTAGRAM_URL as string | undefined },
  { label: 'YouTube', url: import.meta.env.VITE_COMMUNITY_YOUTUBE_URL as string | undefined },
].filter((l): l is { label: string; url: string } => !!l.url);

/**
 * Comunidade e Feedback: o jogador manda um feedback (gravado pelo servidor no Supabase, tabela `feedback`), vê as
 * novidades das últimas versões e os caminhos para jogar com a comunidade.
 */
export function CommunityScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const online = useAppStore((s) => s.connStatus) === 'connected';
  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    const off = gameClient.on((msg) => {
      if (msg.t === 'feedback_ok') {
        setState('sent');
        setMessage('');
        setRating(null);
      } else if (msg.t === 'error' && msg.code === 'feedback') setState('idle');
    });
    return () => {
      off();
    };
  }, []);

  const valid = message.trim().length >= 5;
  const send = () => {
    if (!valid || !online || state === 'sending') return;
    setState('sending');
    gameClient.send({ t: 'feedback', category, message: message.trim(), ...(rating ? { rating } : {}) });
  };
  const hint = CATEGORIES.find((c) => c.id === category)!.hint;

  return (
    <Shell title="Feedback" back={() => setScreen('menu')} wide="xl">
      <div className="grid gap-5 md:grid-cols-[1.25fr_1fr]">
        <section aria-label="Enviar feedback">
          <h2 className="label">Envie seu feedback</h2>
          <p className="mb-3 text-sm text-ink-300">O Nation Commander é feito com a comunidade. Cada mensagem é lida pela equipe e ajuda a decidir o que vem na próxima versão.</p>
          {state === 'sent' ? (
            <div className="rounded border border-signal-green/50 bg-ink-850 p-4 text-sm" role="status">
              <div className="font-semibold text-signal-green">✔ Feedback enviado. Obrigado, comandante!</div>
              <p className="mt-1 text-ink-300">Você pode mandar outro daqui a um minuto.</p>
              <button className="btn mt-3" onClick={() => setState('idle')}>
                Enviar outro
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de feedback">
                {CATEGORIES.map((c) => (
                  <button key={c.id} type="button" role="radio" aria-checked={category === c.id} className={`btn min-h-8 px-2.5 py-1 text-xs ${category === c.id ? 'btn-primary' : ''}`} onClick={() => setCategory(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
              <textarea
                className="field mt-3 min-h-36 resize-y"
                placeholder={hint}
                aria-label="Mensagem"
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-ink-400">
                <span>{message.trim().length < 5 ? 'Escreva pelo menos algumas palavras.' : ' '}</span>
                <span>{message.length}/2000</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-300">Sua nota para o jogo (opcional):</span>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`text-xl leading-none ${rating !== null && n <= rating ? 'text-brass-400' : 'text-ink-600'}`}
                    aria-label={`${n} de 5`}
                    aria-pressed={rating === n}
                    onClick={() => setRating(rating === n ? null : n)}
                  >
                    ★
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button className="btn btn-primary" disabled={!valid || !online || state === 'sending'}>
                  {state === 'sending' ? 'Enviando…' : 'Enviar feedback'}
                </button>
                <span className="text-[11px] text-ink-400">Vai junto: seu nome de comandante e a versão {GAME_VERSION}.</span>
              </div>
              {!online && <p className="mt-2 text-xs text-brass-400">Aguardando conexão com o servidor para enviar.</p>}
            </form>
          )}
        </section>

        <div className="space-y-5">
          <section aria-label="Comunidade">
            <h2 className="label">Comunidade</h2>
            <div className="grid gap-2">
              <button className="btn btn-hero w-full justify-start" onClick={() => setScreen('rooms')}>
                <span aria-hidden>🌐</span>
                <span className="flex flex-col text-left">
                  <span>Salas Públicas</span>
                  <span className="font-sans text-[11px] font-medium tracking-normal text-ink-400">Jogue com outros comandantes agora</span>
                </span>
              </button>
              {LINKS.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {LINKS.map((l) => (
                    <a key={l.label} className="btn" href={l.url} target="_blank" rel="noreferrer noopener">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-ink-400">Os canais oficiais da comunidade (Discord e redes) aparecerão aqui em breve. Enquanto isso, o feedback acima chega direto à equipe.</p>
              )}
            </div>
          </section>

          <section aria-label="Novidades">
            <h2 className="label">Novidades</h2>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {CHANGELOG.map((v) => (
                <div key={v.version} className="rounded border border-ink-700 bg-ink-850/70 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="font-display text-sm font-semibold text-brass-400">Versão {v.version}</span>
                    <span className="text-[11px] text-ink-400">{v.date}</span>
                  </div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-ink-200">
                    {v.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
