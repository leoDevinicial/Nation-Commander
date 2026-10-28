# KAICS Adaptables+ & KGPS v2
## Especificação de evolução do desempenho adaptativo — Nation Commander

| Campo | Valor |
|---|---|
| Documento | KAP-KGPS-SPEC |
| Versão | 2.1. Revisa a 1.0 (rascunho do autor, genérica) e a ancora no código real. A 2.1 registra o que a Onda 1 aprendeu ao ser implementada (seção 36.1). |
| Estado | **Ondas 1 e 2 implementadas** (aguardando os testes de campo F-01 a F-07). Onda 3 só com gatilho de campo. As decisões da seção 0.5 seguem o padrão definido. |
| Base atual | KGPS/KAICS v1 em produção: `src/game/perf/` e `GameRuntime.setupPerf`. Descrição em `docs/KGPS_KAICS.md`. |
| Público | Agente de implementação, desenvolvedor e o jogador que testa no aparelho. |
| Idioma | Português (Brasil). |

**Termos normativos.** O significado desses termos neste documento:
- **DEVE / NÃO DEVE:** obrigatório.
- **DEVERIA:** recomendado; o desvio exige justificativa escrita.
- **PODE:** opcional.

**Prioridades:**
- **P0:** entra na Onda 1.
- **P1:** entra na Onda 2.
- **P2:** só entra com gatilho de campo (seção 36).

### O que mudou em relação à versão 1.0

1. **Ancorada no jogo real.** A 1.0 dizia "engine a identificar". Aqui estão a engine, os arquivos, os botões que já existem e os pontos de integração.
2. **Evidência de campo incorporada.** A 1.0 não tinha números. Esta versão traz duas medições do celular do jogador: 7 qps no Ultra+ com economia de bateria e ~30 qps no mínimo.
3. **Duas lacunas críticas encontradas no v1:**
   - a meta é fixa em 60 qps em qualquer aparelho;
   - os pisos são rasos demais para sair de 7 para 30 qps.

   No preset mínimo, o KGPS v1 tem **um único** ajuste disponível (a resolução).
4. **De 20 minissistemas para 8 componentes.** Os 20 da 1.0 viraram 8 componentes reais. Nenhum se perdeu: há uma tabela de rastreabilidade (seção 23) dizendo onde cada um foi parar, em que onda entra ou por que foi adiado.
5. **Requisitos verificáveis.** Cada requisito tem ID, prioridade e forma de verificação (teste automático `T`, teste de campo `F` ou inspeção `I`).
6. **Números concretos.** Metas, janelas e limiares no lugar de "janela adequada".
7. **Contradição da 1.0 resolvida.** A 1.0 dava a "política de adaptação" ao Adaptables+ e a "decisão" ao KGPS. Aqui o KGPS é o único que decide, e o Adaptables+ fornece botões, perfis e políticas como dados (ADR-01).
8. **Entrega em três ondas**, cada uma com critérios de saída, e um protocolo de teste de campo que o jogador consegue seguir.

---

# Parte 0 — Leitura rápida

## 0.1 O problema
No celular do jogador, o jogo roda a **~7 qps no Ultra+ com economia de bateria** e a **~30 qps no preset mínimo sem economia**. O KGPS v1 não resolve nenhum dos dois casos:
- **No mínimo:** ele persegue 60 qps, e o único ajuste disponível é baixar a resolução de 100% até 70%.
  - Se isso não ajudar, ele desfaz e pausa ("limite externo").
  - Se ajudar um pouco, sacrifica nitidez para chegar a algo como 35 qps, quando 30 estáveis já seriam a meta certa.
- **No Ultra+:** mesmo com todos os botões no piso, continuam ativos:
  - modelos cinematográficos;
  - reflexo planar a cada 3 quadros;
  - 60% da densidade base de pixels (1,5 px por px CSS numa tela de densidade ≥ 2,5).

  Sair de 7 para 30 qps exige ~4,3× menos custo por quadro, e os pisos atuais não chegam perto disso.

## 0.2 A decisão
Evoluir o v1, sem reescrever. Quatro mudanças centrais:
1. **Meta por classe de aparelho:** 30 qps no celular e 60 no PC, sempre limitada pela taxa da tela.
2. **Descida rápida:** um modo de emergência que desce vários passos em segundos quando o jogo está muito abaixo da meta, com pisos próprios de emergência.
3. **Novos botões baratos de aplicar,** sem recompilar shaders:
   - reflexo "só céu";
   - resolução de emergência;
   - densidade da vegetação;
   - sombra da vegetação;
   - orçamento de efeitos.
4. **Evidência exportável:** o painel ganha "Copiar relatório", para que cada ajuste futuro venha de dados do aparelho real.

## 0.3 O que entra primeiro (Onda 1, só P0)
- Classe do aparelho.
- Salvaguardas do núcleo: níveis de emergência, portões novos, escrita externa detectada e versão gráfica no perfil aprendido.
- Meta por classe e teto pela taxa da tela.
- Limite externo explícito.
- Descida rápida.
- Botões K-01 a K-05.
- Painel v2 e relatório.
- Investigação do artefato visual E3.

## 0.4 Como saberemos que deu certo
**Testes automáticos:** os novos da Onda 1 (T-01 a T-15 e T-17) e os 19 do v1, todos passando. Fora da descida rápida, o comportamento no PC continua idêntico ao v1.

**Testes de campo:** o protocolo da seção 33 roda no celular do jogador, que envia os relatórios. O comportamento esperado:
- **No mínimo a ~30 qps:** nenhum ajuste, porque a meta 30 já foi atingida.
- **No Ultra+:** a descida rápida age em segundos e registra o antes e o depois.
- **Ao desligar a adaptação:** tudo volta ao preset.

**Metas de referência** (não bloqueiam a entrega; o relatório diz se foram atingidas):
- Ultra+ adaptado no celular com pelo menos 2× o qps do v1;
- p95 ≤ 66 ms após a descida.

## 0.5 Decisões do dono do produto
O padrão recomendado vale até o dono do produto decidir outra coisa.

| # | Decisão | Padrão recomendado |
|---|---|---|
| D1 | Meta padrão no celular | **30 qps.** O jogador pode escolher 60 nas configurações (P1). |
| D2 | A descida rápida pode ir abaixo dos pisos normais? | **Sim, só em emergência:** no celular, resolução até 0,7 px por px CSS (o mesmo piso absoluto do preset mínimo), reflexo só céu, vegetação em 50% e efeitos em 40%. No PC, os únicos níveis extras são o reflexo só céu e os efeitos em 40%. |
| D3 | Desligar sombras em tempo real | **Não.** Recompila shaders e trava. Vai para o consultor da próxima partida (C6). |
| D4 | O relatório inclui o nome da GPU | **Sim**, mas só quando o jogador copia. Nunca é enviado automaticamente. |
| D5 | Ultra+ no celular | **Permitido**, com aviso específico que usa a última medição real naquele aparelho (R-ADV-02). |

---

# Parte I — Onde estamos

## 1. Plataforma real

| Item | Nation Commander |
|---|---|
| Execução | Navegador (desktop e celular), cliente em TypeScript |
| Renderização | three.js 0.186, `WebGLRenderer` (WebGL 2), um renderizador por cena tática (teatro ou batalha local) |
| Laço | `GameRuntime.frame` via `requestAnimationFrame`. O KGPS mede dentro dele, sem laço próprio. |
| Interface | HTML/React por cima do canvas. Baixar a resolução 3D não borra o HUD. |
| Simulação | No servidor (autoritativa). O cliente só desenha: o custo do cliente é renderização + JavaScript do quadro + HUD. |
| Presets | `src/lib/graphics.ts`: Mobile/Baixo, Equilibrado, Alto, Ultra, Ultra+. Valem a partir da próxima partida. |
| Medição disponível | Intervalo entre quadros; tempo de CPU do quadro; `renderer.info` (desenhos, triângulos, geometrias, texturas). Tempo de GPU **não** medido no v1. |

## 2. Presets (valores atuais)

