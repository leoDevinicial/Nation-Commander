# KAC — Plano de implementação

Ordem por risco encontrado na auditoria (não por arquitetura genérica). Estados de maturidade como na especificação:
- NOT ASSESSED, DESIGNED, IMPLEMENTED, UNIT TESTED;
- INTEGRATION TESTED, ADVERSARIALLY TESTED;
- PRODUCTION OBSERVED, APPROVED.

## Capacidades e estado

| Capacidade | Estado | Onde |
|---|---|---|
| Autoridade do servidor sobre a simulação | ADVERSARIALLY TESTED (antes do KAC) | `shared/sim`, `server/Room.ts`; testes "B tenta mover unidade de A" etc. |
| Validação de forma das mensagens | INTEGRATION TESTED (antes do KAC) | `server/messages.ts`, `shared/sim/commands.ts` |
| Névoa de guerra no servidor | INTEGRATION TESTED (antes do KAC) | `makeSnapshot`, `eventVisible` |
| KAC-01: identidade de convidado por hash do segredo | ADVERSARIALLY TESTED | `server/kac/identity.ts`, `server/kac.test.ts` |
| KAC-02: política de pausa entre humanos | ADVERSARIALLY TESTED | `server/kac/policy.ts`, `Room.setPaused`, `Room.command` |
| KAC-03: limites de conexões e salas por IP | ADVERSARIALLY TESTED | `server/kac/network.ts`, `server/index.ts`, `handler.ts` |
| Diário de segurança (memória, contagem, log) | INTEGRATION TESTED | `server/kac/journal.ts` |
| Observação em produção | NOT ASSESSED | depende de publicar e ler os logs do Render ("KAC" e "KAC resumo") |

## Próximas etapas

1. **Publicar e observar (P0)**
   - Ler no log do Render os eventos "KAC" e o "KAC resumo" de 10 em 10 minutos.
   - Confirmar o KAC-04: ver se o IP registrado é o do jogador e não o do proxy.
   - Medir se algum limite atrapalha jogador legítimo.
2. **Persistência do diário (P1, KAC-08)**
   - Tabela `kac_events` no Supabase com RLS sem políticas e retenção de 90 dias.
   - Gravar só a gravidade média ou maior; o resto fica na contagem.
3. **Projeção do snapshot mais estrita (P1, KAC-05/06/07)**
   - Id público derivado para contas na sala.
   - Ids de entidade opacos por observador.
   - `targetId` só de alvo visível.
   - Testes de confidencialidade para cada caso.
4. **Sinais de automação (P2, KAC-09)**
   - Por partida e jogador: intervalo entre comandos (regularidade), tempo sem nenhuma ação, repetição exata de
     sequências.
   - Só gera alerta para revisão.
   - Calibrar com partidas legítimas (APM alto não é prova) antes de qualquer uso.
5. **Integridade do resultado (P2)**
   - Hash do estado final no registro da partida.
   - Replay a partir da semente e dos comandos aceitos (a simulação é determinística) para investigar disputas.
6. **Antes do ranking (P2/P3)**
   - Sinais de conluio e multicontas.
   - Processo de sanção com revisão humana e contestação, reaproveitando o modelo justo do chat (aviso, punição
     progressiva, motivo explícito).

## Como verificar

```bash
npx vitest run server/kac.test.ts
```

Para provar que um teste pega o ataque, desfaça a correção correspondente e rode de novo. O teste do KAC-01 falha
com o código antigo; essa verificação foi feita em 31/10.
