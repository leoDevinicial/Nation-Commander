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
