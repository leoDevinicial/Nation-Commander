"""Junta capa e corpo em docs/RELATORIO_LOW_POLY.pdf (rodar depois de `node pdf.cjs`, nesta pasta)."""
from pypdf import PdfWriter

w = PdfWriter()
for f in ('out_capa.pdf', 'out_corpo.pdf'):
    w.append(f)
w.add_metadata({'/Title': 'Low poly: a identidade visual do Nation Commander', '/Author': 'Nation Commander'})
with open('../RELATORIO_LOW_POLY.pdf', 'wb') as fh:
    w.write(fh)
print('ok: docs/RELATORIO_LOW_POLY.pdf')
