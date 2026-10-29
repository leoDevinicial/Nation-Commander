# Economia: custos altos e começo enxuto

> Depois desta entrega veio a recalibragem da coleta ([`RECALIBRAGEM_RECURSOS.md`](RECALIBRAGEM_RECURSOS.md)): taxas por
> célula novas, até 6 trabalhadores por coleta, QG com 1,5 de suprimentos/s, consumo de comida 0,04, cidadão em 10 s,
> custo crescente (+18% por edifício do tipo), começo com 100 de comida e 150 de madeira, eras ×1,25 e uma IA que
> reage ao gargalo. As tabelas abaixo já mostram esses valores; a seção "IA" descreve a primeira versão, substituída
> pela da recalibragem.

Pedido do jogador: "a principal parte de um RTS é saber administrar bem recursos; se tudo for muito barato, some o
fator estratégia". Antes, um bombardeiro custava cerca de 110 de ferro, 70 de petróleo e 80 de suprimentos e ficava
pronto em menos de um minuto de coleta. Agora cada tropa, construção e pesquisa pesa no estoque, e a partida começa com
pouco.

## Começo da partida

|                      | Antes                    | Agora                                               |
| -------------------- | ------------------------ | --------------------------------------------------- |
| Cidadãos             | 8                        | 6                                                   |
| Tropas               | 3 infantarias e 1 tanque | só 1 Explorador                                     |
| Suprimentos          | 300                      | 200                                                 |
| Comida               | 150                      | 100                                                 |
| Madeira              | 250                      | 150                                                 |
| Pedra                | 120                      | 60                                                  |
| Ferro                | 60                       | 0                                                   |
| Petróleo             | 50                       | 50 (paga a mobilização de uma declaração de guerra) |
| Verba de obras (US$) | 50% do teto anual        | 25% do teto anual (`WORKS_START_FRACTION`)          |

**Explorador** (`O`, Base Militar): batedor rápido (velocidade 5,2), com visão longa (16 células) e uma arma fraca.
Serve para achar depósitos e o inimigo. Custa 75 de comida e 40 de suprimentos. Tem modelo próprio: soldado com
binóculo e antena de rádio.

## Multiplicadores

Os valores-base continuam escritos nas definições, como antes. O bloco `ECONOMY` no fim de `shared/sim/config.ts`
multiplica os custos uma vez, quando o módulo carrega, e arredonda para múltiplos de 5, com mínimo de 5. Servidor, HUD e
IA leem o mesmo valor já escalado.

| Grupo                                                                                                       | Multiplicador                                |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Tropas terrestres                                                                                           | ×2,5                                         |
| Recrutas                                                                                                    | ×1,5                                         |
| Cidadãos                                                                                                    | ×1,25                                        |
| Pesquisas militares                                                                                         | ×2                                           |
| Construções econômicas e cívicas                                                                            | ×1,6                                         |
| Construções militares (quartel, fábrica, torre, centro de pesquisa, antiaérea, base aérea, silo, obstáculo) | ×2                                           |
| Grandes Projetos                                                                                            | ×1,3                                         |
| Avanço de era                                                                                               | ×1,25                                        |
| Aeronaves                                                                                                   | ×3 em recursos, ×2 em US$ (`air.ts`)         |
| Mísseis e ogiva nuclear                                                                                     | ×2,5 (`air.ts`)                              |
| Minas antitanque                                                                                            | ×2                                           |
| Coleta por célula                                                                                           | ×1 (as taxas-base já são as da recalibragem) |

**Outros ajustes:**

- Estrada: 10 de pedra por célula; antes eram 6.
- Depósitos com o dobro de reserva, para durar a partida: floresta 160 por célula, rocha 240, minério 200 e petróleo
  5.000 por jazida.
- Capacidade dos depósitos dobrada:
  - QG: 1.500 de suprimentos, 300 de comida, madeira e pedra, 200 de ferro e petróleo.
  - Armazém: 800 de cada.
  - Silo: 800.
  - Tanque de Petróleo: 600.
  - Prefeitura: 400 de suprimentos e 200 dos demais.

  Isso permite juntar recursos para as compras caras.

Para mudar o ritmo da economia, ajuste os multiplicadores em vez dos valores espalhados pelas definições.

## Exemplos de custo

| Item                | Custo                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------- |
| Infantaria          | 140 de comida                                                                         |
| Tanque              | 125 de suprimentos, 150 de ferro, 175 de petróleo                                     |
| Tanque Moderno      | 200 de suprimentos, 250 de ferro, 275 de petróleo                                     |
| Lança-Foguetes      | 200 de suprimentos, 175 de ferro, 175 de petróleo                                     |
| Bombardeiro         | 240 de suprimentos, 330 de ferro, 210 de petróleo, US$ 12 mi                          |
| Caça                | 150 de suprimentos, 180 de ferro, 120 de petróleo, US$ 6 mi                           |
| Míssil              | 150 de suprimentos, 200 de ferro, 150 de petróleo                                     |
| Base Militar        | 200 de madeira, 60 de pedra                                                           |
| Fábrica de Veículos | 200 de suprimentos, 240 de madeira, 300 de pedra                                      |
| Centro de Pesquisa  | 240 de madeira, 240 de pedra, 120 de ferro                                            |
| Base Aérea          | 200 de suprimentos, 200 de madeira, 300 de pedra, 240 de ferro                        |
| Era Pós-Guerra Fria | 375 de suprimentos, 250 de madeira, 190 de pedra, 100 de ferro                        |
| Programa Espacial   | 1.950 de suprimentos, 1.560 de ferro, 1.040 de pedra, 780 de madeira, 780 de petróleo |

## IA

> Substituída pela IA que reage ao gargalo ([`RECALIBRAGEM_RECURSOS.md`](RECALIBRAGEM_RECURSOS.md), §6.3).

Primeira versão, para não travar com os custos novos:

- **Madeira:** com floresta fraca perto da base (menos de 1,5 de madeira por segundo), ergue serrarias extras antes da
  base militar.
- **Pedra e ferro:**
  - a segunda mina vem logo depois do quartel;
  - a terceira pedreira vem depois da fábrica.
- **Melhorias:**
  - só começam depois do quartel;
  - esperam enquanto uma obra do plano aguarda recursos.
- **Era 2:** com a fábrica pronta, o QG sobe até o nível exigido pela era 2 antes de qualquer outra melhoria.
- **Reservas:** a IA guarda material, em vez de gastar em torres, prefeituras, fábricas extras e tropas, para:
  - o avanço de era;
  - o Centro de Pesquisa;
  - a primeira pesquisa, já durante a obra do centro;
  - a pesquisa seguinte, quando a guarnição já está montada.
- **Fazendas e silos:** no máximo 3 fazendas de emergência e menos silos enquanto junta recursos (antes, a comida
  sobrava aos milhares).

No Fácil, a IA chega à era 2, ergue o Centro de Pesquisa e começa a primeira pesquisa por volta dos 12 minutos
(`server/persistence.test.ts`).

## Testes

`TEST_START`, em `shared/test/helpers.ts`, dá aos testes de regra um estoque folgado. Assim eles testam a regra, não a
coleta. Os testes de IA usam o mapa real das partidas (`generateMatchMap`).
