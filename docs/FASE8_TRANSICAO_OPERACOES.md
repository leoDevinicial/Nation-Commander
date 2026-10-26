# Fase 8 do adendo — transição globo → mapa operacional → batalha

## Escalas
- **Globo:** a camada política. Ali se escolhe o país em guerra.
- **Mapa operacional:** as regiões desse país e o planejamento da operação.
- **Batalha local:** um mapa tático 3D com o terreno da região escolhida e as forças enviadas.

O teatro de operações da partida, onde os jogadores do teatro se enfrentam, continua existindo o tempo todo.
Sua simulação nunca para. Uma batalha local acontece em paralelo, e as unidades que vão para ela são as
mesmas do teatro.

## Regras (servidor — `shared/strategic/operations.ts`)

### Guerra
- A guerra contra governos da IA fora do teatro agora pode ser declarada.
- Valem os mesmos custos e regras da declaração contra um jogador.
- Operações expedicionárias são a forma de combater esses governos.
- Contra outro jogador do teatro, o combate continua no próprio teatro.

### Regiões
`shared/data/sectors.ts` define 3 ou 4 regiões por país. Cada uma tem:
- ponto aproximado;
- bioma;
- costa, rio e montanhas;
- infraestrutura;
- fatia aproximada da economia.

São aproximações de jogo, e a interface diz isso.

### Lançamento
- **Unidades:** só as próprias, vivas e fora de modernização; até 16 por operação e uma operação por vez.
- **Associação persistente:** as unidades saem do teatro e viram registros. Cada registro guarda o id de
  origem, o tipo, a vida, a vida máxima e o equipamento.
- **População:** continuam contando como militares destacados (a população não muda).
- **Custos:**
  - US$ 1,5 mi por unidade, mais US$ 0,6 mi por unidade a cada 1.000 km, financiados por dívida;
  - 15 suprimentos por unidade;
  - 12 de petróleo por veículo.
- **Viagem:** 1 dia a cada 900 km entre capital e região, de 3 a 20 dias. A volta leva o mesmo tempo.

### Batalha local
É uma segunda `Simulation`, rodando no mesmo laço do servidor:
- **Mapa:** 40×40 células, gerado pelo bioma e pelo relevo da região (`generateBattleMap`).
  - costa ao sul;
  - rio com vaus e ponte;
  - montanhas;
  - vegetação conforme o bioma;
  - sempre há uma estrada entre as posições.
- **Atacante (slot 0):** recebe as mesmas unidades, com a vida e o equipamento que tinham, e uma base
  avançada.
- **Defensor:**
  - posto de comando;
  - guarnição de 4 a 14 unidades, conforme o orçamento de defesa do país, o peso da região e o estado da
    guarnição;
  - 1 a 3 torres.
- Não há atrito territorial (o mapa é local).
- **Fim da batalha:**
  - **vitória:** posto inimigo destruído;
  - **derrota:** base avançada destruída ou todos os atacantes mortos;
  - **recuo:** ordem do jogador; também é possível na viagem de ida;
  - **impasse:** 8 minutos de jogo sem decisão; vira recuo.

### Reconciliação (uma única vez)
- **Perdas:** cada unidade morta conta como baixa nacional e deixa de ser militar destacado.
- **Munição:** os disparos do atacante custam suprimentos no teatro, até o que houver.
- **Guarnição:** fica com o que sobrou e se recupera 1% ao dia.
- **Vitória:**
  - a região passa a ser ocupada;
  - o país perde 30% da produção da região (choque único no PIB);
  - o ocupante sofre repercussão diplomática (−12 de memória com o país e −3 com os demais);
  - a região rende suprimentos todo dia no teatro, e petróleo se tiver campos.
- **Notícia:** o evento `operation` registra o resultado, as perdas, as baixas inimigas e o custo.
- **Volta:** os sobreviventes voltam ao teatro com a vida e o equipamento que tinham.
- **Contagem:** nada é duplicado nem desaparece. Os testes conferem a soma de unidades, a população e os
  militares destacados.

