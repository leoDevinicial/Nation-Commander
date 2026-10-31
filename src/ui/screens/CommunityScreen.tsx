import { useEffect, useRef, useState } from 'react';
import { MAX_COMMUNITY_LENGTH, type CommunityMessage } from '../../../shared/protocol.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { Shell } from '../components/Shell.tsx';

/**
 * Comunidade: o chat aberto entre todos os comandantes que estão no menu desta tela. Ao abrir, chegam as últimas
 * mensagens e quantas pessoas estão conversando; as novas aparecem na hora. Mensagens de até 300 caracteres, no
 * máximo uma a cada 1,5 s.
 */
export function CommunityScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const online = useAppStore((s) => s.connStatus) === 'connected';
  const me = useAppStore((s) => s.serverUser);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [people, setPeople] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    if (!online) return;
    const off = gameClient.on((msg) => {
      if (msg.t === 'community_history') {
        setMessages(msg.messages);
        setPeople(msg.online);
      } else if (msg.t === 'community_msg') setMessages((m) => [...m.slice(-199), msg.msg]);
      else if (msg.t === 'community_online') setPeople(msg.online);
      else if (msg.t === 'error' && msg.code === 'community') setError(msg.message);
    });
    gameClient.send({ t: 'community_join' });
    return () => {
      gameClient.send({ t: 'community_leave' });
      off();
    };
  }, [online]);

  // desce sozinho com mensagem nova, a menos que a pessoa tenha rolado para ler as antigas
  useEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const t = text.trim();
    if (!t || !online) return;
    setError(null);
    gameClient.send({ t: 'community_say', text: t });
    setText('');
  };

  return (
    <Shell title="Comunidade" back={() => setScreen('menu')} wide>
      <div className="mb-2 flex items-center justify-between text-xs text-ink-400">
        <span>Converse com outros comandantes: táticas, convites para partidas, ideias para o jogo.</span>
        <span className="shrink-0 font-semibold text-signal-green" aria-live="polite">
          ● {people} {people === 1 ? 'pessoa' : 'pessoas'} no chat
        </span>
      </div>
      <div
        ref={list}
        className="h-[52vh] space-y-1.5 overflow-y-auto rounded border border-ink-700 bg-ink-950/80 p-3"
        role="log"
        aria-label="Mensagens da comunidade"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!online ? (
          <p className="py-6 text-center text-sm text-ink-400">Aguardando conexão com o servidor…</p>
        ) : messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">Nenhuma mensagem ainda. Diga olá para a comunidade!</p>
        ) : (
          messages.map((m) => {
            const mine = m.from === me?.name;
            return (
              <div key={m.id} className="text-sm leading-snug break-words">
                <span className="mr-1.5 font-mono text-[10px] text-ink-400">{new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`font-semibold ${mine ? 'text-brass-400' : 'text-ink-100'}`}>{m.from}</span>
                {m.guest && <span className="ml-1 rounded bg-ink-700 px-1 text-[9px] uppercase text-ink-300">convidado</span>}
                <span className="text-ink-400">: </span>
                <span className="text-ink-200">{m.text}</span>
              </div>
            );
          })
        )}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          className="field flex-1"
          placeholder="Escreva para a comunidade…"
          aria-label="Mensagem"
          maxLength={MAX_COMMUNITY_LENGTH}
          value={text}
          disabled={!online}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary shrink-0" disabled={!online || !text.trim()}>
          Enviar
        </button>
      </form>
      {error && <p className="mt-1 text-xs text-brass-400">{error}</p>}
      <p className="mt-2 text-[11px] text-ink-400">Seja respeitoso. O chat mostra as últimas 80 mensagens e é reiniciado quando o servidor é atualizado.</p>
    </Shell>
  );
}