| Preset | Densidade máx. | Sombras | Efeitos máx. | Oclusão | Água | Exposição adapt. | Luzes dinâmicas | Sonda de ambiente | Ultra | Cinematográfico |
|---|---|---|---|---|---|---|---|---|---|---|
| Mobile/Baixo | 1 | — | 60 | — | céu | — | 0 | — | — | — |
| Equilibrado | 1,25 | 1024 | 120 | — | planar | sim | 2 | — | — | — |
| Alto | 2 | 2048 | 160 | sim | planar | sim | 4 | sim | — | — |
| Ultra | 2 | 4096 | 220 | sim | planar | sim | 6 | sim | sim | — |
| Ultra+ | 2,5 | 8192 | 300 | sim | planar | sim | 8 | sim | sim | sim |

- A escolha inicial (`detectPreset`) leva toque com tela curta, ou ≤ 4 GB / ≤ 4 núcleos, para Mobile/Baixo.
- O Ultra+ já pede confirmação ao ser escolhido (`HEAVY_PRESETS`), mas o aviso é o mesmo em qualquer aparelho.

## 3. KGPS v1 como está (`src/game/perf/kgps.ts`, `stats.ts`)
- **Meta e orçamento:** 60 qps fixos (`targetFps: 60`), orçamento de 16,7 ms.
- **Medição:**
  - aquecimento de 4 s;
  - janelas de 2 s com p50, p95, p99, CPU, travadas (> 50 ms) e congelamentos (> 1 s, fora dos percentis).
- **Classificação da janela:**
  - lenta: p95 > 1,2× o orçamento ou p50 > 1,08×;
  - estável: p95 ≤ 1,1×;
  - folga: p95 ≤ 0,8×.
- **Gargalo estimado** pela fração de CPU do quadro:
  - CPU se ≥ 70%;
  - GPU se ≤ 45%;
  - indefinido entre os dois.
- **Redução:** depois de 2 janelas lentas, um passo de menor custo visual; espera 1,2 s e prova. Mantém se o p50 cair ≥ 4% ou o p95 cair ≥ 6%.
- **Cadeia sob sincronia vertical:** até 3 passos provisórios. Se nada melhorou, tudo é desfeito e os botões ficam de fora por 90 s.
- **Limite externo:** duas cadeias inúteis seguidas geram uma pausa de 5 min, que dobra a cada repetição até 30 min.
- **Recuperação:** ordem inversa, depois de 3 janelas com folga ou 8 estáveis. Uma subida que pesa é desfeita, com espera crescente de 30 s até 8 min.
- **Vigia de oscilação:** mais de 6 mudanças em 60 s → pausa de 60 s.
- **Perfil aprendido:** `nc.kgps.v1`, por preset, densidade de tela e cena, válido por 14 dias.
- **Modo observação:** com a opção desligada, só sugere.
- **Custo medido:** ~5 µs por quadro.

## 4. KAICS v1 como está (`src/game/perf/kaics.ts`)
- **Capacidades** (só leitura):
  - WebGL 2;
  - textura máxima;
  - extensão de tempo de GPU (só a presença);
  - nome da GPU;
  - densidade de tela, núcleos, memória e toque.
- **Registro de botão:** níveis coerentes, piso < nível base, e o estado lido deve bater com o declarado. Se não bater, o botão fica em quarentena.
- **Mudança transacional:** aplica → lê de volta → restaura se não bater. Se a restauração também falhar, o botão fica com defeito.
- **Portões:** contexto perdido, cena oculta, aba em segundo plano, câmera de entrada.
- **Veredito:** adaptativo, só observando ou bloqueado.
- **Kill switch:** devolve todos os botões ao nível base.

## 5. Botões v1 e pisos

| Botão (id) | Níveis (barato → caro) | Piso | Existe a partir de |
|---|---|---|---|
| `reflections` | a cada 3 → a cada 2 → todo quadro | a cada 3 | Equilibrado |
| `probe` | congelados → atualizados | congelados | Alto |
| `exposure` | fixa → adaptativa | fixa | Equilibrado |
| `shadowRate` | a cada 2 → todo quadro | a cada 2 | Equilibrado |
| `postfx` | desligados → oclusão → + feixes → + brilho | desligados | Alto |
| `shadowRes` | 1024 → … → preset | 1024 px | Alto |
| `resolution` | 60% → … → 100% da densidade base | ≥ 0,7 px por px CSS | todos |

**Consequência:** no Mobile/Baixo só existe `resolution`, porque não há sombras, oclusão, sonda nem água planar. Com densidade base 1, o botão tem só quatro níveis: 70%, 80%, 90% e 100%.

## 6. O que é fixo na partida e o que dá para ajustar em tempo real

| Recurso | Em tempo real? | Por quê |
|---|---|---|
| Resolução interna | Sim | `setPixelRatio`, conferida no buffer do canvas |
| Reflexo planar: frequência | Sim | Intervalo do `Reflector` |
| Reflexo planar → só céu | **Sim (novo)** | Uniforme `uPlanar` + pular a passada; não recompila |
| Resolução e frequência das sombras | Sim | O mapa é recriado no próximo desenho |
| Sombras ligadas/desligadas | **Não** | `shadowMap.enabled` entra no programa do shader: recompila tudo e trava |
| Sombra projetada pela vegetação | **Sim (novo)** | `castShadow` da malha só afeta o passe de sombra |
| Densidade da vegetação/decoração | **Sim (novo)** | `InstancedMesh.count` |
| Orçamento de efeitos e tipo de fumaça | **Sim (novo)** | Limite em `Effects`; os efeitos em curso terminam como estão |
| Quantidade de luzes dinâmicas | **Não** | Mudar a contagem recompila; zerar a intensidade não reduz custo |
| Modelos cinematográficos / Ultra | **Não** | Geometria construída na cena (`setModelDetail`) |
| Ondas da água (Ultra) | Talvez (P1) | Exige alternar geometria pré-criada; a medir |
| Efeitos de tela, sonda, exposição | Sim | Já são botões do v1 |

**Regra (ADR-03):** o que não for ajustável em tempo real vai para o consultor (C6). Ele recomenda para a próxima partida e nunca troca sozinho.

## 7. Evidência de campo

| ID | Situação | Medida | Fonte |
|---|---|---|---|
| E1 | Celular do jogador (modelo não informado), Ultra+, economia de bateria **ligada**, Sandbox, início da partida, câmera sobre a capital | ~7 qps | Print do jogo |
| E2 | Mesmo celular, Mobile/Baixo, economia de bateria **desligada** (cena não informada) | ~30 qps | Relato do jogador |
| E3 | Print de E1: grandes áreas azul-escuras perto da fronteira e manchas alaranjadas e arroxeadas no centro do território | Artefato visual. **Causa confirmada e corrigida na Onda 1** (seção 36.1): não era a GPU do celular | Print do jogo; reproduzido no PC |

**O que E1 e E2 provam:**
- A distância entre os extremos é de ~4,3× em qps. Ela mistura preset e economia de bateria; ainda falta isolar cada fator (protocolo F-01 a F-04).
- No mínimo, os recursos pesados já estão desligados. Os 30 qps vêm de outro lugar, provavelmente de um destes:
  - densidade de pixels;
  - número de desenhos;
  - JavaScript do quadro;
  - HUD.

  O relatório (R-EVD-02) existe para responder isso.
- O KGPS v1 trata os ~30 qps do mínimo como "lento" (meta 60). Ele pode baixar a resolução até 70% em busca de 60. Se não houver ganho, desfaz e pausa; se houver um pouco, perde nitidez sem necessidade, porque 30 qps estáveis já seriam a meta certa no celular.

**O que E1 e E2 não provam:** o gargalo exato. Não há medição de GPU nem relatório dessas sessões.

## 8. Lacunas

