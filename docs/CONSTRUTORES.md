# Construção por cidadãos (01/11)

Pedido do usuário depois de uma partida real: "construções precisem de cidadão pra ir lá construir, assim como no Rise
of Nations [...] quanto mais cidadãos alocar pra construção constrói mais rápido com um limite de 4 e para cada 1 que
faltar de 4 tira 25% da velocidade de construção atual, ex 1 trabalhador sozinho demora 4x tempo atual".

Onde está:

- **Regra:** `BUILDERS` em `shared/sim/config.ts`; `Simulation.staff` (alocação) e `Simulation.updateConstruction`
  (ritmo). Ligada por `SimulationInit.builders` (padrão: ligada, exceto nas batalhas locais).
- **Comando:** `set_builders { buildingId, count }` (0 a 4), validado em `commands.ts`; o dono vem da conexão.
- **Testes:** `shared/test/builders.test.ts`; os testes de regra antigos rodam sem construtores (`shared/test/setup.ts`).
- **Interface:** linha "👷 Construtores − n/alvo +" no painel da obra (`CommandPanel.tsx`, `BuildersLine`); total "em
  obras" na dica da população (barra de cima).
- **No mapa:** `CitizenLayer` cria um civil por construtor (posto `build`): ele caminha até a obra, fica do lado de
  fora virado para ela num vaivém de martelada e troca de ponto a cada 3–7 s. Quando a obra acaba, vira ocioso ou
  volta ao emprego.

## Regra

- Cada obra quer `builderTarget` construtores (padrão 4).
- **Ritmo:** cada construtor vale 25%: `builtTicks += builders / 4` por tick. Com 4, o tempo de `buildSeconds`; com 1,
  4 vezes mais; com 0, a obra para.
- **De onde vêm:** a cada segundo (`staff`), as obras recebem construtores antes dos postos de trabalho, na ordem das
  obras (a mais antiga primeiro). Os ociosos vão primeiro; faltando gente, saem dos empregos mais novos, que voltam a
  ser preenchidos quando a obra acaba.
- **População:** construtores contam como empregados (`Population.builders` diz quantos).
- **Snapshot:** `builders` (cidadãos na obra, visíveis no canteiro para quem enxerga a obra) e `builderTarget` (só
  para o dono).
- **Melhorias de nível** (obras de melhoria) seguem sem construtores por enquanto.

## Partida

- Começo com **11 cidadãos** (eram 6): 4 constroem as primeiras obras sem esvaziar as coletas.
- A IA usa a mesma regra, com o alvo padrão de 4.

## Efeito no ritmo

`npx tsx scripts/sim-economia.ts 1,2,3,4,5,6,7 25`, depois da energia (6 de 9 critérios):

| Cidadãos iniciais | Era 2            | Tropas até 15:00 (média) | Critérios  |
| ----------------- | ---------------- | ------------------------ | ---------- |
| 6                 | 12:04 a 16:55    | 10,5                     | 5 de 9     |
| 10                | 9:27 a 12:07     | 9,4                      | 4 de 9     |
| **11**            | **8:30 a 11:59** | **10,6**                 | **5 de 9** |
| 12                | 8:15 a 10:30     | 10,4                     | 3 de 9     |

Com 11, ficam de fora: armazém cheio de comida/madeira em algumas IAs, primeira pesquisa militar antes das 13:00,
primeira ofensiva até as 12:00 (duas partidas atacam às 13–14 min) e a era 3 até as 22:00 (herança da energia). Uma
variante em que só os ociosos constroem (1 construtor garantido por obra) atrasou a era 2 para 13–19 min e foi
descartada.
