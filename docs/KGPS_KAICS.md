# KGPS + KAICS — desempenho gráfico adaptativo (versão 2: Onda 1 do KAICS Adaptables+)

**KGPS** (Kaiser Graphic Performance System) mantém a partida perto da **meta de quadros do
aparelho** — 60 qps no PC, 30 qps no celular — mexendo o mínimo possível na qualidade. **KAICS**
(Kaiser Adaptive Integration & Compatibility System) conhece o jogo e decide o que pode ser
mexido, quando e com que garantia. **KAICS Adaptables+** é o conjunto de botões (adaptadores) e
de evidências que os dois usam; a especificação completa, com requisitos, ondas e testes, está em
[`KAICS_ADAPTABLES_PLUS.md`](KAICS_ADAPTABLES_PLUS.md).

> O KAICS entende o jogo e prepara o terreno; o KGPS otimiza — e só mantém o que comprovadamente
> ajudou.

Código: `src/game/perf/` (núcleo, sem dependência do three.js: `stats.ts`, `kaics.ts`, `kgps.ts`,
`device.ts`, `report.ts`) e `src/game/GameRuntime.ts` (`setupPerf`, `perfFrame`, `perfReport`).
Testes: `src/test/kgps.test.ts` (v1) e `src/test/adaptables.test.ts` (v2).

### O que mudou da versão 1 para a 2 (Onda 1)

| Problema visto em campo (E1/E2) | Versão 2 |
|---|---|
| Meta fixa de 60 qps: no celular, 30 qps contavam como "lento" | **Meta por classe de aparelho:** 30 no celular e na renderização por software, 60 no PC, nunca acima da taxa estimada da tela |
| Um passo por vez, 2 janelas por passo: de 7 para 30 qps levaria minutos | **Descida rápida:** mini-janelas de 0,5 s, 1 a 3 passos por rodada, prova final contra o início |
| No piso do preset ainda sobrava muito custo (Ultra+ no celular) | **Níveis de emergência** abaixo do piso normal, só na descida rápida, e **4 botões novos** (reflexo só do céu, efeitos, vegetação, sombra da vegetação) |
| Economia de bateria (30 qps fixos) virava pausas de 5 min | **Limite externo** reconhecido pelo padrão (quadros presos em 33,3 ms com a CPU folgada) |
| Difícil diagnosticar à distância | **Painel v2** e **"Copiar relatório"** (JSON ≤ 20 KB), evidência em cada decisão |
| Ajuste aprendido sobrevivia a mudanças visuais do jogo | Chave do perfil com **versão gráfica**, classe do aparelho e meta (`nc.kgps.v2`) |

## 1. Princípios (do plano original, mantidos)

1. **Medir antes de mexer.** Sem dados válidos, nada muda.
2. **Um ajuste por vez, com prova.** Cada redução é medida. Se não ajudou, é desfeita e o ajuste
   fica de lado por um tempo.
3. **Quem manda é o jogador.** O KGPS nunca passa da qualidade do preset escolhido. Desligado nas
   configurações, ele devolve tudo na hora e só observa.
4. **O jogo continua dono do jogo.** Não existe um segundo laço de renderização. Regras,
   simulação, névoa de guerra, fronteiras, seleção, barras de vida e interface **nunca** são
   ajustadas.
5. **Complexidade com propósito.** A versão 1 tem 3 arquivos de núcleo (≈800 linhas) e 7 botões.
   As outras ideias do brainstorm estão na seção 9, com o gatilho que justificaria cada uma.

### O que do plano virou código e o que virou processo

O plano original misturava três coisas. Na versão 1 elas ficaram separadas:

| Parte | Onde está |
|---|---|
| Controlador que roda na partida (telemetria, diagnóstico, decisões, recuperação) | `src/game/perf/` |
| "Entender o jogo antes de integrar" (inventário, pontos de integração, riscos) | este documento: foi feito uma vez, lendo o código (seção 2) |
| Governança de mudanças no repositório (testes, revisão, rastreabilidade) | o fluxo normal do projeto: testes automáticos, typecheck, lint, build e commits |

