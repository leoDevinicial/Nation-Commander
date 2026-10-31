# Clima, dia e noite

Pedido do usuário (31/10): conforme os países escolhidos no lobby (humanos e IA), a partida tem neve (se todas as
nações forem da Europa), chuva e ciclo de dia e noite.

É só visual: não muda nenhuma regra. A decisão é determinística, pela semente e pelo tempo da partida, então todos os
jogadores veem o mesmo céu.

- **Regra:** `shared/sim/climate.ts` (testes em `shared/test/climate.test.ts`).
- **Cena:** `src/game/render/Weather.ts`.
- **Materiais e céu:** `climateUniforms` em `materials.ts` e `skyUniforms` em `Sky.ts`.
- **Som:** `setWeather` e `thunder` em `AudioService`.
- **Indicador:** `SkyChip` na barra de cima, com o ícone e a hora; o título mostra o clima.

## Clima da partida (`matchClimate`)

| Clima | Quando | Eventos |
|---|---|---|
| Inverno europeu (`snow`) | todas as nações são da Europa (Alemanha, França, Reino Unido, Itália, Espanha, Rússia) | neve leve (32% das janelas) e às vezes chuva fria (8%) |
| Árido (`arid`) | mapa Deserto | chuva rara e fraca (6%) |
| Tropical (`tropical`) | alguma nação com capital entre os trópicos (\|lat\| < 23,5°: Brasil, México, Índia, Arábia Saudita…) | chuva mais frequente (42%), tempestades com raios |
| Temperado (`temperate`) | o resto | chuva às vezes (28%), algumas tempestades |

O tempo é sorteado em janelas de 6 min. A primeira janela é sempre de tempo bom. Tempo bom é a regra: chuva ou neve
ocupam de 2% a 14% da partida (teste em `climate.test.ts`). Cada evento:
- é curto: 50 a 90 s, num momento sorteado da janela, com entrada e saída de 12 s;
- tem força de 40% a 90% (a neve, 65% disso: flocos esparsos, não nevasca);
- vem com o céu fechando um pouco antes da precipitação e abrindo um pouco depois.

## Dia e noite (`dayLight`)

O ciclo completo dura 16 min de partida e anda com a velocidade do jogo (para na pausa):
- ~10,5 min de dia: a partida começa no meio da manhã;
- 1,5 min de entardecer, com o sol baixo e dourado e o céu rosado;
- ~4 min de noite;
- ~1,5 min de amanhecer.

À noite:
- a luz vem da lua: azulada, fraca, com sombra do outro lado;
- o céu escurece, com estrelas que cintilam e a lua;
- as janelas dos prédios acendem (luz quente, parte das vidraças);
- a noite fica escura o bastante para ter clima, sem atrapalhar a leitura das tropas.

## Na cena

- **Chuva:**
  - céu cinza fechado, luz direta mais fraca, neblina mais perto;
  - riscos de chuva inclinados pelo vento numa caixa em volta da câmera, animados na GPU;
  - chão, prédios e telhados molhados: 30% mais escuros e bem mais lisos (refletem o céu); secam em ~2 min;
  - som em camadas, baixo e sem assobio: lençol de chuva abafado, chiado fino, tamborilar grave nos telhados e gotas
    soltas espalhadas no estéreo.
- **Tempestade:**
  - raios em pontos aleatórios perto da câmera, com clarão no céu e na cena (luz do conjunto fixo, sem recompilar);
  - trovão depois, com atraso pela distância: estalo seco quando é perto, ronco que rola quando é longe.
- **Neve:**
  - flocos redondos caindo devagar e balançando;
  - a neve acumula nas faces voltadas para cima (chão, telhados, copas) só em manchas: nunca cobre o mapa todo
    (`SNOW_MAX` em `Weather.ts`);
  - derrete em ~1,5 min quando para e deixa só restos mínimos (`SNOW_RESIDUE`);
  - vento frio no som.
- **Desempenho:**
  - 4.200 riscos de chuva e 3.600 flocos (1.600 e 1.400 no perfil leve), sem atualizar buffers por quadro;
  - com o tempo bom, os efeitos nos materiais são um ramo uniforme desligado.
- **Fim da partida:** os valores-base do céu são compartilhados entre partidas e voltam ao padrão no `dispose`.
