import { DEFAULT_COUNTRY } from '../../shared/data/countries.ts';
import { gameClient } from '../net/client.ts';
import { supabase, type Profile } from '../lib/supabase.ts';
import { useAppStore } from '../state/useAppStore.ts';
import { applyNationalMessage, useNationalStore } from '../state/useNationalStore.ts';

/** Liga mensagens do servidor de jogo ao estado da aplicação. Chamar uma vez. */
export function wireGameClient(): void {
  gameClient.onStatus((status, detail) => {
    useAppStore.setState({ connStatus: status, connDetail: detail ?? null });
  });

  gameClient.on((msg) => {
    const app = useAppStore.getState();
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
      case 'match_start':
        if (app.match?.seed !== msg.match.seed) useNationalStore.getState().reset();
        useAppStore.setState({ match: msg.match, matchEnd: null, screen: 'game' });
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

async function currentToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
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
  if (useAppStore.getState().screen === 'auth') useAppStore.setState({ screen: 'menu' });
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
  useAppStore.setState({ guest: { id, name }, screen: 'menu' });
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
