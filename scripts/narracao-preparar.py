#!/usr/bin/env python3
"""Narração do tutorial (07/11): corta cada capítulo nas falas dos passos e grava public/narration/<idioma>/<id>.mp3.

Originais em assets/narration/originais/<idioma>-<capítulo>-<a|b>.mp3 (ElevenLabs eleven_v4, uma tomada por capítulo
com as falas separadas por pausa longa; vozes em docs/TUTORIAL.md). Usa a tomada "a" e, se o número de falas achadas não
bater com o roteiro, a "b". Cada fala sai mono, 64 kbps, a −18 LUFS. Os ids e a ordem vêm de shared/tutorial/script.ts.
Uso: python3 scripts/narracao-preparar.py
"""
import json, os, subprocess
import numpy as np

SRC = 'assets/narration/originais'
OUT = 'public/narration'
SR = 44100


def steps_by_chapter() -> dict[int, list[str]]:
    code = "import { TUTORIAL } from './shared/tutorial/script.ts'; console.log(JSON.stringify(Object.fromEntries(TUTORIAL.map((c) => [c.id, c.steps.map((s) => s.id)]))));"
    raw = subprocess.run(['npx', 'tsx', '-e', code], capture_output=True, text=True, check=True).stdout
    return {int(k): v for k, v in json.loads(raw).items()}


def segments(path: str, n: int) -> list[tuple[float, float]] | None:
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32)
    w = int(0.02 * SR)
    e = np.sqrt(np.add.reduceat(x[: len(x) // w * w] ** 2, np.arange(0, len(x) // w * w, w)) / w)
    # pausa mínima entre falas cada vez maior até achar exatamente n falas
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
            segs = [s for s in segs if s[1] - s[0] > 0.4]
            if len(segs) == n:
                return segs
    return None


def main() -> None:
    chapters = steps_by_chapter()
    for lang in ('pt', 'en', 'es'):
        for ch, ids in chapters.items():
            for take in ('a', 'b'):
                src = os.path.join(SRC, f'{lang}-{ch}-{take}.mp3')
                if not os.path.exists(src):
                    continue
                segs = segments(src, len(ids))
                if not segs:
                    print(f'{src}: número de falas não bate com os {len(ids)} passos')
                    continue
                os.makedirs(os.path.join(OUT, lang), exist_ok=True)
                for sid, (a, b) in zip(ids, segs):
                    a, b = max(0.0, a - 0.05), b + 0.15
                    dst = os.path.join(OUT, lang, f'{sid}.mp3')
                    af = f'atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,afade=t=out:st={b - a - 0.1}:d=0.1,loudnorm=I=-18:TP=-2:LRA=7'
                    subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', src, '-af', af, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', '64k', dst], check=True)
                print(f'{lang} capítulo {ch}: {len(ids)} falas ({take})')
                break


if __name__ == '__main__':
    main()