| ID | Lacuna | Consequência | Fecha em |
|---|---|---|---|
| G1 | Meta fixa de 60 qps | No celular a 30 qps estáveis, o KGPS age à toa | C3 (O1) |
| G2 | Pisos rasos e só passo a passo | De 7 qps, cada passo leva ~4–6 s e o piso fica longe de 30 | C4 + C5 (O1) |
| G3 | Sem botões de cena (vegetação, efeitos) | Gargalos de desenho e preenchimento sem alavanca | C5 (O1) |
| G4 | Recursos fixos na partida sem caminho de saída | Ultra+ pesado demais fica assim a partida inteira | C6 (O2) |
| G5 | Limite externo só implícito (pausa) | O painel não diz "economia de bateria/navegador provável" | C3 (O1) |
| G6 | Sem tempo de GPU, mesmo quando disponível | Gargalo sempre estimado | C2 (O2) |
| G7 | Painel não exportável | Impossível ajustar com dados reais do aparelho | C8 (O1) |
| G8 | Artefato visual E3 no celular | Imagem errada; era bug de camada (tom do território fora da névoa), em qualquer aparelho | C7 (O1) — **fechada** |
| G9 | Travadas na primeira explosão ou unidade nova (compilação de shader) | Hitches no início das batalhas | C7 (O2) |
| G10 | Perfil aprendido não sabe que o visual do jogo mudou | Pode reaplicar ajustes antigos depois de um update gráfico | C8 (O1) |

---

# Parte II — Arquitetura alvo

## 9. Princípios
1. **Evoluir o v1, não reescrever.** O que funciona e é testado fica.
2. **Medir antes de mexer; manter só o que provou ajudar.** Vale do v1 e continua valendo.
3. **Um escritor por parâmetro.** Só o KAICS escreve nos botões, e só a pedido do KGPS.
4. **Meta por classe de aparelho.** O que é "lento" depende do aparelho e da tela.
5. **Tempo real só para o que não recompila.** O resto vai para o consultor.
6. **Descer rápido quando o jogo está muito mal; subir devagar e com prova.**
7. **O jogo continua dono do jogo.** Não se mexe em:
   - regras e simulação;
   - névoa de guerra e fronteiras;
   - seleção, barras de vida e efeitos de combate essenciais;
   - interface.
8. **Honestidade:** "Ultra+ · adaptado" sempre que algo estiver abaixo do preset. Métricas excluídas de percentis continuam no relatório.
9. **Preferência do jogador manda:** o KGPS nunca passa do preset, e desligar a adaptação devolve tudo na hora.
10. **Custo do próprio sistema** abaixo de 50 µs por quadro em média.

## 10. Papéis e autoridade

| Papel | Quem | Faz | Não faz |
|---|---|---|---|
| Executor | Jogo (`GameRuntime`, camadas de render) | Aplica o estado e mantém o real | Decidir adaptação |
| Compatibilidade e transação | **KAICS** | Capacidades, registro e validação de botões, portões, transação, kill switch | Decidir quando reduzir |
| Suíte de capacidades | **KAICS Adaptables+** (C1–C8) | Fornece botões (adaptadores), perfil do aparelho, política por classe (como dados), consultor e evidência | Decidir, escrever fora do KAICS |
| Decisor | **KGPS** | Mede, diagnostica, escolhe, prova, recupera, entra e sai da descida rápida | Escrever direto no renderizador |
| Testemunha | Painel + relatório (C8) | Mostra e exporta o que foi medido e decidido | Alterar estado |

**ADR-01:** o KGPS é o único decisor.

## 11. Fluxo

```text
GameRuntime.frame (rAF)
  └─ desenha o quadro, mede intervalo e CPU
      └─ perfFrame ── portões do KAICS (contexto, cena, aba, câmera de entrada, carregando*, compilando*)
            └─ KGPS.sample ── janela de 2 s ──► fecha a janela
                  ├─ classifica: lenta / estável / folga / crítica* / travada em 30 Hz*
                  ├─ normal: 1 passo → KAICS.set (aplica, lê de volta) → assenta 1,2 s → prova
                  ├─ crítica*: descida rápida (vários passos, pisos de emergência) → prova final
                  └─ folga: sobe 1 passo na ordem inversa → prova → mantém ou desfaz com espera
Painel / relatório ◄── janelas, botões, decisões (com natureza da evidência), incidentes
Consultor* ◄── resumo da sessão (fim da partida) → recomendação para a próxima
(* = novo na v2)
```

## 12. Máquinas de estado

**KGPS v2**

| Estado | Entra quando | Sai quando |
|---|---|---|
| `warmup` | Início da cena; prolongado enquanto `compilando` | 4 s + fim do pré-aquecimento |
| `observing` | Padrão | Janela crítica (→ `emergency`), 2 lentas (→ `evaluating`), folga (→ `evaluating` de subida) |
| `evaluating` | Um passo aplicado | Janela de prova: mantém, soma à cadeia ou desfaz |
| `emergency` (novo) | 2 janelas com p50 > 1,8× o orçamento, sem limite externo | p50 ≤ 1,15× ou fim dos passos → prova final |
| `stabilizing` (novo) | Fim de uma emergência com ganho | 10 s sem subidas |
| `externalCap` (novo) | Travado em ~33,3 ms com CPU baixa e reduções inúteis | O padrão do quadro muda (p50 sai da faixa por 3 janelas) |
| `frozen` | Vigia de oscilação ou limite externo do v1 | Fim do prazo |

**Botão:** `ok`, `quarantined`, `faulted` (já no v1). Cada nível ainda é marcado `normal` ou `emergência` (R-CORE-04).

**Capacidade:** `observada` (lida do navegador ou da GPU), `inferida` (deduzida de padrão) ou `indisponível`. A 1.0 tinha seis estados; três bastam para o que este jogo consegue saber, e cada valor guarda a fonte.

---

# Parte III — Componentes do Adaptables+

## 13. Visão geral

| Comp. | Nome | Resumo | Onda |
|---|---|---|---|
| C1 | Núcleo de coordenação | Escritor único, adaptadores com ciclo de vida, portões novos, isolamento de falha | O1 |
| C2 | Perfil do aparelho | Classe (celular, PC, software), taxa da tela, tempo de GPU quando houver, revalidação | O1 / O2 |
| C3 | Metas e cadência | Meta por classe, orçamento, teto pela tela, limite externo, tendência sustentada | O1 / O2 |
| C4 | Descida rápida, recuperação e reversão | Emergência, prova final, estabilização, ordem de recuperação | O1 |
| C5 | Adaptadores de custo | Botões novos K-01 a K-09 | O1 / O2 |
| C6 | Consultor de preset | Recomendações para a próxima partida e aviso por aparelho | O2 |
| C7 | Guardião de shaders, precisão e memória | Investigação do E3, pré-aquecimento, bloqueio por evidência, tendência de memória | O1 / O2 / O3 |
| C8 | Evidência, painel e relatório | Painel v2, copiar relatório, natureza da evidência, versão gráfica | O1 / O2 |

## 14. C1 — Núcleo de coordenação
**Já existe:** registro com quarentena, transação, portões, veredito e kill switch (KAICS v1).

| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-CORE-01 | Todo parâmetro adaptável DEVE mudar só via `kaics.set`. Nenhum adaptador escreve por fora. | P0 | I + T-10 |
| R-CORE-02 | Adaptadores DEVEM ter `attach()` e `detach()` idempotentes. O `detach` é chamado no descarte da cena; um `attach` repetido não duplica nada. | P0 | T-09 |
| R-CORE-03 | A cada janela, o KAICS DEVE comparar o nível lido com o último aplicado. Se divergir, registra o incidente "alterado fora do KAICS", e o KGPS adota o nível lido em vez de brigar. | P0 | T-10 |
| R-CORE-04 | Cada nível de botão DEVE ser `normal` ou `emergência`. Níveis de emergência só podem ser usados no estado `emergency`. | P0 | T-08 |
| R-CORE-05 | Uma exceção em `apply` ou `read` de um adaptador DEVE pôr só aquele botão em quarentena, sem interromper o quadro. | P0 | T-09 |
| R-CORE-06 | Novos portões `loading` (montagem e troca de cena) e `compiling` (pré-aquecimento): nada se mede e nada se muda enquanto ativos. | P0 | T-08 |

**Fora:** um "orquestrador" separado do KAICS. O registro de botões já cumpre essa função (rastreio do Core Orchestrator e do Conflict Resolver da 1.0).

## 15. C2 — Perfil do aparelho
**Já existe:** `probeCapabilities` e `detectPreset`.

| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-DEV-01 | A classe DEVE ser derivada de evidência, com fonte registrada. **Software:** nome do renderizador contém SwiftShader, llvmpipe ou Software. **Celular:** ponteiro grosso + toque + lado curto < 820 px CSS. **PC:** o resto. Nunca por marca ou modelo comercial. | P0 | T-12 |
| R-DEV-02 | A taxa da tela DEVE ser estimada pelos quadros mais rápidos de cada janela (p10 dos intervalos), reconhecendo 60, 90, 120 ou 144 Hz (tolerância de 7% do período). A maior taxa já evidenciada é o teto da meta (`inferida`). Quadros presos em 33,3 ms **não** DEVEM virar estimativa de 30 Hz: numa tela de 60 Hz, uma carga entre 17 e 33 ms produz o mesmo padrão. Esse caso é tratado pelo limite externo (R-TGT-04). | P0 | T-13 |
| R-DEV-03 | Com `EXT_disjoint_timer_query_webgl2`, o tempo de GPU DEVERIA ser amostrado (1 a cada 10 quadros, descartando resultados disjuntos) e usado no diagnóstico como `medido`. | P1 | T (simulado) + F |
| R-DEV-04 | Contexto restaurado, redimensionamento e mudança de densidade (troca de monitor) DEVEM invalidar a densidade base, a taxa da tela e a janela atual. | P1 | T |
| R-DEV-05 | `renderer.info.memory` (geometrias e texturas) PODE alimentar um indício de vazamento: crescimento contínuo por 10 min sem troca de cena vira incidente. | P2 | T |

**Fora:**
- benchmark pesado na abertura;
- detectar a economia de bateria diretamente. Não há API confiável no navegador; ela só aparece de forma inferida por R-TGT-04.

## 16. C3 — Metas e cadência
| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-TGT-01 | Meta padrão por classe: **celular 30**, **PC 60**, **software 30**. Na classe software, as reduções continuam permitidas e o painel avisa "renderização por software: aceleração gráfica desativada ou indisponível". Na Onda 2, o jogador pode escolher Automática, 30 ou 60. | P0 (P1 na interface) | T-01 |
| R-TGT-02 | O orçamento DEVE derivar da meta (33,3 ms ou 16,7 ms). Todos os limiares do v1 passam a usar esse orçamento. | P0 | T-01 |
| R-TGT-03 | A meta NÃO DEVE passar da taxa estimada da tela. | P0 | T-02 |
| R-TGT-04 | **Limite externo explícito.** Condição: ≥ 80% dos intervalos em 33,3 ± 1,5 ms, CPU ≤ 45% do quadro e uma cadeia sem efeito. Efeitos: estado `externalCap` e texto "limite de 30 qps do navegador ou sistema (ex.: economia de bateria) provável". Nada é reduzido enquanto durar. Com meta 30, conta como meta atingida. | P0 | T-03 |
| R-TGT-05 | Travadas (> 50 ms) e congelamentos (> 1 s) DEVEM ser contados por janela e aparecer no relatório, mesmo fora dos percentis. | P0 | T-14 |
| R-TGT-06 | **Degradação sustentada (indício térmico).** Com os mesmos níveis de botões, p50 subindo ≥ 15% ao longo de 5 min → bloqueia subidas por 5 min e registra "possível aquecimento (indício, não medido)". | P1 | T-16 |

## 17. C4 — Descida rápida, recuperação e reversão
**Já existe:** prova por passo, cadeia, recuperação com espera crescente e kill switch.

| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-EMG-01 | **Gatilho:** 2 janelas seguidas com p50 > 1,8× o orçamento e sem `externalCap`. Equivale a menos de ~17 qps com meta 30 e a menos de ~33 qps com meta 60. | P0 | T-04 |
| R-EMG-02 | **Ação:** um passo a cada ~1,7 s (assentamento de 1,2 s + mini-janela de 0,5 s), sem esperar duas janelas, na ordem da classe (seção 22), incluindo níveis de emergência. Para quando o p50 ficar ≤ 1,15× o orçamento ou os passos acabarem. | P0 | T-04 |
| R-EMG-03 | **Prova final:** uma janela completa contra o início. Se o p50 caiu menos de 15%, tudo é desfeito e registrado como "limite não gráfico ou externo". | P0 | T-05 |
| R-EMG-04 | **Saída:** `stabilizing` por 10 s; depois, recuperação normal do v1 (histerese e espera crescente). | P0 | T-06 |
| R-EMG-05 | Cada passo é uma transação do KAICS. Uma falha pula para o passo seguinte e bane o botão por 90 s. | P0 | T-04 |
| R-EMG-06 | No máximo uma descida rápida a cada 3 min, salvo nova queda com p50 > 2,5× o orçamento. | P0 | T-07 |
| R-RST-01 | Depois de uma emergência, a recuperação devolve primeiro os níveis de emergência (o que mais enfeia), depois os normais. | P0 | T-06 |
| R-RB-01 | Desligar a adaptação DEVE restaurar o nível base de todos os botões, incluindo os de emergência, na hora. | P0 | T-11 |

## 18. C5 — Adaptadores de custo
**Os botões v1 continuam:** `probe`, `exposure`, `shadowRate`, `postfx`, `shadowRes`.

| Botão | Níveis novos | Piso normal → emergência | Recompila? | Alivia | Custo visual | Onda |
|---|---|---|---|---|---|---|
| K-01 `reflections` | + nível 0 **só céu** (uniforme `uPlanar=0`, sem passada) | a cada 3 → só céu | Não | GPU + CPU (desenhos em dobro) | 2 | O1 |
| K-02 `resolution` | + níveis abaixo de 60% (só celular) | 60% da densidade base (≥ 0,7 px) → **0,7 px por px CSS** no celular; no PC não há nível extra | Não | GPU (preenchimento) | 4 (emergência) | O1 |
| K-03 `vegetation` | 100% → 75% → 50% das instâncias. Subconjunto fixo por hash, sem piscar. | 75% → 50% (só no celular) | Não | GPU + CPU (vértices, passe de sombra) | 2 / 3 | O1 |
| K-04 `vegShadow` | Árvores e rochas projetam sombra ↔ não | Desligado (já no piso normal) | Não | Passe de sombra | 2 | O1 |
| K-05 `effects` | Orçamento 100% → 70% → 40% de `maxEffects`; fumaça cinematográfica → volumétrica → básica nos efeitos novos | 70% → 40% | Não | GPU (preenchimento) + CPU | 2 / 3 | O1 |
| K-06 `trails` | Rastros do ar e marcas de esteira: 100% → 50% | 50% | Não | CPU + preenchimento | 1 | O2 |
| K-07 `clouds` | Sombras de nuvens (Ultra+): ligadas ↔ desligadas | desligadas | Não | GPU (a medir; pode ser descartado) | 1 | O2 |
| K-08 `farAnim` | Animação de unidades longe da câmera a cada 2 quadros | — | Não | CPU | 1 | O2 |
| K-09 `waves` | Ondas da água (Ultra): malha de ondas ↔ plano simples | plano | Não | GPU (vértices) | 2 | O2 |

| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-ADP-01 | Cada botão novo DEVE declarar níveis, nível base, piso normal, piso de emergência, gargalos que alivia, custo visual por passo e leitura do estado real. | P0 | T-08 |
| R-ADP-02 | K-03 DEVE usar um subconjunto determinístico: as mesmas instâncias somem sempre e nenhuma volta e some em sequência. | P0 | T-17 |
| R-ADP-03 | Nenhum botão novo pode mexer em unidades, prédios, névoa, fronteiras, seleção, barras de vida ou interface. | P0 | I |
| R-ADP-04 | O ganho de cada botão DEVERIA ser medido em campo (relatório antes/depois). Botão sem ganho mensurável em dois aparelhos sai do catálogo. | P1 | F |

**Fora** (não são botões; vão para o consultor C6):
- modelos cinematográficos;
- quantidade de luzes dinâmicas;
- sombras ligadas/desligadas;
- antialiasing;
- subdivisão do terreno.

