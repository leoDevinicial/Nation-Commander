# Relatório pós-partida

Lote 1, §3.2 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md): gráficos e medalhas ao fim da
partida.

## Amostras

A sala tira uma amostra do teatro no começo, a cada 30 s de jogo e no fim (`reportSample` em `shared/sim/report.ts`).
Cada amostra registra, por jogador:
- tropas em campo;
- construções prontas;
- fração do território reivindicado no mapa;
- recursos coletados (valor acumulado);
- PIB do país.

A série guarda no máximo 160 amostras. Quando passa disso, descarta uma a cada duas das antigas, então continua
cobrindo a partida inteira. As amostras e a maior patente de cada jogador entram no salvamento da sala, então
sobrevivem a um reinício do servidor.

## Medalhas

| Medalha | Critério |
|---|---|
| 🏆 Vitória | venceu a partida |
| 🗺 Senhor das Fronteiras | venceu por domínio territorial |
| ⚖ Golpe de Mestre | venceu com o colapso político do rival |
| 🛡 Muralha | partida de 10 min ou mais sem perder construção |
| 🎯 Ás de Combate | 10 abates ou mais e pelo menos o dobro das perdas |
| 🏭 Potência Industrial | 5.000 recursos coletados ou mais |
| 🏗 Construtor | 25 construções ou mais |
| 📈 Milagre Econômico | PIB 5% maior no fim |
| 🔥 Resistência | derrota depois de 30 min ou mais |
| 🎖 Escola de Heróis | alguma tropa chegou a Herói |

As regras estão em `medalsFor`.

## Tela de resultado

As medalhas aparecem ao lado do nome de cada comandante; o nome e o critério de cada uma ficam na dica. O gráfico
"Evolução da partida" mostra uma linha por comandante, na cor da facção, e tem botões para trocar a métrica: Tropas,
Construções, Território, Recursos coletados e PIB.

O relatório vai na mensagem `match_end` (`MatchEndInfo.report`). Ele ainda não é gravado no histórico do Supabase.
