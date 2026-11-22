import { DEFAULT_COUNTRY } from '../../shared/data/countries.ts';
import { currentMatch, gameClient, isSameMatch } from '../net/client.ts';
import '../net/localMode.ts'; // partida contra a IA no aparelho: ouvintes prontos antes da primeira mensagem (22/11)
import { supabase, type Profile } from '../lib/supabase.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { screenAfterLogin } from '../ui/manual.ts';
import { applyNationalMessage, useNationalStore } from '../state/useNationalStore.ts';
import { applyOpsMessage, useOpsStore } from '../state/useOpsStore.ts';
import { useTutorialStore } from '../state/useTutorialStore.ts';

/** Liga mensagens do servidor de jogo ao estado da aplicação. Chamar uma vez. */
export function wireGameClient(): void {
  gameClient.onStatus((status, detail) => {
    useAppStore.setState({ connStatus: status, connDetail: detail ?? null });
  });

  // reconexão (21/11): o ponto de retomada só vale para a mesma partida (o seed dela)
  gameClient.resumeKey = () => {
    const m = useAppStore.getState().match;
    return m ? String(m.seed) : null;
  };
  gameClient.on((msg) => {
    const app = useAppStore.getState();
    applyOpsMessage(msg);
    switch (msg.t) {
      case 'welcome':
        useAppStore.setState({ serverUser: msg.user });
        break;
      case 'room': {
        useAppStore.setState({ room: msg.room });
        if (!msg.room) {
          if (app.screen === 'lobby' || (app.screen === 'game' && !app.matchEnd)) useAppStore.setState({ screen: 'menu', match: null });
        } else if (msg.room.status === 'lobby' && app.screen !== 'lobby') {
          useAppStore.setState({ screen: 'lobby', match: null, matchEnd: null });
        }
        break;
      }
      case 'match_start': {
        if (app.match?.seed !== msg.match.seed) {
          useNationalStore.getState().reset();
          useOpsStore.getState().reset();
        }
        if (msg.match.mode !== 'tutorial') useTutorialStore.getState().set(null);
        // mesma partida (reconexão): mantém o objeto, e com ele a cena 3D montada
        const same = isSameMatch(currentMatch(), msg.match);
        useAppStore.setState({ match: same ? app.match : msg.match, matchEnd: null, screen: 'game' });
        break;
      }
      case 'tutorial':
        useTutorialStore.getState().set(msg.view);
        break;
      case 'national':
        applyNationalMessage(msg.day, msg.date, msg.nations, msg.events, msg.diplomacy);
        break;
      case 'match_end':
        useAppStore.setState({ matchEnd: msg.end });
        break;
      case 'chat':
        app.pushChat({ from: msg.from, text: msg.text, system: Boolean(msg.system) });
        break;
      case 'error':
        app.pushToast('error', msg.message);
        if (msg.code === 'auth' && supabase) void signOut();
        break;
    }
  });
}

/**
 * Token para o `hello`. `null` só quando não há sessão (convidado ou saiu da conta). Se a renovação do token falhar
 * (rede voltando, aba que ficou em segundo plano mais de 1 h), lança: o GameClient tenta de novo em vez de mandar o
 * `hello` sem token, que o servidor recusa com "auth" e tirava o jogador da conta no meio da partida (20/11).
 */
async function currentToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session) return null;
  // expirado ou a menos de 30 s de expirar: renova agora (o relógio da aba em segundo plano atrasa a renovação automática)
  if (session.expires_at && session.expires_at * 1000 - Date.now() < 30_000) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) throw refreshed.error ?? new Error('Sessão não renovada');
    return refreshed.data.session.access_token;
  }
  return session.access_token;
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) {
    useAppStore.getState().pushToast('error', `Não foi possível carregar o perfil: ${error.message}`);
    return null;
  }
  return data as Profile | null;
}

/** Após login: carrega o perfil e conecta ao servidor de jogo. */
export async function onSignedIn(userId: string, email: string | null): Promise<void> {
  const profile = await loadProfile(userId);
  useAppStore.setState({ authUserId: userId, authEmail: email, profile, guest: null });
  if (useAppStore.getState().screen === 'auth') useAppStore.setState({ screen: screenAfterLogin() });
  if (gameClient.status === 'idle' || gameClient.status === 'failed') gameClient.connect({ getToken: currentToken });
}

export function playAsGuest(name: string): void {
  let id: string;
  try {
    id = localStorage.getItem('nc.guestId') ?? crypto.randomUUID();
    localStorage.setItem('nc.guestId', id);
  } catch {
    id = crypto.randomUUID();
  }
  useAppStore.setState({ guest: { id, name }, screen: screenAfterLogin() });
  gameClient.connect({ getToken: async () => null, guestId: id, guestName: name });
}

export async function signOut(): Promise<void> {
  gameClient.disconnect();
  if (supabase) await supabase.auth.signOut().catch(() => undefined);
  useAppStore.setState({
    authUserId: null,
    authEmail: null,
    profile: null,
    guest: null,
    serverUser: null,
    room: null,
    match: null,
    matchEnd: null,
    chat: [],
    screen: 'auth',
  });
}

/** Restaura a sessão salva e acompanha mudanças de autenticação. */
export function initAuth(): void {
  if (!supabase) return;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') return;
    if (session?.user && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
      // evita chamadas ao Supabase dentro do callback (recomendação da biblioteca)
      setTimeout(() => void onSignedIn(session.user.id, session.user.email ?? null), 0);
    }
  });
}

export function preferredCountry(): string {
  return useAppStore.getState().profile?.preferred_country ?? DEFAULT_COUNTRY;
}
