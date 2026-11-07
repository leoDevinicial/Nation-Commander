#!/usr/bin/env python3
"""Mixagem do trailer em numpy (sem o amix do ffmpeg): lê o edl.json e grava um WAV 48 kHz estéreo com a duração exata.

Música com ducking sob a narração, narração, efeitos e sons do jogo de cada clipe; limitador suave no fim.
Uso: mixdown.py edl.json saida.wav
"""
import json, os, subprocess, sys
import numpy as np

W = '/home/user/trailer_work'
SR = 48000
FPS = 24
edl = json.load(open(sys.argv[1]))
out = sys.argv[2]
total = sum(round(c['dur'] * FPS) for c in edl['clips']) / FPS
N = int(round(total * SR))
cache = {}


def load(path):
    if path not in cache:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        cache[path] = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).copy()
    return cache[path]


def place(bus, path, at, frm=0.0, dur=None, gain=0.0, fin=0.0, fout=0.0):
    a = load(path)
    s0 = int(frm * SR)
    seg = a[s0:] if dur is None else a[s0:s0 + int(dur * SR)]
    seg = seg * (10 ** (gain / 20))
    n = len(seg)
    if n == 0:
        return
    env = np.ones(n, dtype=np.float32)
    if fin:
        k = min(n, int(fin * SR)); env[:k] *= np.linspace(0, 1, k)
    if fout:
        k = min(n, int(fout * SR)); env[n - k:] *= np.linspace(1, 0, k)
    seg = seg * env[:, None]
    p = int(at * SR)
    if p >= N:
        return
    m = min(n, N - p)
    bus[p:p + m] += seg[:m]


mus = np.zeros((N, 2), np.float32)
vox = np.zeros((N, 2), np.float32)
fx = np.zeros((N, 2), np.float32)
for m in edl.get('music', []):
    place(mus, f"{W}/{m['file']}", m['at'], m.get('from', 0), m.get('dur'), m.get('gain', 0), m.get('fin', 0), m.get('fout', 0))
for v in edl.get('voice', []):
    place(vox, f"{W}/{v['file']}", v['at'], v.get('from', 0), v.get('dur'), v.get('gain', 0), v.get('fin', 0.02), v.get('fout', 0.08))
for x in edl.get('sfx', []):
    f = x['file'] if x['file'].startswith('/') else f"{W}/{x['file']}"
    place(fx, f, x['at'], x.get('from', 0), x.get('dur'), x.get('gain', 0), x.get('fin', 0), x.get('fout', 0))
t = 0.0
for c in edl['clips']:
    d = round(c['dur'] * FPS) / FPS
    g = c.get('game_wav') or f"{W}/frames/{c['scene']}/game.wav"
    if c.get('game', True) and os.path.exists(g):
        place(fx, g, t, c['from'], d, c.get('game_gain', -3), 0.04, 0.1)
    t += d

# ducking: envelope da narração (janela de 50 ms), música cai até -7 dB quando há voz
lvl = np.abs(vox).max(axis=1)
win = int(0.05 * SR)
env = np.convolve(lvl, np.ones(win) / win, mode='same')
active = (env > 0.01).astype(np.float32)
# ataque 40 ms, soltura 450 ms
sm = np.empty_like(active)
a_att, a_rel = 1 - np.exp(-1 / (0.04 * SR)), 1 - np.exp(-1 / (0.45 * SR))
cur = 0.0
for i in range(0, N, 64):
    tgt = active[i]
    a = a_att if tgt > cur else a_rel
    cur += (tgt - cur) * (1 - (1 - a) ** 64)
    sm[i:i + 64] = cur
duck = 1 - sm * (1 - 10 ** (-7 / 20))
mix = mus * duck[:, None] + vox + fx

# normaliza para pico -1 dBFS com limitador suave (tanh acima de 0,7)
peak = np.abs(mix).max() or 1
mix = mix / peak * 1.15
th = 0.7
over = np.abs(mix) > th
mix[over] = np.sign(mix[over]) * (th + (1 - th) * np.tanh((np.abs(mix[over]) - th) / (1 - th)))
mix *= 10 ** (-1 / 20)
# fade final
k = int(1.5 * SR)
mix[N - k:] *= np.linspace(1, 0, k)[:, None]
pcm = (np.clip(mix, -1, 1) * 32767).astype('<i2')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', out], input=pcm.tobytes(), check=True)
print('mix', round(total, 3), 's', 'pico original', round(float(peak), 3))
