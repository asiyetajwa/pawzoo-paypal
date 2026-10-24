// Spoken answers through ElevenLabs. The key stays on the server (ELEVENLABS_API_KEY in .env);
// every line is cached on disk, so replaying a demo spends no extra credits.

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Jessica (warm, cheerful, American), the voice of the Pawzoo film. Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = 'cgSgspJ2msm6clMCkdW9';
const DEFAULT_MODEL = 'eleven_flash_v2_5';

export function voiceConfig(): { enabled: boolean; voiceId: string; modelId: string } {
  return {
    enabled: Boolean(process.env.ELEVENLABS_API_KEY?.trim()),
    voiceId: process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE,
    modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || DEFAULT_MODEL,
  };
}

export async function speak(text: string, cacheDir: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const { voiceId, modelId } = voiceConfig();
  const clean = text.replace(/\s+/g, ' ').trim().slice(0, 1200);
  const name = createHash('sha256').update(`${voiceId}|${modelId}|${clean}`).digest('hex').slice(0, 32);
  const file = join(cacheDir, `${name}.mp3`);
  try {
    return await readFile(file);
  } catch {
    // not cached yet
  }
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({ text: clean, model_id: modelId, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const audio = Buffer.from(await res.arrayBuffer());
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, audio);
  return audio;
}
