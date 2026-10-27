# Fase 7 do adendo — força aérea, bases aéreas, mísseis e áudio contextual

O servidor decide tudo (`shared/sim/air.ts`, ligado à simulação tática). O cliente só envia intenções:

- `build_aircraft` (produzir aeronave numa base);
- `air_mission` (reconhecimento num ponto ou ataque a um edifício);
- `build_missile` (produzir míssil num silo);
- `missile_prepare` (escolher o alvo e abastecer);
- `missile_authorize` (autorização final);
- `missile_abort` (abortar antes do lançamento).

O painel usa as mesmas regras para mostrar o motivo de cada bloqueio. Toda aleatoriedade (antiaérea,
precisão, interceptação) usa um gerador determinístico salvo no estado: salvar e carregar continua idêntico.

## Instalações
| Construção | Custo | Para quê |
|---|---|---|
| Base Aérea (3×3) | 100 madeira, 150 pedra, 120 ferro, 100 suprimentos; manutenção 0,1 suprimentos/s + 0,03 petróleo/s | hangar para 4 aeronaves, pista, torre de controle, combustível; terminal do comércio aéreo |
| Bateria Antiaérea (1×1) | 60 pedra, 90 ferro, 40 suprimentos; manutenção 0,04/s | defende num raio de 12 contra aeronaves e mísseis; não dispara contra tropas |
| Silo de Mísseis (1×1) | 160 pedra, 200 ferro, 120 suprimentos; manutenção 0,08/s | guarda até 2 mísseis; exige a pesquisa **Mísseis balísticos** |

## Aeronaves
Nenhuma aeronave é gratuita. Cada uma custa materiais, verba de obras e **um recruta (piloto)**, e passa a
contar como militar na população.

| Classe | Custo | Produção | Alcance | Velocidade | Combustível | Manutenção | Papel |
|---|---|---|---|---|---|---|---|
| Caça multifunção | 60 ferro, 40 petróleo, 50 supr. + US$ 3 mi | 30 s | 170 | 14 | 0,12 petróleo por unidade voada | 0,04 supr./s; 25 s em solo após voar | ataque e interceptação |
| Reconhecimento | 30 ferro, 25 petróleo, 30 supr. + US$ 1,5 mi | 20 s | 200 | 16 | 0,08 | 0,02 supr./s; 15 s | revela área e registra edifícios |
| Cargueiro | 50 ferro, 30 petróleo, 40 supr. + US$ 2,5 mi | 25 s | — | — | — | 0,03 supr./s | +1 embarque aéreo simultâneo no comércio |

- **Disponibilidade:** uma aeronave fica em produção, pronta, em missão ou em manutenção.
- **Manutenção não paga:** a manutenção entra na mesma conta de suprimentos dos edifícios. Sem suprimentos,
  as aeronaves prontas ficam **em terra** até a conta ser paga.
- **Base destruída:**
  - as aeronaves no hangar se perdem;
  - as que estão em missão se perdem ao voltar, por falta de pista.

## Missões
O mapa padrão tem 128 × 128 unidades: os alcances cobrem o teatro a partir de uma base perto do QG, mas uma
base avançada encurta o voo (menos combustível, menos tempo exposto e manutenção mais cedo).

- **Combustível:** o petróleo de ida e volta é debitado na decolagem (distância × 2 × consumo).
- **Tempo de voo:** distância ÷ velocidade na ida e o mesmo na volta. Depois vem a manutenção em solo.
- **Reconhecimento** (só aeronaves de reconhecimento):
  - revela um raio de 18 por 40 s;
  - registra os edifícios inimigos vistos.
- **Ataque** (só caças, até 4 por ordem). Exige:
  - a pesquisa **Munição guiada**;
  - guerra com o dono do alvo;
  - alvo **já descoberto**, por visão ou reconhecimento (o ataque não fura a névoa de guerra);
  - alvo dentro do alcance;
  - combustível.
- **Defesa ao chegar ao alvo:** cada aeronave pode ser derrubada. A chance soma:
  - 25% por bateria antiaérea a até 12;
  - 8% por torre a até 8,4;
  - 15% por caça pronto em base aérea inimiga a até 25;
  - teto de 75%.
- **Precisão:** de 60% a 100% do dano por caça (180), ou de 75% a 100% com munição guiada. Dano parcial é o
  normal: destruir exige vários ataques.
