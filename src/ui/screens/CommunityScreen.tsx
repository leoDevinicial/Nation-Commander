import { useEffect, useRef, useState } from 'react';
import { MAX_COMMUNITY_LENGTH, type CommunityMessage, type ReportReason } from '../../../shared/protocol.ts';
import { gameClient } from '../../net/client.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { Shell } from '../components/Shell.tsx';

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'offense', label: 'Ofensa ou assédio' },
  { id: 'hate', label: 'Discurso de ódio' },
  { id: 'spam', label: 'Spam ou propaganda' },
  { id: 'cheat', label: 'Trapaça ou golpe' },
  { id: 'other', label: 'Outro motivo' },
];

/** Silenciados por este jogador (só para ele), guardados no navegador. */
const MUTE_KEY = 'nc.community.muted';
function loadMuted(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MUTE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}
function saveMuted(m: Record<string, string>): void {
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(m));
  } catch {
    // sem armazenamento: o silenciamento vale só nesta visita
  }
}

/**
 * Comunidade: o chat aberto entre todos os comandantes que estão nesta tela. Ao abrir, chegam as últimas mensagens e
 * quantas pessoas estão conversando; as novas aparecem na hora. Moderação: o servidor filtra palavras ofensivas e
 * silencia quem insiste; cada mensagem pode ser denunciada (3 denúncias a removem) ou o autor silenciado só para você;
 * moderadores apagam mensagens e silenciam por um tempo.
 */
