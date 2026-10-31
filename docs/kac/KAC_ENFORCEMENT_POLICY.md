# KAC — Política de sanções

Como o Nation Commander trata o que o KAC registra. Vale para qualquer pessoa da equipe que leia o painel `/kac`, a
tabela `kac_events` ou o campo `matches.report.integrity`.

**Regra principal:** o KAC só barra ou registra; ele **nunca pune sozinho**. Um alerta estatístico não é prova. Uma
sanção é sempre decisão de uma pessoa, com motivo escrito e direito de contestação.

## 1. O que acontece automaticamente (não é punição)

São regras do jogo, iguais para todos, aplicadas no servidor no momento do pedido:

| Regra | Efeito | Onde |
|---|---|---|
| Comando inválido (unidade de outro, sem recursos, fora do território...) | Recusado, com o motivo na tela | `Simulation.applyCommand` |
| Mensagem fora do protocolo ou acima do ritmo | Ignorada; após 50 violações a conexão fecha | `server/index.ts`, `Connection` |
| Pausa entre humanos | 3 por jogador, até 60 s; ordens com o jogo pausado são recusadas | KAC-02, KAC-11 |
| Conexões e salas por IP | 12 conexões simultâneas, 8 salas a cada 10 min | KAC-03 |
| Convidado tentando usar o id de outro | Recebe uma identidade própria; não entra na vaga alheia | KAC-01 |
| Tentativas erradas no painel `/kac` | IP barrado por 10 min depois de 10 erros | painel |

Nenhuma dessas regras marca a conta nem afeta partidas futuras.

## 2. Tipos de evidência

| Nível | O que é | Exemplos | Pode sustentar sanção? |
|---|---|---|---|
| **A — determinística** | O servidor viu e recusou uma ação que só um cliente adulterado manda | `identity.guest_impersonation`; `admin.denied` com token errado repetido | Sim, depois de revisão humana |
| **B — sinal forte** | Padrão estatístico que um humano dificilmente produz | `behavior.automation_suspected` (intervalos quase iguais, ritmo acima de 15 ordens/s por um minuto) | Só com revisão humana **e** confirmação por outro sinal ou por repetição em partidas diferentes |
| **C — sinal fraco** | Comum em jogo legítimo | `command.rejected`, `match.command_while_paused`, `protocol.rate_limited` isolados | Não. Serve só de contexto |

APM alto, por si só, nunca é evidência. Jogadores bons de RTS são rápidos; os limites do KAC-09 foram escolhidos para
errar para o lado de não alertar.

## 3. Fluxo de revisão

1. **Sinal.** O evento vai para o diário. Os de gravidade média ou maior ficam 90 dias em `kac_events`. A partida com
   algum sinal termina com `integrity.verdict = "review"`.
2. **Triagem.** Alguém da equipe abre o painel `/kac` ou consulta `kac_events` e `matches.report.integrity`:
   - ordens aceitas e recusadas;
   - pausas usadas;
   - alertas por jogador;
   - hash do estado final.
3. **Contexto.** Antes de decidir, conferir:
   - se houve queda de conexão ou servidor reiniciando (logs do Render);
   - se o jogador tem outras partidas com o mesmo sinal;
   - se o sinal pode vir de um recurso legítimo da interface (seleção em massa, atalhos, fila de produção).
4. **Decisão.** Registrar por escrito:
   - o que foi visto (ids dos eventos);
   - o nível da evidência;
   - a sanção escolhida;
   - quem decidiu.
5. **Aviso ao jogador.** A pessoa recebe o motivo em linguagem simples, sem expor detalhes que ensinem a burlar o
   sistema.
6. **Contestação.** O jogador pode contestar em até 14 dias. Quem revisa a contestação não pode ser quem decidiu.
   Sanção revertida apaga o registro dela e devolve o que foi tirado.

## 4. Escada de sanções (quando houver ranking)

Hoje o jogo não tem ranking nem banimento. Por isso a escada abaixo é a regra combinada para quando existirem. Até lá,
o único efeito possível é a equipe conversar com o jogador.

| Passo | Quando | Efeito |
|---|---|---|
| 1. Aviso | Primeira ocorrência de evidência B confirmada | Mensagem com o motivo; nada muda na conta |
| 2. Partida anulada | Evidência A numa partida ranqueada, ou B repetida | O resultado não conta para o ranking (nem a vitória do infrator, nem a derrota do adversário) |
| 3. Suspensão do ranqueado (7 dias) | Reincidência depois do passo 2 | Joga só partidas casuais |
| 4. Suspensão do ranqueado (30 dias) | Nova reincidência | Idem |
| 5. Banimento | Evidência A grave e repetida, ou fraude de conta (sequestro de outra conta) | Conta impedida de entrar; contestação continua possível |

Princípios da escada:
- **progressiva:** começa pelo aviso;
- **proporcional:** um alerta B isolado nunca passa do aviso;
- **transparente:** sempre com motivo;
- **reversível:** a contestação pode desfazer qualquer passo.

## 5. Dados e privacidade

- `kac_events` guarda categoria, gravidade, sala, conta e um detalhe curto. Não guarda IP, token, mensagem de chat nem
  dado do computador do jogador.
- A conta aparece como o id interno do servidor (o UUID do Supabase, ou `guest:<hash>` para convidados). Esse id não
  vai para outros jogadores (KAC-05).
- Retenção: 90 dias, apagados automaticamente pelo servidor.
- O KAC não instala nada, não lê processos nem memória e não identifica hardware. O jogo roda no navegador, e a defesa
  é a autoridade do servidor.

## 6. O que esta política não promete

- Não promete pegar toda trapaça. A automação bem disfarçada (com intervalos humanizados) pode passar pelo KAC-09.
- Não compara o KAC a sistemas de outros jogos. Proteções com driver ou leitura de memória resolvem outro problema:
  jogos que rodam no computador do jogador.
