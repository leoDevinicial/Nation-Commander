# KNPS — Riscos e próximos passos

## Riscos

| Id | Risco | Nível | Mitigação | Estado |
|---|---|---|---|---|
| R1 | Memória da compressão: ~256 KB por conexão (janela de 32 KB + estado do zlib) | médio | `concurrencyLimit` 10; cliente sem contexto; dimensionar se passar de ~500 jogadores por instância | aceito |
| R2 | Fragmentação de memória conhecida do zlib no Node com muitas conexões | baixo nesta escala | observar a memória do serviço no Render | aberto |
| R3 | Bomba de compressão | alto se ignorado | `maxPayload` vale para o tamanho descomprimido; teste fecha com 1009 | testado |
| R4 | Snapshot extra (KNPS-03) aumenta o tráfego de quem dá muitas ordens | baixo | no máximo 1 por tick; não vale para a pilotagem do drone; cabe na compressão | aceito |
| R5 | Pular snapshots esconde estado por um tempo numa conexão saturada | médio | só o substituível é pulado; eventos e território vão no próximo; contador `skipped` em `/health` | testado |
| R6 | Ping no painel inclui o tempo de processar a página | baixo | texto do painel diz isso; o KAC não usa essas medições | documentado |
| R7 | Região fora do alcance do código (Oregon, plano free dormindo) | alto para jogadores longe | decisão de infraestrutura (regional) | aberto |
| R8 | Cliente antigo com o servidor novo | baixo | a compressão é negociada (quem não aceita recebe sem); o protocolo não mudou | verificado |

## Próximos passos (em ordem)

1. Decidir a região e o plano do servidor (KNPS-07). Sem isso, o maior termo do ping continua sendo a distância.
2. Coletar o ping real dos jogadores (só agregado, sem IP) para escolher regiões com dados, não estimativas.
3. KNPS-08 (várias regiões) se houver público fora das Américas.
4. Reavaliar delta de snapshot só se o tráfego comprimido voltar a ser problema em partidas de 6 nações.
