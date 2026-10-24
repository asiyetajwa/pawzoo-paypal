// Bundles each MCP Apps view into a single self-contained HTML file (views run in a sandboxed iframe).
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

await mkdir('dist-views', { recursive: true });
for (const name of ['card']) {
  const out = await build({
    entryPoints: [`views/${name}.ts`],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    write: false,
  });
  const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = (await readFile(`views/${name}.html`, 'utf8')).replace('/*__CARD_JS__*/', () => js);
  await writeFile(`dist-views/${name}.html`, html);
  console.log(`views: dist-views/${name}.html (${Math.round(html.length / 1024)} KB)`);
}
