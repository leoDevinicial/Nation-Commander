# Drone de ataque com controle em primeira pessoa

Aeronave nova da Base Aérea, liberada na Era Digital (era 3), com custo médio (40 ferro, 15 petróleo, 35 suprimentos
antes da escala da economia, mais US$ 1,8 mi da verba de obras e um recruta). É uma munição vagante: é consumida no
ataque.

## Como se usa

1. Base Aérea → **Drone** (produz) → **Lançar drone** → clique no ponto do ataque (anel de alcance: 170).
2. O drone decola e voa sozinho até o ponto, onde mergulha e explode.
3. Nos primeiros **10 s** de voo, um anel azul pulsa embaixo dele e aparece o botão "Assumir o drone (T)". Clique no
   drone, no botão ou aperte **T** para pilotar em primeira pessoa.

## Primeira pessoa (`src/game/render/DroneFpv.ts`)

- Câmera no nariz, inclinada para baixo, com campo de visão de **120°** como nos jogos de tiro (medido em 4:3, o padrão
  de Quake/CS/Apex: ~105° na vertical e ~133° na horizontal em tela 16:9); a interface do mapa some.
- Pilotagem suave: o cliente prevê o voo com as mesmas contas do servidor, então a câmera responde ao mouse e ao
  teclado na hora. Para corrigir sem puxar a câmera para trás, a pose do servidor (que chega atrasada) é comparada com o
  ponto do trajeto previsto do último 1,5 s mais perto dela, e só esse desvio é corrigido aos poucos; acima de 5 a
  câmera vai direto para o servidor.
- Visto do mapa, o drone é tocado no relógio do servidor (tick do snapshot) com atraso fixo de 0,16 s, interpolando
  entre as posições recebidas (buffer de 1,5 s); se um pacote atrasa, segue em frente por até 0,3 s. A oscilação da
  rede não vira tranco.
- Na câmera, o ponto do trajeto é projetado no segmento entre quadros e o desvio passa por um filtro (~0,25 s) antes
  da correção lenta. Simulação com 80–220 ms de latência (`.audit/fpv_jitter.ts`): variação máxima de 0,11 u/s na
  velocidade e 0,07 rad/s no giro entre quadros.
- Trocar de janela solta as teclas do piloto (antes uma tecla podia ficar presa). O OSD usa vinheta pronta e resolução
  até 1,5× para pesar menos. O mouse tem sensibilidade baixa, zona morta pequena e filtro contra o tremido da mão; a
  câmera inclina pouco nas curvas (70% da inclinação).
- OSD no estilo dos óculos de FPV: faixas pretas, modo (ACRO/MAX), bússola, velocidade (km/h), altitude (m), sinal,
  tensão da bateria (por célula e total), porcentagem e segundos de bateria, tempo de voo, horizonte artificial, mira,
  chiado analógico (mais forte com bateria baixa).
- Alvos inimigos à vista (tropas em vermelho, edifícios em laranja) com nome e distância; o mais perto da mira fica
  "ALVO TRAVADO"; fora da tela, uma seta aponta para o mais próximo.
- Pilotar é opcional: sem assumir, o drone vai sozinho até o ponto, como os aviões.
- Controles: mouse dá a direção (o cursor fica travado na tela; mexer vira e inclina o nariz, parar endireita);
  W acelera (~7,8), Shift é o turbo (até 11,5), S freia, A/D viram de leve; Espaço sobe, Ctrl ou C desce; clique esquerdo explode; Esc devolve ao piloto
  automático (soltar o cursor também). No celular, arrastar o dedo é o manche e um toque rápido explode.
- Cuidado: Ctrl + W fecha a aba em alguns navegadores (o jogo não consegue bloquear); por isso C também desce.
- Ao cair o sinal (impacto, derrubado, bateria), a tela vira chiado com "SINAL PERDIDO" e volta ao mapa no ponto.
- Som (referência: turboélice com hélice propulsora de 4 pás): o zumbido da hélice na frequência de passagem das pás
  (~110 a 150 Hz) com harmônicos e a pulsação de cada volta, o assobio da turbina, o vento que cresce com a velocidade e
  um chiado de rádio. Visto do mapa, o drone passando perto tem o zumbido com Doppler (`drone_pass`).

## Regras (servidor, `shared/sim/drones.ts`)

- Tudo é calculado na simulação; o cliente só manda a intenção (`drone_steer` com valores de −1 a 1, limitados de novo
  no servidor), a ~10 por segundo. Só o dono pilota, e só depois de assumir dentro da janela.
- Velocidade 3,0 a 11,5 (cruzeiro 5,4; W ~7,8; Shift, o turbo, 11,5); curva 1,25 rad/s; subida 1,9 (mergulho ×1,5). O manche chega ao drone aos
  poucos (resposta de 3,2/s, ~0,3 s para a curva toda) e o acelerador em ~0,6 s, sem trancos; bateria de 80 s (acelerar gasta mais); sem comando por 2 s, segue reto.
- Explode ao tocar o chão, um edifício ou uma tropa de outro país. A colisão com edifícios usa a altura sólida de
  cada tipo (`shared/sim/buildingHeights.ts`, igual à do modelo 3D; `src/test/buildingHeights.test.ts` confere): o QG
  tem 6 de altura (antes a regra via todos os prédios com 1,7 e o drone atravessava o QG). Os prédios do próprio dono
  só contam depois de 3 s de voo. O dano da ogiva conta a altura a partir do telhado que está embaixo.
- Piloto automático sobe por cima do prédio alto no caminho (olha ~12 à frente) e só desce no mergulho final.
- Na câmera, a previsão para na parede de prédio inimigo enquanto o servidor confirma a batida.
- Desempenho no voo: a sonda de reflexos (`EnvironmentProbe`: 6 renderizações da cena + filtro, a cada 2,5 s quando a
  câmera anda) e a medição de exposição (`AdaptiveExposure`: a cena inteira de novo a cada 0,6 s) ficam congeladas
  enquanto o jogador pilota, porque a câmera anda o tempo todo e elas davam engasgos periódicos; as fronteiras do
  território só são redesenhadas na volta ao mapa; os alvos do OSD são refeitos a cada 150 ms.
- Ogiva: 360 em tropas e 320 em edifícios no raio de 2,6, só contra quem está em guerra com o dono.
- Antiaérea (baterias e defesa móvel) a até 12: chance por segundo de derrubar o drone.
- Visão de 11 em volta do drone para o dono; o inimigo só vê o drone quando ele está à vista.
- KAC: `drone_steer` fica fora do monitor de automação (o ritmo fixo é esperado); o resto continua medido.

## Testes

`shared/test/drones.test.ts` (piloto automático, controle, janela, queda por comando, detonação, antiaérea, névoa,
salvar e carregar) e `server/kac.test.ts` (manche sem falso alerta de automação).

## A fazer

- A IA ainda não produz nem usa drones.
