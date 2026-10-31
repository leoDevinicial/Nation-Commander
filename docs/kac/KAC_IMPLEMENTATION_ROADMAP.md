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
| KAC-05: ids públicos para contas (sala, anfitrião, `welcome`) | ADVERSARIALLY TESTED | `server/kac/identity.ts` (`publicId`), `Room.info`, `handler.ts` |
| KAC-07: `targetId` só de alvo visível | ADVERSARIALLY TESTED | `visibleTarget` em `shared/sim/snapshot.ts`; `shared/test/kacProjection.test.ts` |
| KAC-12: base aérea de voo inimigo só se visível | ADVERSARIALLY TESTED | `airView`; `AirLayer` sem base; teste em `shared/test/air.test.ts` |
| KAC-11: decisões nacionais recusadas na pausa | ADVERSARIALLY TESTED | `Room.nationalCommand` |
| KAC-08: diário persistente (`kac_events`, 90 dias) | UNIT TESTED | `server/kac/store.ts`, `kacSupabaseBackend`; migração aplicada em 31/10 |
| KAC-09: sinais de automação (só alerta) | INTEGRATION TESTED | `server/kac/behavior.ts`, `Room.command`; falta calibrar com partidas reais |
| Relatório de integridade da partida | INTEGRATION TESTED | `server/kac/integrity.ts`, `matches.report.integrity` |
| Painel de leitura `/kac` | ADVERSARIALLY TESTED | `server/kac/admin.ts`; ligado só com `KAC_ADMIN_TOKEN` |
| Política de sanções | DESIGNED | `KAC_ENFORCEMENT_POLICY.md`; não há ranking nem banimento no jogo ainda |
| KAC-06: ids opacos (permutação secreta por partida) | ADVERSARIALLY TESTED | `server/kac/entityIds.ts`, `shared/sim/ids.ts`; chave no salvamento da sala |
| Observação em produção | NOT ASSESSED | depende de publicar e ler os logs do Render ("KAC" e "KAC resumo") |

## Próximas etapas

1. **Publicar e observar (P0)**
   - Ler no log do Render os eventos "KAC" e o "KAC resumo" de 10 em 10 minutos.
   - Confirmar o KAC-04 com `xffMaxHops` e `rede.busiestIp` do resumo.
   - Medir se algum limite atrapalha jogador legítimo e se o KAC-09 gera alerta em partidas normais.
   - Opcional: definir `KAC_ADMIN_TOKEN` (24+ caracteres aleatórios) no Render para usar o painel `/kac`.
2. **Calibrar o KAC-09 (P1)**
   - Com algumas semanas de `kac_events`, ver a distribuição dos alertas.
   - Ajustar `BEHAVIOR_POLICY` se aparecer falso positivo. Nada de sanção antes disso.
3. **Replay para disputas (P2)**
   - Gravar os comandos aceitos de partidas ranqueadas.
   - Reexecutar a partir da semente e comparar com o `stateHash` do relatório de integridade.
4. **Antes do ranking (P2/P3)**
   - Sinais de conluio e multicontas.
   - Ferramenta de sanção que siga `KAC_ENFORCEMENT_POLICY.md`: registro da decisão, aviso ao jogador e contestação.

## Como verificar

```bash
npx vitest run server/kac.test.ts shared/test/kacProjection.test.ts shared/test/air.test.ts
```

Painel (com o servidor rodando e `KAC_ADMIN_TOKEN` definido):

```bash
curl -s -H "Authorization: Bearer $KAC_ADMIN_TOKEN" "https://<servidor>/kac?limit=50"
```

Para provar que um teste pega o ataque, desfaça a correção correspondente e rode de novo. Os testes do KAC-01, KAC-05,
KAC-06, KAC-07 e KAC-12 falham com o código antigo; essa verificação foi feita em 31/10.
