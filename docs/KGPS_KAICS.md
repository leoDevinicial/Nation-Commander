# KGPS + KAICS — desempenho gráfico adaptativo (versão 1, em produção)

**KGPS** (Kaiser Graphic Performance System) mantém a partida perto de **60 quadros por segundo**
mexendo o mínimo possível na qualidade. **KAICS** (Kaiser Adaptive Integration & Compatibility
System) conhece o jogo e decide o que pode ser mexido, quando e com que garantia.

> O KAICS entende o jogo e prepara o terreno; o KGPS otimiza — e só mantém o que comprovadamente
> ajudou.

Código: `src/game/perf/` (núcleo, sem dependência do three.js) e `src/game/GameRuntime.ts`
(`setupPerf`, `perfFrame`). Testes: `src/test/kgps.test.ts`.

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

| Botão | Níveis | Piso | Alivia | Custo visual | Existe em |
|---|---|---|---|---|---|
| Reflexo da água | todo quadro → a cada 2 → a cada 3 | a cada 3 | GPU e CPU | 1 | Alto+ |
| Reflexos do cenário | atualizados → congelados | congelados | GPU e CPU | 1 | Alto+ |
| Exposição automática | adaptativa → fixa | fixa | GPU e CPU | 1 | Equilibrado+ |
| Atualização das sombras | todo quadro → a cada 2 | a cada 2 | GPU e CPU | 2 | com sombras |
| Efeitos de tela | brilho → feixes → oclusão → desligados | desligados | GPU e CPU | 2 / 3 / 4 | Alto+ |
| Resolução das sombras | preset → … → 1024 px | 1024 px | GPU | 1 (8192) / 2 (4096) / 3 | com sombras > 1024 |
| Resolução interna | 100% → 90% → … | 0,7 px por px de tela | GPU | 2 / 3 / 4 | todos |

**Nunca reduzidos (piso visual):** sombras ligadas, névoa de guerra, fronteiras, unidades e
prédios, barras de vida, efeitos de combate e interface.

## 4. KGPS: como decide

A telemetria é coletada a cada quadro desenhado:
- **intervalo** entre quadros (o que o jogador sente);
- **tempo de CPU** do quadro (atualização + envio dos desenhos).

O tempo da GPU não é medido: no navegador ele quase nunca está disponível de forma confiável. Por
isso o gargalo é **estimado**, e o painel diz isso:
- se o JavaScript ocupa ≥ 70% do quadro, ou sozinho passa de 90% do orçamento → **CPU**;
- se ocupa ≤ 45% → **GPU**;
- entre os dois → **indefinido** (vale qualquer ajuste).

Ciclo (números em `KGPS_CONFIG`):

1. **Aquecimento.** Os primeiros 4 s são ignorados (compilação de shaders, envio de texturas).
2. **Janelas de ~2 s.** Para cada uma calcula p50, p95, p99, a CPU e as travadas (> 50 ms).
   Congelamentos acima de 1 s são só contados, fora dos percentis.
   - Orçamento: 16,7 ms por quadro.
   - **Lenta**: p95 > 20 ms ou mediana > 18 ms.
   - **Estável**: p95 ≤ 18,3 ms.
   - **Com folga**: p95 ≤ 13,3 ms.
3. **Reduzir.** Depois de 2 janelas lentas seguidas, escolhe o passo de **menor custo visual**
   entre os botões que aliviam o gargalo estimado. Com gargalo de CPU, a resolução nunca é tocada.
4. **Provar.** Espera 1,2 s para o renderizador assentar e mede uma janela nova. Mantém o passo se a
   mediana caiu ≥ 4% ou o p95 caiu ≥ 6%.
5. **Cadeia (sincronia vertical).** A tela arredonda cada quadro para 16,7 ou 33,3 ms. Um passo de
   26 → 22 ms não aparece na medida. Por isso:
   - um passo sem efeito visível fica **provisório** e o próximo se soma a ele (até 3);
   - a cadeia é comparada com o ponto de partida;
   - se no fim nada melhorou, **tudo é desfeito** e esses botões ficam fora por 90 s.
