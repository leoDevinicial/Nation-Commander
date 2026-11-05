# Conhecimento, cidades e produção sem limite (02/11)

Pedido do usuário:
- pesquisa na era 3 que libera a Floresta de Eucalipto (como a fazenda, mas com árvores e serraria embutida; madeira
  devagar e sem limite), com um forno de carvão vegetal ao lado;
- outra pesquisa na era 3 que libera a mineração subterrânea (uma mina em qualquer lugar, com um pouco de pedra,
  minerais e carvão);
- no máximo 1 de cada por cidade (cada QG ou prefeitura é uma cidade; as construções perto ficam atreladas a ela), e
  todas gastam energia;
- pesquisas custam US$ e pontos de conhecimento, formados por escolas e universidades (1 de cada por cidade).

## Cidades (`shared/sim/cities.ts`)
- Cada construção pertence à **sede mais próxima** do mesmo dono: o QG (a capital) ou uma prefeitura, pronta ou em
  obra, medindo centro a centro.
- `BuildingDef.perCity` limita o tipo por cidade: Escola, Universidade, Floresta de Eucalipto, Forno de Carvão Vegetal
  e Mina Subterrânea, 1 de cada. Fundar cidades (prefeituras) libera mais de cada.
- Mensagem: "Brasília já tem um(a) Escola (máximo 1 por cidade): funde outra cidade ou construa perto de outra
  prefeitura". A mesma regra roda no servidor e no fantasma de construção (`placement.ts`).

## Conhecimento (`KNOWLEDGE` em `config.ts`)
| Fonte | Por segundo | Condição |
|---|---|---|
| Centro de Comando | 0,05 | sempre (feedback 05/11: sem escola a pesquisa travava) |
| Escola (2 professores) | 0,15 | 1 por cidade; também segue como serviço com raio |
| Universidade (era 2, 3×3, 4 pesquisadores) | 0,4 | 1 por cidade |

- Começo com 60 pontos. Sem luz, escola e universidade formam metade. Contador 🧠 na barra de cima.
- **Pesquisa militar** (Centro de Pesquisa): recursos (como antes) + conhecimento (15, 30 ou 50 pelo nível do centro) +
  US$ do caixa do país (3%, 6% ou 10% do repasse anual). Cancelar devolve 75% de tudo.
- **Pesquisa nacional** (árvore): o US$ sai do caixa do país por dia enquanto ela corre (ver `docs/CAIXA_DO_PAIS.md`) e custa também
  conhecimento: 15 + 15 por nível na árvore (+20 nas de era mínima), pago uma vez ao começar (pausar e retomar não
  cobra de novo). `researchBlocker` confere era e conhecimento; o nó mostra o custo 🧠.
- **IA:** escola junto com o Centro de Pesquisa, universidade depois da era 3; a pesquisa nacional da IA guarda 20
  pontos para as militares. A escola muito cedo tirava trabalhadores das minas e faltava carvão.

## Era 3: produção sem limite
| Pesquisa nacional (área Recursos) | Pré-requisito | Libera |
|---|---|---|
| Silvicultura de eucalipto (era 3, 🧠 50) | Mecanização agrícola | Floresta de Eucalipto e Forno de Carvão Vegetal |
| Mineração subterrânea (era 3, 🧠 50) | Extração mecanizada | Mina Subterrânea |

| Construção | Como funciona | Energia |
|---|---|---|
| Floresta de Eucalipto (2×2, 4 trabalhadores) | planta eucalipto em até 10 células de planície em volta (como a fazenda), 0,12 de madeira por célula/s; sem depósito, não acaba; serraria embutida | 1, rende 75% sem luz |
| Forno de Carvão Vegetal (1×1, 2 forneiros) | 2 de madeira → 1 de carvão, 0,25 de carvão/s; a até 3 células da Floresta de Eucalipto | 2, para sem luz |
| Mina Subterrânea (2×2, 4 mineiros) | em qualquer lugar do território: 0,3 pedra, 0,15 ferro e 0,12 carvão por segundo, sem acabar | 5, para sem luz |

- Modelos low poly em `src/game/render/models/production.ts`; os eucaliptos aparecem nas células plantadas
  (`eucalyptusCell`).
- A IA ergue a mina subterrânea e a floresta quando tem a pesquisa, e o forno quando o carvão está baixo.

## Ritmo da IA
`sim-economia` 1–7: 5 de 9 critérios, como antes; era 3 até 22:00 em 6 de 13 IAs vivas.

## Testes
`shared/test/knowledge.test.ts` (conhecimento, limite por cidade, custos das pesquisas, mina subterrânea, floresta e
forno).
