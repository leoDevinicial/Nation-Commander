# KAC — Kaiser Anti Cheat

Sistema de integridade competitiva do Nation Commander, parte do ecossistema Kaiser junto com o KGPS (desempenho
gráfico) e o KAICS (qualidade adaptativa). Os três são independentes:
- o KAC não mexe em gráficos;
- o KGPS não trata queda de quadros como trapaça;
- o KAICS não detecta trapaça.

**Princípio:** o cliente pede, o servidor valida, decide e registra. Nenhum valor calculado pelo navegador vale como
verdade da partida.

## Documentos

| Documento | O que tem |
|---|---|
| [`KAC_ARCHITECTURE_AUDIT.md`](KAC_ARCHITECTURE_AUDIT.md) | Inventário, fluxo da partida, matriz de confiança, fluxo de dados, controles existentes e o modelo de autoridade (A: servidor autoritativo) |
| [`KAC_THREAT_MODEL.md`](KAC_THREAT_MODEL.md) | Superfície de ataque, ameaças por domínio e registro de riscos (KAC-01 a KAC-11) |
| [`KAC_IMPLEMENTATION_ROADMAP.md`](KAC_IMPLEMENTATION_ROADMAP.md) | Estado de maturidade de cada capacidade e próximas etapas |
| [`KAC_ENFORCEMENT_POLICY.md`](KAC_ENFORCEMENT_POLICY.md) | O que é automático, tipos de evidência, revisão humana, escada de sanções e contestação |

A especificação pedia dez documentos de auditoria separados. Eles foram reunidos nos três acima para não repetir
conteúdo:

| Pedido na especificação | Onde está |
|---|---|
| `ARCHITECTURE_AUDIT` | `KAC_ARCHITECTURE_AUDIT.md`, seções 1 e 6 |
| `MATCH_FLOW` | `KAC_ARCHITECTURE_AUDIT.md`, seção 2 |
| `SERVER_AUTHORITY_ASSESSMENT` | `KAC_ARCHITECTURE_AUDIT.md`, seção 2 |
| `TRUST_BOUNDARY_MAP` | `KAC_ARCHITECTURE_AUDIT.md`, seção 3 |
| `DATA_FLOW_MAP` | `KAC_ARCHITECTURE_AUDIT.md`, seção 4 |
| `EXISTING_CONTROLS` | `KAC_ARCHITECTURE_AUDIT.md`, seção 5 |
| `THREAT_MODEL` | `KAC_THREAT_MODEL.md` |
| `ATTACK_SURFACE` | `KAC_THREAT_MODEL.md`, seção 1 |
| `RISK_REGISTER` | `KAC_THREAT_MODEL.md`, seção 3 |
| `IMPLEMENTATION_ROADMAP` | `KAC_IMPLEMENTATION_ROADMAP.md` |

## Código

| Arquivo | Função |
|---|---|
| `server/kac/identity.ts` | KAC-01: id público do convidado = hash do segredo |
| `server/kac/policy.ts` | KAC-02: política de pausa nas partidas entre humanos |
| `server/kac/network.ts` | KAC-03: tetos de conexões e de salas por IP, IP real atrás do proxy |
| `server/kac/identity.ts` (`publicId`) | KAC-05: contas aparecem para os outros só pelo id público |
| `server/kac/journal.ts` | Diário de eventos de segurança (memória, contagem por categoria, log, destino persistente) |
| `server/kac/store.ts` | KAC-08: gravação em lote na tabela `kac_events`, retenção de 90 dias |
| `server/kac/behavior.ts` | KAC-09: sinais de automação (só alerta) |
| `server/kac/integrity.ts` | Relatório de integridade da partida (`matches.report.integrity`) |
| `server/kac/admin.ts` | Painel de leitura `GET /kac` (token `KAC_ADMIN_TOKEN`) |
| `server/kac/entityIds.ts`, `shared/sim/ids.ts` | KAC-06: ids embaralhados por uma chave secreta da partida |
| `shared/sim/snapshot.ts` | KAC-07 e KAC-12: o snapshot não cita alvo nem base aérea fora da visão |
| `server/kac.test.ts`, `shared/test/kacProjection.test.ts` | Testes adversariais: cada um reproduz um ataque e prova que ele não funciona mais |

## Efeito para o jogador

- **Convidados:** na primeira conexão depois da atualização, o convidado ganha um id novo. Uma partida de convidado em
  andamento nesse momento não é retomada. Contas não mudam.
- **Pausa entre humanos:** 3 pausas por partida, de até 60 s cada. Nos primeiros 15 s só quem pausou retoma. Ordens
  dadas com o jogo pausado são recusadas. Contra a IA e no Sandbox, nada muda.
- **Limites por IP:** quem cria mais de 8 salas em 10 minutos recebe "Muitas salas criadas em pouco tempo".
- **Decisões nacionais na pausa:** nas partidas entre humanos, orçamento, pesquisa e diplomacia também esperam a
  partida voltar.
- **Voos inimigos:** só mostram a decolagem e o pouso quando a base deles está à vista; fora disso, aparecem já no ar.
- **Sem efeito visível:** ids embaralhados, ids públicos na sala, diário persistente, sinais de automação e relatório de integridade.
  Nenhum deles muda o jogo ou pune alguém.
