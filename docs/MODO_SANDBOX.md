# Modo Sandbox

Modo livre para testar o jogo. Entra pelo menu (**🧪 Modo Sandbox**): escolha o país no lobby e
inicie. A partida é contra uma IA, mas com regras de laboratório para o jogador:

- **Sem economia na tela:** os recursos ficam sempre cheios, sem limite de armazenamento, de
  população ou de recrutas, e sem fome ou manutenção atrasada.
- **Tudo liberado:**
  - todas as pesquisas nacionais e militares;
  - verba de obras ilimitada;
  - estabilidade máxima para as melhorias.

  Qualquer edifício, tropa, pacote de modernização, aeronave ou míssil pode ser usado na hora.
- **Já em guerra com a IA:** contato e guerra declarados no início, para testar combate, caças e
  mísseis sem preparo.
- **O QG não cai:** atacado até zerar, ele volta com a vida cheia, e a partida não termina
  sozinha. Para sair, use Menu → Render-se.
- **Não conta:** a partida não entra no histórico nem no ranking.

## Ferramentas (botão 🧪 SANDBOX na barra da partida)

| Ferramenta | O que faz |
|---|---|
| Tudo instantâneo (ligado por padrão) | Obras, melhorias, produção, pesquisas, modernização, aeronaves e mísseis em 1 tick |
| IA inimiga ativa (desligada por padrão) | Desligada, a base inimiga fica parada como alvo. Ligada, a IA constrói, produz e ataca |
| Revelar o mapa | Tira a névoa de guerra do mapa inteiro |
| Criar tropas | Qualquer tropa, minhas ou inimigas, ×1/×5/×10/×20, no centro da tela, opcionalmente com todos os pacotes de modernização |
| Nível do edifício | Leva o edifício selecionado a qualquer nível (inclusive o máximo), com a especialização escolhida |
| Modernizar tudo e curar | Todos os pacotes e vida cheia nas unidades selecionadas |
| Remover a seleção / Limpar o campo | Remove unidades ou edifícios selecionados (o QG fica), ou todas as tropas inimigas ou as minhas |

O painel também traz um "Como testar" com sugestões rápidas.

## Como funciona por dentro

| Parte | Onde |
|---|---|
| Modo da sala `sandbox` | `shared/protocol.ts`, `server/Room.ts` |
| Regras do Sandbox na simulação | `Simulation.sandbox` (`slots`, `instant`, `aiActive`, `reveal`), salvo e carregado com a partida |
| Pesquisas, verba e estabilidade liberadas | `server/Room.ts` (`wire`): a ligação nacional devolve tudo liberado só para o jogador do Sandbox; o orçamento real da nação não é mexido |
| IA passiva | o servidor só chama a IA tática com `aiActive` |
| Comandos `sandbox_*` | `shared/sim/commands.ts`; recusados fora do Sandbox ("Ferramenta disponível só no modo Sandbox") |
| Cliente | `src/state/sandbox.ts` aplica as mesmas liberações nos botões; `SandboxPanel.tsx` é o painel; a barra esconde a economia |

Testes: `server/sandbox.test.ts`.

## Correções de divergência

- O botão normal **⬆ Melhorar** também ignora os requisitos (Centro de Comando, armazém do produto, infraestrutura nacional, estabilidade, verba); com "Tudo instantâneo" a janela mostra a obra como instantânea.
- As dicas de produção, pesquisa, modernização, aeronaves e mísseis mostram "instantâneo (Sandbox)" quando o modo está ligado.
- Tropas criadas "no máximo" (e o botão Maximizar) recebem também o bônus de vida do quartel/fábrica no nível máximo, igual a uma unidade produzida de verdade.
- Com a IA pausada, o governo inimigo também não mexe em orçamento nem em diplomacia (não propõe paz no meio do teste).
