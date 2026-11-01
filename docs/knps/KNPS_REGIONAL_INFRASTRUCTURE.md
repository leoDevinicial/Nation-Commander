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
3. **Várias regiões (KNPS-08, código pronto).** Ver "Como ligar" abaixo. Só vale quando houver jogadores longe uns
   dos outros (ex.: Brasil e Europa) em número que justifique pagar mais de um servidor.

Nenhuma dessas mudanças foi feita: todas criam ou alteram serviço pago ou de produção.

## Como ligar várias regiões (KNPS-08)

1. No Render, um serviço por região (mesmo Dockerfile e as mesmas variáveis do atual), mais três variáveis em cada um:
   - `KNPS_REGION`: id curto (`us-east`, `eu-central`...);
   - `KNPS_REGION_LABEL`: nome mostrado ao jogador (`Virgínia (EUA)`);
   - `KNPS_REGION_LETTER`: uma letra diferente por região, do alfabeto dos códigos (sem I, O, 0 e 1). Ex.: `V`, `F`.
2. Na Vercel, `VITE_GAME_SERVERS` com a lista, na ordem de preferência (a primeira é a padrão):
   `V|Virgínia (EUA)|wss://nc-virginia.onrender.com,F|Frankfurt (Europa)|wss://nc-frankfurt.onrender.com`
3. `ALLOWED_ORIGINS` de cada servidor precisa ter o domínio do jogo (a lista pública entre regiões usa isso).

Como funciona para o jogador:
- ao abrir o jogo, ele conecta na região padrão (ou na da última sala, por até 6 h, para retomar a partida) e mede o
  ping de todas as regiões por HTTP (`/knps/ping`);
- "Região das salas novas" no menu: Automático (menor ping) ou uma região fixa;
- criar sala: conecta na região escolhida e cria lá (o código começa com a letra dela);
- entrar por código ou pela lista pública: vai ao servidor da letra do código;
- a lista pública junta as salas de todas as regiões (`/knps/rooms`), com o nome da região;
- no lobby, cada jogador vê o ping de todos até o servidor da sala (medido pelo servidor).

A partida inteira roda num servidor só (o da sala). Não há migração de partida entre regiões; se um servidor cair, as
partidas dele são retomadas quando ele volta (salvamento já existente).

## Dados reais

`/health` de cada servidor tem `rttBuckets`: quantas conexões tiveram ping mediano em cada faixa (<50, <100, <150,
<200, <300, ≥300 ms). Não guarda quem foi nem de onde. Com isso dá para decidir com dados se vale abrir outra região.
