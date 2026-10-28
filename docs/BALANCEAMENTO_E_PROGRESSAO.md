# Balanceamento, progressão e ideias de design

Análise do estado do jogo e propostas de melhoria, em dois lotes:

1. **Diagnóstico de balanceamento e progressão**, com elementos de city builder inspirados em *Tropico 5* e *Tropico 6*.
2. **Elementos inspirados em *Rise of Nations*** que ainda não existem no jogo.

Nada aqui está implementado: são propostas para discussão. Os números do diagnóstico saem das tabelas do código
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

- **Eras ligadas ao nível do QG** (estilo *Rise of Nations* / *Tropico 5*): por exemplo Guerra Fria → Pós-Guerra Fria →
  Contemporânea → Futuro Próximo. Cada era muda o visual, libera edifícios e unidades e toca uma música; os 10 níveis
  lineares viram 3 ou 4 saltos perceptíveis.
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
| **Eras** | Ver seção 3: a espinha da progressão. |
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
- **Proposta:** eras como pesquisa nacional (Guerra Fria → Pós-Guerra Fria → Era Digital → Futuro Próximo). Cada era exige
  um nível mínimo do QG e libera um novo patamar do Centro de Pesquisa Militar e das melhorias.

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

**14. Relógio do Juízo Final**
- **No RoN:** cada arma nuclear lançada avança o relógio do Armagedom; no limite, todos perdem.
- **Proposta:** relógio global em que cada lançamento de míssil balístico avança o contador, derruba as relações com todos
  os países e gera sanções automáticas. No limite, a partida termina sem vencedor. Torna o míssil uma decisão moral e
  estratégica.

**15. Condições de vitória variadas**
- **No RoN:** conquista, território, maravilhas e pontuação.
- **Proposta:** além de destruir o QG:
  - **vitória territorial**, por controle do mapa durante X minutos;
  - **vitória política**, quando o rival entra em colapso de estabilidade por sanções e protestos.

## Prioridade sugerida (lote 2)
1. **Cidades secundárias com captura (1 e 2):** resolvem a falta de expansão e dão objetivos intermediários.
2. **Grandes Projetos Nacionais (13):** ligam a camada nacional ao teatro e dão sensação de "construir uma nação".
3. **Relógio do Juízo Final (14):** custo baixo, porque o sistema de mísseis já existe, e impacto narrativo alto.
4. **Bônus únicos por país (12):** pouco código, muita identidade.
