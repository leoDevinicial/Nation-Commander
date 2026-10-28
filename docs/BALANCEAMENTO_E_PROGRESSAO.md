# Balanceamento, progressão e ideias de design

Análise do estado do jogo e propostas de melhoria, em quatro lotes:

1. **Diagnóstico de balanceamento e progressão**, com elementos de city builder inspirados em *Tropico 5* e *Tropico 6*.
2. **Elementos inspirados em *Rise of Nations*** que ainda não existem no jogo.
3. **Estradas construídas pelo jogador e Engenheiro de Combate** (com minas terrestres).
4. **Mapas maiores, partidas com mais jogadores e tipos de mapa.**

O que já foi implementado está na seção **Estado da implementação**, no fim do documento; o resto são propostas.
Os números do diagnóstico saem das tabelas do código
(`shared/sim/config.ts`, `shared/sim/TacticalAI.ts`, `shared/sim/Simulation.ts`, `shared/sim/upgrades.ts`,
`shared/strategic/params.ts`) na data da análise; não vêm de partidas medidas.

---

# Lote 1 — Diagnóstico, progressão e elementos de Tropico

## 1. O que tira a sensação de desafio

### 1.1 Pontos cegos da IA tática
- **Artilharia de longe sem resposta.** A IA só defende contra inimigos que ela **vê** e que estão a até **22** de algum
  edifício seu (`nearestThreat`). O Lança-Foguetes tem alcance 24 e a Artilharia 16 (com um blindado dando visão), então
  dá para bombardear a base da IA sem reação. As defesas fixas também alcançam menos: torre 10, QG 9.
- **A IA cai em iscas.** Diante de qualquer ameaça visível, ela manda **todas** as unidades a até 45 de distância
  (`defenders`) e encerra o turno ali. Uma unidade barata puxa o exército inteiro para fora de posição.
- **Ataques previsíveis.** Cada onda é um bloco único que avança direto para o ponto inicial do jogador. Não há flanco,
  recuo, alvo econômico nem reforço. Intervalo mínimo entre ondas de 4 min; tamanho máximo 24.
- **Ferramentas que a IA não usa.** Ela nunca usa aviões, mísseis nem operações expedicionárias, e no comércio só
  responde a ofertas. O jogador tem um arsenal inteiro que a IA não usa nem sabe contra-atacar.
- **Sem níveis de dificuldade.** Existe uma só IA. A "dificuldade" do `CountryCard` é uma estimativa do país, não do
  adversário.

### 1.2 O jogador controla quando o desafio começa
`PREPARATION_TICKS` dá **12 minutos** de paz garantida, com a IA limitada a uma guarnição de 6 unidades. Somado à regra
"sem guerra declarada, ninguém ataca", o jogador cresce sem pressão e escolhe o momento da luta. Isso remove a tensão
do começo da partida.

### 1.3 Curva de unidades invertida
Custos incluindo a tripulação (recruta = 40 comida + 25 suprimentos):

| Unidade | Custo total | Dano/s | Vida | Eficiência (dano/s × vida ÷ custo², ×1000) |
|---|---|---|---|---|
| Infantaria | 120 | 9 | 70 | 44 |
| **Veículo Blindado (sem pesquisa)** | 165 | **15** | 160 | **88** |
| Tanque (pesquisa) | 245 | 13,6 | 260 | 59 |
| Tanque Moderno (3 pesquisas) | 355 | 20 | 430 | 68 |

- **O blindado inicial é a melhor unidade em custo-benefício.** Causa mais dano por segundo que o Tanque, é mais rápido
  e enxerga mais longe. Pesquisar o Tanque é, na prática, um rebaixamento.
- **Não existe blindagem de verdade.** Fuzil de infantaria causa dano cheio em tanque (`vsVehicle` padrão = 1). Só a
  infantaria antitanque tem modificador.