## 2. Inventário da integração (o trabalho do KAICS feito na prática)

| Área | Nation Commander |
|---|---|
| Motor | three.js 0.186, `WebGLRenderer` (WebGL 2), um por cena tática (teatro e batalha local) |
| Laço | `GameRuntime.frame` via `requestAnimationFrame`. O KGPS mede dentro dele e não cria outro laço |
| Presets | `src/lib/graphics.ts`: Mobile/Baixo, Equilibrado, Alto, Ultra, Ultra+. Valem a partir da próxima partida |
| Pós-processamento | `PostFx`: GTAO (Alto+), feixes de sol + exposição local (Ultra), brilho (Ultra+) |
| Sombras | sol direcional, mapa de 1024 a 8192 px que acompanha a câmera (`ShadowFollow`) |
| Água | reflexo planar (`Reflector`, Alto+) que redesenha a cena inteira |
| Extras | sonda de ambiente (cubo + PMREM a cada ~2,5 s) e exposição adaptativa (render reduzido a cada 0,6 s) |
| Interface | HTML/React por cima do canvas. Baixar a resolução 3D **não** afeta a nitidez do HUD |
| Simulação | no servidor. O cliente só desenha, então o gargalo do cliente é a renderização |

### Achado da inspeção: sombras desenhadas duas vezes por quadro

Toda chamada `renderer.render()` redesenha o mapa de sombras, e o passe de oclusão (GTAO) faz uma
segunda chamada. Nos presets Alto, Ultra e Ultra+, o mapa de sombras era desenhado **duas vezes por
quadro**. Agora ele é desenhado uma vez e reaproveitado pelos outros passes: mesma imagem, menos
trabalho.

Medição no teste do navegador: ver a seção 8.

### Dono de cada parâmetro (escritor único)

Durante a partida, os parâmetros abaixo só são escritos pelo KGPS, via KAICS. O preset do jogador
só muda na próxima partida, então não há disputa entre dois escritores.

## 3. Os botões (o que o KGPS pode mexer)

Cada botão declara:
- níveis (do mais barato ao preset);
- piso de qualidade;
- quais gargalos alivia;
- custo visual de cada passo (1 = imperceptível … 5 = muito visível);
- como **aplicar**;
- como **ler o estado real** do renderizador.

Na versão 2, cada botão também pode ter um **piso de emergência** (abaixo do piso normal), que só
a descida rápida alcança. Nenhum botão recompila shaders: todos mexem em uniformes, contagens ou
intervalos.

| Botão | Níveis | Piso normal | Piso de emergência | Alivia | Custo visual | Existe em |
|---|---|---|---|---|---|---|
| Reflexo da água | todo quadro → a cada 2 → a cada 3 → **só céu** | a cada 3 | só céu (sem a passada do espelho) | GPU e CPU | 1 / 1 / 3 | Equilibrado+ |
| Reflexos do cenário | atualizados → congelados | congelados | — | GPU e CPU | 1 | Alto+ |
| Exposição automática | adaptativa → fixa | fixa | — | GPU e CPU | 1 | Equilibrado+ |
| Atualização das sombras | todo quadro → a cada 2 | a cada 2 | — | GPU e CPU | 2 | com sombras |
| Efeitos de tela | brilho → feixes → oclusão → desligados | desligados | — | GPU e CPU | 2 / 3 / 4 | Alto+ |
| Resolução das sombras | preset → … → 1024 px | 1024 px | — | GPU | 1 (8192) / 2 (4096) / 3 | com sombras > 1024 |
| **Sombra da vegetação e pedras** (novo) | com sombra → sem sombra | sem sombra | — | GPU e CPU | 2 | com sombras |
| **Efeitos** (explosões, fumaça; novo) | 100% → 70% → **40%** | 70% (fumaça um degrau abaixo) | 40% (fumaça básica) | GPU e CPU | 2 / 4 | todos |
| **Densidade da vegetação e pedras** (novo) | 100% → 75% → **50%** | 75% | 50% só no celular | GPU e CPU | 3 / 4 | todos |
| Resolução interna | 100% → 90% → … → 60% → **50/40/30%** | 0,7 px por px de tela ou 60% | celular: até 0,7 px por px CSS | GPU | 2 / 3 / 4 / 5 (emergência) | todos |

