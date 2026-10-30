# Fontes do Guia do Comandante (PDF do jogador)

O PDF final é `docs/GUIA_DO_JOGADOR.pdf`. Ele sai destas fontes:

| Arquivo | O que é |
|---|---|
| `guia.html` | O corpo do guia (capítulos 1 a 20), com o CSS de impressão A4 |
| `cover.html` | A capa |
| `img/` | Capturas do jogo usadas no guia |
| `pdf.cjs` | Gera `out_cover.pdf` e `out_body.pdf` com o Chromium do Playwright (rodapé com número de página) |
| `montar.py` | Junta os dois em `docs/GUIA_DO_JOGADOR.pdf` (usa `pypdf`) |

## Regerar

```bash
cd docs/guia
node pdf.cjs        # precisa do pacote playwright (já instalado no container do Claude Code)
python3 montar.py   # pip install pypdf, se faltar
```

Os arquivos `out_*.pdf` são temporários e ficam fora do git (`.gitignore` desta pasta).

## Atualizar

- Mudou uma regra, um custo ou um botão? Edite o trecho em `guia.html` e regenere. O texto segue as regras do
  `CLAUDE.md`: português simples, sem nomes de outros jogos.
- Capturas novas: tire com o Playwright no jogo rodando (`ALLOW_GUESTS=true npx tsx server/index.ts` e
  `VITE_ALLOW_GUESTS=true npx vite`). No Sandbox, `window.__runtime` aceita os mesmos comandos do jogador
  (`rt.send({...})`). Salve em `img/` como `.jpg` com no máximo 1.400 px de largura.
- Depois de regenerar, confira as páginas: `pdftoppm -r 40 -png ../GUIA_DO_JOGADOR.pdf /tmp/pg` e veja se nenhuma
  página ficou quase vazia ou cortada.