- **O Lança-Foguetes é mais fraco que a artilharia que o libera.** A salva de 12 foguetes aplica **40 de dano no total**
  a cada 7 s (cerca de 5,7 de dano por segundo no alvo, ver `updateSalvos`). A Artilharia faz 13,75 por segundo, custa
  menos e vem antes na árvore.

### 1.4 Camada nacional com pouco peso no teatro
- **Orçamento de defesa quase irrelevante.** A logística segue `1,2 × log₁₀(1 + gasto em US$ bi)`. No modo paridade,
  subir a defesa de 1% para 10% do PIB rende só **+1,15 suprimento/s**, contra os 3/s fixos do QG.
- **Aprovação e estabilidade quase não chegam ao campo.** Hoje só bloqueiam o QG no nível 9+. Dá para ignorar a nação
  sem perder nada no campo de batalha.

### 1.5 Melhorias com ganho linear e custo exponencial
Até 10 níveis por edifício, ganho linear por nível e custo multiplicado por 1,28–1,3 a cada nível. Os níveis altos ficam
caros, com retorno pequeno e invisível ("+8% de vida"). Faltam marcos que se sintam.

### 1.6 Detalhes menores
- O mapa de 64×64 é pequeno para o raio de território 13 do QG, e só a jazida central de petróleo é realmente disputada.
  Há pouco motivo para expandir.
- O README diz que "recursos não se esgotam", mas o código tem depósitos finitos.

## 2. Ajustes rápidos (números e regras)

1. **Blindagem por classe:** fuzil de infantaria com `vsVehicle: 0.35`; blindado de transporte com dano 12 → 8 e
   `vsVehicle: 0.6`; tanque com tempo de recarga 2,2 → 1,7. Cada pesquisa passa a ser claramente melhor que a anterior.
2. **Lança-Foguetes:** dano por salva 40 → cerca de 120, ou dividido entre 3 a 4 pontos de impacto. Precisa ser o
   "martelo de cerco" que o visual promete.
3. **Contra-bateria da IA:** quando um edifício levar dano de um atacante que ela não vê, mandar um grupo rápido na
   direção de onde veio o tiro (o evento `shot` já traz a origem). Torre com alcance 10 → 13.
4. **Defesa proporcional:** a IA manda no máximo cerca de 1,5× a força inimiga visível, não o exército inteiro.
5. **Dificuldade (Fácil / Normal / Difícil / Brutal)** controlando:
   - duração do preparo (12 / 8 / 5 / 3 min);
   - tamanho e intervalo das ondas;
   - se a IA usa aviões e mísseis;
   - um bônus de coleta pequeno e declarado no modo Brutal.
6. **Assédio durante o preparo:** "incidentes de fronteira" com 2 a 3 unidades atacando fazendas ou serrarias na borda do
   território, sem guerra total.
7. **Curva de defesa mais sensível:** trocar o log₁₀ por raiz quadrada ou por uma escala linear da parcela do PIB, para a
   decisão de orçamento aparecer no campo.

## 3. Progressão mais gratificante

### 3.1 Progressão por eras (eixo central)

A partida avança por **quatro eras**, no estilo *Rise of Nations* e *Tropico 5*. Cada era **muda a aparência de todas
as construções** e **libera aos poucos tropas, veículos e construções novas**. É o principal marcador de progresso: o
jogador vê e sente a nação evoluir, em vez de acumular só porcentagens.

**Como se avança de era**
- O avanço é uma **pesquisa nacional cara**, com custo em recursos do teatro e em US$ do orçamento.
- Cada era exige um **nível mínimo do Centro de Comando**.
- O custo sobe a cada era.
- Durante o avanço, o QG mostra a obra. Ao concluir, há um evento de destaque e a música muda.

**O que muda ao entrar numa era**
- **Aparência:** todas as construções do jogador trocam de modelo e textura para o estilo da nova era, com uma transição
  curta. Unidades novas saem com o visual da era; as antigas mantêm o visual até serem modernizadas.