6. **Limite externo.** Duas cadeias seguidas sem efeito (ex.: navegador travado em 30 qps para
   economizar bateria) → pausa de 5 min, que dobra a cada repetição até 30 min. Reduzir a qualidade
   ali só pioraria a imagem.
7. **Devolver a qualidade.** A qualidade volta na ordem inversa, um passo por vez:
   - depois de 3 janelas com folga ou 8 janelas estáveis (~16 s);
   - se o passo deixar o jogo lento, volta atrás e espera 30 s, depois 60, 120… até 8 min antes de
     tentar de novo. Isso evita o "pisca-pisca".
8. **Vigia de oscilação.** Mais de 6 mudanças em 60 s → segura tudo por 60 s.
9. **Interrupções.** Redimensionar a janela, abrir o globo, trocar de cena, aba em segundo plano ou
   contexto restaurado:
   - descartam a janela atual;
   - uma avaliação em andamento vira **inconclusiva** (a mudança fica e pode ser devolvida depois).
10. **Perfil aprendido.** O ajuste confirmado é guardado no navegador (`nc.kgps.v1`, por preset,
    densidade de tela e tipo de cena, válido por 14 dias). A próxima partida começa dele, e a
    qualidade sobe sozinha se houver folga.
11. **Modo observação.** Com a opção desligada, o KGPS mede e registra o que **faria** ("Modo
    observação — faria …"), sem mudar nada.

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
  câmera de entrada da batalha. Nesses momentos nada muda e nada é medido.
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
  - âmbar: qualidade reduzida pelo KGPS;
  - cinza: só observando;
  - vermelho: bloqueado.

  Tocar no contador abre o **painel de desempenho**:
  - medidas: quadros/s, mediana, p95, p99, CPU, travadas, desenhos e triângulos por quadro, custo
    do KGPS;
  - gargalo estimado;
  - cada botão e o nível em vigor;
  - as decisões recentes, cada uma com o motivo e os números;
  - o aparelho detectado e os incidentes do KAICS.

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
- tela travada em 30 Hz: desfaz tudo e pausa;
- cena que alivia: recupera a qualidade do preset;
- sem oscilação: subidas que pesam são desfeitas com espera crescente (≤ 5 tentativas em 5 min);
- aquecimento ignorado;
- modo observação só sugere;
- desligar no meio da partida restaura;
- avaliação interrompida fica inconclusiva;
- perfil aprendido salvo e reaplicado;
- custo por quadro.

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

## 9. Fora da versão 1, e o que justificaria cada item

| Ideia do plano | Quando vale a pena |
|---|---|
| Tempo de GPU por consulta (`EXT_disjoint_timer_query`) | Se o painel mostrar muitos "gargalo indefinido" em aparelhos que têm a extensão |
| Pré-aquecimento de shaders (`renderer.compileAsync`) | Se as travadas (> 50 ms) aparecerem ao surgir unidade/efeito novo |
| Limite de efeitos e luzes dinâmicas | Mudar a quantidade de luzes recompila shaders (trava). Só com luzes pré-alocadas |
| Distância de detalhe e vegetação em tempo real | Se houver gargalo de CPU persistente em mapas grandes (hoje dependem do preset) |
| Globo do menu e globo diplomático | Têm laço próprio com limite de 60 qps. Entram se aparecerem lentos em celular |
| Previsão de carga e planejamento de várias mudanças | Só com dados reais de muitas partidas mostrando ganho sobre a regra atual |
| Telemetria agregada no servidor | Se for preciso comparar aparelhos de jogadores; exige consentimento |

## 10. Critérios de aceitação (versão 1)

| Critério | Evidência |
|---|---|
| Não muda nada sem medir | aquecimento, janelas e portões (testes) |
| Só mantém o que ajudou | testes de cadeia/30 Hz e o registro de decisões no painel |
| Respeita o jogador | nunca passa do preset; kill switch testado |
| Não oscila | teste de subidas com espera crescente; vigia de 60 s |
| Não quebra o jogo | leitura de volta, quarentena e defeito testados; build, typecheck e todos os testes passando |
| Custa pouco | custo medido no painel e no teste (< 100 µs por quadro) |
| Explica o que fez | cada decisão registrada com motivo e números |
