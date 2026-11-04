#!/usr/bin/env python3
"""
Prepara os efeitos sonoros do jogo (04/11): lê os originais em `assets/sfx/originais/` (ver `assets/sfx/CATALOGO.md`),
recorta (início, fim e fade), converte para mono 44,1 kHz, iguala o volume médio do grupo e grava MP3 leve em
`public/sfx/`. Precisa do ffmpeg. Rodar da raiz: `python3 scripts/sfx-preparar.py`.
"""
import os
import re
import subprocess

SRC = 'assets/sfx/originais'
OUT = 'public/sfx'

# (saída, original, início s, fim s, fade final s, média alvo dB)
CLIPS = [
    ('tanque-tiro-1', 'tanque-tiro/tanque-tiro-1', 0.0, 3.0, 1.2, -19),
    ('tanque-tiro-2', 'tanque-tiro/tanque-tiro-2', 0.0, 3.0, 1.0, -19),
    ('tanque-tiro-3', 'tanque-tiro/tanque-tiro-2', 3.2, 6.2, 1.0, -19),
    ('tanque-tiro-4', 'tanque-tiro/tanque-tiro-3', 0.0, 3.0, 1.0, -19),
    ('tanque-tiro-5', 'tanque-tiro/tanque-tiro-4', 0.0, 3.0, 1.0, -19),
    ('explosao-grande-1', 'explosao-grande/explosao-grande-2', 0.0, 6.0, 2.0, -17),
    ('explosao-grande-2', 'explosao-grande/explosao-grande-3', 0.0, 6.0, 2.0, -17),
    ('explosao-grande-3', 'explosao-grande/explosao-grande-4', 0.0, 6.0, 2.0, -17),
    ('missil-lancamento-1', 'missil-lancamento/missil-lancamento-1', 0.0, 4.0, 1.5, -18),
    ('missil-lancamento-2', 'missil-lancamento/missil-lancamento-2', 0.0, 4.5, 1.5, -18),
    ('missil-lancamento-3', 'missil-lancamento/missil-lancamento-3', 0.0, 4.0, 1.5, -18),
    ('missil-lancamento-4', 'missil-lancamento/missil-lancamento-4', 0.0, 4.0, 1.5, -18),
    ('missil-impacto-1', 'missil-impacto/missil-impacto-1', 0.0, 5.0, 1.5, -18),
    ('missil-impacto-2', 'missil-impacto/missil-impacto-2', 0.9, 5.9, 1.5, -18),
    ('missil-impacto-3', 'missil-impacto/missil-impacto-3', 0.0, 4.8, 1.5, -18),
    ('missil-impacto-4', 'missil-impacto/missil-impacto-4', 0.6, 6.4, 1.5, -18),
    ('metralhadora-tiro-1', 'metralhadora-tiro/metralhadora-tiro-1', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-2', 'metralhadora-tiro/metralhadora-tiro-2', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-3', 'metralhadora-tiro/metralhadora-tiro-3', 0.0, 0.9, 0.35, -20),
    ('metralhadora-tiro-4', 'metralhadora-tiro/metralhadora-tiro-4', 0.0, 0.9, 0.35, -20),
    ('metralhadora-rajada-1', 'metralhadora-rajada/metralhadora-rajada-1', 0.0, 1.5, 0.6, -20),
    ('metralhadora-rajada-2', 'metralhadora-rajada/metralhadora-rajada-2', 0.0, 2.1, 0.6, -20),
    ('metralhadora-rajada-3', 'metralhadora-rajada/metralhadora-rajada-3', 0.0, 1.4, 0.6, -20),
    ('metralhadora-rajada-4', 'metralhadora-rajada/metralhadora-rajada-4', 0.0, 2.5, 0.6, -20),
    ('artilharia-distante-1', 'artilharia-distante/artilharia-distante-1', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-2', 'artilharia-distante/artilharia-distante-2', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-3', 'artilharia-distante/artilharia-distante-3', 0.0, 7.0, 2.0, -24),
    ('artilharia-distante-4', 'artilharia-distante/artilharia-distante-4', 0.0, 7.0, 2.0, -24),
    ('energia-desligando', 'energia-desligando/energia-desligando-1', 0.0, 3.2, 1.0, -22),
]


def mean_db(path: str, start: float, end: float) -> float:
    r = subprocess.run(
        ['ffmpeg', '-hide_banner', '-ss', str(start), '-to', str(end), '-i', path, '-ac', '1', '-af', 'volumedetect', '-f', 'null', '-'],
        capture_output=True,
        text=True,
    )
    m = re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr)
    return float(m.group(1)) if m else -20.0


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, src, start, end, fade, target in CLIPS:
        path = os.path.normpath(os.path.join(SRC, src + '.mp3'))
        gain = target - mean_db(path, start, end)
        dur = end - start
        af = f'volume={gain:.2f}dB,alimiter=limit=0.89:level=false,afade=t=in:d=0.004,afade=t=out:st={dur - fade:.3f}:d={fade}'
        dst = os.path.join(OUT, name + '.mp3')
        subprocess.run(
            ['ffmpeg', '-y', '-v', 'error', '-ss', str(start), '-to', str(end), '-i', path, '-ac', '1', '-ar', '44100', '-af', af, '-c:a', 'libmp3lame', '-b:a', '80k', dst],
            check=True,
        )
        print(f'{dst}: {dur:.1f} s, ganho {gain:+.1f} dB, {os.path.getsize(dst) // 1024} KB')


if __name__ == '__main__':
    main()
