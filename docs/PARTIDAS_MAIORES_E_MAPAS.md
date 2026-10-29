# Partidas com mais nações, mapas maiores e tipos de mapa

Lote 4 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Número de nações

| Versão | Nações por partida (humanos + bots) |
|---|---|
| Grátis | até 4 |
| Assinante | até 6 |

O limite de cada sala depende do anfitrião, pelo campo `active` da tabela `subscriptions` (migração
`20261029010000_subscriptions.sql`). A assinatura fica numa tabela separada do perfil porque o jogador pode editar o
próprio perfil e não pode se marcar como assinante. A tabela tem RLS sem políticas, então só o servidor, com a chave de
serviço, lê e grava. Ainda não há tela de pagamento: hoje uma assinatura é ativada com
`insert into subscriptions (user_id, active) values (...)`.

No lobby (`LobbyScreen`):
- O anfitrião escolhe quantas nações a partida terá e o tipo de mapa.
- O anfitrião adiciona e remove bots (IA), em qualquer modo. Cada bot recebe um país ainda livre na sala.
- Cada jogador escolhe o próprio time (A, B ou C, ou sem time). O anfitrião escolhe o time dos bots.
- O mesmo time começa aliado, no teatro e na diplomacia. A aliança de time vale a partida inteira e bloqueia a
  declaração de guerra entre os parceiros.
- A partida só começa com pelo menos dois lados.
- Ao começar, os slots são renumerados em sequência (0 a n−1).

A IA tática escolhe o alvo entre vários rivais: ignora aliados e prefere quem está perto, quem já está em guerra com
ela e quem já está em guerra com outra nação.

## Mapas

O gerador é `generateMatchMap` (`shared/sim/matchMap.ts`). O tamanho cresce com o número de nações:

| Nações | Lado do mapa |
|---|---|
| 2 | 96 células |
| 3–4 | 128 células |
| 5–6 | 160 células |

**Simetria**
- 2 e 4 nações: rotação exata da grade, de 180° ou 90°. Cada nação recebe exatamente o mesmo terreno.
- 3, 5 e 6 nações: o terreno é amostrado em coordenadas polares no setor de referência. O mapa vira um continente
  circular cercado de mar, para nenhuma nação ganhar um canto a mais.

O kit de cada base é desenhado para a nação de referência e copiado pela mesma rotação. O kit tem rocha, uma serra com
minério, floresta, solo fértil, duas jazidas de petróleo e uma jazida disputada no caminho do vizinho. Estradas ligam
cada base ao centro, o que garante a passagem por rios e serras. Os testes conferem a conexão entre todas as bases em
todos os tipos de mapa.

| Tipo | O que muda |
|---|---|
| Continental | o padrão: florestas, serras e planícies |
| Rios e Pontes | rio largo na fronteira entre nações vizinhas e lago central; a travessia é pelas estradas (pontes) |
| Montanhoso | cordilheiras nas fronteiras com dois passos cada, mais rocha e minério |
| Deserto | pouca floresta e solo fértil, uma jazida de petróleo a mais por nação; terreno com tons áridos |

O anfitrião escolhe o tipo, ou deixa sorteado no início da partida. Os tipos navais, Oceano Central e Arquipélago,
esperam o conteúdo naval de combate (passos 3 e 4 da ordem sugerida no documento de design).

## Região inicial do país

A região perto da base reflete o país. Cada perfil ganha mais de um recurso e perde de outro (compensação declarada),
e o lobby mostra o perfil de cada nação.

| Perfil | Países | Ganho | Compensação |
|---|---|---|---|
| Florestal | Brasil, Canadá, Rússia, Coreia do Sul | mais floresta | menos rocha |
| Petrolífera | Arábia Saudita, México, Egito, Austrália | +1 jazida de petróleo | menos solo fértil e floresta |
| Serrana | Japão, China, Turquia, Coreia do Norte, África do Sul, Itália | serra maior, mais minério | menos solo fértil |
| Agrícola | Argentina, EUA, França, Índia, Alemanha | mais solo fértil | menos minério |
| Equilibrada | os demais | padrão | — |

## Desempenho

Um mapa de 160×160 tem 6,25 vezes as células do antigo, de 64×64. O território vai para os clientes só quando muda.
A névoa e o A* escalam com a área. O desempenho ainda não foi medido em aparelhos reais; o KGPS mostra o custo no
cliente.
