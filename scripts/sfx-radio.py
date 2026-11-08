#!/usr/bin/env python3
"""Resposta das tropas pelo rádio (lote 37): recorta as seis falas de cada idioma e aplica o filtro de rádio.

Originais em assets/sfx/originais/radio/radio-<idioma>-a.mp3 (ElevenLabs, voz "Jerry B.", seis falas separadas por
pausa: três de "movendo" e três de "atacando"). Saída: public/sfx/radio-<idioma>-<movendo|atacando>-<n>.mp3, mono.
Cada fala ganha o clique do botão de falar no começo e o chiado de soltar no fim, banda de rádio (350–3000 Hz),
compressão e saturação leve, a −20 dB RMS. Uso: python3 scripts/sfx-radio.py
"""
import os, subprocess

SRC = 'assets/sfx/originais/radio'
OUT = 'public/sfx'
# início e fim de cada fala na tomada "a" (detecção de silêncio a −38 dB, pausa mínima de 0,35 s)
SEGS = {
    'pt': [(0.14, 1.54), (2.76, 4.1), (5.26, 6.78), (8.02, 9.7), (10.78, 12.4), (13.42, 14.62)],
    'en': [(0.04, 1.36), (2.66, 3.9), (5.06, 6.52), (7.7, 9.36), (10.36, 11.8), (12.7, 13.74)],
    'es': [(0.18, 1.6), (2.76, 4.26), (5.38, 7.06), (8.22, 10.12), (11.2, 12.86), (13.94, 15.12)],
}


def render(src: str, a: float, b: float, dst: str) -> float:
    """Recorta a fala [a, b] de `src`, aplica o rádio e grava `dst`; devolve a duração final (s)."""
    a, b = max(0.0, a - 0.04), b + 0.08
    dur = b - a
    graph = (
        f'[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,aresample=44100,aformat=channel_layouts=mono,'
        'highpass=f=350:poles=2,highpass=f=350,lowpass=f=3000:poles=2,lowpass=f=3000,'
        'acompressor=threshold=0.08:ratio=6:attack=3:release=80:makeup=3,asoftclip=type=tanh:param=1.6,'
        f'afade=t=in:d=0.01,afade=t=out:st={dur - 0.05}:d=0.05,adelay=70[v];'
        # clique ao apertar (70 ms) e chiado ao soltar (150 ms), ruído na mesma banda
        'anoisesrc=d=0.07:c=white:a=0.5:r=44100,bandpass=f=1800:w=2200,afade=t=out:d=0.07[k];'
        f'anoisesrc=d=0.15:c=white:a=0.35:r=44100,bandpass=f=2200:w=2400,afade=t=in:d=0.02,afade=t=out:st=0.05:d=0.1,adelay={int((dur + 0.07) * 1000)}[s];'
        # chiado de fundo bem baixo enquanto fala
        f'anoisesrc=d={dur + 0.07}:c=pink:a=0.02:r=44100,bandpass=f=1800:w=2400[h];'
        '[k][v][h][s]amix=inputs=4:normalize=0:duration=longest,loudnorm=I=-20:TP=-2:LRA=7'
    )
    subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-i', src, '-filter_complex', graph, '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '80k', dst],
        check=True,
    )
    return dur + 0.22


def main() -> None:
    for lang, segs in SEGS.items():
        for i, (a, b) in enumerate(segs):
            kind = 'movendo' if i < 3 else 'atacando'
            dst = os.path.join(OUT, f'radio-{lang}-{kind}-{i % 3 + 1}.mp3')
            print(dst, f'{render(os.path.join(SRC, f"radio-{lang}-a.mp3"), a, b, dst):.2f} s')


if __name__ == '__main__':
    main()
