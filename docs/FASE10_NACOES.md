# Fase 10 do adendo — expansão das nações

## Lote 3 (27 países no total)

| País | Região diplomática | Por que entrou |
|---|---|---|
| Nigéria | África | Maior economia e população da África Ocidental; petróleo. Dá à África do Sul um vizinho regional |
| Indonésia | Ásia-Pacífico | Arquipélago, 4ª maior população do mundo, florestas e recursos |
| Irã | Oriente Médio | Potência regional, petróleo e gás, sanções reais em vigor |
| Polônia | Europa | Flanco leste da OTAN, forte investimento militar |
| Colômbia | Américas | Andes, Caribe e Llanos; petróleo e agricultura |
| Paquistão | Ásia-Pacífico | Potência nuclear, grande exército, rival histórico da Índia |

O critério foi diversidade geográfica, econômica, demográfica e militar, não cobertura máxima.

## De onde vem cada dado

| Dado | Arquivo | Origem |
|---|---|---|
| Indicadores (PIB, população, inflação, dívida, gasto militar etc.) | `shared/data/reference/worldbank.json`, `imf.json` | Banco Mundial (WDI) e FMI (WEO), importados pelo workflow **Importar dados de referência** com `paises=NGA,IDN,IRN,POL,COL,PAK`. Mesmo esquema e mesmas regras dos lotes anteriores (valor mais recente não nulo, com ano, unidade e série). Ver `docs/DATA_SOURCES.md` |
| Lideranças em 01/01/2026 | `shared/data/reference/leaders.ts` | Registro editorial, só cargo e nome. Eventos posteriores à data de referência não entram no cenário |
| Capital e região diplomática | `shared/data/geography.ts` | Coordenadas aproximadas da sede de governo; a região é regra de jogo |
| Setores operacionais | `shared/data/sectors.ts` | Aproximações de jogo (ponto, bioma, relevo, infraestrutura, fatia da economia), como nos lotes anteriores |
| Cidades | `shared/data/cities.ts` | 16 cidades reais por país, das maiores para as menores, em grafia portuguesa quando há uma consagrada |
| Bônus único | `shared/sim/countryBonus.ts` | Regra de jogo (identidade), não dado factual |
| Perfil comercial da IA | `shared/sim/trade.ts` | Vantagens comparativas aproximadas, regra de jogo |

Dados factuais e variáveis da partida continuam separados: os arquivos de referência nunca são alterados pela
simulação, que copia os valores para o estado da nação ao começar.

Se um indicador não tem valor na fonte, o campo fica `null`, a interface mostra "sem dado confiável" e a simulação
usa o valor de jogo declarado em `FALLBACKS`, marcado como estimado. Nenhum valor é inventado como se fosse real.

## Mudanças de regra

- **Região África:** agora tem dois países. África do Sul e Nigéria começam se conhecendo. O teste de contato inicial
  foi atualizado.
- **Workflow de importação:** ganhou o campo opcional `paises` (ISO alfa-3 separados por vírgula). Com ele, a
  importação busca só esses países e mescla no arquivo, sem mexer nos demais. A lista é validada antes de rodar.

## Como acrescentar o próximo lote

1. Incluir o país em `countries.ts`, `geography.ts`, `sectors.ts`, `cities.ts`, `leaders.ts`, `countryBonus.ts` e
   `trade.ts`.
2. Rodar o workflow **Importar dados de referência** no ramo, com `paises` preenchido.
3. Rodar os testes. `national.test.ts` confere se todo país jogável tem dados de referência com fonte e ano, e
   `countryBonus.test.ts` confere se todo país tem bônus.
