import { build as buildUI } from 'vite';
import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');
const options = {
  entryPoints: ['src/plugin/index.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  format: 'iife',
  platform: 'neutral',
  target: 'es2020',
};
if (watch) {
  const plugin = await context(options);
  await plugin.watch();
  await buildUI({ build: { watch: {} } });
  process.on('SIGINT', async () => {
    await plugin.dispose();
    process.exit(0);
  });
} else {
  await buildUI();
  await build(options);
}