### Rede
- Comandos `launch_operation` e `operation_retreat`.
- Ordens na batalha usam `{ t: 'cmd', scope: 'battle' }` e só aceitam ordens de unidades.
- Mensagens do servidor:
  - `battle_start`: mapa e contexto da região;
  - snapshots com `scope: 'battle'`, só para o dono da operação;
  - `battle_end`: resultado reconciliado;
  - `operations`: regiões e operações do jogador.
- Na reconexão, a batalha reabre.
- Salvar e carregar inclui as operações e as batalhas em andamento.

## Fluxo no jogo

### Do globo ao mapa operacional
1. **Globo:** toque no país em guerra e depois em "🗺 Abrir Mapa Operacional".
   - O globo gira e aproxima até o país (0,7 s, com easing), e o mapa operacional entra por cima.
   - Um toque durante a aproximação abre na hora.
   - Com "Reduzir animações" (ou a preferência do sistema), abre direto.
2. **Mapa operacional** mostra:
   - o contorno do país (Natural Earth 1:110m, simplificado);
   - as regiões, com controle, guarnição estimada, bioma, relevo, infraestrutura e peso econômico;
   - a rota a partir do seu país, com a distância.
3. **Força expedicionária:** você escolhe quantas unidades de cada tipo enviar, entre as do teatro. O painel
   mostra viagem, custos e o motivo de cada bloqueio.

### Viagem e batalha
4. **Viagem:**
   - um indicador no teatro mostra o estado e os dias restantes;
   - ao chegar, um aviso oferece "Entrar na batalha" ou "Depois" (a batalha começa de qualquer forma).
5. **Entrada:**
   - a tela de carregamento mostra a região e o bioma enquanto a cena gera o terreno e recebe o primeiro
     estado, e pode ser cancelada;
   - a câmera entra do alto e desce até a base avançada (0,9 s; o zoom do jogador interrompe);
   - o solo segue o bioma: areia e ocre no árido, verde fechado no tropical, palha nos campos, tons frios no
     frio.
6. **Na batalha:**
   - barra com região, objetivo, forças, tempo até o impasse e bioma;
   - "⤺ Teatro" minimiza a batalha (ela segue) e "Recuar" encerra, com confirmação;
   - o teatro fica suspenso: não renderiza, não ouve teclado nem toque e não escreve no HUD.

### Fim
7. **Resultado:** o relatório mostra o desfecho, as perdas, as baixas inimigas, os custos, a ocupação e a
   duração. Dele se volta ao teatro ou se abre o mapa operacional.

### Detalhes
- Cada troca de cena tem um esmaecimento de 0,38 s, para não haver salto brusco. Ele é desligado com
  movimento reduzido.
- A batalha é uma segunda cena 3D, sem recarregar a aplicação nem perder o estado da campanha:
  - a névoa de guerra, que é compartilhada, é religada na troca;
  - a cena da batalha não libera geometrias, materiais nem modelos que o teatro usa.
- O fluxo funciona por toque. O mapa operacional é usável com o celular deitado (painel embaixo ou ao lado).

## Testes
`shared/test/operations.test.ts` cobre:
- bloqueios e custos;
- saída das unidades sem duplicar;
- forças e guarnição na batalha;
- vitória com ocupação, PIB e volta com a vida preservada;
- derrota;
- recuo na batalha e na ida;
- impasse;
- salvar e carregar no meio da batalha;
- visão do jogador;
- `parseCommand`;
- mapa por bioma (costa, rio e conectividade).

`server/room.test.ts` cobre o fluxo pela rede: guerra contra país da IA → lançamento → `battle_start` →
snapshots com escopo → ordem na batalha → recuo → volta.

## Limites desta versão
- **Combate:** operações só contra governos da IA. Eles não lançam contraofensivas e não se rendem quando todas
  as regiões são ocupadas.
- **Mapa local:** procedural a partir de bioma, costa, rio e montanhas. Não é cartografia.
- **Visual:** os edifícios e a vegetação da batalha usam os mesmos modelos do teatro; só o solo segue o bioma.
