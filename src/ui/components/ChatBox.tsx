import { useEffect, useRef, useState } from 'react';
import { MAX_CHAT_LENGTH } from '../../../shared/protocol.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';

export function ChatBox({ compact }: { compact?: boolean }) {
  const chat = useAppStore((s) => s.chat);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat]);
  return (
    <div className={`flex flex-col rounded border border-ink-700 bg-ink-950 ${compact ? 'h-40' : 'h-72'}`}>
      <div ref={listRef} className="flex-1 space-y-1 overflow-y-auto p-2 text-xs" aria-live="polite">
        {chat.length === 0 && <div className="text-ink-400">Sem mensagens.</div>}
        {chat.map((c) => (
          <div key={c.id} className={c.system ? 'text-ink-400 italic' : 'text-ink-200'}>
            {!c.system && <span className="font-semibold text-brass-400">{c.from}: </span>}
            {c.text}
          </div>
        ))}
      </div>
      <form
        className="flex border-t border-ink-700"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (t && gameClient.send({ t: 'chat', text: t })) setText('');
        }}
      >
        <input
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-xs outline-none"
          placeholder="Mensagem…"
          aria-label="Mensagem de chat"
          value={text}
          maxLength={MAX_CHAT_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button className="px-3 text-xs text-brass-400 hover:text-ink-100">Enviar</button>
      </form>
    </div>
  );
}