- **Tanque de petróleo atingido:**
  - perde petróleo na proporção do dano (dano ÷ vida antes do impacto), nunca mais do que havia nele;
  - se destruído, perde **exatamente o estoque do momento do impacto**;
  - a perda aparece como "perda de petróleo (depósito atingido por ataque)".
- **Resultado registrado** em cada missão: aeronaves abatidas, dano, petróleo perdido, destruição e edifícios
  descobertos. Aparece no painel da base, no painel de eventos e no noticiário nacional.

## Mísseis
- **Produção:** 80 ferro, 60 petróleo, 60 suprimentos + US$ 6 mi, 45 s. O inventário é explícito no silo
  (máximo de 2, contando o lançamento em andamento).
- **Estados distintos:**

  | Estado | O que acontece |
  |---|---|
  | **preparar** | escolha do alvo; 10 s de abastecimento; o míssil sai do inventário |
  | **armado** | aguarda autorização e nunca lança sozinho |
  | **autorizado/contagem final** | 3 s; não dá mais para abortar |
  | **em voo** | velocidade 25 |
  | **impacto** ou **interceptado** | fim do lançamento |

- **Requisitos para preparar:**
  - pesquisa e silo operacional;
  - míssil no silo;
  - alvo no território de um país com quem há **guerra**;
  - alvo à vista ou junto de um edifício já descoberto.
- **Na autorização:** a guerra é conferida de novo. Uma paz decretada depois de armar bloqueia o lançamento.
- **Abortar:** possível na preparação ou com o míssil armado; o míssil volta ao silo.
- **Impacto:** dano em área (raio 4, 700 no centro, mínimo de 25% na borda) em edifícios e tropas. Tanques
  atingidos perdem petróleo na mesma regra.
- **Interceptação:** 20% por bateria antiaérea do país-alvo a até 10 do alvo, com teto de 60%.

### Silo nível 2: míssil pesado de nova geração

A melhoria do silo (nível 2: 220 pedra, 280 ferro, 90 petróleo, 160 suprimentos + US$ 45 mi, 50 s) troca o
poço simples por uma **torre de lançamento** e passa a usar o **míssil pesado**:

| | Nível 1 | Nível 2 (pesado) |
|---|---|---|
| Abastecimento | 10 s | 5 s |
| Contagem final | 3 s | 2 s |
| Velocidade | 25 | 32 |
| Dano no centro | 700 | 1150 |
| Raio | 4 | 5,5 |
| Interceptação | 20% por bateria, teto 60% | 13% por bateria, teto 45% |

- **Visual da torre:**
  - duas torres treliçadas com plataformas de serviço;
  - braços umbilicais e luz de balizamento;
  - defletor de chamas e tanques de propelente.
- **Abastecimento:** o míssil sobe do fundo do silo e fica de pé entre as torres soltando vapor branco.
- **Lançamento:** a pré-ignição começa antes. O jato bate no defletor e sai em leque pela frente, a torre
  treme e a ignição traz um clarão maior, uma nuvem enorme, uma onda de choque e um estrondo.
- **Míssil:** mais grosso e longo, com ogiva escura, asas cruciformes no meio do corpo, aletas de cauda largas
  e faixas de alerta. O rastro de fumaça é mais largo.
- **Impacto:** o impacto comum maior, com um segundo clarão, um anel de explosões em volta, brasas lançadas
  para todos os lados, mais poeira, três ondas de choque e um tremor forte da câmera.
- **Geração:** vale a do silo no momento da preparação e fica gravada no lançamento, também nas partidas salvas.

### Segurança contra lançamento acidental (celular e desktop)
1. "Preparar lançamento" abre a escolha de alvo. O toque ou clique só **marca** o alvo (anel vermelho).
2. "Confirmar alvo" inicia a preparação. Ainda dá para abortar, e o míssil volta ao silo.
3. Armado, a autorização exige **manter pressionado** o botão vermelho por 1,5 s (dedo, mouse ou
   Enter/Espaço). Um toque curto, arrastar para fora ou rolar a tela cancela.

## Consequências nacionais
- **Ataque aéreo:** −4 de memória com o país atingido e −1 com cada um dos demais países.
- **Míssil:** −10 com o atingido e −4 com os demais, mesmo interceptado.
- As memórias decaem como as demais da diplomacia.
- Ataques e mísseis viram notícia (`military_strike`) com dano, estruturas destruídas e petróleo perdido. Saem
  para quem atacou, para quem foi atacado e para quem conhece os dois.
- Aeronave abatida conta como baixa na opinião pública.
- **IA tática:** constrói até 3 baterias antiaéreas quando descobre uma base aérea ou um silo inimigo.

