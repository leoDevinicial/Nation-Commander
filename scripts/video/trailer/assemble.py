#!/usr/bin/env python3
"""Montagem do trailer: lê edl.json, junta os quadros, sobrepõe cartelas, mixa música, narração e sons do jogo.

edl.json:
  clips:    [{"scene": "r1", "from": 0.0, "dur": 4.0, "fx": "flash"?}, ...]   (em ordem; tempos de vídeo da cena)
  overlays: [{"png": "cards/tag_build.png", "at": 11.2, "dur": 2.6, "fade": 0.35}, ...]
  flashes:  [{"at": 15.75, "dur": 0.25}, ...]                                   (clarão branco)
  music:    [{"file": "audio/build_a.mp3", "at": 0, "from": 0, "dur": 30, "gain": -2, "fin": 0.5, "fout": 1}, ...]
  voice:    [{"file": "audio/narr_a.mp3", "at": 1.0, "from": 0.05, "dur": 3.4, "gain": 2}, ...]
  sfx:      [{"file": "...", "at": ..., "gain": ...}, ...]
  game:     true  -> sons do jogo de cada clipe (OUT/<cena>/game.wav, gerado pelo mix.cjs) entram junto
  fade_in / fade_out: segundos
"""
import json, os, subprocess, sys

W = '/home/user/trailer_work'
FPS = 24
edl = json.load(open(sys.argv[1] if len(sys.argv) > 1 else f'{W}/edl.json'))
out = sys.argv[2] if len(sys.argv) > 2 else f'{W}/trailer.mp4'
frames_dir = f'{W}/frames'
seq = f'{W}/edit'
os.makedirs(seq, exist_ok=True)
for f in os.listdir(seq):
    os.remove(os.path.join(seq, f))

# 1) sequência de quadros (links), clipe a clipe
n = 0
t = 0.0
clip_times = []
for c in edl['clips']:
    d = c.get('dir') or f"{frames_dir}/{c['scene']}"
    ext = c.get('ext', 'jpg')
    f0 = round(c['from'] * FPS)
    cnt = round(c['dur'] * FPS)
    for k in range(cnt):
        src = f'{d}/{f0 + k:05d}.{ext}'
        if not os.path.exists(src):
            # quadro que faltou (corte no fim da gravação): repete o último
            src = last
        last = src
        os.symlink(src, f'{seq}/{n:05d}.jpg')
        n += 1
    clip_times.append((t, c))
    t += cnt / FPS
total = n / FPS
print('quadros', n, 'duração', round(total, 2))

# 2) filtros de vídeo: grade de cor, clarões, cartelas, fades
inputs = ['-framerate', str(FPS), '-i', f'{seq}/%05d.jpg']
vf = []
grade = edl.get('grade', 'eq=contrast=1.06:saturation=1.05:brightness=-0.01,unsharp=5:5:0.35')
vf.append(f'[0:v]scale=1920:1080:flags=lanczos,{grade},format=rgba[v0]')
cur = 'v0'
idx = 1
for i, fl in enumerate(edl.get('flashes', [])):
    a, d = fl['at'], fl.get('dur', 0.25)
    inputs += ['-f', 'lavfi', '-t', str(d + 0.1), '-i', 'color=white:s=1920x1080:r=24,format=rgba']
    vf.append(f'[{idx}:v]fade=t=in:st=0:d={d * 0.3}:alpha=1,fade=t=out:st={d * 0.3}:d={d * 0.7}:alpha=1,setpts=PTS+{a}/TB[fl{i}]')
    vf.append(f'[{cur}][fl{i}]overlay=eof_action=pass[vf{i}]')
    cur = f'vf{i}'
    idx += 1
for i, o in enumerate(edl.get('overlays', [])):
    a, d, fd = o['at'], o['dur'], o.get('fade', 0.3)
    inputs += ['-loop', '1', '-framerate', str(FPS), '-t', str(d), '-i', f"{W}/{o['png']}"]
    vf.append(f'[{idx}:v]format=rgba,fade=t=in:st=0:d={fd}:alpha=1,fade=t=out:st={d - fd}:d={fd}:alpha=1,setpts=PTS+{a}/TB[ov{i}]')
    vf.append(f'[{cur}][ov{i}]overlay=eof_action=pass[vo{i}]')
    cur = f'vo{i}'
    idx += 1