- **Tropas e veículos:** a era libera um novo grupo de unidades. As pesquisas do Centro de Pesquisa Militar continuam
  existindo, mas cada uma só fica disponível a partir da sua era.
- **Construções:** a era libera novos edifícios e eleva o nível máximo das melhorias.

**Proposta inicial de eras** (distribuição a partir do conteúdo que já existe; números a calibrar):

| Era | Requisito | Aparência das construções | Tropas e veículos liberados | Construções liberadas |
|---|---|---|---|---|
| **1. Guerra Fria** (início) | — | Concreto aparente, tijolo, telhado de zinco, pintura verde-oliva, antenas simples | Infantaria, Veículo Blindado | Centro de Comando, Casa, Fazenda, Serraria, Pedreira, Mina, Poço de Petróleo, Armazém, Silo, Tanque de Petróleo, Base Militar, Fábrica de Veículos, Torre de Vigilância |
| **2. Pós-Guerra Fria** | QG nível 3 | Galpões metálicos pré-fabricados, cercas e guaritas, primeiros radares | Tanque, Artilharia, Infantaria Antitanque, Engenheiro de Combate (lote 3) | Centro de Pesquisa Militar, Prédio Residencial, Terminal Comercial, Porto, Estação Ferroviária, Bateria Antiaérea |
| **3. Era Digital** | QG nível 5 | Vidro e aço, antenas de telecomunicação, painéis solares, camuflagem digital nos veículos | Antiaérea Móvel, Forças Especiais, Lança-Foguetes; caças de 1ª geração | Base Aérea; melhorias até o nível 8 |
| **4. Futuro Próximo** | QG nível 7 | Estruturas compostas, telas e iluminação de LED, drones de vigilância decorativos, pistas iluminadas | Tanque Moderno; caças de nova geração | Silo de Mísseis, Grandes Projetos Nacionais (lote 2, item 13); melhorias até o nível 10 |

Assim, os 10 níveis lineares de melhoria deixam de ser a única progressão: ficam dentro de 4 saltos claros, e cada
salto se vê no mapa.

### 3.2 Outras ideias de progressão

- **Marcos nas melhorias:** níveis 3, 6 e 9 liberam algo qualitativo (habilidade, nova produção, mudança visual); os
  níveis intermediários mantêm os ganhos pequenos.
- **Veterania:** unidades que matam sobem de patente (+dano, +vida, insígnia). Cria apego e motivo para preservar tropas,
  e combina com a modernização.
- **Objetivos no mapa:** a jazida central e pontos neutros (aeroporto, ponte, usina) que dão bônus; vitória por pontos de
  controle como alternativa a "destruir o QG".
- **Relatório pós-partida e metaprogressão:** gráficos de economia e exército, medalhas, desbloqueios cosméticos ou de
  doutrina no perfil (o Supabase já guarda o histórico).
- **Doutrinas militares** escolhidas uma vez por partida (blindada, guerra de manobra, defesa em profundidade, poder
  aéreo): dão identidade e ajudam a balancear sem mexer em tudo.

## 4. Elementos de city builder (*Tropico 5* e *6*)

