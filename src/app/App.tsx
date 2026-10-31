import { lazy, Suspense } from 'react';
import { useAppStore } from '../state/useAppStore.ts';
import { AuthScreen } from '../ui/screens/AuthScreen.tsx';
import { CreditsScreen } from '../ui/screens/CreditsScreen.tsx';
import { LobbyScreen } from '../ui/screens/LobbyScreen.tsx';
import { IntroOverlay } from '../ui/screens/IntroOverlay.tsx';
import { ManualScreen } from '../ui/screens/ManualScreen.tsx';
import { MenuScreen } from '../ui/screens/MenuScreen.tsx';
import { RoomsScreen } from '../ui/screens/RoomsScreen.tsx';
import { CommunityScreen } from '../ui/screens/CommunityScreen.tsx';
import { ProfileScreen } from '../ui/screens/ProfileScreen.tsx';
import { SettingsScreen } from '../ui/screens/SettingsScreen.tsx';
import { Toasts } from '../ui/components/Toasts.tsx';
import { GlobeBackdrop } from '../ui/components/GlobeBackdrop.tsx';

// Three.js e a cena 3D só são carregados ao entrar numa partida
const GameScreen = lazy(() => import('../ui/screens/GameScreen.tsx').then((m) => ({ default: m.GameScreen })));

export function App() {
  const screen = useAppStore((s) => s.screen);
  // durante a abertura as telas nem montam: o manual/menu entra junto com o fade da abertura
  const intro = useAppStore((s) => s.intro);
  const show = intro !== 'play';
  return (
    <>
      {/* um único globo para todas as telas fora da partida: não é recriado ao navegar */}
      {screen !== 'game' && <GlobeBackdrop layout={screen === 'menu' || screen === 'auth' ? 'hero' : 'center'} dim={screen !== 'menu' && screen !== 'auth'} />}
      {screen === 'auth' && show && <AuthScreen />}
      {screen === 'manual' && show && <ManualScreen />}
      {screen === 'menu' && show && <MenuScreen />}
      {screen === 'lobby' && show && <LobbyScreen />}
      {screen === 'game' && (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-400">Preparando o teatro de operações…</div>}>
          <GameScreen />
        </Suspense>
      )}
      {screen === 'profile' && show && <ProfileScreen />}
      {screen === 'settings' && show && <SettingsScreen />}
      {screen === 'credits' && show && <CreditsScreen />}
      {screen === 'rooms' && show && <RoomsScreen />}
      {screen === 'community' && show && <CommunityScreen />}
      {intro !== 'off' && <IntroOverlay />}
      <Toasts />
    </>
  );
}