## 19. C6 — Consultor de preset (próxima partida)
| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-ADV-01 | **Recomendação ao fim da partida** (ou ao sair para o menu). Gatilho: mais de 60% do tempo abaixo da meta ou no piso de emergência. Recomenda um degrau abaixo, ou o preset mais alto que já manteve a meta neste aparelho, com motivo e números. Nunca troca sozinho. | P1 | T + I |
| R-ADV-02 | **Aviso por aparelho:** ao escolher Ultra/Ultra+ num aparelho da classe celular, o aviso usa a última medição real daquele preset, se houver (ex.: "ficou em ~7 qps neste aparelho"). | P1 | I |
| R-ADV-03 | "Ultra+ Móvel" (aparência Ultra+ com modelos Ultra e sombras 4096) PODE existir só como preset **rotulado à parte**, com as diferenças listadas. Nunca como "Ultra+" silencioso. Depende de decisão. | P2 | I |

## 20. C7 — Guardião de shaders, precisão e memória
| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-SHD-01 | **Investigar o E3:** reproduzir por preset e pelos botões do painel (efeitos de tela, reflexo, nuvens), isolar o recurso e corrigir. Se depender da GPU, registrar a incompatibilidade com evidência (print e relatório). | P0 | F + I |
| R-SHD-02 | **Pré-aquecimento** com `renderer.compileAsync(scene, camera)` durante a câmera de entrada no Alto+, sob o portão `compiling`. Medir as travadas > 50 ms nos primeiros 60 s, antes e depois. | P1 | F |
| R-SHD-03 | **Bloqueio por evidência:** um recurso com defeito visual comprovado numa família de GPU PODE ser marcado incompatível (lista explícita com motivo e data). Nunca por suposição. | P1 | T + I |
| R-MEM-01 | Depois do descarte de uma cena, geometrias e texturas (`renderer.info.memory`) DEVERIAM voltar perto da linha de base. Divergência vira incidente. | P2 | T/F |

**Adiado** (gatilho na seção 36): gerenciador de residência de texturas e ativos. As texturas são procedurais e há poucos ativos externos (Nature Kit).

## 21. C8 — Evidência, painel e relatório
**Já existe:** painel com medidas, gargalo, botões, decisões e incidentes.

| ID | Requisito | Prio. | Verif. |
|---|---|---|---|
| R-EVD-01 | **O painel mostra:** classe do aparelho e fonte; meta e origem (automática/jogador/tela); estado (incluindo emergência e limite externo); índice de fidelidade (seção 28); passos de emergência ativos. | P0 | I |
| R-EVD-02 | **Botão "Copiar relatório":** JSON de até 20 KB no formato da seção 31. O jogador vê o conteúdo antes de copiar. | P0 | T-14 |
| R-EVD-03 | Cada decisão DEVE dizer a natureza da evidência: `medido` (janelas), `estimado` (gargalo pela fração de CPU) ou `hipótese` (limite externo, aquecimento). | P0 | T-14 |
| R-EVD-04 | **Versão gráfica.** A constante `GRAPHICS_REVISION` entra na chave do perfil aprendido, junto com classe e meta. Quando muda (update visual), os perfis antigos são descartados. | P0 | T-15 |
| R-EVD-05 | Eventos extraordinários DEVEM ser marcados no registro: troca de cena, contexto perdido/restaurado, aba oculta, congelamento, pré-aquecimento. | P1 | T |

## 22. Ordem de sacrifício por classe
Ordem usada pela descida rápida e, entre empates, pelo modo normal: menor custo visual por ganho esperado primeiro. É uma estimativa inicial, revisada pelos relatórios de campo (R-ADP-04).

**Celular** (fim do trajeto = estado de emergência máximo):
1. exposição fixa;
2. sonda congelada;
3. sombras a cada 2 quadros;
4. reflexo a cada 3 quadros;
5. efeitos de tela desligados;
6. reflexo só céu;
7. sombras em 1024 px;
8. vegetação sem sombra;
9. efeitos em 70%;
10. vegetação em 75%;
11. resolução até 60%;
12. efeitos em 40%;
13. vegetação em 50%;
14. resolução até 0,7 px por px CSS.

**PC:** mesma ordem até o passo 11, incluindo o reflexo só céu (passo 6). Depois disso, só o passo 12 (efeitos em 40%):
- a resolução fica no piso normal (sem nível extra);
- a vegetação para em 75%.

O consultor (C6) cuida do resto.

## 23. Rastreabilidade dos 20 minissistemas da versão 1.0

| # | Minissistema (1.0) | Destino na v2 | Onda | No código hoje |
|---|---|---|---|---|
| 1 | Core Orchestrator | C1 (registro do KAICS + adaptadores) | O1 | Parcial |
| 2 | Adaptive Capability Profiler | C2 | O1/O2 | Parcial (`probeCapabilities`) |
| 3 | Runtime Lifecycle Guardian | C1 (portões, `detach`) + R-DEV-04 | O1 | Parcial (`invalidate`, portões, `cleanup`) |
| 4 | Mobile Compatibility Intelligence | C2 (classe) + C3 (meta 30) | O1 | Não existe |
| 5 | Frame Pacing Intelligence Adapter | C3 | O1 | Parcial (percentis, travadas, cadeia) |
| 6 | Dynamic Resolution Compatibility Adapter | C5 K-02 | O1 | Existe; ganha piso de emergência |
| 7 | Graphics Fidelity Preservation Manager | C5 (custo visual) + índice de fidelidade (seção 28) | O1 | Parcial (`stepCost`) |
| 8 | Shader and Pipeline Guardian | C7 | O1/O2 | Não existe |
| 9 | Texture and Asset Residency Manager | Adiado (seção 36) | O3 | — |
| 10 | Memory Pressure Guardian | C2/C7 (indício por `renderer.info`) | O3 | — |
| 11 | Thermal and Sustained Performance Guardian | C3 R-TGT-06 (tendência, não temperatura) | O2 | — |
| 12 | Scene Complexity and LOD Adapter | C5 K-03, K-04, K-08 | O1/O2 | — |
| 13 | Graphics Resource Budget Manager | C3 (orçamento pela meta) + C5 (ganho por botão) | O1 | Parcial |
| 14 | Adaptation Conflict Resolver | C1 (escritor único + escrita externa) | O1 | Parcial |
| 15 | Quality Restoration Manager | C4 | O1 | Existe; ganha a ordem pós-emergência |
| 16 | Safe Rollback and Recovery Manager | C4 + transação do KAICS | O1 | Existe |
| 17 | Compatibility Regression Watcher | C8 R-EVD-04 + testes de contrato dos botões | O1 | — |
| 18 | Session and Metrics Integrity Guardian | C8 (chave do perfil, invalidação por cena) | O1/O2 | Parcial |
| 19 | Performance Diagnostics and Evidence Recorder | C8 | O1 | Parcial (painel) |
| 20 | PC Scaling and Capability Utilization Adapter | C3 (meta PC; nunca passa do preset) | O1 | Parcial |

---

# Parte IV — Políticas

## 24. Metas por classe

| Classe | Meta padrão | Teto | Observação |
|---|---|---|---|
| Celular | 30 qps (33,3 ms) | Taxa da tela | Com 60 escolhido pelo jogador, valem as regras do PC, mas com os pisos do celular |
| PC | 60 qps (16,7 ms) | Taxa da tela | Telas acima de 60 Hz usam a folga do v1. Metas acima de 60 ficam fora (P2). |
| Software | 30 qps | — | Reduções permitidas (a resolução ajuda muito sem placa de vídeo), com aviso de aceleração gráfica desativada no painel |

## 25. Limiares e janelas (configuração v2)

