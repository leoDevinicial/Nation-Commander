# Fontes de dados

## Indicadores dos países

Arquivo: `shared/data/reference/worldbank.json`, gerado por `scripts/import-reference-data.ts`
(`npm run data:import`, ou o workflow manual **Importar dados de referência** no GitHub Actions).

- **Fonte:** Banco Mundial — World Development Indicators, API v2 (`api.worldbank.org`).
- **Licença:** CC BY 4.0 — atribuição: The World Bank.
- **Regra:** para cada país e indicador, guarda o valor **mais recente não nulo** entre 2010 e 2026,
  com o ano, a unidade e o código da série. Nada é estimado ou interpolado na importação.
- **Ausências:** quando a série não tem valor, o campo fica `null` e a interface mostra
  "sem dado confiável". A simulação usa então um valor de jogo declarado em
  `shared/strategic/params.ts` (`FALLBACKS`) e lista o campo como estimado.

| Chave | Série | Fonte primária | Observação |
| --- | --- | --- | --- |
| population | SP.POP.TOTL | ONU WPP / censos via BM | |
| gdpUsd | NY.GDP.MKTP.CD | BM | US$ correntes |
| gdpPerCapitaUsd | NY.GDP.PCAP.CD | BM | US$ correntes |
| gdpGrowthPct | NY.GDP.MKTP.KD.ZG | BM | real, % a.a. |
| inflationPct | FP.CPI.TOTL.ZG | FMI IFS via BM | preços ao consumidor |
| unemploymentPct | SL.UEM.TOTL.ZS | OIT (estimativa modelada) | pode diferir da taxa nacional oficial |
| govDebtPctGdp | GC.DOD.TOTL.GD.ZS | FMI GFS via BM | **governo central**; sem dado para ARG, DEU, FRA, JPN |
| govRevenuePctGdp | GC.REV.XGRT.GD.ZS | FMI GFS via BM | **governo central**; sem dado para JPN |
| govExpensePctGdp | GC.XPN.TOTL.GD.ZS | FMI GFS via BM | **governo central** |
| militaryPctGdp / militaryUsd | MS.MIL.XPND.GD.ZS / .CD | SIPRI | |
| armedForces | MS.MIL.TOTL.P1 | IISS Military Balance | último ano disponível: 2020 |
| educationPctGdp | SE.XPD.TOTL.GD.ZS | UNESCO UIS | governo geral |
| healthPctGdp | SH.XPD.GHED.GD.ZS | OMS GHED | governo geral |
| researchPctGdp | GB.XPD.RSDV.GD.ZS | UNESCO UIS | P&D total (público + privado) |
| lifeExpectancy, electricityAccessPct, tradePctGdp, landAreaKm2 | SP.DYN.LE00.IN, EG.ELC.ACCS.ZS, NE.TRD.GNFS.ZS, AG.LND.TOTL.K2 | BM | exibição |

### Limitações conhecidas

- **Defasagem:** "mais recente" varia por país e série (ex.: inflação da Argentina é de 2024,
  quando passou de 200%; o valor de 2025, bem menor, ainda não estava no WDI na importação).
  O ano aparece ao lado de cada número.
- **Governo central vs. geral:** dívida/receita/despesa do WDI cobrem só o governo central, enquanto
  saúde e educação cobrem todos os níveis. O modelo ajusta a receita inicial para preservar o
  déficit observado (`taxAdjustmentPct`, explicado no painel de orçamento).
- **Dívida pública:** para ARG, DEU, FRA e JPN não há série no WDI; a simulação usa 60% do PIB
  (estimativa de jogo, sinalizada). Uma próxima importação do FMI (WEO, dívida bruta do governo
  geral) deve substituir esses campos.

## Lideranças

`shared/data/reference/leaders.ts`: chefes de Estado e de governo em 01/01/2026, registro editorial
verificado manualmente em fontes oficiais. Contém apenas cargo e nome — nenhuma característica
política ou pessoal é atribuída aos líderes.

## Parâmetros do modelo

Coeficientes de economia, opinião pública, pesquisa e logística estão em
`shared/strategic/params.ts` e `shared/strategic/technologies.ts`. São **hipóteses de jogo**
(`game_parameter`), legíveis e testadas, não estimativas econométricas, e não são exibidos como
dados do mundo real.

## Fontes previstas

| Fonte | Uso previsto |
| --- | --- |
| FMI — World Economic Outlook | dívida bruta e saldo do governo geral, projeções 2026 |
| UN Comtrade | comércio bilateral (Fase 3, diplomacia) |
| V-Dem | indicadores institucionais (estabilidade) |