**Por classe (decisão D2 da especificação):** no PC, a emergência vai só até "reflexo só do céu" e
"efeitos 40%"; no celular e na renderização por software, também até vegetação 50% e resolução de
0,7 px por px CSS.

**Como cada botão novo funciona por dentro**
- *Reflexo só do céu:* a água passa a usar o reflexo analítico do céu (mesmo shader, um uniforme);
  a passada que redesenha a cena inteira para o espelho deixa de rodar.
- *Efeitos:* limita quantos efeitos nascem ao mesmo tempo (mínimo de 8, então tiros e explosões
  continuam visíveis) e baixa a fumaça das explosões novas; as que já estão no ar terminam como
  estão.
- *Densidade da vegetação:* um subconjunto fixo por posição (`decorThinning.ts`): quem fica com 50%
  também fica com 75%, nada pisca e nenhuma árvore troca de lugar. As instâncias visíveis vão para
  o começo do buffer, então as escondidas não custam nem vértices.
- *Sombra da vegetação:* só desliga a projeção no mapa de sombras; prédios e unidades continuam
  com sombra.

**Nunca reduzidos (piso visual):** sombras ligadas (dos prédios e unidades), névoa de guerra,
fronteiras, unidades e prédios, barras de vida e interface. Tiros e explosões continuam
aparecendo mesmo com efeitos em 40%.

## 4. KGPS: como decide

A telemetria é coletada a cada quadro desenhado:
- **intervalo** entre quadros (o que o jogador sente);
- **tempo de CPU** do quadro (atualização + envio dos desenhos).

O tempo da GPU não é medido: no navegador ele quase nunca está disponível de forma confiável. Por
isso o gargalo é **estimado**, e o painel diz isso:
- se o JavaScript ocupa ≥ 70% do quadro, ou sozinho passa de 90% do orçamento → **CPU**;
- se ocupa ≤ 45% → **GPU**;
- entre os dois → **indefinido** (vale qualquer ajuste).

**Meta e orçamento (versão 2).** A meta vem da classe do aparelho (`device.ts`), deduzida de
evidência e nunca de marca ou modelo:
- **software** (SwiftShader, llvmpipe…): o navegador desenha sem placa de vídeo → meta 30;
- **celular**: tela de toque com lado curto < 820 px CSS → meta 30;
- **PC**: o resto → meta 60.

A meta nunca passa da taxa da tela estimada pelos quadros mais rápidos (p10 das janelas: 60, 90,
120 ou 144 Hz). Quadros presos em 33,3 ms **não** viram estimativa de 30 Hz: numa tela de 60 Hz,
uma carga entre 17 e 33 ms produz o mesmo padrão. Esse caso é resolvido pelo limite externo
(passo 6).

Ciclo (números em `KGPS_CONFIG`; os limites são proporcionais ao orçamento da meta):

1. **Aquecimento.** Os primeiros 4 s são ignorados (compilação de shaders, envio de texturas).
   Os portões `carregando` (antes do primeiro estado do servidor) e `compilando` (1,5 s depois
   que os modelos do Nature Kit chegam) também bloqueiam medição e mudança.
