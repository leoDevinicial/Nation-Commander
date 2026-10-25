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
            Ainda não há dados factuais integrados. Os países disponíveis são perfis provisórios sem indicadores. Fontes previstas (Banco
            Mundial, FMI, ONU, SIPRI, UN Comtrade, V-Dem) serão documentadas em <code>docs/DATA_SOURCES.md</code> com licença, período e
            metodologia quando integradas.
          </p>
        </div>
        <p className="text-xs text-ink-400">
          Os acontecimentos da partida são uma linha histórica alternativa produzida pela simulação, não previsões do mundo real.
        </p>
      </div>
    </Shell>
  );
}
