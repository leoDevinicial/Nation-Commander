# Partidas salvas no servidor

As partidas vivem na memória do servidor de jogo. Sem gravação, qualquer reinício as perderia:
- uma publicação nova (cada envio ao repositório publica o servidor);
- uma queda;
- o plano gratuito do Render, que adormece.

Agora cada partida em andamento é gravada e retomada.

## O que é gravado (`RoomSave`, `server/Room.ts`)
- **Sala:** código, modo, anfitrião, regra do teatro, seed, início, velocidade e jogadores (id,
  nome, país, IA).
- **Simulação tática:** `Simulation.serialize()`, com entidades, território, comércio, força aérea,
  militares destacados e ±Infinity preservado.
- **Camada nacional:** `NationalSimulation.toSave()`, com economia, pesquisa, verba de obras,
  histórico, gerador aleatório e diplomacia (`Diplomacy.toSave()`: tratados, memória, contatos,
  missões e guerras).
- **Operações expedicionárias:** inclui as batalhas locais em andamento.
- **IA tática:** tamanho da onda, ataque em curso e pedido de guerra.
- **Névoa:** edifícios inimigos lembrados por cada jogador.

Os vínculos entre as camadas (guerra nacional → combate no teatro, verba de obras, comércio) não
são dados: são refeitos pelo mesmo código da partida nova (`Room.wire`).

Continuar de um salvamento é **idêntico** a continuar da partida original. Os testes comparam o
estado completo depois de centenas de ticks, inclusive no meio de uma batalha local.

## Quando grava
- **A cada 30 s** (`SAVE_INTERVAL_MS`), só as partidas que avançaram desde a última gravação.
- **No encerramento do servidor (SIGTERM):**
  1. congela todas as partidas;
  2. grava o estado final;
  3. só então derruba as conexões, com o código 1012.
- **Fim da partida:** o salvamento é apagado.

## Onde grava (`server/matchStore.ts`)
| Ambiente | Armazenamento |
|---|---|
| Produção (com `SUPABASE_SERVICE_ROLE_KEY`) | tabela `active_matches` (migração `20261026000000_active_matches.sql`): uma linha por sala, ids dos jogadores e estado em JSON com gzip + base64 (~16 KB numa partida média). RLS ligada e nenhuma política: só a service role do servidor acessa |
| Sem Supabase, com `MATCH_STORE_DIR` | um arquivo por sala, gravado com troca atômica |
| Nenhum dos dois | não grava (aviso no log ao iniciar) |

## Como retoma
A retomada é **sob demanda**, quando o jogador volta (`RoomManager.findOrRestore`), e não na
partida do servidor. Numa publicação sem interrupção, o servidor novo entra no ar antes de o antigo
gravar o estado final; ler tudo na partida pegaria salvamentos velhos.

1. **Reconexão:** o cliente reconecta sozinho. Na queda 1012 ele mostra "Servidor atualizando… a
   partida será retomada" e tenta por cerca de 2 minutos.
2. **Busca:** sem a sala em memória, o servidor busca o salvamento mais recente daquele jogador.
3. **Ensaio:** o servidor roda 40 ticks numa cópia. Um salvamento que não roda nesta versão é
   descartado sem afetar ninguém, e o jogador vai para o menu.
4. **Retomada:** a sala volta com todos desconectados.
   - **Prazo de reconexão:** os humanos têm 5 minutos para voltar (`RESTORE_GRACE_MS`), além do
     prazo normal.
   - **Contra a IA:** a partida fica pausada e volta sozinha quando o jogador reconecta.
   - **Batalha local em andamento:** reabre para o dono.
5. **PvP:** o segundo jogador encontra a mesma sala já em memória.

Salvamentos com mais de 12 horas são descartados.

## Robustez
- **Erro na simulação:** um erro durante o tick é registrado e pausa só aquela partida. Antes, ele
  derrubaria o processo e todas as outras partidas.
- **Pausa automática:** a pausa por queda de conexão passou a ser automática também fora da
  retomada. Antes, na reconexão contra a IA o jogo ficava "PAUSADO" até o jogador retomar.

## Testes
`server/persistence.test.ts` cobre:
- reinício com continuação idêntica (simulação, economia, diplomacia, operações e IA);
- reinício no meio de uma batalha local;
- PvP com prazo estendido, abandono e salvamento apagado;
- salvamento ilegível descartado;
- sala pausada sem regravação, e compressão;
- salvar e carregar a camada nacional e a IA tática;
- armazenamento em arquivos.

Um teste ponta a ponta no navegador (servidor real, SIGTERM, servidor novo) confirmou a retomada
com o aviso na tela.