| Parâmetro | v1 | v2 |
|---|---|---|
| `targetFps` | 60 fixo | Por classe, ≤ taxa da tela |
| `warmupMs` | 4000 | 4000, estendido enquanto `compiling` |
| `windowMs` / `minSamples` | 2000 / 20 (estende até 6 s com ≥ 5 amostras) | Igual |
| Lenta / estável / folga | p95 > 1,2× ou p50 > 1,08× / p95 ≤ 1,1× / p95 ≤ 0,8× | Igual, sobre o orçamento da meta (com meta 30: lenta = p95 > 40 ms) |
| `emergencyP50` | — | 1,8× o orçamento, 2 janelas |
| `emergencyExitP50` | — | 1,15× |
| `emergencyMinGain` | — | p50 −15% |
| `emergencyCooldownMs` | — | 180 000 (salvo p50 > 2,5×) |
| `stabilizeMs` | — | 10 000 |
| `externalCap` | Implícito (2 cadeias inúteis) | ≥ 80% dos intervalos em 33,3 ± 1,5 ms + CPU ≤ 45% + 1 cadeia inútil |
| `sustainedRise` | — | +15% no p50 em 300 s, sem mudança de botões |

## 26. Descida rápida (algoritmo)
1. Duas janelas críticas (p50 > 1,8×) e nenhum `externalCap` → estado `emergency`; registra o ponto de partida.
2. Pega o próximo passo da ordem da classe (seção 22) que alivie o gargalo estimado; se o gargalo for indefinido, vale qualquer passo.
3. Aplica pelo KAICS:
   - se falhar, pula e bane o botão por 90 s;
   - se der certo, espera 1,2 s e mede uma mini-janela de 0,5 s, só para decidir se para.
4. Para quando a mini-janela mostrar p50 ≤ 1,15× ou acabarem os passos.
5. **Prova final:** uma janela completa contra o ponto de partida.
   - Se o p50 caiu ≥ 15% → mantém todos os passos e vai para `stabilizing`.
   - Se não → desfaz tudo na ordem inversa, registra "limite não gráfico/externo" e respeita o tempo de espera.

## 27. Recuperação e histerese
- **Ordem:** inversa à da redução. Depois de uma emergência, devolve primeiro os níveis de emergência (R-RST-01).
- **Quando sobe um passo:** depois de 3 janelas com folga ou 8 estáveis, com prova. Se a subida pesar, volta e espera 30 s, 60 s, 120 s… até 8 min (v1).
- **Vigia de oscilação do v1 mantido:** mais de 6 mudanças em 60 s → pausa de 60 s. A descida rápida conta como **uma** mudança no vigia.

## 28. Ultra+ Adaptive Fidelity
Seis camadas, sempre separadas no código e no painel:
1. **Preset desejado** pelo jogador.
2. **Parâmetros de construção** do preset: fixos na partida.
3. **Ajustes em tempo real** do KGPS: níveis dos botões.
4. **Capacidades validadas** pelo KAICS.
5. **Estado efetivo:** lido do renderizador.
6. **Resultado medido:** janelas.

**Rótulo:** com qualquer botão abaixo do nível base, o painel e a barra mostram "**<preset> · adaptado**".

**Índice de fidelidade (IFA):**

`IFA = 1 − Σ custo visual dos passos aplicados ÷ Σ custo visual de todos os passos até o piso de emergência`

Ele é exibido como "Qualidade adaptada: 72% (estimativa relativa aos ajustes disponíveis; não é medida de imagem)". **NÃO DEVE** ser apresentado como equivalência visual ao preset.

## 29. Precedência de configurações
1. **Segurança e compatibilidade (KAICS):** quarentena, defeito, portões.
2. **Escolhas explícitas do jogador:** preset, qualidade adaptativa ligada/desligada, meta (O2).
3. **Limites do jogo:** pisos normais e de emergência, e o que nunca é reduzido (princípio 7).
4. **Ajustes temporários do KGPS.**

---

# Parte V — Contratos

## 30. Tipos (TypeScript, extensão do v1)
```ts
// kaics.ts — KnobSpec v2 (os campos novos são opcionais: botões v1 continuam válidos)
export interface KnobSpec {
  id: string;
  label: string;
  levels: readonly string[];          // do mais barato (0) ao mais caro
  baseline: number;                   // nível do preset (teto)
  floor: number;                      // piso normal
  emergencyFloor?: number;            // piso de emergência (≤ floor); ausente = floor
  helps: readonly ('gpu' | 'cpu')[];
  stepCost: (from: number) => number; // custo visual 1..5 de descer de `from` para `from - 1`
  apply: (level: number) => void;
  read: () => number;                 // nível em vigor lido do renderizador (-1 = inválido)
  attach?: () => void;                // idempotente (R-CORE-02)
  detach?: () => void;
}

export type DeviceClass = 'mobile' | 'pc' | 'software';
export interface Observed<T> { value: T; source: string; kind: 'observada' | 'inferida' | 'indisponivel' }
export interface DeviceProfile {
  deviceClass: Observed<DeviceClass>;
  refreshHz: Observed<number | null>;
  gpu: Observed<string | null>;
  dpr: number; cores: number | null; memoryGb: number | null; touch: boolean; webgl2: boolean; gpuTimer: boolean;
}
export interface TargetPolicy { fps: number; budgetMs: number; origin: 'classe' | 'jogador' | 'tela' }

// kgps.ts — decisão com natureza da evidência (R-EVD-03)
export type Evidence = 'medido' | 'estimado' | 'hipotese';
export interface Decision { at: number; kind: DecisionKind; text: string; evidence: Evidence }
```

## 31. Relatório exportável (R-EVD-02)
```json
{
  "schema": "nc.perf.report.v1",
  "graphicsRevision": 2,
  "preset": "ultraplus",
  "scene": "teatro",
  "device": { "class": "mobile", "classSource": "toque + tela curta", "refreshHz": 60, "gpu": "…", "dpr": 2.5, "cores": 8, "memoryGb": 4, "webgl2": true, "gpuTimer": false },
  "target": { "fps": 30, "budgetMs": 33.3, "origin": "classe" },
  "state": "stabilizing",
  "fidelityIndex": 0.58,
  "windows": [{ "t": 12.4, "fps": 24.1, "p50": 41.2, "p95": 52.0, "p99": 60.3, "cpuP50": 9.8, "hitches": 1, "stalls": 0, "bottleneck": "gpu" }],
  "knobs": [{ "id": "resolution", "level": 3, "baseline": 7, "floor": 4, "emergencyFloor": 0 }],
  "decisions": [{ "at": 8.2, "kind": "degrade", "evidence": "medido", "text": "…" }],
  "incidents": [],
  "render": { "drawCalls": 412, "triangles": 380000, "geometries": 310, "textures": 54 }
}
```
- **Limites:** últimas 30 janelas e 40 decisões.
- **Não contém:** nome do jogador, sala, posição no mapa, chat ou qualquer dado pessoal.

---

# Parte VI — Validação

## 32. Testes automáticos (vitest, fluxos de quadros sintéticos como no v1)

| ID | Cenário | Requisitos |
|---|---|---|
| T-01 | Classe celular, quadros estáveis a 33,3 ms → nenhum passo aplicado | R-TGT-01/02 |
| T-02 | Meta limitada pela taxa estimada da tela; 33,3 ms presos não viram estimativa de 30 Hz | R-TGT-03, R-DEV-02 |
| T-03 | Travado em 33,3 ms com CPU baixa e reduções inúteis → `externalCap`, tudo desfeito, nada mais reduzido | R-TGT-04 |
| T-04 | ~143 ms por quadro (7 qps) que melhora a cada passo → chega a ≤ 1,15× sem esperar 2 janelas por passo; antes e depois registrados | R-EMG-01/02/05 |
| T-05 | Emergência sem ganho → tudo desfeito, marcado "limite não gráfico/externo" | R-EMG-03 |
| T-06 | Depois da emergência: `stabilizing` 10 s, recuperação na ordem certa, sem oscilação | R-EMG-04, R-RST-01 |
| T-07 | Segunda queda em menos de 3 min → sem nova emergência, salvo p50 > 2,5× | R-EMG-06 |
| T-08 | Pisos de emergência inacessíveis no modo normal; portões `loading` e `compiling` bloqueiam medição e mudança | R-CORE-04/06, R-ADP-01 |
| T-09 | Adaptador que lança exceção → quarentena só dele; `attach` duplo sem efeito | R-CORE-02/05 |
| T-10 | Nível alterado por fora → incidente e KGPS adota o lido | R-CORE-01/03 |
| T-11 | Kill switch em plena emergência → todos os botões no nível base | R-RB-01 |
| T-12 | Classe do aparelho por fixtures (SwiftShader → software; toque + tela curta → celular) | R-DEV-01 |
| T-13 | Intervalos de 8,3 ms no aquecimento → 120 Hz | R-DEV-02 |
| T-14 | Relatório com campos obrigatórios, ≤ 20 KB, congelamentos presentes, evidência por decisão, sem campos proibidos | R-EVD-02/03, R-TGT-05 |
| T-15 | Perfil aprendido descartado quando muda a versão gráfica, a classe ou a meta | R-EVD-04 |
| T-16 | p50 subindo 15% em 5 min sem mudança de botões → subidas bloqueadas (O2) | R-TGT-06 |
| T-17 | Densidade da vegetação: o mesmo subconjunto some sempre; nenhuma instância pisca | R-ADP-02 |
| T-18 | **Regressão:** os 19 testes do v1 passam; classe PC com meta 60 se comporta como o v1 fora da descida rápida | Todos |

