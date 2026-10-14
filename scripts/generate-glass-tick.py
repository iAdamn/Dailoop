"""Original soft glass tick, in the same sound family as glass-tap.wav.
Deterministic synthesis, no samples/network. 0.16 s, mono PCM16/24 kHz.
"""
import math
from pathlib import Path
import struct
import wave

rate, duration = 24000, 0.16
samples = []
for i in range(round(rate * duration)):
    t = i / rate
    attack = 1 - math.exp(-t / .0009)
    value = sum(gain * math.exp(-t / decay) * math.sin(2 * math.pi * 1567.98 * ratio * t)
                for ratio, gain, decay in [(1, 1, .023), (2.32, .14, .010), (4.25, .018, .006)])
    samples.append(value * attack * min(1, (duration - t) / .015))
peak = max(map(abs, samples))
output = Path(__file__).resolve().parent.parent / 'assets/audio/glass-tick.wav'
output.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(output), 'wb') as sound:
    sound.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    sound.writeframes(b''.join(struct.pack('<h', round(value / peak * .42 * 32767)) for value in samples))
print(f'{output.name}: {output.stat().st_size} bytes, {duration}s')
