const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const promptPath = path.join(__dirname, 'elevenlabs-sfx-prompts.json');
const draftDirectory = path.join(root, '효과음', 'ElevenLabs_Drafts');
const manifestPath = path.join(draftDirectory, 'manifest.json');
const apiKey = process.env.ELEVENLABS_API_KEY;

async function main() {
  if (!apiKey) {
    console.error('ELEVENLABS_API_KEY is unavailable to this process.');
    process.exitCode = 1;
    return;
  }

  const effects = JSON.parse(await fs.readFile(promptPath, 'utf8'));
  await fs.mkdir(draftDirectory, { recursive: true });

  const generated = [];
  for (const effect of effects) {
    const outputPath = path.resolve(draftDirectory, effect.file);
    if (!outputPath.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Refusing output path outside project for ${effect.id}.`);
    }

    let bytes;
    if (await fileExists(outputPath)) {
      bytes = await fs.readFile(outputPath);
      console.log(`Reused existing draft: ${effect.name}`);
    } else {
      bytes = await generateWithRetry(effect);
      if (bytes.length < 1000) throw new Error(`Received an invalid audio file for ${effect.id}.`);
      await fs.writeFile(outputPath, bytes, { flag: 'wx' });
      console.log(`Generated ${effect.name} (${bytes.length} bytes)`);
      await delay(350);
    }

    generated.push({
      id: effect.id,
      name: effect.name,
      group: effect.group,
      description: effect.description,
      prompt: effect.prompt,
      inactive: Boolean(effect.inactive),
      duration: effect.duration,
      src: path.relative(root, outputPath).split(path.sep).join('/')
    });
  }

  const manifest = { provider: 'ElevenLabs', generatedAt: new Date().toISOString(), effects: generated };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const previewBundle = `window.SECOND_CHANCE_ELEVENLABS_EFFECTS = ${JSON.stringify(generated).replace(/</g, '\\u003c')};\n`;
  await fs.writeFile(path.join(root, 'sound-preview-effects.js'), previewBundle);
  console.log(`Manifest saved with ${generated.length} effects.`);
}

async function generateWithRetry(effect) {
  const endpoint = 'https://api.elevenlabs.io/v1/sound-generation';
  const body = {
    text: effect.prompt,
    model_id: 'eleven_text_to_sound_v2',
    duration_seconds: effect.duration,
    prompt_influence: 0.55
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000)
      });
    } catch (error) {
      if (attempt === 3) throw new Error(`Network failure for ${effect.id}: ${error.message}`);
      await delay(1500 * (attempt + 1));
      continue;
    }

    if (response.ok) return Buffer.from(await response.arrayBuffer());

    const detail = await response.text();
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      const retryAfter = Number(response.headers.get('retry-after'));
      await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * (attempt + 1));
      continue;
    }

    const safeDetail = detail.replace(/xi-api-key[^,\s]*/gi, '[redacted]').slice(0, 500);
    throw new Error(`ElevenLabs HTTP ${response.status} for ${effect.id}: ${safeDetail}`);
  }
  throw new Error(`Retries exhausted for ${effect.id}.`);
}

async function fileExists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
