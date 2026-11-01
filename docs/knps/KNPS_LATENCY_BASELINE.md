# KNPS — Linha de base e resultado

## 1. Tráfego (medido)

`npx tsx scripts/knps-baseline.ts 12 3` — partida de 4 nações (1 humano parado + 3 bots), 12 min, servidor sem rede.

| Medida | Valor |
|---|---|
| Snapshot (JSON) mediana / p95 / máximo | 9.513 / 9.797 / 26.236 bytes |
| Tráfego médio para o jogador, sem compressão | 707 kbit/s (snapshots ~87%, `national` ~11%) |
| Deflate nível 1 sem contexto | 21,6% do tamanho, 0,08 ms por snapshot |
| **Deflate nível 1 com contexto (o que o KNPS usa)** | **5,4% do tamanho, 0,17 ms por snapshot** |
| Custo do tick no servidor (média) | 0,65–0,82 ms |

Estimativa com compressão: ~700 → ~40 kbit/s por jogador nessa partida (inferido da razão medida). Partidas maiores
têm snapshots maiores; a razão tende a se manter porque a maior parte de cada snapshot repete o anterior.

No Sandbox (mapa revelado, mais entidades) o navegador recebeu ~4,8 Mbit/s de conteúdo descomprimido, 20 snapshots/s.
Sem compressão isso já não cabia em muitas conexões móveis.

## 2. Orçamento de atraso de uma ordem (ordem → resultado na tela)

Valores do lado do jogo; a ida e volta de rede (RTT) se soma a tudo.

| Etapa | Antes | Depois | Estado |
|---|---|---|---|
| Ordem espera o laço acordar | 0–25 ms (média ~12) | 0–10 ms (média ~5) | confirmado; atraso do laço p95 medido: 9 ms |
| Ordem espera o início do tick | 0–50 ms (média 25) | igual (o tick é a regra do jogo) | confirmado |
| Resultado espera o snapshot | 0–50 ms (média 25) | 0 (snapshot extra no mesmo tick) | testado |
| Transmissão do snapshot num link de 2 Mbit/s | ~38 ms (9,5 KB) | ~2 ms (~0,5 KB) | calculado a partir do tamanho medido |
| Fila de saída num link saturado | sem limite | limitada a 192 KB; snapshot velho não entra | testado |
| Interpolação até a posição nova | 100 ms | 50 ms após o snapshot extra | confirmado |

Ganho médio do lado do jogo: ~30 ms numa conexão boa, mais em conexão lenta (onde a fila e a transmissão dominavam).

## 3. Partida real no navegador (`.audit/knps_e2e.cjs`)

- O navegador negociou `permessage-deflate; client_no_context_takeover; server_max_window_bits=15`.
- `/health` durante a partida: tick p95 2,01 ms; atraso do laço p95 9 ms; nenhum snapshot pulado.
- O ping no navegador de teste (sem GPU, poucos quadros por segundo) saiu alto e oscilando: a medição inclui o tempo
  da página processar a resposta. Num aparelho normal esse termo fica em poucos ms. Não há medição de rede real entre
  regiões nesta entrega.