export function CommunityScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  const online = useAppStore((s) => s.connStatus) === 'connected';
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [people, setPeople] = useState(0);
  const [you, setYou] = useState('');
  const [moderator, setModerator] = useState(false);
  const [text, setText] = useState('');
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  const [muted, setMuted] = useState<Record<string, string>>(loadMuted);
  const [menu, setMenu] = useState<number | null>(null);
  const [reporting, setReporting] = useState<number | null>(null);
  const [showMuted, setShowMuted] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    if (!online) return;
    const off = gameClient.on((msg) => {
      if (msg.t === 'community_history') {
        setMessages(msg.messages);
        setPeople(msg.online);
        setYou(msg.you);
        setModerator(!!msg.moderator);
      } else if (msg.t === 'community_msg') setMessages((m) => [...m.slice(-199), msg.msg]);
      else if (msg.t === 'community_remove') setMessages((m) => m.filter((x) => x.id !== msg.id));
      else if (msg.t === 'community_online') setPeople(msg.online);
      else if (msg.t === 'community_notice') setNotice({ text: msg.text, bad: false });
      else if (msg.t === 'error' && msg.code === 'community') setNotice({ text: msg.message, bad: true });
    });
    gameClient.send({ t: 'community_join' });
    return () => {
      gameClient.send({ t: 'community_leave' });
      off();
    };
  }, [online]);

  const shown = messages.filter((m) => !muted[m.uid]);
  // desce sozinho com mensagem nova, a menos que a pessoa tenha rolado para ler as antigas
  useEffect(() => {
    const el = list.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  const send = () => {
    const t = text.trim();
    if (!t || !online) return;
    setNotice(null);
    gameClient.send({ t: 'community_say', text: t });
    setText('');
  };
  const mute = (m: CommunityMessage) => {
    const next = { ...muted, [m.uid]: m.from };
    setMuted(next);
    saveMuted(next);
    setMenu(null);
    setNotice({ text: `${m.from} silenciado para você. Desfaça em "Silenciados".`, bad: false });
  };
  const unmute = (uid: string) => {
    const next = { ...muted };
    delete next[uid];
    setMuted(next);
    saveMuted(next);
  };
  const mutedCount = Object.keys(muted).length;

  return (
    <Shell title="Comunidade" back={() => setScreen('menu')} wide>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
        <span>Converse com outros comandantes: táticas, convites para partidas, ideias para o jogo.</span>
        <span className="flex shrink-0 items-center gap-3">
          {mutedCount > 0 && (
            <button className="underline decoration-dotted hover:text-ink-200" onClick={() => setShowMuted((v) => !v)}>
              🔇 Silenciados ({mutedCount})
            </button>
          )}
          {moderator && <span className="rounded bg-brass-400/20 px-1.5 py-0.5 font-semibold text-brass-400">Moderador</span>}
          <span className="font-semibold text-signal-green" aria-live="polite">
            ● {people} {people === 1 ? 'pessoa' : 'pessoas'} no chat
          </span>
        </span>
      </div>
      {showMuted && mutedCount > 0 && (
        <div className="mb-2 rounded border border-ink-700 bg-ink-850 p-2 text-xs">
          <div className="mb-1 text-ink-300">Você não vê as mensagens destes jogadores (só para você):</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(muted).map(([uid, name]) => (
              <button key={uid} className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => unmute(uid)} title="Voltar a ver as mensagens">
                {name} ✕
              </button>
            ))}
          </div>
        </div>
      )}
      <div
        ref={list}
        className="h-[50vh] space-y-0.5 overflow-y-auto rounded border border-ink-700 bg-ink-950/80 p-2"
        role="log"
        aria-label="Mensagens da comunidade"
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {!online ? (
          <p className="py-6 text-center text-sm text-ink-400">Aguardando conexão com o servidor…</p>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">Nenhuma mensagem ainda. Diga olá para a comunidade!</p>
        ) : (
          shown.map((m) => {
            const mine = m.uid === you;
            const open = menu === m.id;
            return (
              <div key={m.id} className="group relative rounded px-1.5 py-1 text-sm leading-snug break-words hover:bg-ink-850">
                <span className="mr-1.5 font-mono text-[10px] text-ink-400">{new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className={`font-semibold ${mine ? 'text-brass-400' : 'text-ink-100'}`}>{m.from}</span>
                {m.guest && <span className="ml-1 rounded bg-ink-700 px-1 text-[9px] text-ink-300 uppercase">convidado</span>}
                <span className="text-ink-400">: </span>
                <span className="text-ink-200">{m.text}</span>
                {m.filtered && (
                  <span className="ml-1 text-[10px] text-ink-400" title="Parte da mensagem foi ocultada pelo filtro de ofensas">
                    (filtrada)
                  </span>
                )}
                {!mine && (
                  <button
                    className="absolute top-0.5 right-1 rounded px-1.5 text-ink-400 opacity-60 group-hover:opacity-100 hover:bg-ink-700 hover:text-ink-100 focus:opacity-100"
                    aria-label={`Opções da mensagem de ${m.from}`}
                    aria-expanded={open}
                    onClick={() => {
                      setMenu(open ? null : m.id);
                      setReporting(null);
                    }}
                  >
                    ⋯
                  </button>
                )}
                {open && (
                  <div className="relative z-10 mt-1 flex flex-wrap gap-1.5 rounded border border-ink-700 bg-ink-900 p-1.5 text-xs">
                    {reporting === m.id ? (
                      <>
                        <span className="self-center text-ink-300">Motivo:</span>
                        {REASONS.map((r) => (
                          <button
                            key={r.id}
                            className="btn min-h-7 px-2 py-0.5 text-xs"
                            onClick={() => {
                              gameClient.send({ t: 'community_report', id: m.id, reason: r.id });
                              setMenu(null);
                              setReporting(null);
                            }}
                          >
                            {r.label}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => setReporting(m.id)} title="Avise a equipe; com 3 denúncias a mensagem sai do chat">
                          ⚑ Denunciar
                        </button>
                        <button className="btn min-h-7 px-2 py-0.5 text-xs" onClick={() => mute(m)} title="Esconde as mensagens desta pessoa só para você">
                          🔇 Silenciar para mim
                        </button>
                        {moderator && (
                          <>
                            <button
                              className="btn btn-danger min-h-7 px-2 py-0.5 text-xs"
                              onClick={() => {
                                gameClient.send({ t: 'community_mod', action: 'delete', id: m.id });
                                setMenu(null);
                              }}
                            >
                              🗑 Apagar
                            </button>
                            {[
                              [60, '1 h'],
                              [24 * 60, '24 h'],
                              [7 * 24 * 60, '7 dias'],
                            ].map(([min, label]) => (
                              <button
                                key={label}
                                className="btn btn-danger min-h-7 px-2 py-0.5 text-xs"
                                onClick={() => {
                                  gameClient.send({ t: 'community_mod', action: 'mute', id: m.id, minutes: min as number });
                                  setMenu(null);
                                }}
                              >
                                Silenciar {label}
                              </button>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
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
      {notice && <p className={`mt-1 text-xs ${notice.bad ? 'text-brass-400' : 'text-signal-green'}`}>{notice.text}</p>}
      <p className="mt-2 text-[11px] text-ink-400">
        Seja respeitoso. Ofensas são ocultadas: as duas primeiras vezes só avisam, depois vem um silenciamento curto que cresce com a reincidência. Use ⋯ para
        denunciar ou silenciar alguém só para você. Toda punição diz o motivo e o tempo; se achar injusta, conte em Feedback. O chat mostra as últimas 80
        mensagens e recomeça quando o servidor é atualizado.
      </p>
    </Shell>
  );
}