## 33. Protocolo de teste de campo (para o jogador)
**Preparação:**
- mesmo aparelho e navegador;
- bateria acima de 50%, fora do carregador, aparelho frio;
- Sandbox, câmera inicial sobre a capital;
- "Mostrar FPS" ligado.

**Cada rodada:**
1. 2 minutos parado.
2. 2 minutos com 20 tropas em combate (ferramenta "Criar tropas" do Sandbox).
3. "Copiar relatório" e colar na conversa, com um print.

| ID | Preset | Economia de bateria | Adaptação | Para quê |
|---|---|---|---|---|
| F-01 | Mobile/Baixo | Desligada | Desligada (v1 e v2) | Linha de base pura |
| F-02 | Mobile/Baixo | Desligada | Ligada | Meta 30 sem agir à toa |
| F-03 | Ultra+ | Desligada | Ligada | Descida rápida (antes/depois) |
| F-04 | Ultra+ | Ligada | Ligada | Isolar o efeito da economia (limite externo?) |
| F-05 | Equilibrado | Desligada | Ligada | Preset intermediário |
| F-06 | Ultra+ (PC, se houver) | — | Ligada | PC preservado (nenhuma redução com folga) |
| F-07 | Igual a E1 | Ligada | — | Reproduzir o artefato E3 e testar os botões do painel |

## 34. Critérios de aceitação

**Onda 1:**
- **Automáticos:**
  - T-01 a T-15, T-17 e T-18 passando;
  - typecheck, lint e build;
  - custo do KGPS ≤ 50 µs por quadro nos testes.
- **Campo:**
  - F-01 a F-04 e F-07 executados e relatórios anexados;
  - comportamento esperado: F-02 sem passos; F-03 com descida registrada; F-04 marca `externalCap` ou desce com prova; kill switch restaura;
  - E3 explicado (causa identificada) ou corrigido.
- **Documentação:** `docs/KGPS_KAICS.md` atualizado para a v2, com resultados reais.

**Onda 2:**
- T-16;
- consultor e aviso por aparelho funcionando;
- pré-aquecimento medido (travadas antes/depois em F-05/F-06).

**Metas de referência** (relatadas, não bloqueiam):
- F-03 com qps ≥ 2× o do v1 no mesmo cenário;
- p95 ≤ 66 ms depois da descida;
- F-02 estável perto de 33,3 ms.

## 35. Orçamento de custo do próprio sistema
- **KGPS:** ≤ 50 µs por quadro em média (v1 mede ~5 µs). Medido e exibido.
- **Adaptadores:** nenhum trabalho por quadro, exceto o que economiza mais do que custa (K-08). A troca de nível é pontual.
- **Relatório:** gerado só sob demanda.
- **Memória:** o registro de decisões fica limitado a 40 entradas.

---

# Parte VII — Entrega

## 36. Plano em ondas

**Onda 1 — impacto no celular (P0).** Arquivos principais: `src/game/perf/*`, `GameRuntime.setupPerf`, `PerfPanel.tsx`, `Water.ts`, `Trees.ts`, `Effects.ts`, `src/test/kgps.test.ts`.
1. Classe do aparelho e taxa da tela (C2).
2. Meta por classe, orçamento e `externalCap` (C3).
3. Níveis de emergência no KAICS, portões novos e escrita externa detectada (C1).
4. Descida rápida, estabilização e ordem de recuperação (C4).
5. Botões K-01 a K-05 (C5).
6. Painel v2, "Copiar relatório" e versão gráfica na chave do perfil (C8).
7. Investigação e correção do E3 (C7).
8. Testes, documentação e commit. O jogador então roda F-01 a F-07.

**Saída:** critérios da Onda 1 cumpridos.

### 36.1 Onda 1 — o que a implementação mudou ou descobriu
**Estado:** itens 1 a 8 entregues. Automáticos: T-01 a T-15, T-17 e T-18 passando, com typecheck,
lint e build. Falta o campo (F-01 a F-07).

1. **Taxa da tela (R-DEV-02 e T-02 reescritos).** A mediana do aquecimento não serve: 33,3 ms
   presos são ambíguos (tela de 30 Hz ou carga entre 17 e 33 ms numa tela de 60 Hz). A estimativa
   usa o p10 de cada janela e só reconhece 60/90/120/144 Hz; o padrão de 30 qps é resolvido pelo
   limite externo, que exige uma cadeia de reduções sem efeito antes de concluir.
2. **Descida rápida e o padrão de 30 qps.** Uma janela presa em 33,3 ms com a CPU folgada não
   dispara a descida rápida: a cadeia passo a passo resolve a dúvida primeiro.
3. **T-18 (regressão).** O teste do v1 "tela travada em 30 Hz" mudou de expectativa de propósito:
   em vez de pausar 5 min, o KGPS entra em `externalCap` (R-TGT-04). Os outros 18 testes do v1
   passam sem mudança.
4. **Custos visuais implementados** (definem a ordem efetiva; a seção 22 é a intenção):
   K-01 só céu 3; K-02 níveis de emergência 5; K-03 3 (100→75) / 4 (75→50); K-04 2;
   K-05 2 (100→70) / 4 (70→40). Com eles, a resolução de emergência fica por último e o reflexo só
   céu entra antes de desligar a oclusão.
5. **E3 — causa e correção (R-SHD-01).** Reproduzido no PC (Chromium com SwiftShader, preset
   Equilibrado), então **não** é GPU nem precisão do celular. O tom do território (camada
   transparente com a cor da nação) era desenhado sem a névoa de guerra. Nas partes do próprio
   território fora de visão e nunca exploradas, o chão fica quase preto e só o azul sobrava: as
   "áreas azul-escuras perto da fronteira". As "manchas alaranjadas e arroxeadas" eram as texturas
   de terra e asfalto sob o mesmo véu azul, na transição da névoa. Correção:
   - o tom do território passa pela névoa como o chão embaixo dele;
   - o próprio território conta no mínimo como explorado (só o visual do chão; o servidor continua
     escondendo as unidades fora de visão);
   - a faixa da fronteira continua sempre visível.
6. **Portão `compilando`.** Na Onda 1 ele cobre 1,5 s depois que os modelos do Nature Kit chegam
   (troca de malhas no meio da partida). O pré-aquecimento com `compileAsync` (R-SHD-02) é da Onda 2.

### 36.2 Onda 2 — o que a implementação mudou ou descobriu
**Estado:** entregue — consultor e aviso por aparelho (C6), tempo de GPU (R-DEV-03), R-DEV-04,
pré-aquecimento (R-SHD-02), bloqueio por evidência (R-SHD-03), K-06 a K-09, meta escolhida pelo
jogador (R-TGT-01), tendência sustentada (R-TGT-06, T-16) e eventos extraordinários (R-EVD-05).
Automáticos: T-16 e os novos da Onda 2 passando, com typecheck, lint e build. Falta o campo.

1. **Guardiões de shader (achado).** O three.js apaga um programa quando o último material que o
   usa é descartado. Os efeitos criam e descartam materiais o tempo todo: quando a última
   explosão acabava, a próxima recompilava tudo — travada no meio da batalha. Agora um objeto
   invisível por variante de material fica na cena a partida inteira, em todos os presets.
