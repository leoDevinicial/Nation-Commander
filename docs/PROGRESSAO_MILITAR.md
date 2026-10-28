# Progressão militar — Centro de Pesquisa, tropas novas e contras

Este é o primeiro passo do retorno do parceiro (áudios de feedback): a partida precisa de **evolução
militar dentro da própria partida**. O jogador não deve começar com tudo liberado. Junto com ela, as pesquisas
nacionais ficaram bem mais rápidas.

Como no resto do jogo, o servidor decide tudo. As regras ficam em `shared/sim/config.ts`
(`MILITARY_RESEARCH`, `militaryResearchBlocker`, `UNITS[...].requires`) e são usadas pelo servidor, para validar,
e pela interface, para mostrar custos e motivos de bloqueio.

## Pesquisa nacional mais rápida

Em `shared/strategic/technologies.ts`, os custos caíram para 1/6 e as durações mínimas para 1/3. A primeira
tecnologia agora sai em cerca de 20 s de jogo com o orçamento padrão, em vez de vários minutos.

## Centro de Pesquisa Militar (atalho T)

| | |
|---|---|
| Custo | 120 madeira · 120 pedra · 60 ferro · 30 s |
| Pesquisadores | 3 (4 a partir do nível 4) |
| Manutenção | 0,08 suprimento/s |
| Melhorias | até o nível 5: cada nível pesquisa 10% mais rápido e libera os níveis da árvore |

- Pesquisa uma coisa por vez.
- Cancelar devolve 75% do que foi pago.
- O mesmo projeto não pode correr em dois centros ao mesmo tempo.
- Sem pesquisadores, com fome ou sem manutenção paga, a pesquisa desacelera ou para.
- O **orçamento de P&D** da nação (Nação → Orçamento) acelera todos os centros: de ×0,8 a ×2.

| Pesquisa | Custo | Tempo | Requer | Nível do centro | Libera |
|---|---|---|---|---|---|
| Blindados sobre lagartas | 100 sup · 90 ferro · 40 petr. | 35 s | — | 1 | Tanque (fábrica, T) |
| Artilharia de campanha | 110 sup · 80 ferro · 30 petr. | 35 s | — | 1 | Artilharia (fábrica, R) |
| Armas antitanque | 120 sup · 80 ferro | 40 s | — | 1 | Infantaria antitanque (base militar, N) |
| Defesa antiaérea móvel | 140 sup · 100 ferro · 60 petr. | 50 s | lagartas | 1 | Antiaérea móvel (fábrica, Y) |
| Operações especiais | 180 sup · 150 comida · 60 ferro | 60 s | antitanque | 2 | Forças especiais (base militar, J) |
| Lança-foguetes múltiplos | 200 sup · 140 ferro · 90 petr. | 65 s | artilharia de campanha | 2 | Lança-Foguetes (fábrica, L) |
| Blindados de nova geração | 300 sup · 240 ferro · 160 petr. | 90 s | lagartas e foguetes | 3 | Tanque Moderno (fábrica, M) |

Liberação gradual dos veículos:
- sem pesquisa, a fábrica produz só o Veículo Blindado de transporte;
- o Tanque e a Artilharia vêm das duas primeiras pesquisas;
- o tanque com que cada país começa a partida continua.

O botão de uma tropa ainda bloqueada aparece apagado, com o motivo: "pesquisar" no botão e, na dica,
"Requer a pesquisa … no Centro de Pesquisa Militar".

## Tropas novas e contras

As armas ganharam multiplicadores por tipo de alvo (`vsInfantry`, `vsVehicle`, `vsBuilding`), e cada unidade tem
uma classe de blindagem: infantaria ou veículo.

| Tropa | Papel | Destaque |
|---|---|---|
| Infantaria antitanque | caça blindados | ×3 contra veículos, ×0,5 contra infantaria |
| Forças especiais | rápidas, enxergam longe | velocidade 3,9, visão 15, tiro rápido |
| Antiaérea móvel | acompanha o exército | conta como defesa antiaérea (80% de uma bateria) contra aviões e mísseis |
| Lança-Foguetes | artilharia de saturação | salva de 12 foguetes, alcance 24, alcance mínimo 7, dano em área (raio 3,5, 60% em volta) ao fim do voo |
| Tanque Moderno | blindado pesado | 430 de vida, 48 de dano |

A dica do botão de cada tropa lista as vantagens dela, por exemplo "×3 contra veículos".

**Blindagem por classe** (balanceamento, ver `docs/BALANCEAMENTO_E_PROGRESSAO.md`): o fuzil da infantaria causa
35% do dano em veículos, e a metralhadora do Veículo Blindado (dano 8) causa 60% em outros veículos. O Tanque
recarrega em 1,7 s. Assim cada pesquisa de veículo é melhor que a anterior, e o blindado inicial volta a ser
reconhecimento e apoio.

## Modernização sem travar a produção

Antes, se faltasse ferro para o equipamento de linha (Fase 5), nenhuma tropa saía. Agora a tropa sai **básica**,
sem os pacotes, e o botão avisa "sai básica". Ela pode ser modernizada depois numa instalação.

## IA

- Constrói o Centro de Pesquisa depois da fábrica (a partir de 4 min).
- Pesquisa em ordem: antiaérea primeiro se houver ameaça aérea.
- Mistura as tropas novas no exército e melhora o centro até o nível 3.
- Reconstrói minas, pedreiras e serrarias esgotadas.
- Ataca com o que tem (no mínimo 6 tropas) quando o exército para de crescer por 3 min. Antes, ficava travada
  esperando o tamanho ideal.

## Testes

- `shared/test/military.test.ts`: bloqueio, pré-requisitos, nível, velocidade, cancelamento, visibilidade,
  salvar/carregar, contras, dano em área, antiaérea móvel e produção básica.
- `server/persistence.test.ts`: a IA constrói o centro, pesquisa e monta o exército numa sala real.

## Lança-Foguetes: salva de foguetes

O lança-foguetes funciona como um lançador múltiplo real (estilo Astros II), e não como um canhão.

- **Salva:** cada disparo lança 12 foguetes, um a um, do casulo de tubos. O dano (120, ×1,6 contra construções)
  cai na **área do alvo no fim do voo**, entre 1 e 2 segundos depois, conforme a distância. Quem sai da área a
  tempo escapa; quem fica em volta leva 60%.
- **Alcance:** 24, o maior entre as tropas, contra 13 da torre e 9 do QG. Bate em construções de longe.
- **Alcance mínimo de 7:** alvos mais perto não podem ser atingidos. O lançador recua para a distância de
  tiro e, parado, prefere alvos fora dessa faixa.
- **Distância das bases:** o lançador não avança até a beira das construções inimigas. Uma ordem de
  movimento para dentro da base inimiga para a 7 de distância da construção mais próxima.
- **Preparo:** ao parar para atirar, o lançador leva 1,4 s para baixar os macacos e erguer o casulo antes da
  primeira salva.
- **Visual:**
  - o casulo de 12 tubos fica deitado na carroceria em deslocamento e se ergue sobre a cabine para atirar;
  - cada foguete sai com clarão, jato de gases para trás, poeira e chama;
  - na subida, o foguete deixa um rastro de fumaça e cai espalhado na área, cada um com a sua explosão;
  - cada saída tem um som de sopro.
- **Salvar e carregar:** as salvas em voo entram no estado salvo da partida.