| Elemento de Tropico | Adaptação para Nation Commander |
|---|---|
| **Facções com exigências** | Facções internas (Forças Armadas, Indústria, Agro, Sindicatos, Opinião Pública) com pedidos ligados ao teatro: "construa 2 fábricas", "não tenha mais de 20 baixas este mês". Cumprir rende aprovação ou bônus; ignorar gera protestos que **reduzem a produtividade** no teatro. Liga as duas camadas. |
| **Pedidos das superpotências** (*Tropico 6*) | Os governos de IA fazem pedidos com prazo ("exporte 500 de petróleo em 90 dias", "não declare guerra a X") com recompensa em relação, ajuda militar ou US$. |
| **Decretos** | Decretos nacionais com custo e efeito duplo: Alistamento obrigatório (recrutas mais baratos, −aprovação), Economia de guerra (+produção na fábrica, +inflação), Racionamento (−consumo de comida, −aprovação), Lei marcial. |
| **Cadeias produtivas** | Petróleo → **Refinaria** → combustível; Ferro → **Siderúrgica** → aço para os blindados avançados. Profundidade de cidade e alvos estratégicos para aviões, mísseis e forças especiais. |
| **Moradia e serviços com raio de cobertura** | Hospital, escola e delegacia com área de efeito: cidadãos cobertos trabalham mais e recrutas saem com veterania inicial. Hoje a casa só dá população. |
| **Ministros e dinastia** (*Tropico 5*) | Ministros com traços (Defesa: −10% no custo de veículos; Fazenda: +renda), escândalos e demissão. |
| **Eras** | Ver seção 3.1: a espinha da progressão, com troca de aparência e liberação gradual de tropas e construções. |
| **Assaltos e operações especiais** (*Tropico 6*) | Forças especiais roubam tecnologia, sabotam a refinaria ou instigam protestos no rival. |
| **Eleições e constituição** | Eleição a cada 4 anos de jogo (a partida cobre de 5 a 10). Perder causa penalidade grande ou derrota alternativa. |

## 5. Prioridade sugerida (lote 1)
1. **Ajustes rápidos:** blindagem e números das unidades, Lança-Foguetes, contra-bateria e defesa proporcional da IA,
   texto do README.
2. **Curto prazo:** níveis de dificuldade, assédio no preparo, curva de defesa, veterania.
3. **Médio prazo:** facções e pedidos dos governos de IA, decretos, IA usando aviões e mísseis.
4. **Longo prazo:** eras, cadeias produtivas, serviços com cobertura, metaprogressão.

---

# Lote 2 — Elementos inspirados em *Rise of Nations*

O jogo já tem do *Rise of Nations*: fronteiras territoriais, coleta por edifícios perto dos recursos, depósitos finitos,
população com cidadãos e atrito em território inimigo sustentado por blindados de transporte (`updateAttrition`). Abaixo,
o que falta e como se encaixaria.

## Expansão e território

**1. Cidades e limite de cidades**
- **No RoN:** cada cidade estende a fronteira e libera mais edifícios; o número de cidades é limitado pela pesquisa Cívica.
- **Proposta:** **Centros Regionais** (cidades secundárias) em pontos fixos do mapa: jazida central, cruzamento de
  estradas, ponte. O limite viria da tecnologia nacional *Administração territorial*. Resolve a falta de motivo para
  expandir.

**2. Captura e assimilação de cidades**
- **No RoN:** a cidade inimiga é tomada com infantaria em vez de destruída e passa a ser sua depois de um tempo.
- **Proposta:** infantaria cerca um Centro Regional inimigo e o ocupa. Ele fica em revolta (sem produção) até
  assimilar; assimilação mais rápida com missão diplomática ou aprovação alta. Também dá objetivos além de "destruir o QG".

**3. Fortes e pressão de fronteira por influência**
- **No RoN:** fortes empurram a fronteira; templos e maravilhas dão "cultura" que também a empurra.
- **Proposta:** **Base Fortificada** com guarnição (infantaria entra e o forte atira mais) e projeção maior; edifícios civis
  de prestígio (universidade, estádio, emissora de TV) empurram a fronteira por **influência**, tirando território do
  inimigo sem tiro.

## Economia e ritmo

**4. Teto de comércio (Commerce Cap)**
- **No RoN:** cada recurso tem um teto de coleta por segundo, que sobe com pesquisas de Comércio.
- **Proposta:** teto de produção por recurso ligado ao PIB e à infraestrutura nacional. Investir em infraestrutura passa
  a ser sentido no teatro.

