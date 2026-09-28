import { build, context } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.dirname(fileURLToPath(import.meta.url));
const serving = process.argv.includes('--serve');
const output = path.resolve(root, serving ? '../dist/binder-dev' : '../dist/binder');
await fs.mkdir(output, { recursive: true });
if (!serving) {
  const generated = /^(?:app\.(?:js|css)(?:\.map)?|(?:room|chunk)-[A-Za-z0-9_-]+\.js(?:\.map)?)$/;
  for (const entry of await fs.readdir(output, { withFileTypes: true })) {
    if (entry.isFile() && generated.test(entry.name)) await fs.rm(path.join(output, entry.name));
  }
}
await fs.cp(path.join(root, 'public'), output, { recursive: true, filter: source => path.basename(source) !== 'tokyo-night.webp' });
await fs.rm(path.join(output, 'room/tokyo-night.webp'), { force: true });
await fs.writeFile(path.join(output, '.nojekyll'), '');
await fs.writeFile(path.join(output,'city/manifest.json.gz'),gzipSync(await fs.readFile(path.join(root,'public/city/manifest.json')),{level:9}));
const options = {
  entryPoints: [path.join(root, 'src/main.js')],
  outdir: output,
  entryNames: 'app',
  bundle: true,
  splitting: true,
  format: 'esm',
  target: ['es2022'],
  minify: !serving,
  sourcemap: serving,
  loader: { '.svg': 'text', '.ttf': 'file' },
  assetNames: 'fonts/[name]',
  logLevel: 'info',
  plugins: [{
    name: 'binder-html',
    setup(builder) {
      builder.onEnd(async () => {
        await fs.copyFile(path.join(root, 'index.html'), path.join(output, 'index.html'));
      });
    },
  }],
};
if (serving) {
  const builder = await context(options);
  await builder.watch();
  const server = await builder.serve({ servedir: output, host: '127.0.0.1', port: Number(process.env.PORT || 4173) });
  console.log(`Afterhours is ready at http://127.0.0.1:${server.port}`);
  const stop = async () => { await builder.dispose(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} else {
  await build(options);
  console.log('Built dist/binder. Serve this directory with any static web server.');
}
