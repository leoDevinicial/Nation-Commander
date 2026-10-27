# Visão aproximada, tanques no estilo T-90 e rastros de esteira

## Visão aproximada

Para ver as tropas e as construções de perto: botão **🎥 De perto** na barra superior (também no celular) ou
tecla **V**.

- **Acompanhamento:** a câmera segue a seleção: a primeira unidade selecionada ou o edifício escolhido. Clicar
  em outra unidade troca o acompanhamento.
- **Câmera:** o zoom chega a 3,2 (no modo normal, o mínimo é 16). Quanto mais perto, mais baixa a câmera, até
  quase a altura das tropas, mirando o corpo delas e não o chão.
- **Controles:**
  - role ou faça pinça para aproximar;
  - **Q/E** giram a câmera;
  - mover a câmera (WASD, setas ou arrasto) solta o acompanhamento.
- **Sair:** **Esc** ou o mesmo botão. A câmera volta suave ao zoom de antes.
- **Barras de vida:** ficam escondidas na visão aproximada, porque de perto cobririam a tela. A vida continua no
  painel da seleção.
- **Tecla V:** com um quartel ou uma fábrica selecionados, V continua produzindo o Veículo Blindado.

## Tanques no estilo T-90

- **Tanque (T-90):**
  - casco baixo com o glacis coberto de blindagem reativa;
  - seis rodas de apoio grandes e saias com painéis reativos na frente;
  - torre arredondada com blocos reativos em "V";
  - bloqueadores infravermelhos (Shtora) dos dois lados do canhão;
  - cúpula do comandante com metralhadora, mira do atirador e lançadores de fumígenos;
  - caixas laterais, cesto traseiro, tambores de combustível, tronco de desatolamento e antenas;
  - canhão longo com luva térmica e evacuador de gases.
- **Tanque moderno (T-90M):** maior, com mais blocos reativos, cesto blindado e estação de armas remota.

## Rastros de esteira

Os veículos de lagartas (tanques, tanque moderno e antiaérea móvel) deixam marcas no chão.

- **Desenho:** um par de marcas por esteira a cada 0,34 percorrido, com o desenho das garras.
- **Cor:** as marcas escurecem o solo por multiplicação, respeitando a cor e a textura do terreno.
- **Duração:** esmaecem em cerca de 45 s.
- **Quantidade:** um conjunto fixo e reaproveitado de 3.000 marcas (1.200 nos presets leves). As mais antigas
  dão lugar às novas.

## Suspensão dos veículos

O chassi inclina para fora nas curvas, afunda a traseira ao acelerar e a frente ao frear, com amortecimento. Os
veículos de rodas inclinam mais que os de lagartas.

## Testes

`src/test/closeup.test.ts` cobre:
- o zoom e a inclinação da visão aproximada, e a volta ao modo normal;
- a posição dos pares de marcas sob as esteiras;
- o esmaecimento das marcas e o reaproveitamento em anel.

## Animações: polimento e correções

- **Entrada em cena:** a unidade cresce até o tamanho real em cerca de 0,3 s ao ser produzida ou ao entrar na
  visão, em vez de surgir de repente.
- **Destruição:**
  - o veículo tomba de lado, a torre fica torta e uma coluna de fumaça escura sobe dos destroços, que ficam
    cerca de 6 s no chão e afundam;
  - o soldado cai e some em cerca de 3 s.
  - Uma unidade que só saiu da visão some na hora, sem a animação.
- **Máquinas das construções:**
  - serras, bombas de petróleo, esteiras, guindastes e chaminés acompanham o funcionamento do prédio: param
    sem trabalhadores, sem manutenção paga, com o depósito esgotado ou com o armazém cheio, desacelerando e
    voltando suaves;
  - construções iguais não giram mais em sincronia perfeita.
- **Correções:**
  - os foguetes do lança-foguetes seguem o relógio da simulação: param na pausa e aceleram com a velocidade
    do jogo, chegando junto com o dano;
  - na visão aproximada, arrastar o mapa (também no celular), usar o minimapa ou centralizar no QG solta o
    acompanhamento; antes, a câmera era puxada de volta para a unidade;
  - escolher um edifício pelo resumo de produção passa a acompanhá-lo.
- **Testes:** `src/test/unitAnim.test.ts` cobre a entrada, a queda, os rastros de um tanque andando e a
  parada suave das máquinas.

## Canos e disparos visíveis

- **Canos:** viram peças próprias da torre, com a boca aberta (anel de aço e o furo escuro à mostra).
  - **Tanques:** canhão com luva térmica e evacuador de gases.
  - **Artilharia:** obus com freio de boca de dupla câmara e janelas laterais.
  - **Antiaérea:** dois canhões com quebra-chamas.
  - **Blindado:** canhão automático.
- **Recuo:** no disparo o cano recua rápido sozinho (a torre fica parada) e volta amortecido, como num sistema
  hidráulico. O curso é maior no obus e no canhão do tanque.
- **Projétil visível**, com clarão macio e jato de fogo na boca:
  - **Tanque:** a flecha sai muito rápida com traçante; anel de fumaça na boca e poeira no chão.
  - **Artilharia:** a granada sobe em arco com fumaça fina e explode ao cair.
  - **Antiaérea:** rajadas de dois traçantes alternando os canos.
  - **Blindado:** rajada de três traçantes.
- **Relógio:** os projéteis seguem o relógio da simulação: param na pausa e aceleram com a velocidade.
- **Lança-foguetes:**
  - cada tubo mostra a ogiva do foguete carregado, e ela some quando aquele foguete sai;
  - cerca de 2,8 s depois da salva a guarnição recarrega o casulo, um tubo a cada 0,3 s.
