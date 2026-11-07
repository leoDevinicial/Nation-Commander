# Trailer cinematográfico — roteiro (06/11/2026)

90 s, 16:9, 1920×1080, 24 qps (sem GPU na nuvem: ~6,5 s por quadro em 1080p; 60 qps levaria ~10 h só de render).
Tudo é partida real do jogo (Sandbox no servidor de gravação), câmera de roteiro e interface verdadeira. Nada gerado
por IA na imagem; o ElevenLabs entra só no som (música, narração, contagem regressiva e reforço de efeitos).

Mensagem: **BUILD YOUR NATION. ADVANCE YOUR TECHNOLOGY. COMMAND THE WORLD.** (trailer em inglês, para o Reddit).

| Tempo | Plano | Gravação | O que se vê | Som |
|---|---|---|---|---|
| 0–4 | 1. Amanhecer | R1 cidade | voo baixo sobre a floresta até a capital, luz dourada | cordas suaves; "Every nation begins with a single decision." |
| 4–10 | 2. Cidade nasce | R1 | time-lapse real: a IA ergue casas, fazendas, minas, estradas | pulso leve; obras |
| 10–14 | 3. Cidade viva | R1 | grua baixa: tráfego, cidadãos, porto e pesqueiros | narração "Raise your cities…"; cartela BUILD YOUR NATION |
| 14–21 | 4. Eras | R1 | mesmo quarteirão trocando de aparência: Guerra Fria → Pós-Guerra Fria → Era Digital → Futuro Próximo | batida a cada era; nome da era na tela |
| 21–26 | 5. Pesquisa | R2 interface | árvore de pesquisa e painel nacional reais (em inglês) | "Research. Diplomacy. Every choice…" |
| 26–30 | 6. Geopolítica | R2 | globo e diplomacia (contato, pacto, aliança) | cartela ADVANCE YOUR TECHNOLOGY |
| 30–46 | 7. Programa Espacial | R3 espaço | plataforma, contagem 10…1, ignição, decolagem, foguete sumindo no céu | voz de controle de missão (rádio); silêncio na ignição; impacto na decolagem |
| 46–52 | 8. Domo de Ferro | R4 dissuasão | míssil entrando, interceptadores, explosão no céu (câmera lenta 0,5×) | sirene, "Defend what you built." |
| 52–60 | 9. Nuclear | R4 | silo abre, míssil sobe, cogumelo e onda de choque | sirene do silo, grave longo; silêncio antes do clarão |
| 60–64 | 10. Coluna blindada | R5 guerra | câmera rente ao chão, tanques avançando | percussão de guerra |
| 64–67 | 11. Artilharia | R5 | salva dos lança-foguetes | ronco da salva |
| 67–72 | 12. Marinha | R6 oceano | frota (fragatas, porta-aviões, submarino) navegando e disparando | |
| 72–76 | 13. Força aérea | R5 | bombardeiros sobre a base inimiga | |
| 76–80 | 14. Choque | R5 | órbita sobre a batalha | "…and command the world." |
| 80–90 | 15. Final | cartela | COMMAND THE WORLD → logo NATIONS COMMANDER (mesma abertura do jogo: Michroma, grade tática) | golpe final e silêncio |

## Como gravar

- `server.ts`: servidor de gravação (simulação parada, `GET /step?n=`), mais `/cmd` (ordem em nome de outra nação) e
  `/info` (resumo do estado). Porta em `REC_PORT`.
- `common.cjs`: abre o Sandbox, esconde a interface, câmera de roteiro (`__camPose`), hora do dia fixa (`__tod`) e
  céu limpo.
- Cada gravação (R1…R6) é um script próprio; protótipos em baixa resolução antes do 1080p.

## Resultado (07/11/2026)

`trailer_out/NationsCommander_Trailer_1080p.mp4` (fora do git): 88,7 s, 1920×1080, 24 qps, H.264 + AAC 48 kHz, −14 LUFS.

| Cena | Gravação | Observação |
|---|---|---|
| R1 cidade | `SCENE=r1` (+ `TAG=s1 RANGES=0-4.2` para o amanhecer) | a IA inimiga ergue a cidade; time-lapse de 5500 ticks/s |
| R1b eras | `SCENE=r1b` | três `advance_era` no Sandbox |
| R2 interface | `SCENE=r2` (partida normal contra a IA, em inglês) | seleção por caixa com o mouse, Centro de Comando, pesquisa, globo |
| R3 espaço | `SCENE=r3` | T-10 a T-5 na montagem: o plano aberto (T-7,25 a T-5) em câmera lenta 0,45× |
| R4 domo e nuclear | `SCENE=r4 SLOW=4-6 DUR=21` | base inimiga avançada com o Domo de Ferro (`/setup`); câmera lenta na interceptação |
| R5 guerra | `SCENE=r5 DUR=23` | montagem do vídeo de combate (`../setup.cjs`) |
| R6 marinha | `SCENE=r6 DUR=10.5 NOSUSPEND=1` | mapa Oceano Central; Porto criado por `/setup` (`mine`), frota produzida nele |

Montagem: `python3 assemble.py edl.json` (imagem, cartelas e clarões) e `python3 mixdown.py edl.json mix.wav` (áudio em
numpy; o `amix` do ffmpeg abria um buraco de ~60 s com dezenas de faixas), depois `loudnorm` e mux com `-c:v copy`.
Sons do jogo: o `audio.json` de cada gravação refeito pelo `mix.cjs` (motor de áudio do próprio jogo, offline).
Música, narração (voz "Philip"), contagem (voz "Emily", filtro de rádio) e impactos: ElevenLabs.

## Armadilhas novas

- Sem GPU: ~7 s por quadro em 1080p com uma gravação; três em paralelo ficam mais lentas no total (contenção).
- Perfil gráfico "Equilibrado": no Alto/Ultra a sonda de reflexos deixa a imagem lavada no SwiftShader.
- Vite de gravação: `vite --config scripts/video/trailer/vite.rec.config.ts` (não recarrega a página quando os
  roteiros mudam; uma recarga derrubou duas gravações).
- `setSuspended(true)` na preparação economiza CPU, mas deixa o céu branco nos ~150 primeiros quadros desenhados;
  use `NOSUSPEND=1` quando o começo da cena importa.
- Regravar um trecho de cena com a IA ativa (R1) ou com obras por tentativa (R3) não reproduz a mesma partida.
- `sandbox_spawn` procura espaço em terra: navio vem do Porto. O alcance do míssil é 90: alvo numa base avançada.
