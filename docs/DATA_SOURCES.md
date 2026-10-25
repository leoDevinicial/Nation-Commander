# Fontes de dados

Estado atual: **nenhum dado factual integrado.**

Os países listados em `shared/data/countries.ts` contêm apenas código ISO 3166-1 alfa-3 e nome, e
estão marcados com `isPlaceholder: true`. Eles definem a identidade visual da facção e não alteram
nenhum parâmetro da partida.

Todos os números da operação tática (custos, vida, dano, alcance, renda) são **parâmetros de jogo**
definidos em `shared/sim/config.ts`, não medições do mundo real.

## Fontes previstas (Fase 2+)

Antes de redistribuir qualquer dado, registrar aqui: indicador, fonte, URL, licença, período,
unidade, metodologia, cobertura e data de importação.

| Fonte | Uso previsto | Licença a verificar |
| --- | --- | --- |
| Banco Mundial — World Development Indicators | população, PIB, inflação, desemprego | CC BY 4.0 |
| FMI — World Economic Outlook | PIB, dívida, saldo fiscal | termos do FMI |
| ONU — World Population Prospects | população e projeções | termos da ONU |
| SIPRI — Military Expenditure Database | gasto militar | termos do SIPRI (uso não comercial?) |
| UN Comtrade | comércio bilateral | termos da ONU |
| V-Dem | indicadores institucionais | CC BY-SA 4.0 |
