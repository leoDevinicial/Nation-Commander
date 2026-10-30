# Domo de Ferro

Estrutura militar de defesa antimíssil (2×2), da era **Futuro Próximo**, como o silo de mísseis. Exige a pesquisa
nacional **Mísseis balísticos**. Fica na aba Militares do menu de construção.

## Regra (`IRON_DOME` em `shared/sim/air.ts`)

| Item | Valor |
|---|---|
| Custo | 360 pedra, 520 ferro, 400 suprimentos e 200 petróleo (o silo custa 320 / 400 / 240), 45 s de obra |
| Vida, trabalhadores, manutenção | 900, 3, 0,12 suprimento/s |
| Área protegida | alvo do míssil a até 22 da bateria |
| Disparo | 2 interceptadores por míssil, 90% de acerto |
| Magazine | 4 interceptadores (2 interceptações); a bateria nova já vem cheia |
| Recarga | um interceptador por vez, 40 s cada, pagando 30 ferro, 20 petróleo e 30 suprimentos |
| Espera dos lançadores | 10 s entre uma interceptação e outra |

**O que intercepta:** só o míssil balístico comum (1ª geração). O míssil pesado (silo no nível 2) e a ogiva nuclear
passam.

**Como funciona:**
- Quando um míssil comum sai do silo contra um ponto protegido, a bateria mais perto do alvo engaja, se tiver dois
  interceptadores e os lançadores prontos.
- Os interceptadores saem no momento certo para encontrar o míssil a 72% do voo dele. O acerto é sorteado no disparo
  e aplicado no encontro (evento `dome`).
- **Se acerta:** o míssil vira `intercepted`, sem dano nenhum.
- **Se erra:** o míssil segue e ainda passa pela chance normal das baterias antiaéreas no impacto.

**Contra o spam de mísseis** (pedido de jogador): o magazine é pequeno, a recarga é lenta e paga, e há espera entre
engajamentos.
- Dois mísseis lançados juntos: só um é engajado.
- Duas salvas seguidas esvaziam a bateria.
- Depois disso, a área fica aberta até a recarga.

O estado das baterias fica no salvamento (`AirSave.domes`).

## Modelo (`src/game/render/models/ironDome.ts`, low poly)

Feito a partir da foto de referência:
- três lançadores sobre reboque com sapatas, com casulos de 20 tubos (5 × 4) inclinados a ~69°;
- nos casulos, nervuras, tampas escuras dos tubos e a faixa da nação;
- cavaletes em A e o mastro de comunicação atrás de cada lançador, com o painel branco em losango;
- radar de busca de painel plano sobre plataforma giratória (gira o tempo todo);
- contêiner do centro de controle com ar-condicionado e antenas, gerador, giroflexes laranja, cascalho e cerca.

`DOME_TUBES` dá a boca de cada tubo e a direção do casulo, de onde saem os interceptadores.

## No cliente

- **Interceptadores** (`src/game/render/DomeLayer.ts`):
  - saem de tubos diferentes a cada disparo, com clarão e sopro de fumaça no lançador;
  - sobem na direção do casulo e fazem a curva até o ponto de encontro (cúbica), deixando o rastro branco e grosso que
    fica no céu;
  - o segundo sai 0,5 s depois e chega logo após o primeiro;
  - os que não derrubam o míssil se autodestroem com um estouro pequeno.
- **Interceptação:** a explosão sai do ponto de encontro, alto no céu. Vêm o clarão, a luz, a fumaça escura descendo e
  os destroços, e um tremor leve de câmera.
- **Sons:**
  - `dome_launch`, a cada interceptador: estalo da ignição, baque da carga de expulsão e o motor sólido rasgando para
    cima até sumir;
  - `dome_intercept`: estalo seco e forte, o estrondo vindo do céu e o eco rolando pelo terreno.
- **Painel do edifício** (`DomeInfo`): interceptadores prontos, recarga do próximo e espera dos lançadores.

## Testes (`shared/test/air.test.ts`, "Domo de Ferro")

- A bateria é mais cara que o silo e exige a pesquisa.
- Dispara dois interceptadores e derruba o míssil comum sem dano. Se erra, o míssil cai no alvo.
- Não segura uma salva: espera entre engajamentos, magazine limitado e recarga lenta e paga.
- Não intercepta a ogiva nuclear nem o míssil pesado.
- Salvar e carregar mantém os interceptadores e o engajamento em curso.

## Pendente

- A IA ainda não constrói o Domo de Ferro.
- O guia do jogador em PDF ainda não o descreve.