**5. Recursos raros**
- **No RoN:** pontos especiais no mapa dão bônus quando explorados por um mercador.
- **Proposta:** pontos de **terras raras, urânio, lítio, gás natural e água doce**, ocupados com um pequeno edifício. Cada
  um dá um bônus passivo (urânio barateia mísseis, lítio acelera pesquisa, gás reduz manutenção) e pode ser vendido no
  Terminal Comercial. Cria disputa por pontos específicos.

**6. Caravanas entre cidades**
- **No RoN:** mercadores entre duas cidades suas geram renda proporcional à distância.
- **Proposta:** rotas internas entre o QG e os Centros Regionais, gerando suprimentos. São alvos naturais para emboscadas
  das forças especiais e ataques aéreos.

## Tecnologia e eras

**7. Eras pela Biblioteca**
- **No RoN:** avançar de era é uma pesquisa cara que muda unidades e edifícios; o custo sobe a cada era.
- **Proposta:** eras como pesquisa nacional (Guerra Fria → Pós-Guerra Fria → Era Digital → Futuro Próximo). Cada era
  muda a aparência de todas as construções e libera aos poucos tropas, veículos e construções novas. Detalhes e tabela
  completa no lote 1, seção 3.1.

**8. Quatro linhas de pesquisa permanentes**
- **No RoN:** Militar, Cívica, Comércio e Ciência, com efeitos globais diretos.
- **Proposta:** reorganizar a árvore nacional em quatro trilhas cumulativas:
  - **Defesa:** limite de população militar e atrito.
  - **Estado:** limite de cidades e território.
  - **Comércio:** teto de produção e caravanas.
  - **Ciência:** preço das pesquisas.

## Militar

**9. Generais**
- **No RoN:** unidade de apoio com aura de bônus e habilidades ativas ("Marcha forçada", "Emboscada").
- **Proposta:** **Comandante de campo** (um por exército) com aura e 2 a 3 habilidades com tempo de recarga (avanço
  rápido, fogo concentrado, camuflagem). Pode ser derrubado, com custo de aprovação.

**10. Espiões e sabotadores**
- **No RoN:** o espião revela unidades escondidas, suborna tropas e mata generais.
- **Proposta:** ações ativas para as forças especiais (sabotar poço ou armazém, roubar pesquisa, revelar área) e uma
  **unidade de inteligência** que detecta tropas camufladas.

**11. Vagão de suprimentos e cura**
- **No RoN:** o vagão cura unidades e anula o atrito.
- **Proposta:** **caminhão logístico / hospital de campanha** que cura devagar e recarrega munição, liberando o blindado
  para ser só unidade de combate (ajuda também no desequilíbrio do blindado, ver lote 1).

**12. Unidades únicas por país**
- **No RoN:** cada nação tem poderes e unidades exclusivas.
- **Proposta:** uma unidade ou bônus exclusivo por país, por exemplo:
  - EUA: logística aérea;
  - Rússia: artilharia mais barata;
  - Coreia do Sul: defesa antiaérea superior;
  - Brasil: atrito reduzido em floresta;
  - China: produção em massa.

## Grande estratégia

**13. Grandes Projetos Nacionais (maravilhas modernas)**
- **No RoN:** edifícios caríssimos com bônus enormes.
- **Proposta:** programa espacial, usina nuclear, rede 5G nacional, hidrelétrica, centro financeiro. Custam recursos do
  teatro e US$ do orçamento, levam anos de jogo para concluir e dão bônus globais.

**13.1 Megaconstrução: Programa Espacial 🛰**

O Grande Projeto mais ambicioso e **a construção mais cara do jogo**, pensada para o **fim de partida (endgame)**.

- **O que é:** um centro de lançamento com plataforma, torre de serviço, foguete e centro de controle. Ocupa uma área
  grande (por exemplo 4×4 células).
- **Requisitos:** era **Futuro Próximo** (seção 3.1), Centro de Comando no nível 9 ou mais e uma pesquisa nacional própria
  (*Tecnologia espacial*).
