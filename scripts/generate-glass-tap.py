"""Original, deterministic modal synthesis: two gently damped glass resonators.
No samples, network or third-party audio. 0.52 s, mono PCM16/24 kHz (~25 KB).
"""
import math
from pathlib import Path
import struct
import wave

rate, duration = 24000, 0.52
samples = []
for i in range(round(rate * duration)):
    t = i / rate
    value = 0.0
    for fundamental, delay, strength in [(783.99, 0.0, 1.0), (1046.50, 0.014, 0.38)]:
        x = t - delay
        if x < 0:
            continue
        attack = 1 - math.exp(-x / 0.0015)
        for ratio, gain, decay in [(1, 1, .105), (2.32, .21, .040), (4.25, .035, .018)]:
            value += strength * gain * attack * math.exp(-x / decay) * math.sin(2 * math.pi * fundamental * ratio * x)
    samples.append(value * min(1, (duration - t) / .025))
peak = max(map(abs, samples))
output = Path(__file__).resolve().parent.parent / 'assets/audio/glass-tap.wav'
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), 'wb') as sound:
    sound.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    sound.writeframes(b''.join(struct.pack('<h', round(value / peak * .62 * 32767)) for value in samples))
print(f'{output.name}: {output.stat().st_size} bytes, {duration}s')
