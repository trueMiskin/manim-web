import { writeFileSync } from 'node:fs';

const sampleRate = 8000;
const sampleCount = 4800;
const audio = Buffer.alloc(44 + sampleCount * 2);
audio.write('RIFF', 0);
audio.writeUInt32LE(audio.length - 8, 4);
audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16);
audio.writeUInt16LE(1, 20);
audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(sampleRate, 24);
audio.writeUInt32LE(sampleRate * 2, 28);
audio.writeUInt16LE(2, 32);
audio.writeUInt16LE(16, 34);
audio.write('data', 36);
audio.writeUInt32LE(sampleCount * 2, 40);
for (let sample = 0; sample < sampleCount; sample++) {
  const envelope = Math.min(1, sample / 400, (sampleCount - sample) / 400);
  const value = Math.round(2000 * envelope * Math.sin((2 * Math.PI * 440 * sample) / sampleRate));
  audio.writeInt16LE(value, 44 + sample * 2);
}
writeFileSync(new URL('./tone.wav', import.meta.url), audio);
