# Água natural estilizada (03/11)

Pedido do usuário: água "mais natural e menos geométrica", opção 2 (natural estilizada), com o mar "quanto mais
profundo, mais escuro". Tudo em `src/game/render/Water.ts`; continua no estilo do jogo (cores chapadas por faixa, sem
textura fotográfica) e roda no celular.

- **Sem facetas:** o mosaico de triângulos e as cáusticas em células saíram (ficam só atrás de `uNatural = 0`, para
  comparação). A superfície usa ondulações de ruído em várias oitavas com o domínio torcido (`swell`), em duas direções.
- **Profundidade aparente:** o mapa não tem fundo além da margem, então a distância até a costa (`shoreTexture`, agora
  até `SHORE_CELLS` = 30 células) faz o papel da profundidade: turquesa (`uShallow`) → azul-médio (`uMid`) →
  azul-profundo (`uDeep`) → quase marinho em mar aberto (`uAbyss` `#061a33`).
- **Raso transparente:** perto da praia a água deixa ver a areia (alfa pela profundidade real até o solo).
- **Espuma:** faixa na margem com borda recortada que avança e recua; nas cristas das ondas maiores, só um toque.
- **Cáusticas macias** só no raso e **brilho do sol** em faixa, com cintilação discreta.
- **Rastro dos navios:** até `WAKE_SHIPS` = 12 navios (os mais perto do centro da câmera, `GameRuntime.feedWakes`)
  deixam espuma atrás da popa: esteira central em listras, braços em "V" e onda na proa. A força vem da velocidade,
  medida pela própria água entre os quadros (`WaterHandle.setShips`); parado, não há rastro.
- **Ondas na malha** (Gerstner) agora a partir do preset **Alto** (`GraphicsProfile.waterWaves`); antes só no Ultra.
  O KGPS continua podendo trocar pelo plano simples quando o quadro pesa.