## Comércio aéreo (reuso da Fase 6)
- **Terminais do modal aéreo:** as bases aéreas e o heliponto do QG nível 4.
- **Embarques aéreos simultâneos:** terminais comerciais × 2 + cargueiros prontos.

## Visual
- **Modelos novos:**
  - Base aérea: pista com faixas e luzes, hangar em arco com caça no pátio, torre de controle envidraçada,
    tanques de combustível, caminhão-tanque, biruta e radar girando.
  - Bateria antiaérea: lançador de quatro tubos girando, radar de tiro e sacos de areia.
  - Silo: tampa blindada, bunker, cerca, luz de alerta e antena.
- **Aeronaves em voo:** em formação na altitude de voo, com a cor da nação. As inimigas só aparecem quando
  estão à vista.
- **Míssil:**
  - sobe da boca do silo na contagem final;
  - voa em arco balístico com brilho do motor e rastro de fumaça;
  - ignição: clarão e nuvem no silo;
  - impacto: explosões, clarão e onda de choque;
  - interceptação: estouro alto no céu, sem dano no chão.
- **Silo próprio:** farol âmbar na preparação e vermelho piscando quando armado.
- **Alvos:** anel pulsante no alvo, tanto no próprio lançamento quanto num míssil inimigo contra nós. Na escolha
  de alvo da base, aparece um anel com o raio de ação.
- **Névoa:** a área revelada pelo reconhecimento aparece clara na névoa do cliente.

## Áudio contextual
Serviço central em `src/game/audio/AudioService.ts`. Todo som é **sintetizado no aparelho** com WebAudio: nenhum
arquivo é baixado em tempo de execução e não há material de terceiros a licenciar.

- **Canais e volumes:**
  - canais geral, música, interface, ambiente, combate e produção, cada um com volume próprio, mais
    "silenciar tudo";
  - ficam em Configurações e no Menu da partida ("Áudio e Volumes") e valem na hora;
  - um compressor no fim evita distorção.
- **Contexto de áudio:** só nasce no primeiro gesto do jogador, como os navegadores exigem.
- **Combate:**
  - fuzil, canhão, torre, explosões, passagem de jato, bombas, antiaérea, lançamento, impacto e interceptação;
  - posicionado pela distância ao ponto que a câmera olha, considerando o zoom;
  - panorâmica estéreo pelo lado da tela;
  - variação de altura e timbre a cada som;
  - intervalo mínimo entre sons iguais;
  - limite de vozes: 24 no desktop, 10 no celular. O que excede é descartado pela prioridade (um impacto de
    míssil nunca é cortado por tiros de fuzil).
- **Produção:**
  - só o edifício próprio **selecionado** toca o som de trabalho: serra, britador, mina, fábrica, bomba de
    petróleo, trator, turbina em marcha lenta, porto, escritório ou zumbido;
  - entrada e saída suaves (0,6–0,8 s);
  - para ao desmarcar ou trocar a seleção.
- **Mísseis:** sons distintos para cada etapa.
  - preparação: pulsos da bomba de combustível;
  - armado: alarme de dois tons a cada 1,2 s até autorizar ou abortar;
  - autorização: sirene ascendente;
  - lançamento: ignição e rugido;
  - impacto: estrondo com cauda longa;
  - interceptação: estalo seco e alto.
- **Ambiente e música:**
  - vento baixo durante a partida;
  - trilha procedural de acordes lentos (canal de música, baixo por padrão).
- **Interface:**
  - clique nos cartões de ação;
  - erro em botão bloqueado ou ordem recusada;
  - alerta de ataque e de míssil inimigo;
  - sucesso em obra ou melhoria concluída;
  - tom ao começar a segurar a autorização.

### Testes
`shared/test/air.test.ts` (17 testes) cobre:
- produção, hangar e piloto;
- manutenção não paga;
- missões inválidas com o motivo;
- reconhecimento;
- perda exata de petróleo (parcial e total);
- antiaérea;
- base destruída;
- silo e inventário;
- estados e confirmação do míssil, aborto, paz depois de armar e interceptação;
- salvar/carregar no meio de missão e lançamento;
- `parseCommand`;
- comércio aéreo;
- visão por jogador;
- consequências nacionais.

`src/test/audio.test.ts` cobre:
- atenuação e panorâmica;
- limite de vozes por prioridade;
- serviço seguro antes do primeiro gesto;
- volumes salvos e validados.
