# KNPS — Região do servidor

## Situação

- Um único servidor de jogo no Render, **plano free**, sem `region` no `render.yaml`. O padrão do Render é **Oregon
  (EUA, costa oeste)**. Inferido; confirme no painel do Render (Settings → Region).
- O plano free **dorme depois de ~15 min sem tráfego** e leva perto de um minuto para acordar. Isso aparece como "demora
  para conectar/reconectar" no primeiro acesso. Também tem CPU compartilhada, que pode atrasar ticks em horário de pico.
- Regiões oferecidas pelo Render: Oregon, Ohio, Virgínia, Frankfurt e Singapura. Não há região na América do Sul.

## Distância (estimativa, não medida)

Para jogadores no Brasil, a ida e volta típica até cada região do Render fica perto de:

| Região | RTT típico a partir de São Paulo |
|---|---|
| Oregon (atual) | 170–200 ms |
| Ohio | 130–150 ms |
| **Virgínia** | **110–130 ms** |
| Frankfurt | 190–220 ms |

Estes números são estimativas de rotas públicas; o KNPS não consegue medir de fora. Depois de qualquer mudança, o painel
de conexão do jogo mostra o ping real de cada jogador.

## O que dá para fazer (decisão do responsável; o KNPS não altera infraestrutura sozinho)

1. **Mover o servidor para a Virgínia.** É o maior ganho isolado para jogadores do Brasil (~60 ms a menos, estimado).
   No Render a região não muda num serviço existente: cria-se um serviço novo na Virgínia, com as mesmas variáveis, e
   aponta-se `VITE_GAME_SERVER_URL` (Vercel) para ele. As partidas em andamento no serviço antigo terminam lá.
2. **Plano pago (Starter)** para o servidor não dormir e ter CPU dedicada.
3. **Várias regiões (KNPS-08, proposto)**: um servidor por região; o cliente mede o ping de cada uma (o próprio
   `ping` do jogo); a sala nasce na região que minimiza o pior ping entre os jogadores, e o código da sala carrega a
   região para quem entra. Precisa de pelo menos dois serviços pagos, e salas públicas listadas de todas as regiões.
   Só vale quando houver jogadores fora das Américas em número que justifique o custo.

Nenhuma dessas mudanças foi feita: todas criam ou alteram serviço pago ou de produção.
