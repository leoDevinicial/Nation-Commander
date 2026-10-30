"""Junta a capa e o corpo do guia em docs/GUIA_DO_JOGADOR.pdf (rodar depois de `node pdf.cjs`, nesta pasta)."""
from pypdf import PdfWriter

w = PdfWriter()
for f in ('out_cover.pdf', 'out_body.pdf'):
    w.append(f)
w.add_metadata({'/Title': 'Guia do Comandante', '/Author': 'Nation Commander'})
with open('../GUIA_DO_JOGADOR.pdf', 'wb') as fh:
    w.write(fh)
print('ok: docs/GUIA_DO_JOGADOR.pdf')
