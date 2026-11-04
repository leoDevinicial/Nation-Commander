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
