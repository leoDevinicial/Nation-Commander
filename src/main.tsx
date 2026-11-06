import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { StatsPage } from './ui/screens/StatsPage.tsx';
import { initAuth, wireGameClient } from './app/session.ts';
// identidade "Sala de Situação" (05/11): fontes livres (OFL) embutidas, sem depender das do sistema
import '@fontsource/barlow-semi-condensed/latin-400.css';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import '@fontsource/barlow-semi-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './index.css';
import { initI18n } from './i18n/index.ts';

// painel de números (06/11): só por link direto (/painel#token); não conecta ao jogo nem faz login
const statsPage = location.pathname.replace(/\/+$/, '') === '/painel';
if (!statsPage) {
  wireGameClient();
  initAuth();
}

createRoot(document.getElementById('root')!).render(<StrictMode>{statsPage ? <StatsPage /> : <App />}</StrictMode>);
if (!statsPage) void initI18n();
