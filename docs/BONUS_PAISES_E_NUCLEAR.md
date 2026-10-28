# Bônus por país e choque nuclear global

Itens 12 e 14 do lote 2 de [`BALANCEAMENTO_E_PROGRESSAO.md`](BALANCEAMENTO_E_PROGRESSAO.md).

## Bônus único por país

Cada país jogável tem um bônus pequeno (`shared/sim/countryBonus.ts`). O bônus aparece no cartão do país na sala e
vale nas regras do servidor e no HUD (custos e tempos mostrados já com ele).

| País | Bônus | Efeito |
|---|---|---|
| Brasil | Guerra na selva | Tropas 25% mais rápidas na floresta; metade do atrito em território inimigo |
| Argentina | Celeiro do mundo | +25% de comida |
| Estados Unidos | Logística aérea | Aeronaves 30% mais baratas |
| México | Indústria de montagem | Veículo Blindado 20% mais barato |
| Alemanha | Engenharia blindada | Tanques com 15% mais vida |
| França | Força de intervenção | Forças Especiais e Infantaria Antitanque 20% mais baratas |
| Índia | Grande reserva humana | Recrutas 25% mais baratos |
| Japão | Eficiência industrial | Obras 15% mais rápidas |
| África do Sul | Minerais estratégicos | +30% de ferro |
| Austrália | Mineração em escala | +20% de pedra e ferro |
| Reino Unido | Forças especiais de elite | Forças Especiais com +20% de vida e 15% mais baratas |
| China | Produção em massa | Tropas produzidas 20% mais rápido |
| Itália | Engenharia civil | Obras 12% mais rápidas e +10% de pedra |
| Canadá | Recursos florestais | +25% de madeira |
| Arábia Saudita | Petróleo abundante | +30% de petróleo |
| Espanha | Infantaria de montanha | Infantaria 15% mais barata e +10% de vida |
| Egito | Muralha antiaérea | Antiaérea própria 20% mais eficaz |
| Rússia | Artilharia em massa | Artilharia e Lança-Foguetes 25% mais baratos |
| Turquia | Indústria de defesa | Antiaérea Móvel e Veículo Blindado 15% mais baratos |
| Coreia do Sul | Defesa antiaérea superior | Antiaérea própria 30% mais eficaz |
| Coreia do Norte | Exército de massa | Artilharia 20% e recrutas 15% mais baratos |

## Ogiva nuclear

A pesquisa nacional **Armas nucleares** exige Mísseis balísticos e libera a ogiva nuclear no Silo de Mísseis:

| | Míssil convencional | Ogiva nuclear |
|---|---|---|
| Custo | 80 ferro, 60 petróleo, 60 suprimentos, US$ 6 mi | 220 ferro, 160 petróleo, 220 suprimentos, US$ 40 mi |
| Produção | 45 s | 90 s |
| Dano / raio | 700 / 4 (pesado: 1150 / 5,5) | 6000 / 14 |
| Interceptação | normal | metade da chance |

O lançamento segue a mesma sequência do convencional: preparar, autorizar (manter pressionado) e lançar. A
detonação tem clarão branco, bola de fogo, várias ondas de choque e tremor forte.

## Choque econômico global

Todo lançamento nuclear (no momento em que o míssil sai) derruba a economia de **todas** as nações, inclusive a de
quem lançou e a dos países fora da partida (`NationalSimulation.nuclearShock`):

- crescimento: −6 p.p. por nível de choque;
- inflação-alvo: +4 p.p.;
- aprovação: −4;
- renda no teatro (coleta e logística) de todos os jogadores: −30%.

O nível decai em cerca de 90 dias, e lançamentos seguidos se somam (até 2×). Quem lança perde muita reputação com
todos os países (−25) e o atingido guarda uma memória pesada (−60). Todos os jogadores recebem o aviso no painel
de eventos. Os lançamentos ficam no estado salvo.

## Testes

- `shared/test/countryBonus.test.ts`: todo país com bônus, custos, aeronaves, floresta, coleta e produção.
- `shared/test/air.test.ts`: ogiva nuclear (pesquisa, produção, preparo e detonação) e o choque global
  (todos atingidos, decaimento e salvamento).
