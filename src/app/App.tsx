import { lazy, Suspense } from 'react';
import { useAppStore } from '../state/useAppStore.ts';
import { AuthScreen } from '../ui/screens/AuthScreen.tsx';
import { CreditsScreen } from '../ui/screens/CreditsScreen.tsx';
import { LobbyScreen } from '../ui/screens/LobbyScreen.tsx';
import { ManualScreen } from '../ui/screens/ManualScreen.tsx';
import { MenuScreen } from '../ui/screens/MenuScreen.tsx';
import { ProfileScreen } from '../ui/screens/ProfileScreen.tsx';
import { SettingsScreen } from '../ui/screens/SettingsScreen.tsx';
import { Toasts } from '../ui/components/Toasts.tsx';
import { GlobeBackdrop } from '../ui/components/GlobeBackdrop.tsx';

// Three.js e a cena 3D só são carregados ao entrar numa partida
const GameScreen = lazy(() => import('../ui/screens/GameScreen.tsx').then((m) => ({ default: m.GameScreen })));

export function App() {
  const screen = useAppStore((s) => s.screen);
  return (
    <>
      {/* um único globo para todas as telas fora da partida: não é recriado ao navegar */}
      {screen !== 'game' && <GlobeBackdrop layout={screen === 'menu' || screen === 'auth' ? 'hero' : 'center'} dim={screen !== 'menu' && screen !== 'auth'} />}
      {screen === 'auth' && <AuthScreen />}
      {screen === 'manual' && <ManualScreen />}
      {screen === 'menu' && <MenuScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-400">Preparando o teatro de operações…</div>}>
          <GameScreen />
        </Suspense>
      )}
      {screen === 'profile' && <ProfileScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'credits' && <CreditsScreen />}
      <Toasts />
    </>
  );
}
