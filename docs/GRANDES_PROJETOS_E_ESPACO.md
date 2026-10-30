# Grandes Projetos Nacionais e Programa Espacial

Itens 13 e 13.1 do lote 2 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Grandes Projetos

Os Grandes Projetos são construções da era **Futuro Próximo**, uma de cada por nação. Elas custam muitos recursos e
uma parte do teto anual da verba de obras do país, levam alguns minutos de obra e dão bônus globais enquanto
estiverem de pé.

| Projeto | Tamanho | Verba de obras | Bônus |
|---|---|---|---|
| Usina Nuclear | 3×3 | 40% do teto | +4 suprimentos/s, obras 10% mais rápidas, +0,5 p.p. de crescimento |
| Rede 5G Nacional | 2×2 | 35% | pesquisa militar 30% mais rápida, +2 de visão para todas as tropas, +0,4 p.p. |
| Hidrelétrica | 3×3, na margem da água | 40% | +15% na coleta de todos os recursos, +2 suprimentos/s, +0,4 p.p. |
| Centro Financeiro | 2×2 | 30% | teto da verba de obras 50% maior, +3 suprimentos/s, +0,6 p.p. |
| Programa Espacial | 4×4 | 90% | satélite (abaixo), +0,5 p.p. |

O crescimento entra no painel nacional como o fator "Grandes Projetos Nacionais". A IA ergue a Usina Nuclear e o
Centro Financeiro quando chega à última era com folga de material. Os valores estão em `BUILDINGS` e `PROJECT_FX`
(`shared/sim/config.ts`).

## Programa Espacial

O Programa Espacial é a construção mais cara do jogo: 1500 suprimentos, 1200 ferro, 800 pedra, 600 madeira, 600
petróleo, 90% do teto da verba de obras e 6 minutos de obra. Exige:
- a era Futuro Próximo;
- o Centro de Comando no nível 9;
- a pesquisa nacional **Tecnologia espacial** (pré-requisitos: Mísseis balísticos e Sensores e óptica térmica).

**Complexo de lançamento** (`buildSpaceCenter` em `src/game/render/models/projects.ts`, low poly):
- plataforma elevada com fosso de chamas que leva o jato para fora, defletor em cunha e canos da supressão por água;
- torre de lançamento em treliça de aço, com plataformas, elevador, guindaste e para-raios;
- esferas de propelente com tubulação até a plataforma e caixa-d'água elevada da supressão acústica;
- prédio de montagem vertical com a faixa da nação e a pista até a plataforma;
- centro de controle, bunker e duas antenas de rastreio;
- torres para-raios.

O foguete é de dois estágios, com dois propulsores laterais, pernas recolhidas, aletas em grade, interestágio escuro
e coifa ogival com a faixa da nação. Ele e os braços da torre ficam em `src/game/render/SpaceLaunch.ts`.

**Lançamento:** a sequência anda num relógio próprio, corrigido pelo progresso das fases que vem do servidor. Por
isso a animação e o som ficam sincronizados.
1. Com a obra pronta, o jogador autoriza o lançamento mantendo o botão pressionado.
2. **Contagem (10 s):**
   - o oxigênio líquido solta vapor branco pelos respiros, que escorre pelo corpo do foguete;
   - o braço de acesso da tripulação recolhe (−7,5 a −5,5 s);
   - a água da supressão acústica jorra em volta da mesa (−3,6 s).
3. **Ignição (−2,2 s):** os motores acendem com o foguete ainda preso pelos grampos.
   - A luz estoura e ilumina a plataforma.
   - O jato bate no defletor e uma nuvem enorme de fumaça e vapor sai pelo fosso de chamas e rola pela plataforma.
   - O foguete treme, e a câmera também, conforme a proximidade.
4. **Decolagem (0 s):** os umbilicais se soltam e o foguete sobe devagar, acelerando.
   - A chama (miolo branco, envelope laranja e discos de choque) se alonga e abre com a altitude.
   - O rastro de fumaça fica no céu.
   - A partir de ~4 s o foguete começa a inclinar (curva de gravidade) e some no alto (cerca de 9 s).
5. Depois do satélite em órbita a plataforma fica vazia, e a fumaça se desfaz aos poucos.
6. Todos os jogadores são avisados na contagem, na decolagem e no satélite em órbita.

**Som do lançamento**, sincronizado com a animação e ouvido em todo o mapa (mais baixo de longe, `playWide`):
- `space_prelaunch`, que toca na contagem:
  - o ronco mecânico grave das bombas de propelente e o sopro dos respiros;
  - a hidráulica do braço da tripulação, com o baque metálico no fim;
  - válvulas batendo e a água da supressão acústica;
  - na ignição (−2,2 s), o baque grave e o ronco nascendo.
- `space_liftoff`, que toca na decolagem:
  - ronco grave contínuo e saturado, subgrave e turbulência do ar;
  - o estalo característico do jato de foguete, gerado pulso a pulso (`rocketCrackleBuffer`);
  - a força cresce até ~4 s; depois o som se afasta, abafando e baixando, com os reflexos do terreno e o ronco
    distante rolando por ~20 s.

**Satélite em órbita:**
- O dono vê o mapa inteiro, em tempo real: tropas e construções inimigas aparecem e são registradas como descobertas
  (servem de alvo para ataques aéreos e mísseis).
- As minas terrestres, quando existirem, continuam escondidas.
- O satélite aparece orbitando o globo diplomático, com a bandeira e a sigla do país, à vista de todos.
- Modelo do satélite (`src/globe/satelliteModel.ts`), no estilo dos satélites de comunicação reais:
  - corpo cilíndrico com manta térmica dourada, anéis prateados, módulo de equipamentos com radiador e tanques;
  - antena parabólica grande voltada para a Terra, com estrutura de reforço atrás e o alimentador preso por três hastes;
  - duas asas solares de três segmentos, com células, moldura, dobradiças e braço em treliça, que giram devagar
    acompanhando o Sol;
  - propulsor principal e quatro de manobra, duas parabólicas pequenas, antena de chicote, mastro longo de
    magnetômetro e luz de navegação vermelha piscando.
- A nação dona ganha aprovação extra pelo orgulho nacional.

Decisões de balanceamento tomadas:
- um satélite por nação;
- destruir o Programa Espacial depois do lançamento **não** derruba o satélite, só impede novos lançamentos;
- por enquanto não há arma antissatélite.

O lançamento em andamento e o satélite ficam no estado salvo.

## Testes

- `shared/test/projects.test.ts` cobre:
  - a era, o projeto único por nação e o custo em US$;
  - os bônus da usina, da 5G e da hidrelétrica (esta exige água);
  - o lançamento completo e o satélite revelando o mapa;
  - salvar e carregar;
  - o registro nacional do satélite.
- `src/test/spaceLaunch.test.ts`: os motores acendem com o foguete ainda preso, o foguete sobe devagar e acelerando,
  a plataforma fica vazia depois da órbita e o tremor de câmera acompanha.
