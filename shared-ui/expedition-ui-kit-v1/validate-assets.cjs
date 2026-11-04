'use strict';
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');

const root = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const expected = [];
for (const button of manifest.buttons) {
  for (const theme of Object.keys(manifest.themes)) {
    for (const variant of ['desktop', 'compact']) {
      const [w, h] = button.sizes[variant];
      for (const state of ['idle', 'hover', 'pressed', 'disabled']) {
        expected.push([button.files[theme][variant][state], w, h]);
      }
    }
  }
}
for (const module of manifest.modules) {
  for (const theme of Object.keys(manifest.themes)) {
    for (const variant of ['desktop', 'compact']) {
      const [w, h] = variant === 'desktop' ? module.size : module.compact;
      expected.push([module.files[theme][variant], w, h]);
    }
  }
}
const icons = fs.readdirSync(path.join(root, 'icons')).filter(x => x.endsWith('.svg'));
for (const name of icons) expected.push([`icons/${name}`, 48, 48]);

(async () => {
  const errors = [];
  for (const [rel, w, h] of expected) {
    const svgPath = path.join(root, rel);
    if (!fs.existsSync(svgPath)) { errors.push(`missing ${rel}`); continue; }
    const source = fs.readFileSync(svgPath, 'utf8');
    if (!source.startsWith('<svg ') || !source.includes(`viewBox="0 0 ${w} ${h}"`) || source.includes('<text')) {
      errors.push(`invalid SVG geometry or baked text: ${rel}`);
    }
    for (const ext of ['png', 'webp']) {
      const raster = svgPath.replace(/\.svg$/, `.${ext}`);
      if (!fs.existsSync(raster)) { errors.push(`missing ${raster}`); continue; }
      const meta = await sharp(raster).metadata();
      if (meta.width !== w * 2 || meta.height !== h * 2 || meta.format !== ext) {
        errors.push(`wrong raster ${raster}: ${meta.width}x${meta.height} ${meta.format}`);
      }
    }
  }
  const expectedFiles = new Set(expected.flatMap(([rel]) => [rel, rel.replace(/\.svg$/, '.png'), rel.replace(/\.svg$/, '.webp')]));
  for (const dir of ['buttons', 'modules', 'icons']) {
    const actual = fs.readdirSync(path.join(root, dir), { recursive: true })
      .filter(x => /\.(svg|png|webp)$/.test(x))
      .map(x => `${dir}/${x.replaceAll('\\', '/')}`);
    for (const rel of actual) if (!expectedFiles.has(rel)) errors.push(`unexpected ${rel}`);
  }
  if (errors.length) { console.error(errors.slice(0, 30).join('\n')); process.exitCode = 1; }
  else console.log(`Verified ${manifest.buttons.length} buttons, ${manifest.modules.length} HUD modules, ${icons.length} icons; ${expected.length} design variants, ${expected.length * 3} SVG/PNG/WebP files.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