- **Custo:** muito acima de qualquer outra construção. Proposta inicial, a calibrar: 1.500 suprimentos, 1.200 ferro,
  800 pedra, 600 madeira, 600 petróleo e US$ 2 bi do orçamento nacional, com cerca de 6 minutos de obra. Para comparar,
  a Base Aérea, hoje a construção mais cara, custa cerca de 470 em recursos somados.
- **Lançamento:**
  1. Com a obra concluída, o jogador clica na construção e **autoriza o lançamento**, com confirmação.
  2. Há uma contagem regressiva curta na plataforma.
  3. **Animação do foguete 🚀**: ignição, fumaça e chamas na base, e o foguete sobe até sumir do alto da tela.
  4. O evento é anunciado a todos os jogadores.
- **Efeito: satélite em órbita.** A nação dona do satélite fica **sem névoa de guerra** e **vê todo o mapa em tempo real**:
  todas as unidades e construções inimigas, sempre atualizadas. No servidor, isso significa enviar a esse jogador o
  snapshot completo, sem o filtro de visão. Exceção: o satélite **não revela minas terrestres** (lote 3), senão anularia
  a mecânica.
- **No globo diplomático:** o satélite **aparece orbitando a Terra**, com a bandeira do país, à vista de todos os
  jogadores.
- **Pontos a decidir no balanceamento:**
  - se destruir o Programa Espacial depois do lançamento derruba o satélite ou só impede novos lançamentos;
  - se haverá contra-jogo, como uma pesquisa de arma antissatélite ou interferência eletrônica que cega o satélite por
    um tempo;
  - se cada nação pode ter mais de um lançamento e se o satélite tem vida útil.

**14. Choque econômico global do lançamento nuclear**
- **No RoN:** armas nucleares têm consequências que afetam todos os jogadores, não só o alvo.
- **Proposta:** todo lançamento nuclear causa um **debuff temporário gigante na economia global**: queda forte do
  crescimento do PIB, alta da inflação e do desemprego, e redução da renda no teatro de **todas** as nações (jogadores e
  governos de IA, inclusive quem lançou). O efeito dura alguns meses de jogo e decai aos poucos. Torna o lançamento uma
  decisão estratégica com custo para todos, não só dano no alvo.

**15. Condições de vitória variadas**
- **No RoN:** conquista, território, maravilhas e pontuação.
- **Proposta:** além de destruir o QG:
  - **vitória territorial**, por controle do mapa durante X minutos;
  - **vitória política**, quando o rival entra em colapso de estabilidade por sanções e protestos.

## Prioridade sugerida (lote 2)
1. **Cidades secundárias com captura (1 e 2):** resolvem a falta de expansão e dão objetivos intermediários.
2. **Grandes Projetos Nacionais (13):** ligam a camada nacional ao teatro e dão sensação de "construir uma nação". O
   Programa Espacial (13.1) é a meta de fim de partida.
3. **Choque econômico do lançamento nuclear (14):** custo baixo, porque o sistema de mísseis e a simulação econômica já
   existem, e impacto estratégico alto.
4. **Bônus únicos por país (12):** pouco código, muita identidade.

---

# Lote 3 — Estradas e Engenharia de Combate

## 1. Estradas construídas pelo jogador

**O que já existe:** `Terrain.Road` é um terreno com velocidade 1,3× e custo de caminho 0,7 no A*
(`shared/sim/config.ts`). As tropas **já preferem estradas automaticamente** quando elas encurtam a viagem, e todas as
unidades andam mais rápido nelas. Hoje a única estrada é a que o gerador de mapa desenha entre as bases; falta deixar o
jogador construir.

**Proposta**
- **Construção no estilo OpenTTD, simplificada:** o jogador arrasta uma linha na grade (horizontal e vertical, talvez
  diagonal), com prévia do traçado e do custo antes de confirmar. Sem junções, sinais ou pontes complexas.
- **Movimento:** tropas continuam se movendo livremente como hoje, mas o caminho escolhe a estrada quando ela torna a
  viagem mais rápida. Todas as unidades ganham velocidade sobre a estrada.
