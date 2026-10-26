# Fase 5 do adendo — pesquisa tecnológica, investimento nacional e modernização de tropas

O servidor decide tudo. As regras ficam em dois arquivos de funções puras, e o servidor (para validar) e a interface
(para mostrar custos e motivos de bloqueio) usam as mesmas funções:

- `shared/strategic/technologies.ts`: a árvore de pesquisa;
- `shared/sim/modernization.ts`: os pacotes de modernização.

O cliente só envia a intenção:

- `set_research`, pela camada nacional;
- `modernize` e `cancel_modernize`, pela camada tática.

## Como o jogador usa

1. **Nação → Pesquisa.** As tecnologias aparecem em quatro categorias de investimento: Defesa, Estado e logística,
   Indústria e construção, Recursos naturais. Cada cartão mostra:
   - pré-requisitos (✔/✖);
   - o que a pesquisa libera;
   - progresso e prazo estimado com a verba de P&D atual;
   - custo em US$ no PIB atual, quanto já foi investido, quanto falta e a duração mínima.
2. Tocar em **Pesquisar** inicia o projeto e pausa o atual, se houver. **Pausar** e **Retomar** mantêm o progresso
   e o investido.
3. Quando termina uma pesquisa militar, aparece no painel de comando das tropas o **botão do pacote** (ex.: "📡 Rádio
   digital"). Leve as tropas até a instalação certa e toque no pacote:
   - base militar, para infantaria;
   - fábrica, para veículos.

   O botão mostra:
   - quantas unidades podem começar agora (×N);
   - o custo por unidade, em materiais e na verba de obras;
   - quando nenhuma pode começar, o motivo curto: "pesquisa", "longe", "sem vaga", "sem verba", "recursos".

   Tocar num botão bloqueado mostra o motivo completo.
4. Durante a modernização, a unidade fica parada ao lado da instalação, com um **anel âmbar pulsante**. Ela não
   dispara e não aceita ordens. **Cancelar moderniz.** devolve 50%.
5. Ao terminar, a unidade ganha o pacote. Ele aparece de três formas:
   - **no próprio modelo 3D**: saias de blindagem, mastro de rádio, caixa de sensores e escapamento novo;
   - **na ficha da unidade**: o nível de equipamento ("Ger. 2/5 · BC RD") e cada atributo com a base e a origem do
     ganho (ex.: "Visão 14 (base 12) +2 Rádio digital");
   - **na seleção em grupo**: a contagem por geração.

## Pesquisa

| Regra | Como funciona |
|---|---|
| Custo | Em "% do PIB × ano" (ex.: 0,15). Em US$, acompanha o PIB do país. |
| Investimento | Todo dia sai do orçamento a verba de P&D (aba Orçamento, de 0% a 4% do PIB), que compete com as outras despesas e pesa no déficit. Com projeto ativo, a verba vira investimento nele (`research.invested`). Sem projeto, é gasta sem retorno (`research.idleUsd`), e o painel avisa em destaque. |
| Ritmo | Avanço diário = verba ÷ custo, limitado a 1 ÷ duração mínima. Acima desse limite, verba extra não acelera, e o painel avisa "Ritmo máximo atingido". |
| Pré-requisitos | Começar uma pesquisa sem os pré-requisitos é recusado com "Requer: …". O servidor e o painel usam a mesma regra (`researchBlocker`). |
| Pausa/troca | O progresso e o investido ficam guardados. Não há devolução. |
| Efeitos automáticos | Só os que não dependem de equipamento: logística, tempo de obra, tempo de produção, crescimento e território. |
| Pesquisas militares | Não mudam nenhum número das tropas sozinhas. Elas liberam pacotes de modernização. |

### Árvore

| Pesquisa | Categoria | Custo | Mín. | Requer | Libera |
|---|---|---|---|---|---|
| Logística integrada | Estado | 0,15 | 60 d | — | +25% de suprimentos ao teatro; melhorias de depósitos e QG |
| Treinamento acelerado | Defesa | 0,15 | 60 d | — | −25% no tempo de produção; melhorias da base militar |
| Construção modular | Indústria | 0,12 | 50 d | — | −30% no tempo de obra; melhorias do prédio residencial |
| Mecanização agrícola | Recursos | 0,12 | 50 d | — | melhorias de fazenda |
| Extração mecanizada | Recursos | 0,15 | 60 d | — | melhorias de serraria, pedreira e mina |
| Comunicações digitais | Defesa | 0,15 | 60 d | — | pacote Rádio digital |
| Administração territorial | Estado | 0,15 | 60 d | Logística | +20% de território; QG nível 7 |
| Automação industrial | Indústria | 0,30 | 120 d | Construção modular | +0,4 p.p. de crescimento; melhorias de fábrica |
| Perfuração avançada | Recursos | 0,15 | 60 d | Extração mecanizada | melhorias de poço |
| Blindagem composta | Defesa | 0,25 | 100 d | Extração mecanizada | pacotes Blindagem composta e Colete balístico |
| Munição guiada | Defesa | 0,25 | 100 d | Comunicações digitais | pacote Munição guiada; melhorias da torre |
| Sensores e óptica térmica | Defesa | 0,20 | 80 d | Comunicações digitais | pacote Óptica térmica |
| Propulsão eficiente | Defesa | 0,25 | 100 d | Automação + Perfuração avançada | pacote Motor eficiente |

## Modernização de tropas

| Pacote | Área | Pesquisa | Unidades | Efeito | Instalação (por unidade) | Na linha de produção |
|---|---|---|---|---|---|---|
| Colete balístico (CB) | Blindagem | Blindagem composta | infantaria | +15% de vida | 10 ferro, 10 supr., US$ 0,3 mi, 12 s | +5 ferro |
| Blindagem composta (BC) | Blindagem | Blindagem composta | veículos | +25% de vida | 40 ferro, 20 supr., US$ 1,5 mi, 25 s | +20 ferro |
| Munição guiada (MG) | Precisão | Munição guiada | todas | +15% de dano | 30 supr., 10 ferro, US$ 0,8 mi, 15 s | +15 supr. |
| Rádio digital (RD) | Comunicações | Comunicações digitais | todas | +2 de visão, disparo 8% mais rápido | 20 supr., US$ 0,4 mi, 10 s | +8 supr. |
| Óptica térmica (OT) | Detecção | Sensores e óptica térmica | veículos | +2 de visão, +1 de alcance | 25 supr., 15 ferro, US$ 1,2 mi, 20 s | +8 ferro, +8 supr. |
| Motor eficiente (ME) | Mobilidade e logística | Propulsão eficiente | veículos | +12% de velocidade, −30% de desgaste sem suprimento | 30 ferro, 20 petróleo, US$ 1,5 mi, 25 s | +10 ferro |

Regras gerais da modernização:

- **Instalação compatível:** a mesma que produz a unidade, concluída e a até 8 de distância da borda.
- **Baias:** cada instalação moderniza ao mesmo tempo 2 unidades (+1 a cada 3 níveis do edifício). Assim, parte da
  força fica indisponível de cada vez.
- **Custos:** materiais do teatro mais a verba de obras do orçamento nacional, debitada antes. Sem verba, nada é
  cobrado.
- **Cancelar:** pelo jogador, devolve 50% dos materiais e da verba. Se a instalação for destruída, a obra é cancelada
  com a mesma devolução.
- **Vida:** a vida máxima e a vida atual sobem na mesma proporção. O pacote não "cura" a unidade.
- **Unidades novas:** saem com o padrão vigente no momento do pedido e pagam a diferença de custo do equipamento. O
  cartão de produção mostra "Ger. N" e as siglas. Um pedido feito antes de a pesquisa terminar não ganha o pacote.
- **Origem dos bônus:** todo ganho aponta para o pacote e para a pesquisa que o liberou (`unitStatLines`). Não há
  bônus global sem explicação: os antigos `damageMul`/`tankHpMul`/`infantryHpMul` da camada nacional foram removidos.
- **IA tática:** usa a mesma regra (`checkModernize`) e o mesmo comando. Moderniza até duas unidades por avaliação,
  sem deixar menos da metade do exército disponível.

## Persistência

- `Unit.mods` e `Unit.refit` fazem parte de `Simulation.toSave()`. Continuar de um salvamento é idêntico a continuar
  da partida original (teste). Salvamentos anteriores à Fase 5 carregam com equipamento padrão.
- `NationalSimulation.saveResearch()` / `loadResearch()` guardam e restauram projeto atual, progresso, investido,
  verba sem projeto e data de conclusão de cada pesquisa (teste de ida e volta). O salvamento completo da camada
  nacional, com diplomacia e economia, e o botão de salvar para o jogador ficam para a Fase 12.

## Testes

`shared/test/modernization.test.ts`:

- **Árvore de pesquisa:**
  - árvore válida e sem ciclos;
  - pré-requisito bloqueia;
  - investimento e verba sem projeto;
  - pausa e troca mantêm o progresso;
  - duração mínima;
  - IA respeitando os pré-requisitos;
  - salvar/carregar a pesquisa.
- **Modernização:**
  - tropas em campo não mudam com a pesquisa;
  - exigência de pesquisa e de instalação;
  - custo em materiais e verba, indisponibilidade e instalação;
  - origem dos bônus;
  - pacotes por unidade;
  - cancelamento e instalação destruída;
  - baias;
  - falta de verba;
  - padrão de produção;
  - salvar/carregar;
  - validação de comandos.