fi, fo = edl.get('fade_in', 0.8), edl.get('fade_out', 0)
tail = f'fade=t=in:st=0:d={fi}' if fi else 'null'
if fo:
    tail += f',fade=t=out:st={total - fo}:d={fo}'
vf.append(f'[{cur}]{tail},format=yuv420p[vout]')

# 3) áudio: música (com ducking sob a narração), narração, efeitos e sons do jogo
af = []
buses = {'m': [], 'n': [], 's': []}
ai = idx
def add(path, at, frm=0.0, dur=None, gain=0.0, fin=0.0, fout=0.0, bus='s'):
    global ai
    inputs.extend(['-i', path])
    chain = f'[{ai}:a]aresample=48000,aformat=channel_layouts=stereo'
    chain += f',atrim=start={frm}' + (f':duration={dur}' if dur else '') + ',asetpts=PTS-STARTPTS'
    if fin:
        chain += f',afade=t=in:st=0:d={fin}'
    if fout and dur:
        chain += f',afade=t=out:st={max(0, dur - fout)}:d={fout}'
    chain += f',volume={gain}dB,adelay={int(at * 1000)}|{int(at * 1000)}'
    lab = f'{bus}{ai}'
    af.append(chain + f'[{lab}]')
    buses[bus].append(f'[{lab}]')
    ai += 1
for m in edl.get('music', []):
    add(f"{W}/{m['file']}", m['at'], m.get('from', 0), m.get('dur'), m.get('gain', 0), m.get('fin', 0), m.get('fout', 0), 'm')
for v in edl.get('voice', []):
    add(f"{W}/{v['file']}", v['at'], v.get('from', 0), v.get('dur'), v.get('gain', 0), v.get('fin', 0.02), v.get('fout', 0.08), 'n')
for x in edl.get('sfx', []):
    add(x['file'] if x['file'].startswith('/') else f"{W}/{x['file']}", x['at'], x.get('from', 0), x.get('dur'), x.get('gain', 0), x.get('fin', 0), x.get('fout', 0), 's')
if edl.get('game', True):
    for (at, c) in clip_times:
        g = c.get('game_wav') or f"{frames_dir}/{c['scene']}/game.wav"
        if os.path.exists(g) and c.get('game', True):
            add(g, at, c['from'], c['dur'], c.get('game_gain', -3), 0.04, 0.1, 's')
def bus(name, items):
    if len(items) == 1:
        af.append(f'{items[0]}atrim=duration={total}[{name}]')
    else:
        af.append(''.join(items) + f'amix=inputs={len(items)}:normalize=0:dropout_transition=0,atrim=duration={total}[{name}]')
bus('MUS', buses['m'])
bus('VOX', buses['n'])
bus('FX', buses['s'] or ['anullsrc=r=48000:cl=stereo'])
af.append('[VOX]asplit=2[VOXa][VOXk]')
af.append(f"[MUS][VOXk]sidechaincompress=threshold=0.03:ratio=5:attack=30:release=450:makeup=1[MUSd]")
af.append(f"[MUSd][VOXa][FX]amix=inputs=3:normalize=0:weights='{edl.get('weights', '1 1 1')}',volume=2dB,alimiter=limit=0.89,aresample=48000,asetpts=N/SR/TB,atrim=end_sample={int(total * 48000)},afade=t=out:st={total - 1.5}:d=1.5[aout]")

graph = ';'.join(vf + af)
cmd = ['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', graph, '-map', '[vout]', '-map', '[aout]',
       '-c:v', 'libx264', '-preset', edl.get('preset', 'slow'), '-crf', str(edl.get('crf', 17)), '-pix_fmt', 'yuv420p',
       '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-r', str(FPS), out]
open(f'{W}/assemble_cmd.txt', 'w').write(' '.join(cmd))
r = subprocess.run(cmd)
sys.exit(r.returncode)