- **Comboios e caravanas:** seguem as estradas e ganham o mesmo multiplicador de velocidade. Hoje os comboios do comércio
  andam com velocidade fixa (`TRANSPORT.road.speed` em `shared/sim/trade.ts`), então é preciso aplicar o multiplicador do
  terreno a eles. As Caravanas entre cidades (lote 2, item 6) usam a malha rodoviária.
- **Custo:** pedra por célula e US$ do orçamento nacional de **infraestrutura**, mais uma manutenção pequena. O orçamento
  de infraestrutura passa a ter efeito visível no mapa.
- **Onde construir:** dentro do próprio território; fora dele, só com o Engenheiro de Combate (seção 2).
- **Felicidade da população:** casas e prédios residenciais ligados à estrada dão bônus de aprovação ("bairro
  pavimentado"), como a cobertura de serviços do *Tropico*.

**Decisões de design**
- **Mão dupla:** o inimigo em guerra também usa a sua estrada. Pavimentar até a fronteira acelera a sua defesa e também
  o ataque dele.
- **Contra o "pavimenta tudo":** custo por célula e manutenção impedem que o bônus vire universal.
- **Celular:** o arrasto da linha precisa de um modo dedicado, como a ferramenta Área do toque.
- **Mapas:** o ganho rende mais com mapas maiores e Centros Regionais (lote 2, item 1), em que as distâncias pesam.

## 2. Engenheiro de Combate e minas terrestres

Unidade multifunção da Base Militar, liberada na era **Pós-Guerra Fria** (lote 1, seção 3.1) por uma pesquisa do Centro
de Pesquisa Militar.

**Funções**
- **Colocar minas terrestres.**
- **Detectar e remover minas** (o contra-jogo vem na mesma unidade).
- **Construir estradas fora do próprio território.**
- **Erguer pequenas fortificações:** sacos de areia e obstáculos antitanque.

**Regras das minas**
- **Começar só com minas antitanque:** detonam apenas com veículos; a infantaria passa por cima. Cria um contra natural
  (infantaria ou engenheiros na frente) e evita perder tropas baratas sem ver nada.
- **Visibilidade:** o dono vê as próprias minas. O inimigo só as vê com Engenheiro, Forças Especiais, avião de
  reconhecimento ou depois que uma explode. O satélite do Programa Espacial não as revela.
- **Limites:** custo por mina (ferro e suprimentos), máximo por engenheiro ou por nação, e tempo de instalação parado
  (não dá para minar no meio do combate).
- **Sinergia com as estradas:** estradas são rápidas e previsíveis, então são o lugar óbvio para minar. Dá à estrada um
  custo de risco e ao engenheiro um papel constante.

**Camada geopolítica**
- Se minas **antipessoal** forem adicionadas depois, elas custam relação com os países signatários do **Tratado de
  Ottawa**.
- Minas que sobram depois do fim de uma guerra reduzem a aprovação até serem removidas.

**IA:** precisa evitar as minas que conhece e mandar engenheiros à frente das ondas. Sem isso, as minas viram um novo
jeito de vencê-la de graça, como já acontece com a artilharia de longo alcance (lote 1, seção 1.1).

---

# Lote 4 — Mapas e partidas com mais jogadores

## 1. Número de jogadores

As partidas deixam de ser só 1v1 e passam a aceitar jogadores humanos e bots (IA) juntos:

| Versão | Máximo de nações na partida (jogadores + bots) |
|---|---|
| **Grátis** | até **4** |
| **Assinante** | até **6** |

Modos possíveis: todos contra todos, 2v2, 3v3 e times desiguais com bots. A diplomacia já tem alianças, então os times
podem nascer de alianças formais.

## 2. Mapas maiores

O mapa atual de 64×64 é pequeno demais para estradas, Centros Regionais, comércio marítimo e força aérea. O tamanho deve
crescer com o número de nações, por exemplo:

| Nações | Tamanho sugerido (a calibrar) |
|---|---|
| 2 | 96×96 |
| 3–4 | 128×128 |
| 5–6 | 160×160 |

**O que precisa mudar**
- **Gerador de mapas:** o `MapGen.ts` hoje usa simetria por rotação de 180°, que só serve para 2 jogadores. Para 3 a 6 é
  preciso simetria por rotação em N partes (ou espelhamento), para cada nação começar com recursos equivalentes.
- **IA tática:** hoje sempre mira o QG adversário mais próximo. Com vários rivais precisa escolher alvo, aproveitar quem
  está enfraquecido, respeitar alianças e não ficar entre dois fogos.
- **Desempenho:** mapas maiores aumentam o custo do A*, da névoa de guerra e dos snapshots enviados 10 vezes por segundo.
  Medir cedo o servidor e o cliente (`KGPS`).

## 3. Tipos de mapa

| Tipo | Descrição | Destaques |
|---|---|---|
| **Continental** | Terra contínua com florestas, montanhas e planícies | Padrão; estradas e Centros Regionais |
| **Rios e Pontes** | Rios largos que só se cruzam por pontes ou vaus | Pontos de estrangulamento; o Engenheiro constrói e destrói pontes |
| **Montanhoso** | Cordilheiras com poucos passos | Defesa forte, minas de ferro ricas, artilharia valorizada |
| **Deserto** | Pouca comida e madeira, muito petróleo | Economia de comércio; veículos dominam |
| **Oceano Central** | Nações nas extremidades, oceano no meio | Batalhas navais, desembarques, porta-aviões |
| **Arquipélago** | Cada nação numa ilha ou grupo de ilhas | Domínio naval e aéreo; portos essenciais |

**Ordem sugerida:** batalha naval exige conteúdo antes do mapa. Hoje o mar só tem navios mercantes do comércio; sem
navios de guerra e desembarque, Oceano Central e Arquipélago ficariam injogáveis (só aviões e mísseis decidiriam a
partida). Por isso:
1. mapas terrestres maiores para até 4 e 6 nações;
2. Rios e Pontes, Montanhoso e Deserto;
3. conteúdo naval: navio de transporte com desembarque, fragata (antinavio e antiaérea), submarino e, no fim do jogo,
   porta-aviões;
4. Oceano Central e Arquipélago.

## 4. Geografia real dos países

Com até 4 ou 6 nações por partida, o tipo de mapa **não** pode ser derivado da combinação de países (por exemplo,
"Brasil contra Japão gera mar no meio" não funciona quando há quatro países de continentes diferentes). O tipo de mapa é
escolhido pelo anfitrião ou sorteado.

A geografia real entra em escala menor: **a região inicial de cada nação** reflete o país dentro do tipo de mapa escolhido.
Por exemplo, o Brasil começa com mais floresta e rios, a Arábia Saudita com mais petróleo e deserto, o Japão com mais
costa e montanhas. O equilíbrio é mantido por compensações declaradas (quem tem menos de um recurso tem mais de outro),
como na escolha entre os modos paridade e escala real.

---

# Estado da implementação

| Item | Estado | Onde |
|---|---|---|
| Lote 1, §2.1 — blindagem por classe (fuzil ×0,35 em veículos; blindado dano 8 e ×0,6; tanque recarga 1,7 s) | Feito | `shared/sim/config.ts` |
| Lote 1, §2.2 — Lança-Foguetes com 120 de dano por salva | Feito | `shared/sim/config.ts` |
| Lote 1, §2.3 — contra-bateria da IA e torre com alcance 13 | Feito | `PlayerState.unseenFire`, `TacticalAI` |
| Lote 1, §2.4 — defesa proporcional (≈1,5× a força vista) | Feito | `TacticalAI` |
| Lote 1, §1.6 — texto do README sobre depósitos finitos | Feito | `README.md` |
