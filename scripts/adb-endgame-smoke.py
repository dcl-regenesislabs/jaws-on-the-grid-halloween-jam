"""Temporary-telemetry ADB driver. Real touch input; never writes game state.

Requires the diagnostic [endgame-smoke] JSON line during a local test pass.
The diagnostic is deliberately absent from production source after testing.
Coordinates are calibrated for this project's Motorola 2712x1220 landscape.
"""
import argparse
import itertools
import json
import re
import subprocess
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('log')
parser.add_argument('--rounds', type=int, default=30)
parser.add_argument('--mode', choices=['gear', 'mine', 'suicide'], default='gear')
args = parser.parse_args()
out = Path('design/playtests/endgame')
out.mkdir(parents=True, exist_ok=True)
dirs = [(0, 1), (0, -1), (-1, 0), (1, 0)]
taps = [(495, 707), (495, 1038), (330, 870), (662, 870)]
seen = set()
last = None
planted = False
recording = None

def adb(*cmd):
    return subprocess.run(['adb', *map(str, cmd)], capture_output=True, timeout=8)

def tap(x, y):
    adb('shell', 'input', 'tap', x, y)

def screenshot(name):
    adb('shell', 'screencap', '-p', '/sdcard/endgame-smoke.png')
    adb('pull', '/sdcard/endgame-smoke.png', str(out / (name + '.png')))

# Board geometry from the shared config, so a CELL/GRID change can't drift.
_config = (Path(__file__).resolve().parents[1] / 'src' / 'shared' / 'config.ts').read_text(encoding='utf-8')
def _const(name):
    return int(re.search(r'export const ' + name + r' = (\d+)\b', _config).group(1))
GRID = _const('GRID')
HARBOR_SIZE = _const('HARBOR_SIZE')
HARBOR_MIN = GRID // 2 - HARBOR_SIZE // 2  # config: CENTER_CELL - HARBOR_SIZE / 2
HARBOR_MAX = HARBOR_MIN + HARBOR_SIZE - 1

def harbor(i, j):
    return HARBOR_MIN <= i <= HARBOR_MAX and HARBOR_MIN <= j <= HARBOR_MAX

log_path = Path(args.log)
with log_path.open('r', encoding='utf-8', errors='replace') as log, (out / ('adb-' + args.mode + '.jsonl')).open('a', encoding='utf-8') as evidence:
    log.seek(0, 2)  # Only act on newly observed turns, never a stale snapshot.
    deadline = time.monotonic() + args.rounds * 4 + 25
    count = 0
    while count < args.rounds and time.monotonic() < deadline:
        line = log.readline()
        if not line:
            time.sleep(0.025)
            continue
        if '[endgame-smoke]' not in line:
            continue
        try:
            encoded = line[line.index('"{'):].strip()
            data = json.loads(json.loads(encoded))
        except (ValueError, json.JSONDecodeError):
            continue
        if not data['players']:
            continue
        p = data['players'][0]
        evidence.write(json.dumps(data) + '\n'); evidence.flush()
        count += 1
        # Server telemetry precedes the CRDT phase update on the phone.
        time.sleep(0.55)
        if p['dead']:
            screenshot('adb-' + args.mode + '-death')
            if planted:
                print('Mine pass ended with death; inspect recording/log cause.', flush=True)
                break
            tap(1355, 725)
            print('Respawn', flush=True)
            continue
        if p['boost'] > data['turn'] and 'boost' not in seen:
            seen.add('boost'); screenshot('adb-boost-active')
        if p['lives'] > 0 and 'life' not in seen:
            seen.add('life'); screenshot('adb-jacket-collected')
        if p['mines'] > 0:
            seen.add('mine')
        if args.mode != 'gear' and p['mines'] > 0 and not harbor(p['i'], p['j']) and not planted:
            recording = subprocess.Popen(['adb', 'shell', 'screenrecord', '--time-limit', '16', '/sdcard/endgame-mine.mp4'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            tap(2145, 940)
            planted = True
            screenshot('adb-mine-planted')
            if args.mode == 'suicide':
                continue
        if args.mode == 'suicide' and planted:
            continue
        if planted and any(m['exploded'] for m in data['mines']):
            screenshot('adb-mine-survived')
            print('Survived mine detonation', flush=True)
            break
        danger = set()
        for s in data['sharks']:
            if s['len'] > 0:
                danger.update((s['cellI'] + s['dirX'] * n, s['cellJ'] + s['dirZ'] * n) for n in range(s['len'] + 1))
        for m in data['mines']:
            if m['exploded'] or m['detonateTurn'] > data['turn'] + 1:
                continue
            danger.update((m['cellI'] + dx, m['cellJ'] + dz) for dx, dz in [(0, 0), *dirs] if not harbor(m['cellI'] + dx, m['cellJ'] + dz))
        desired = 'mine' if args.mode != 'gear' else next((k for k in ['boost', 'life', 'mine'] if k not in seen), 'coin')
        targets = [x for x in data['pickups'] if x['kind'] == desired]
        if not targets:
            targets = data['pickups']
        best = None
        for n in range(p['steps'] + 1):
            for path in itertools.product(range(4), repeat=n):
                if any(path[k] == [1, 0, 3, 2][path[k-1]] for k in range(1, n)):
                    continue  # UI treats opposite taps as undo.
                i, j = p['i'], p['j']
                visits = []
                for code in path:
                    dx, dz = dirs[code]; i += dx; j += dz; visits.append((i, j))
                if any(not (0 <= x < GRID and 0 <= z < GRID) for x, z in visits) or (i, j) in danger:
                    continue
                distance = min((abs(i-x['cellI']) + abs(j-x['cellJ']) for x in targets), default=0)
                collected = sum((x['cellI'], x['cellJ']) in visits for x in targets)
                # Survival while observing the explosion: move two tiles clear.
                if planted:
                    distance = -min((abs(i-m['cellI']) + abs(j-m['cellJ']) for m in data['mines']), default=0)
                value = (distance - collected * 20, n)
                if best is None or value < best[0]:
                    best = value, path
        path = best[1] if best else ()
        for code in path:
            tap(*taps[code]); time.sleep(0.06)
        print('turn', data['turn'], 'cell', p['i'], p['j'], 'gear', p['mines'], p['lives'], 'boost', max(0,p['boost']-data['turn']), 'tap', path, flush=True)
        last = data
    screenshot('adb-' + args.mode + '-final')
if recording:
    recording.wait(timeout=20)
    adb('pull', '/sdcard/endgame-mine.mp4', str(out / ('adb-' + args.mode + '.mp4')))
print('Observed gear:', sorted(seen), flush=True)
