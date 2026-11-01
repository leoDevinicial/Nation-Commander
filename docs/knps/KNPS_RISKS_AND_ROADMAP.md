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
| R9 | Lista pública por HTTP (`/knps/rooms`) | baixo | só as salas que já são públicas no jogo; só para as origens permitidas; a resposta de uma região só vale para códigos da letra dela | testado (filtro no cliente) |
| R10 | Trocar de região larga o lobby em que o jogador estava no outro servidor | baixo | a troca só acontece ao criar ou entrar numa sala; partida em andamento não troca | aceito |
| R11 | O ping por HTTP da escolha de região não é igual ao do WebSocket | baixo | serve só para comparar regiões; depois de conectar, vale o ping medido pelo servidor | documentado |
| R12 | Ping de rede no lobby é visível para todos da sala | baixo | só o número arredondado a 5 ms, como nos jogos competitivos; nunca IP nem região do jogador | aceito |

## Próximos passos

O que depende de código está feito. O que falta é decisão de infraestrutura:

1. Escolher a região do servidor principal (Virgínia é a mais perto do Brasil entre as do Render) e o plano.
2. Olhar `rttBuckets` no `/health` depois de alguns dias de jogo para ver se há jogadores longe o bastante para uma
   segunda região; se houver, ligar o KNPS-08 seguindo o guia regional.
3. Reavaliar o delta de snapshot só se o tráfego comprimido passar de ~150 kbit/s em partidas de 6 nações.
