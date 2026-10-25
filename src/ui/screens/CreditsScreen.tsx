import { GAME_VERSION } from '../../../shared/version.ts';
import { useAppStore } from '../../state/useAppStore.ts';
import { Shell } from '../components/Shell.tsx';

export function CreditsScreen() {
  const setScreen = useAppStore((s) => s.setScreen);
  return (
    <Shell title="Créditos e fontes" back={() => setScreen('menu')}>
      <div className="space-y-3 text-sm text-ink-200">
        <p>
          <strong>Nation Commander</strong> (nome de trabalho) · versão {GAME_VERSION}
        </p>
        <p>Modelos, terreno e efeitos são geometrias procedurais criadas no próprio projeto. Nenhum asset de terceiros é usado.</p>
        <p>
          Tecnologia: Three.js, React, Vite, Tailwind CSS, Zustand, Supabase e Node.js com <code>ws</code> — todos sob licenças de código
          aberto (MIT/Apache-2.0).
        </p>
        <div>
          <h2 className="label">Dados de referência</h2>
          <p>
            Indicadores dos países: Banco Mundial — World Development Indicators (CC BY 4.0), incluindo séries que ele redistribui da OIT
            (desemprego), SIPRI (gasto militar), IISS (efetivo), UNESCO (educação, P&amp;D) e OMS (saúde). Cada valor mostra o ano e a série de
            origem. Chefes de Estado e de governo: registro editorial em 01/01/2026. Detalhes em <code>docs/DATA_SOURCES.md</code>.
          </p>
        </div>
        <p className="text-xs text-ink-400">
          Os acontecimentos da partida são uma linha histórica alternativa produzida pela simulação, não previsões do mundo real.
        </p>
      </div>
    </Shell>
  );
}