2. **Janelas de ~2 s.** Para cada uma calcula p10, p50, p95, p99, a CPU, as travadas (> 50 ms) e a
   fração de quadros presos em 33,3 ms. Congelamentos acima de 1 s são só contados, fora dos
   percentis.
   - Orçamento: 16,7 ms por quadro na meta 60, 33,3 ms na meta 30.
   - **Lenta**: p95 > 1,2× o orçamento ou mediana > 1,08×.
   - **Estável**: p95 ≤ 1,1×.
   - **Com folga**: p95 ≤ 0,8×.
   - **Crítica**: mediana > 1,8× (menos de ~17 qps com meta 30; menos de ~33 com meta 60).
3. **Reduzir.** Depois de 2 janelas lentas seguidas, escolhe o passo de **menor custo visual**
   entre os botões que aliviam o gargalo estimado. Com gargalo de CPU, a resolução nunca é tocada.
4. **Provar.** Espera 1,2 s para o renderizador assentar e mede uma janela nova. Mantém o passo se a
   mediana caiu ≥ 4% ou o p95 caiu ≥ 6%.
5. **Cadeia (sincronia vertical).** A tela arredonda cada quadro para 16,7 ou 33,3 ms. Um passo de
   26 → 22 ms não aparece na medida. Por isso:
   - um passo sem efeito visível fica **provisório** e o próximo se soma a ele (até 3);
   - a cadeia é comparada com o ponto de partida;
   - se no fim nada melhorou, **tudo é desfeito** e esses botões ficam fora por 90 s.
6. **Limite externo (versão 2).** Uma cadeia sem efeito com os quadros presos em 33,3 ms antes e
   depois, e o JavaScript ocupando até 45% do quadro → estado **limite externo** (ex.: economia
   de bateria segurando o navegador em 30 qps). Tudo da cadeia é desfeito e nada mais é reduzido
   enquanto durar. Com meta 30, isso conta como meta atingida. O estado termina quando o padrão
   some por 3 janelas, ou é revisto depois de 5 min (dobra a cada repetição, até 30 min). Duas
   cadeias sem efeito **sem** esse padrão → pausa como na versão 1 (evidência: hipótese).
6a. **Descida rápida (versão 2).** Duas janelas críticas seguidas (fora do padrão de 33,3 ms):
   - aplica de 1 a 3 passos por rodada (3 se a mediana passa de 3× o orçamento, 2 acima de 2×),
     incluindo níveis de emergência, sempre do menor custo visual para o maior;
   - entre as rodadas, espera o renderizador assentar (1,2 s) e mede uma mini-janela de 0,5 s;
   - para quando a mediana fica até 1,15× o orçamento ou acabam os passos;
   - **prova final** com uma janela completa: mantém se a mediana caiu pelo menos 15% em relação
     ao início; senão desfaz tudo e registra "limite que não é gráfico ou externo" (hipótese);
   - depois de uma descida com ganho, **estabiliza** por 10 s (sem subidas);
   - nova descida só depois de 3 min, salvo queda muito forte (mediana > 2,5× o orçamento);
   - a descida inteira conta como **uma** mudança no vigia de oscilação.
7. **Devolver a qualidade.** A qualidade volta na ordem inversa, um passo por vez (depois de uma
   descida rápida, os níveis de emergência voltam primeiro):
   - depois de 3 janelas com folga ou 8 janelas estáveis (~16 s);
   - se o passo deixar o jogo lento, volta atrás e espera 30 s, depois 60, 120… até 8 min antes de
     tentar de novo. Isso evita o "pisca-pisca".
8. **Vigia de oscilação.** Mais de 6 mudanças em 60 s → segura tudo por 60 s.
9. **Interrupções.** Redimensionar a janela, abrir o globo, trocar de cena, aba em segundo plano ou
   contexto restaurado:
   - descartam a janela atual;
   - uma avaliação em andamento vira **inconclusiva** (a mudança fica e pode ser devolvida depois).
10. **Perfil aprendido.** O ajuste confirmado é guardado no navegador (`nc.kgps.v2`, válido por
    14 dias) sob a chave `versão gráfica | preset | densidade de tela | cena | classe | meta`. A
    próxima partida começa dele (inclusive de um nível de emergência), e a qualidade sobe sozinha
    se houver folga. Quando o visual do jogo muda (`GRAPHICS_REVISION` em `src/lib/graphics.ts`),
    os ajustes antigos deixam de valer. Os perfis da versão 1 são apagados.
