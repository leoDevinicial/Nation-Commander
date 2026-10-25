import { create } from 'zustand';
import type { MatchEndInfo, MatchStartInfo, PublicUser, RoomInfo } from '../../shared/protocol.ts';
import type { ConnectionStatus } from '../net/GameClient.ts';
import type { Profile } from '../lib/supabase.ts';

export type Screen = 'auth' | 'menu' | 'lobby' | 'game' | 'profile' | 'settings' | 'credits';

export interface ChatLine {
  id: number;
  from: string;
  text: string;
  system: boolean;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error';
  text: string;
}

interface AppState {
  screen: Screen;
  /** Usuário autenticado no Supabase (null = não logado ou convidado). */
  authUserId: string | null;
  authEmail: string | null;
  profile: Profile | null;
  guest: { id: string; name: string } | null;
  /** Identidade confirmada pelo servidor de jogo. */
  serverUser: PublicUser | null;
  connStatus: ConnectionStatus;
  connDetail: string | null;
  room: RoomInfo | null;
  match: MatchStartInfo | null;
  matchEnd: MatchEndInfo | null;
  chat: ChatLine[];
  toasts: Toast[];

  setScreen: (s: Screen) => void;
  pushToast: (kind: Toast['kind'], text: string) => void;
  dismissToast: (id: number) => void;
  pushChat: (line: Omit<ChatLine, 'id'>) => void;
}

let seq = 1;

export const useAppStore = create<AppState>((set) => ({
  screen: 'auth',
  authUserId: null,
  authEmail: null,
  profile: null,
  guest: null,
  serverUser: null,
  connStatus: 'idle',
  connDetail: null,
  room: null,
  match: null,
  matchEnd: null,
  chat: [],
  toasts: [],

  setScreen: (screen) => set({ screen }),
  pushToast: (kind, text) => {
    const id = seq++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  pushChat: (line) => set((s) => ({ chat: [...s.chat.slice(-60), { ...line, id: seq++ }] })),
}));
