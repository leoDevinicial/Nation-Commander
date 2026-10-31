# Nation Commander — memória do projeto

RTS geopolítico 3D no navegador (three.js + React/zustand no cliente, servidor Node com a simulação em `shared/`,
Supabase para contas e histórico). O jogo é todo em português.

> **Começando numa conversa nova?** Leia primeiro [`docs/HANDOFF.md`](docs/HANDOFF.md): branch de trabalho, como rodar e
> verificar, mapa do código, o que já foi feito e de onde continuar.
>
> **Branch de trabalho atual: `claude/youthful-dijkstra-a45emp`** (criada de `claude/serene-bell-7cjnhp` no commit
> `20bdcc5`; ver seção 0.1 do handoff). Commits e push só nela, sem merge nem PR sem pedido do usuário.

## Regras de trabalho
- Responder em português.
- Nunca expor `SUPABASE_SERVICE_ROLE_KEY` no cliente nem em commits.
- Não abrir pull request sem pedido explícito.
- Antes de entregar: `npm test`, `npm run lint`, `npm run typecheck`. Nunca rodar o prettier no arquivo inteiro
  (`src/game/GameRuntime.ts` vira milhares de linhas de diff); formatar só o trecho alterado.

## Diretriz visual (low poly) — vale para todo trabalho gráfico
O Nation Commander é **low poly estilizado**, por decisão do responsável pelo projeto. Fundamentos e exemplos em
[`docs/RELATORIO_LOW_POLY.pdf`](docs/RELATORIO_LOW_POLY.pdf) (fontes em `docs/relatorio_lowpoly/`).
- Formas facetadas, cores chapadas por camada (`body`, `accent` = cor da nação, `glass`), silhueta forte. Nada de
  realismo fotográfico, texturas fotográficas ou mapas PBR.
- Leitura antes de detalhe: todo modelo precisa ser reconhecível de longe, na câmera normal do RTS, pela silhueta e pela
  cor da nação.
- Coerência: mesmo kit (`src/game/render/models/kit.ts`), mesma paleta por era, mesma luz. Não misturar estilos.
- Visual próprio: fotos do mundo real servem de referência de forma e proporção; a aparência de outros jogos não é
  copiada nem transposta.
- Orçamento: até ~6 mil triângulos por tropa ou prédio (hoje 700–6.200); o jogo precisa seguir rodando no navegador e
  no celular.
- Modelos gerados por código em `src/game/render/models/`. Arquivo externo só com licença livre (CC0) e no mesmo estilo.
- Pedidos para "melhorar o gráfico" viram polimento dentro da estética: luz, efeitos, animação, legibilidade, variantes
  de era, biomas e interface.

## Onde está cada coisa
- `shared/sim/` — simulação tática determinística (config, IA, combate, comércio, melhorias). `shared/strategic/` —
  camada nacional (economia, orçamento, diplomacia).
- `src/game/` — runtime 3D (`GameRuntime.ts`), modelos, áudio sintetizado (`audio/AudioService.ts`) e qualidade
  adaptativa (`perf/`: KGPS e KAICS, ver `docs/KGPS_KAICS.md` e `docs/KAICS_ADAPTABLES_PLUS.md`).
- `docs/` — uma página por fase ou sistema já feito; `docs/AUDITORIA_ADENDO.md` diz o estado de cada fase.
- Custos: os valores-base ficam nas definições (`UNITS`, `BUILDINGS`, `AIRCRAFT`...), mas o bloco `ECONOMY` no fim de
  `shared/sim/config.ts` (e em `air.ts`) os multiplica ao carregar. O valor que o jogo usa é o escalado; ver
  `docs/ECONOMIA.md`. Testes de regra usam `TEST_START` (`shared/test/helpers.ts`) como estoque inicial.
- Custo crescente: construir usa `buildingCost(type, existentes)` (+18% por edifício do tipo), não `BUILDINGS[t].cost`.
  Ao mexer em economia ou na IA, rodar `npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25` e conferir os critérios de
  `docs/RECALIBRAGEM_RECURSOS.md` (seção 5).
- Rede elétrica (`shared/sim/power.ts`, `docs/REDE_ELETRICA.md`): carvão é recurso (sai das minas); a energia anda
  pelas estradas (alcance de 4 células); quartel, fábrica, pesquisa e militares param sem luz. Testes de regra antigos
  rodam sem a rede (`shared/test/setup.ts`); ao mexer na IA ou na energia, rodar
  `POWER_LOG=1 npx tsx scripts/sim-economia.ts 2,5,6 25`.
- KAC — Kaiser Anti Cheat (`server/kac/`, `docs/kac/`): o cliente só pede, o servidor decide. Qualquer comando ou
  mensagem nova passa por validação no servidor e confere o dono pela conexão, nunca pelo payload. Riscos abertos em
  `docs/kac/KAC_THREAT_MODEL.md`; ataques reproduzidos em `server/kac.test.ts`. O snapshot nunca cita o que o jogador
  não vê (nem id de alvo, nem base de voo). Nenhuma punição automática: ver `docs/kac/KAC_ENFORCEMENT_POLICY.md`.
- Clima e dia/noite (`shared/sim/climate.ts`, `docs/CLIMA_DIA_NOITE.md`) são só visuais, exceto a usina solar.
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
