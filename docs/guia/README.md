# Fontes do Guia do Comandante (PDF do jogador)

O guia existe em três idiomas (21/11/2026):

| Idioma | PDF em `docs/` | Cópia baixada pelo jogo (`public/guia/`) |
|---|---|---|
| Português | `GUIA_DO_JOGADOR.pdf` | `guia-do-comandante.pdf` |
| Inglês | `GUIA_DO_JOGADOR_EN.pdf` | `commanders-guide.pdf` |
| Espanhol | `GUIA_DO_JOGADOR_ES.pdf` | `guia-del-comandante.pdf` |

O botão **Guia completo (PDF)** da tela do Manual abre o arquivo do idioma da tela (`guideUrl` em `src/ui/manual.ts`).

| Arquivo | O que é |
|---|---|
| `guia.html` | O corpo em português (capítulos 1 a 23), com o CSS de impressão A4 |
| `en/part1..4.html`, `es/part1..4.html` | O corpo traduzido, em quatro partes (1–4, 5–10, 11–15, 16–23) |
| `guia.en.html`, `guia.es.html` | Montados: o `<head>` do `guia.html` (com `lang` e título trocados) + as quatro partes |
| `cover.html`, `cover.en.html`, `cover.es.html` | As capas |
| `img/` | Capturas do jogo (as que mostram texto da interface têm versão em `img/en/` e `img/es/`) |
| `pdf.cjs` | `node pdf.cjs [pt|en|es]`: gera `out_cover*.pdf` e `out_body*.pdf` com o Chromium do Playwright |
| `montar.py` | `python3 montar.py [pt|en|es]`: junta capa e corpo no PDF final (usa `pypdf`) |

## Regerar

```bash
cd docs/guia
# depois de mexer em en/ ou es/, remonte guia.<l>.html (mesma receita para es):
python3 -c "s=open('guia.html').read();h=s[:s.find('<body>')+6].replace('lang=\"pt-BR\"','lang=\"en\"').replace('<title>Guia do Comandante</title>','<title>Commander\'s Guide</title>');open('guia.en.html','w').write(h+'\n'+''.join(open(f'en/part{i}.html').read() for i in range(1,5)))"
node pdf.cjs pt && python3 montar.py pt
node pdf.cjs en && python3 montar.py en
node pdf.cjs es && python3 montar.py es
cp ../GUIA_DO_JOGADOR.pdf ../../public/guia/guia-do-comandante.pdf
cp ../GUIA_DO_JOGADOR_EN.pdf ../../public/guia/commanders-guide.pdf
cp ../GUIA_DO_JOGADOR_ES.pdf ../../public/guia/guia-del-comandante.pdf
```

Os arquivos `out_*.pdf` são temporários e ficam fora do git (`.gitignore` desta pasta).

## Atualizar

- Mudou uma regra, um custo ou um botão? Edite o trecho em `guia.html` **e nas partes `en/` e `es/`**, e regenere os
  três. O texto segue as regras do `CLAUDE.md`: frases simples, sem nomes de outros jogos. Nos idiomas, use os
  nomes que a tela mostra (`src/i18n/en.ts` e `es.ts`).
- Capturas novas: tire com o Playwright no jogo rodando (`ALLOW_GUESTS=true npx tsx server/index.ts` e
  `VITE_ALLOW_GUESTS=true npx vite`). No Sandbox, `window.__runtime` aceita os mesmos comandos do jogador
  (`rt.send({...})`). Para as versões em inglês e espanhol, grave `nc.lang.v1 = {"chosen":"en"}` (ou `es`) no
  localStorage antes de abrir a página. Salve como `.jpg` com no máximo 1.400 px de largura.
- Depois de regenerar, confira as páginas: `pdftoppm -r 40 -png ../GUIA_DO_JOGADOR.pdf /tmp/pg` e veja se nenhuma
  página ficou quase vazia ou cortada (o espanhol é o mais longo).
