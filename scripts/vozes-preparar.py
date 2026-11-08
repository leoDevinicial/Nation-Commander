#!/usr/bin/env python3
"""Vozes de 08/11 (ElevenLabs): avisos do assessor e respostas novas do rádio, em pt/en/es.

- Avisos: assets/narration/originais/aviso-<idioma>-<a|b>.mp3 (vozes do narrador do tutorial, 11 falas separadas por
  pausa longa, na ordem de AVISOS). Saída public/narration/<idioma>/aviso-<id>.mp3, mono 64 kbps a −18 LUFS.
- Rádio: assets/sfx/originais/radio/radio2-<idioma>-<a|b>.mp3 (voz "Jerry B.", 7 falas na ordem de RADIO). Saída
  public/sfx/radio-<idioma>-<tipo>-<n>.mp3 com o mesmo filtro de rádio do lote 37 (`sfx-radio.py`).
Usa a tomada "a"; se o número de falas achadas não bater, a "b". Uso: python3 scripts/vozes-preparar.py
"""
import importlib.util, os, subprocess, sys
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
spec = importlib.util.spec_from_file_location('sfx_radio', os.path.join(os.path.dirname(__file__), 'sfx-radio.py'))
sfx_radio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sfx_radio)

SR = 44100
LANGS = ('pt', 'en', 'es')
# mesma ordem das falas gravadas (AnnounceId no AudioService)
AVISOS = ['research', 'attack', 'era', 'contact', 'war_us', 'nuclear_ours', 'nuclear_other', 'project', 'satellite', 'pact_offer', 'cash']
RADIO = [('selecao', 1), ('selecao', 2), ('selecao', 3), ('pronta', 1), ('pronta', 2), ('obra', 1), ('obra', 2)]


def segments(path: str, n: int) -> list[tuple[float, float]] | None:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    w = int(0.02 * SR)
    e = np.sqrt(np.add.reduceat(x[: len(x) // w * w] ** 2, np.arange(0, len(x) // w * w, w)) / w)
    for gap in (0.45, 0.6, 0.8, 1.0, 0.35):
        for db in (-40, -36, -44):
            on = e > 10 ** (db / 20)
            segs, start, quiet, end = [], None, 0, 0
            for i, v in enumerate(on):
                if v:
                    if start is None:
                        start = i
                    quiet, end = 0, i
                elif start is not None:
                    quiet += 1
                    if quiet * 0.02 > gap:
                        segs.append((start * 0.02, (end + 1) * 0.02))
                        start = None
            if start is not None:
                segs.append((start * 0.02, (end + 1) * 0.02))
            # "Pronto." e "Listos." são curtos: vale a partir de 0,25 s
            segs = [s for s in segs if s[1] - s[0] > 0.25]
            if len(segs) == n:
                return segs
    return None


def pick(base: str, n: int) -> tuple[str, list[tuple[float, float]]]:
    for take in ('a', 'b'):
        path = f'{base}-{take}.mp3'
        segs = segments(path, n)
        if segs:
            return path, segs
    raise SystemExit(f'{base}: nenhuma tomada com {n} falas')


def main() -> None:
    for lang in LANGS:
        src, segs = pick(f'assets/narration/originais/aviso-{lang}', len(AVISOS))
        os.makedirs(f'public/narration/{lang}', exist_ok=True)
        for ident, (a, b) in zip(AVISOS, segs):
            a, b = max(0.0, a - 0.05), b + 0.12
            dst = f'public/narration/{lang}/aviso-{ident}.mp3'
            subprocess.run(
                ['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', f'atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.08}:d=0.08,loudnorm=I=-18:TP=-1.5:LRA=7', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', dst],
                check=True,
            )
        print(f'avisos {lang}: {len(segs)} falas ({os.path.basename(src)})')
        src, segs = pick(f'assets/sfx/originais/radio/radio2-{lang}', len(RADIO))
        for (kind, i), (a, b) in zip(RADIO, segs):
            dst = f'public/sfx/radio-{lang}-{kind}-{i}.mp3'
            print(dst, f'{sfx_radio.render(src, a, b, dst):.2f} s')


if __name__ == '__main__':
    main()
