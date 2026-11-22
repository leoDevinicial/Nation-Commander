"""Junta a capa e o corpo do guia (rodar depois de `node pdf.cjs <idioma>`, nesta pasta): python3 montar.py [pt|en|es].

pt -> docs/GUIA_DO_JOGADOR.pdf; en -> docs/GUIA_DO_JOGADOR_EN.pdf; es -> docs/GUIA_DO_JOGADOR_ES.pdf
"""
import sys
from pypdf import PdfWriter

lang = sys.argv[1] if len(sys.argv) > 1 else 'pt'
sfx = '' if lang == 'pt' else f'.{lang}'
out = '../GUIA_DO_JOGADOR.pdf' if lang == 'pt' else f'../GUIA_DO_JOGADOR_{lang.upper()}.pdf'
title = {'pt': 'Guia do Comandante', 'en': "Commander's Guide", 'es': 'Guía del Comandante'}[lang]
w = PdfWriter()
for f in (f'out_cover{sfx}.pdf', f'out_body{sfx}.pdf'):
    w.append(f)
w.add_metadata({'/Title': title, '/Author': 'Nations Commander'})
with open(out, 'wb') as fh:
    w.write(fh)
print('ok:', out[3:])
