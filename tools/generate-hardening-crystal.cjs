const fs = require('node:fs/promises');
const path = require('node:path');
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is unavailable to this process.');
const output = path.resolve(__dirname, '..', '효과음', 'ElevenLabs_Drafts', 'hardening-crystal-gather-2s.mp3');
const prompt = 'Two-second ability sound for a mysterious post-apocalyptic fantasy game: fine translucent ice-blue crystal fragments gather rapidly around a heavy stone and lock into a clear shell. Airy crystalline particles converge into a firm, weighty stone-like impact, then a short deep icy-glass resonance with subtle reverb. Strong clear midrange, elegant, no harsh glass smash, speech, music, machinery or silence.';
async function main() {
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ text: prompt, model_id: 'eleven_text_to_sound_v2', duration_seconds: 2, prompt_influence: .62 }),
    signal: AbortSignal.timeout(120000)
  });
  if (!response.ok) throw new Error(`ElevenLabs HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 1000) throw new Error('ElevenLabs returned an invalid audio file.');
  await fs.writeFile(output, audio, { flag: 'wx' });
  console.log(`Created ${path.basename(output)} (${audio.length} bytes)`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