2. **Pré-aquecimento.** Além da cena, compila os guardiões e um modelo oculto de cada tropa, nas
   variantes de alvo intermediário (reflexo, pós-processamento) e de tela (sem pós-processamento).
   No SwiftShader: 73 programas para 623 materiais em ~6,5 s. A comparação de travadas
   antes/depois não é possível nesse ambiente (congelamentos de 20–70 s com ou sem); fica para
   F-05/F-06. `localStorage['nc.perf.prewarm'] = 'off'` desliga para o teste.
3. **Tempo de GPU (R-DEV-03 ajustado).** "1 a cada 10 quadros" virou "um quadro a cada ~150 ms"
   (o mesmo a 60 qps, mais amostras quando o jogo está lento, para cada janela ter pelo menos 3).
   Leituras acima de 1,5× o intervalo entre quadros são descartadas: no SwiftShader a extensão
   existe, mas mede 10× o intervalo.
4. **Tendência sustentada.** Compara as 3 primeiras e as 3 últimas janelas com os mesmos ajustes,
   depois de 5 min. Uma cena que pesa aos poucos também dispara o indício (por isso ele é
   `hipótese` e só segura subidas, nunca reduz).
5. **Consultor.** "No piso de emergência" foi lido como "com níveis de emergência em uso". O
   histórico guarda a última partida de cada preset; "já manteve a meta" vale para a mesma versão
   gráfica e a mesma meta. Uma partida boa no mesmo preset retira a recomendação.
6. **R-SHD-03.** O mecanismo existe, com a lista vazia: nenhum defeito de GPU foi comprovado.
7. **K-07.** O shader das nuvens passou a pular a leitura da textura com força 0 (sem isso,
   desligar não economizava nada). **K-08:** raio "longe" = max(30, 0,8 × distância da câmera).

**Onda 2 — precisão e próxima partida (P1).**
- consultor e aviso por aparelho;
- tempo de GPU quando houver;
- pré-aquecimento de shaders;
- K-06 a K-09;
- meta escolhida pelo jogador;
- tendência sustentada;
- marcação de eventos extraordinários no registro (R-EVD-05).

**Saída:** critérios da Onda 2.

**Onda 3 — só com gatilho de campo (P2).**

| Item | Gatilho |
|---|---|
| Residência de texturas e ativos | Travadas ao surgir conteúdo novo, ou memória subindo nos relatórios |
| Tendência de memória | Partidas longas ficando mais lentas sem mudança de botões |
| "Ultra+ Móvel" | D5 decidido + relatórios mostrando o Ultra+ inviável em celular mesmo com a descida |
| Metas acima de 60 qps | Pedido de jogadores com telas de 120 Hz+ e folga medida |
| Telemetria agregada no servidor | Necessidade de comparar muitos aparelhos. Exige consentimento explícito. |

## 37. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Reflexo "só céu" muda bruscamente a água | Custo visual 2; usado tarde na ordem; transição só na troca de nível; avaliar em F-03 |
| Vegetação "pisca" ao mudar a densidade | Subconjunto fixo por hash (R-ADP-02) e histerese do v1 |
| Classe errada (tablet com teclado, PC com toque) | Fonte registrada no painel; meta escolhida pelo jogador (O2); a classe só muda a meta e os pisos |
| Economia de bateria confundida com GPU fraca | `externalCap` exige padrão de 33,3 ms com CPU baixa e redução inútil; o relatório marca "hipótese" |
| Descida rápida deixa o jogo feio sem ganho | Prova final com ganho mínimo de 15%, senão desfaz tudo (R-EMG-03) |
| Botão novo que recompila sem querer | Revisão (I) e teste de travadas no campo; se recompilar, vira recomendação do consultor |
| Perfil antigo reaplicado depois de um update visual | `GRAPHICS_REVISION` na chave do perfil (O1), além do TTL de 14 dias do v1 |
| Superestimar ganho com testes simulados | Relatório separa "teste automático" de "campo"; nenhuma meta declarada sem F |

## 38. Fora do escopo
- Simulação, regras, rede, física, névoa de guerra, fronteiras, seleção e interface.
- Trocar de engine ou de linguagem.
- Preset acima do Ultra+.
- Benchmark pesado na abertura do jogo.
- Telemetria automática.
- Classificação por marca/modelo.
- Previsão de carga ou aprendizado de máquina. Só com dados de muitas partidas mostrando ganho sobre a regra.

## 39. Instrução operacional ao agente de implementação
1. Implementar onda por onda, sem parar no plano: auditar o trecho tocado → implementar → testar → corrigir → documentar.
2. **Comandos:**
   - `npm run typecheck`
   - `npx vitest run`
   - `npx eslint <arquivos>`
   - `npm run build`
3. Desenvolver no branch designado. Commits pequenos por item da onda. Nunca descartar mudanças alheias nem reescrever histórico.
4. Não inventar APIs nem resultados. Cada afirmação de ganho precisa de relatório F, e cada comportamento, de teste T.
5. Manter o v1 funcionando: T-18 é obrigatório antes de cada commit.
6. Ao fim da onda, produzir o relatório (seção 40) e pedir ao jogador as rodadas F correspondentes.

## 40. Modelo de relatório final (por onda)
1. **Resumo:** o que entrou, o que ficou de fora e por quê.
2. **Implementação:**

   | Componente | Antes | Mudança | Arquivos | Evidência (T/F/I) |
   |---|---|---|---|---|

3. **Testes:** comandos e resultados reais, incluindo T-18.
4. **Campo:** relatórios F recebidos (aparelho, preset, economia, qps e p95 antes/depois, travadas, estado, IFA), ou "pendente".
5. **Classificação de cada requisito:**
   - implementado e testado;
   - implementado, validação parcial;
   - parcial;
   - bloqueado (dependência externa);
   - não implementado.
6. **Pendências:** motivo, impacto e próximo passo.

---

## Apêndice A — Glossário
- **qps / FPS:** quadros por segundo; sempre lidos junto com o p95 do tempo de quadro.
- **Orçamento:** tempo por quadro da meta (33,3 ms a 30 qps; 16,7 ms a 60).
- **p50 / p95 / p99:** tempo de quadro abaixo do qual ficam 50%, 95% e 99% dos quadros.
- **Travada:** quadro com mais de 50 ms e mais de 2,5× a mediana.
- **Congelamento:** quadro com mais de 1 s; fica fora dos percentis, mas no relatório.
- **Botão (knob):** parâmetro gráfico declarado pelo jogo, com níveis, piso e leitura do estado real.
- **Piso normal / piso de emergência:** nível mais baixo permitido fora e dentro da descida rápida.
- **Descida rápida:** sequência de passos em segundos quando o jogo está muito abaixo da meta, com prova final.
- **Limite externo (`externalCap`):** quadro travado pelo navegador ou sistema (ex.: 30 Hz da economia de bateria), que reduzir qualidade não resolve.
- **Consultor:** recomenda o preset da próxima partida; nunca troca sozinho.
- **IFA:** índice de fidelidade adaptativa. Estimativa relativa aos ajustes disponíveis, não medida de imagem.
- **Evidência `medido` / `estimado` / `hipótese`:** natureza de cada afirmação do painel e do relatório.

## Apêndice B — Decisões de arquitetura (ADR)
- **ADR-01:** o KGPS é o único decisor. O Adaptables+ fornece botões, perfis e políticas como dados. Resolve a contradição da 1.0.
- **ADR-02:** a meta depende da classe do aparelho (30 no celular, 60 no PC) e é limitada pela taxa da tela.
- **ADR-03:** nada que recompile shaders muda durante a partida; vai para o consultor.
- **ADR-04:** pisos de emergência existem para todas as classes, mais profundos no celular: lá, a resolução desce até 0,7 px por px CSS e a vegetação até 50%. No PC, os únicos níveis extras são o reflexo só céu e os efeitos em 40%: a resolução fica no piso normal, a vegetação para em 75% e o resto vai para o consultor.
- **ADR-05:** rótulo honesto ("· adaptado") e IFA explicado como estimativa.
- **ADR-06:** o relatório é local e copiado pelo jogador. Não há telemetria automática.
