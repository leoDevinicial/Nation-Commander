import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { initAuth, wireGameClient } from './app/session.ts';
import './index.css';
import { initI18n } from './i18n/index.ts';

wireGameClient();
initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
void initI18n();
