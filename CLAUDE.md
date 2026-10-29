# Nation Commander — memória do projeto

RTS geopolítico 3D no navegador (three.js + React/zustand no cliente, servidor Node com a simulação em `shared/`,
Supabase para contas e histórico). O jogo é todo em português.

## Regras de trabalho
- Responder em português.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no cliente nem em commits.
- Não abrir pull request sem pedido explícito.
- Antes de entregar: `npm test`, `npm run lint`, `npm run typecheck`. Nunca rodar o prettier no arquivo inteiro
  (`src/game/GameRuntime.ts` vira milhares de linhas de diff); formatar só o trecho alterado.

## Onde está cada coisa
- `shared/sim/` — simulação tática determinística (config, IA, combate, comércio, melhorias). `shared/strategic/` —
  camada nacional (economia, orçamento, diplomacia).
- `src/game/` — runtime 3D (`GameRuntime.ts`), modelos, áudio sintetizado (`audio/AudioService.ts`) e qualidade
  adaptativa (`perf/`: KGPS e KAICS, ver `docs/KGPS_KAICS.md` e `docs/KAICS_ADAPTABLES_PLUS.md`).
- `docs/` — uma página por fase ou sistema já feito; `docs/AUDITORIA_ADENDO.md` diz o estado de cada fase.
- Minas terrestres (`shared/sim/mines.ts`) não são entidades: o snapshot envia só as do dono e as já detectadas
  (`MineSystem.visibleTo`). O satélite do Programa Espacial revela o resto do mapa, mas nunca as minas.

## Próximas direções de design
Documento completo: [`docs/BALANCEAMENTO_E_PROGRESSAO.md`](docs/BALANCEAMENTO_E_PROGRESSAO.md). Consultar antes de mexer
em balanceamento, IA, progressão, mapas ou modos de partida. A seção "Estado da implementação" no fim dele diz o que
já foi feito; atualizar a tabela a cada entrega. Resumo do que já foi decidido em conversa:

- **Balanceamento rápido:** blindagem por classe (fuzil com `vsVehicle` baixo), Lança-Foguetes muito mais forte que
  hoje, contra-bateria e defesa proporcional da IA, níveis de dificuldade (Fácil / Normal / Difícil / Brutal),
  assédio leve durante o preparo, curva do orçamento de defesa mais sensível.
- **Eras como eixo da progressão:** Guerra Fria → Pós-Guerra Fria → Era Digital → Futuro Próximo. Avançar é uma
  pesquisa nacional cara com nível mínimo de QG; cada era troca a aparência de todas as construções e libera tropas,
  veículos e construções aos poucos (tabela na seção 3.1 do documento).
- **Tropico 5/6:** facções com exigências, pedidos das superpotências, decretos, cadeias produtivas (refinaria,
  siderúrgica), serviços com raio de cobertura, ministros, eleições.
- **Rise of Nations:** Centros Regionais com captura e assimilação, fortes e influência de fronteira, teto de
  produção, recursos raros, caravanas, generais, espiões, caminhão logístico, bônus únicos por país, Grandes Projetos
  Nacionais e vitórias alternativas.
- **Programa Espacial (megaconstrução de fim de partida):** a mais cara do jogo; exige era Futuro Próximo e QG 9+.
  Lançamento com animação do foguete; o satélite tira a névoa de guerra do dono (mapa inteiro em tempo real, menos
  minas) e aparece orbitando o globo com a bandeira.
- **Lançamento nuclear:** choque econômico global temporário para todas as nações, inclusive quem lançou.
- **Estradas do jogador** (arrasto na grade, custo em pedra + orçamento de infraestrutura; tropas e comboios ganham
  velocidade) e **Engenheiro de Combate** (minas antitanque, detecção e remoção, estradas fora do território,
  fortificações). Minas são invisíveis ao inimigo e ao satélite.
- **Partidas maiores:** até 4 nações na versão grátis e até 6 para assinantes (humanos + bots); mapas de 96×96 a
  160×160 conforme o número de nações, com gerador por simetria em N partes.
- **Tipos de mapa:** Continental, Rios e Pontes, Montanhoso, Deserto, Oceano Central, Arquipélago. Os navais só depois
  de existir conteúdo naval de combate. O tipo de mapa é escolhido pelo anfitrião ou sorteado; a geografia real do país
  só influencia a região inicial de cada nação, com compensações declaradas.