11. **Modo observação.** Com a opção desligada, o KGPS mede e registra o que **faria** ("Modo
    observação — faria …", inclusive a descida rápida), sem mudar nada.
12. **Evidência em cada decisão (versão 2):** `medido` (janelas), `estimado` (gargalo pela fração
    de CPU) ou `hipótese` (limite externo, causa não gráfica).

**Custo do próprio KGPS:** medido a cada janela e mostrado no painel. Nos testes fica em
microssegundos por quadro.

## 5. KAICS: o que garante

- **Capacidades:** WebGL 2, textura máxima, GPU informada pelo navegador, extensão de tempo de GPU,
  densidade de tela, núcleos, memória e toque. Só leitura.
- **Registro com validação.** Um botão só entra se:
  - os níveis forem coerentes;
  - o piso for menor que o nível do preset;
  - o estado **lido** do renderizador bater com o declarado.

  Se não, ele fica em **quarentena** (incidente no painel) e o KGPS não o usa.
- **Transação por mudança:** confere limites e permissão → aplica → **lê de volta**.
  - Se não bateu, restaura o anterior.
  - Se nem a restauração bateu, o botão é marcado **com defeito** e sai do controle automático.
  - A resolução, por exemplo, confere até o buffer real do canvas.
- **Portões (momentos inseguros):** contexto gráfico perdido, cena oculta, aba em segundo plano,
  câmera de entrada da batalha e, na versão 2, `carregando` e `compilando`. Nesses momentos nada
  muda e nada é medido.
- **Classe do aparelho (versão 2):** com a fonte da conclusão ("renderizador SwiftShader",
  "toque + tela curta (412 px)"), mostrada no painel e no relatório.
- **Pisos de emergência (versão 2):** fora do alcance do ajuste normal; só a descida rápida (e a
  volta a um nível já confirmado) passa deles.
- **Escritas externas (versão 2):** a cada janela o KAICS relê todos os botões. Um nível mudado
  por fora vira incidente no registro e o KGPS adota o lido (sem briga).
- **Isolamento de falhas (versão 2):** uma exceção ao aplicar ou ler um botão restaura o nível
  anterior e põe só aquele botão em quarentena; o quadro continua.
- **Ciclo de vida:** adaptadores ligam uma vez no registro e desligam uma vez no fim da cena.
- **Veredito:**
  - **Adaptativo**: pode mexer;
  - **Só observando**: desligado pelo jogador ou nenhum botão validado;
  - **Bloqueado**: contexto perdido.
- **Kill switch:** desligar a opção devolve cada botão ao nível do preset, sem esperar a próxima
  partida.

## 6. Interface

- **Configurações → Qualidade adaptativa (KGPS):** ligada por padrão. Vale na hora.
- **Barra da partida:** com "Mostrar FPS" ligado, o contador tem um ponto colorido:
  - verde: qualidade cheia;
  - âmbar: qualidade reduzida pelo KGPS (e "· adaptado" ao lado, em telas largas);
  - vermelho pulsando: descida rápida em andamento;
  - cinza: só observando;
  - vermelho: bloqueado.

  Tocar no contador abre o **painel de desempenho (v2)**:
  - preset com o rótulo honesto "**<preset> · adaptado**" sempre que algo está abaixo do preset;
  - estado: aquecendo, medindo, avaliando um ajuste, descida rápida, estabilizando, limite externo
    de 30 qps ou em pausa;
  - medidas: quadros/s, mediana, p95, p99, CPU, travadas, desenhos e triângulos por quadro, custo
    do KGPS;
  - meta (qps, orçamento e origem: padrão do aparelho, escolha do jogador ou limite da tela) e
    gargalo estimado;
  - **qualidade adaptada (IFA)**: "estimativa relativa aos ajustes disponíveis; não é medida de
    imagem" (1 − custo visual dos passos aplicados ÷ custo de todos até o piso de emergência);
  - cada botão e o nível em vigor, com "· emergência" quando abaixo do piso normal;
  - as decisões recentes, cada uma com o motivo, os números e a evidência (medido, estimado,
    hipótese);
  - o aparelho: classe e fonte, taxa da tela estimada, GPU, WebGL, núcleos, memória e incidentes;
  - **Copiar relatório**: gera o JSON (formato da seção 31 da especificação, até 20 KB), mostra o
    conteúdo antes e só então copia. Sem nome, sala, posição no mapa ou chat; nada é enviado
    sozinho. Se o navegador não liberar a área de transferência, o texto fica selecionado para
    copiar à mão.

## 7. Testes automáticos (`src/test/kgps.test.ts`)

**Telemetria e diagnóstico**
- percentis;
- travadas;
- congelamentos fora dos percentis;
- classificação do gargalo.

**KAICS**
- quarentena por estado divergente;
- botão sem margem;
- leitura de volta com restauração;
- defeito quando a restauração falha;
- limites;
- portões;
- veredito bloqueado;
- kill switch.

**KGPS** (com fluxos de quadros sintéticos sob sincronia vertical)
- limitado pela GPU: reduz do mais barato, respeita o piso e volta aos 60 qps;
- limitado pela CPU: não sacrifica a resolução;
- quadros presos em 30 qps com a CPU folgada: desfaz a cadeia e entra em limite externo (na
  versão 1, pausava; a mudança é intencional);
- cena que alivia: recupera a qualidade do preset;
- sem oscilação: subidas que pesam são desfeitas com espera crescente (≤ 5 tentativas em 5 min);
- aquecimento ignorado;
- modo observação só sugere;
- desligar no meio da partida restaura;
- avaliação interrompida fica inconclusiva;
- perfil aprendido salvo e reaplicado;
- custo por quadro.

**Versão 2** (`src/test/adaptables.test.ts`, IDs da especificação)
- T-12: classe do aparelho por evidência;
- T-01: meta 30 no celular, quadros estáveis em 33,3 ms não disparam ajuste;
- T-02/T-13: taxa da tela pelos quadros mais rápidos (120 Hz), sem confundir 33,3 ms presos;
- T-03: limite externo — nada reduzido enquanto durar;
- T-04: ~7 qps → descida rápida com vários passos em segundos, inclusive de emergência, com prova;
- T-05: descida sem ganho desfeita por inteiro, registrada como hipótese;
- T-06: estabilização de 10 s e recuperação começando pelos níveis de emergência;
- T-07: espera de 3 min entre descidas, salvo queda > 2,5× o orçamento;
- T-08: pisos de emergência fora do ajuste normal; portões novos;
- T-09: exceção num adaptador → quarentena só dele; ligar/desligar uma vez;
- T-10: mudança feita por fora → incidente e nível adotado;
- T-11: desligar no meio da descida devolve tudo;
- T-14: relatório com os campos, ≤ 20 KB, congelamentos e evidência por decisão, sem dados
  pessoais;
- T-15: perfil vale só para a mesma versão gráfica, classe e meta; perfil com nível de
  emergência reaplicado;
- T-17: densidade da vegetação com subconjunto fixo e encaixado;
- T-18: os testes da versão 1 continuam passando (com a mudança intencional do caso de 30 qps).

T-16 (tendência térmica) é da Onda 2.

## 8. Verificação no navegador

Partida real no navegador headless (Chromium com SwiftShader, que renderiza sem placa de vídeo e
serve de teste de estresse). Resultados registrados abaixo a cada entrega.

**Sombra uma vez por quadro**

| Preset | Desenhos por quadro antes | Agora |
|---|---|---|
| Alto | 178 | 147 (−17%, mesma imagem) |
| Equilibrado | 70 | 70 (sem passe de oclusão, não havia duplicação) |

**KGPS na partida (Equilibrado, ~10–20 qps)**
- Primeiro passo: reduziu a exposição automática (custo visual 1).
- Sem efeito visível na medida, somou o passo seguinte da cadeia (sombras a cada 2 quadros).
- Numa das janelas classificou o gargalo como GPU.

**KAICS e painel**
- O KAICS detectou o aparelho (SwiftShader) e validou os 3 botões que esse preset tem: exposição,
  atualização das sombras e resolução.
- Custo do KGPS: ~5 µs por quadro.
- Desligar a opção no painel passou o modo para "só observando", com o preset restaurado.
- Nenhum erro na página.

**Limite do ambiente de teste**
- O SwiftShader congela a página por 1 a 50 s (compilação de shaders).
- Isso derruba o WebSocket (código 1006): a cena é recriada a cada ~100 s ou, no Alto, a partida é
  perdida.
- **O mesmo acontece com o código anterior ao KGPS** (verificado guardando as mudanças e repetindo
  o teste).

Por isso a convergência completa (reduzir → confirmar → devolver) foi verificada nos testes
automáticos. Esse ensaio também levou a uma melhoria: congelamentos acima de 1 s ficam fora dos
percentis (reduzir qualidade não resolve compilação de shader nem aba parada).

**A conferir em aparelho real**
Com "Mostrar FPS" ligado, toque no contador e confira no painel as medidas, os ajustes e as
decisões, de preferência num PC com placa dedicada (Alto/Ultra) e num celular (Mobile/Baixo).

## 9. Próximas ondas (ver a seção 36 da especificação)

**Onda 2 (precisão e próxima partida):**
- consultor de preset ao fim da partida e aviso por aparelho (Ultra+ no celular, decisão D5);
- tempo de GPU por consulta (`EXT_disjoint_timer_query_webgl2`) quando houver;
- pré-aquecimento de shaders (`renderer.compileAsync`) sob o portão `compilando`;
- botões K-06 a K-09 (rastros, sombras de nuvens, animação distante, ondas da água);
- meta escolhida pelo jogador (Automática, 30 ou 60);
- tendência sustentada (indício térmico, T-16);
- marcação de eventos extraordinários no registro.

**Onda 3 (só com gatilho de campo):** residência de texturas, tendência de memória, "Ultra+
Móvel", metas acima de 60 qps e telemetria agregada no servidor (exige consentimento).

**Continua fora:** limite de luzes dinâmicas e sombras ligadas/desligadas em tempo real (mudar
isso recompila shaders e trava o jogo). Ficam com o consultor da próxima partida.

## 10. Critérios de aceitação (versão 2, Onda 1)

| Critério | Evidência |
|---|---|
| Não muda nada sem medir | aquecimento, janelas e portões, inclusive `carregando` e `compilando` (T-08) |
| Só mantém o que ajudou | testes de cadeia, prova final da descida rápida (T-04/T-05) e o registro de decisões |
| Meta certa para o aparelho | 30 qps estáveis no celular não disparam nada (T-01); taxa da tela como teto (T-02/T-13) |
| Sai rápido de quedas fortes | descida rápida em segundos, com prova (T-04) e espera entre descidas (T-07) |
| Não briga com limite externo | `externalCap` (T-03) |
| Respeita o jogador | nunca passa do preset; kill switch restaura até os níveis de emergência (T-11) |
| Não oscila | estabilização (T-06), espera crescente nas subidas, vigia de 60 s |
| Não quebra o jogo | leitura de volta, quarentena, isolamento de exceções (T-09), escrita externa (T-10); build, typecheck e todos os testes passando |
| Custa pouco | custo medido no painel e no teste (< 50 µs por quadro) |
| Explica o que fez | cada decisão com motivo, números e evidência; relatório copiável (T-14) |
| Honesto | "· adaptado" e IFA como estimativa, nunca como equivalência visual |
