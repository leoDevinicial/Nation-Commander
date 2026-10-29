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

**Lançamento:**
1. Com a obra pronta, o jogador autoriza o lançamento mantendo o botão pressionado.
2. Há uma contagem regressiva de 10 s, com vapor na plataforma.
3. Na ignição há clarão, nuvem de fumaça, onda de choque, tremor e som. O foguete acelera, com chama e coluna de
   fumaça, até sumir no alto da tela (cerca de 9 s).
4. Todos os jogadores são avisados na contagem, na decolagem e no satélite em órbita.

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
