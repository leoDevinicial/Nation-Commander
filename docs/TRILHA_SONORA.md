# Trilha sonora original (04/11)

Quatro faixas em `public/music/` (MP3 128 kbps, ~2,9 MB cada, tocadas em streaming pelo canal **Música** das
configurações, com volume e mudo próprios):

| Estado de ameaça | Faixa |
|---|---|
| Construção (`calm`) | Architect of the Horizon e The Last Perimeter, alternadas (uma emenda na outra com crossfade antes de acabar) |
| Ataque convencional (`combat`) | The War Board (em laço) |
| Ataque massivo e guerra nuclear (`massive`) | Strike at Zero (em laço) |

## Transições
`AudioService.setThreat` troca de faixa só quando o estado muda, sempre por **crossfade**: 3 s para subir a tensão,
5 s para voltar à calma e 4 s entre as faixas calmas. Uma faixa de combate que volta em menos de 1 min continua de onde
parou; depois disso, recomeça.

## A guerra acima da música
O som da guerra tem prioridade sobre a trilha, sem a música ficar "bombeando" a cada tiro:
- **Mixagem por estado:** as faixas de combate tocam quase no nível das de construção (The War Board 0,85 e Strike at
  Zero 0,8 do canal; construção 0,85), e a troca acompanha o crossfade de 3–5 s.
- **Espaço na frequência (`MUSIC_EQ`):** em combate a música perde um pouco de graves (shelf em 180 Hz, −2 dB; −3 no
  ataque massivo) e de médios (pico em 1,4 kHz, −1,5 dB; −2,5 no massivo). O filtro muda devagar (constante de 1,2 s)
  e volta a zero na calma.
- **Ducking só em eventos grandes (`DUCK`):** explosão grande, explosão de blindado pesado, bomba, bombardeio em tapete,
  impacto de míssil, nuclear e decolagem espacial abaixam a música 25–40% (proporcional à distância), descendo em
  ~150 ms e voltando em ~2,5 s; eventos seguidos não somam. Fuzil, metralhadora e canhões não mexem no volume da
  música.
- **Combate +3 dB (`COMBAT_BOOST` = 1,4 no canal de combate)** sobre o volume das configurações (padrão 0,8).
- **Ajuste de 04/11 (noite), feedback de partida no celular:** "nenhuma música de guerra tocou" e "tiros e explosões
  podem ser mais proeminentes". Medido antes (04/11, tanques perto do QG): música de combate entre −33 e −40 dB, contra
  −20 a −25 na calma; com a faixa de guerra mais baixa (0,7) e o corte de −4/−5 dB, ela sumia na caixinha do celular.
  Agora a música de guerra fica perto do nível da calma e quem ganha espaço são os efeitos (+3 dB). No navegador do
  computador a troca para The War Board foi confirmada durante o combate no Sandbox. Se o navegador recusar tocar a
  faixa nova (mídia barrada fora de um toque, no celular), ela é tentada de novo no próximo toque ou tecla.

## Controle do jogador
- **Menu → Áudio e Volumes** (na partida) ou **Configurações**: volume geral, música, interface, ambiente, combate e
  produção, valendo na hora; "Silenciar todo o som" e "Silenciar só a música".
- **Botão 🎵 na barra de cima** (ou a tecla **M**): liga e desliga só a música a qualquer momento; tiros, explosões e
  alertas continuam. A escolha fica salva (`musicMuted` em `nc.settings.v1`).

## Estado de ameaça (`src/game/audio/threat.ts`, `GameRuntime.noteThreat`)
Só com o que o jogador já vê (eventos do snapshot e unidades visíveis):
- **combate**: construção nossa sob ataque, tiro envolvendo unidades ou prédios nossos, atrito em território inimigo,
  ataque aéreo, incidente de fronteira, míssil convencional vindo ou indo, cidade inimiga tomada, inimigos perto das
  nossas construções;
- **ataque massivo**: 16+ inimigos à vista a até 28 das nossas construções, 8+ perdas nossas em 20 s, 80+ tiros
  envolvendo o jogador em 12 s ou uma cidade nossa tomada;
- **guerra nuclear**: qualquer lançamento nuclear no mundo (evento `world` ou míssil nuclear em voo/impacto) segura o
  estado massivo por 90 s.

Subir é imediato; descer espera 40 s sem sinais (massivo → combate) e 25 s (combate → construção), para a música não
trocar a cada tiro. Constantes em `THREAT`; testes em `threat.test.ts`.
