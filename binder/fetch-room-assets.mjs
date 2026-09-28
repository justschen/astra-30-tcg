import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const output = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public/room');
const cityOnly = process.argv.includes('--city-only');
const woodOnly = process.argv.includes('--wood-only');
await fs.mkdir(output, { recursive: true });

async function download(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Afterhours-local-prototype/1.0' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Room asset download failed: ${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

if (!cityOnly && !woodOnly) {
  const skylineSource = 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Shiba-koen%2C_aerial_view_on_Tokyo_Tower_at_dusk_%28Unsplash%29.jpg';
  const photograph = await download(skylineSource);
  await sharp(photograph).resize({ width: 5120, height: 2880, fit: 'cover', position: 'top' })
    .modulate({ saturation: 1.08 }).webp({ quality: 88 }).toFile(path.join(output, 'tokyo-night.webp'));
  console.log('Modeling reference only: Kazuend, CC0, 5120px WebP. The app renders the reconstructed 3D city.');
}

for (const [id, name, size] of [
  ['wood_table_001', 'walnut', 2048],
  ['oak_veneer_02', 'oak', 2048],
  ['leather_white', 'leather', 1024],
  ['fabric_pattern_07', 'upholstery', 1024],
  ['concrete_wall_001', 'city-concrete', 1024],
  ['brick_wall_001', 'city-brick', 1024],
  ['asphalt_02', 'city-asphalt', 1024],
]) {
  if (cityOnly && !name.startsWith('city-')) continue;
  if (woodOnly && name !== 'oak') continue;
  const manifest = JSON.parse((await download(`https://api.polyhaven.com/files/${id}`)).toString());
  for (const [key, suffix] of [['Diffuse', 'color'], ['nor_gl', 'normal'], ['Rough', 'roughness']]) {
    const channel = manifest[key] || (key === 'Diffuse' ? manifest['diff'] || manifest['Diffuse/Albedo'] || manifest['diffuse'] : null);
    if (!channel) {
      if (key === 'Diffuse' && id === 'fabric_pattern_07') continue;
      throw new Error(`Missing ${key} map for ${id}.`);
    }
    const resolution = size === 2048 ? '2k' : '1k';
    const source = channel[resolution]?.jpg?.url;
    if (!source) throw new Error(`Missing ${resolution} JPG for ${id}/${key}.`);
    const bytes = await download(source);
    const image = sharp(bytes).resize(size, size);
    await image.webp({ quality: key === 'nor_gl' ? 92 : 86 }).toFile(path.join(output, `${name}-${suffix}.webp`));
    console.log(`${name}-${suffix}: Poly Haven ${id}, CC0.`);
  }
}
