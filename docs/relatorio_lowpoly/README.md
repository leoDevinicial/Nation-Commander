# Fontes do relatório "Low poly: a nossa identidade"

O PDF final é `docs/RELATORIO_LOW_POLY.pdf`: o documento que fundamenta a diretriz visual do projeto (resumida no
`CLAUDE.md`).

- `capa.html` — capa; `_head.html` — estilo (o mesmo do guia do jogador); `_corpo.html` — o texto; `img/` — capturas.
- Regerar: `node pdf.cjs && python3 montar.py` nesta pasta (Playwright + `pypdf`).
- Os números de triângulos vêm da geometria dos modelos (`unitModel` / `buildingModel`) e o tamanho do jogo de
  `npx vite build`. Se os modelos mudarem muito, refaça a contagem e atualize a tabela do capítulo 3.
