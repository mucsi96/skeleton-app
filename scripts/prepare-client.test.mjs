import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareClient } from './prepare-client.mjs';

const assetUrl = 'https://fixture.blob.core.windows.net/assets/';
const appOrigin = 'https://hello.example.test';

async function fixture(t) {
  const root = await mkdtemp(join(process.env.RUNNER_TEMP ?? tmpdir(), 'prepare-client-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'input');
  const output = join(root, 'output');
  await mkdir(input);
  await writeFile(join(input, 'index.html'), `<!doctype html><base href="/">
<script>window.__APP_CONFIG__ = "__APP_CONFIG_JSON__";</script>
<link rel="stylesheet" href="styles.css"><link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="/favicon.png"><link rel="modulepreload" href="chunk.js">
<script src="main.js" type="module" crossorigin></script>`);
  await writeFile(join(input, 'manifest.webmanifest'), JSON.stringify({ start_url: '/', scope: '/', icons: [{ src: 'icons/icon.png' }] }));
  await writeFile(join(input, 'main.js'), 'import "./chunk.js";');
  return { input, output };
}

test('separates document and assets, preserves bundles and app navigation', async t => {
  const { input, output } = await fixture(t);
  await prepareClient(input, output, assetUrl, appOrigin);
  const html = await readFile(join(output, 'documents/index.html'), 'utf8');
  assert(html.includes('<base href="/">'));
  assert(html.includes('"__APP_CONFIG_JSON__"'));
  for (const file of ['styles.css', 'manifest.webmanifest', 'favicon.png', 'chunk.js', 'main.js']) assert(html.includes(assetUrl + file));
  assert.equal((html.match(/crossorigin="anonymous"/g) ?? []).length, 5);
  await assert.rejects(readFile(join(output, 'assets/index.html')), { code: 'ENOENT' });
  assert.equal(await readFile(join(output, 'assets/main.js'), 'utf8'), 'import "./chunk.js";');
  const manifest = JSON.parse(await readFile(join(output, 'assets/manifest.webmanifest'), 'utf8'));
  for (const field of ['id', 'start_url', 'scope']) assert.equal(manifest[field], `${appOrigin}/`);
  assert.equal(manifest.icons[0].src, 'icons/icon.png');
  assert(!(await readFile(join(input, 'index.html'), 'utf8')).includes(assetUrl));
});

test('rejects symlinks before copying the artifact', async t => {
  const { input, output } = await fixture(t);
  await symlink('/etc/passwd', join(input, 'linked-file'));
  await assert.rejects(prepareClient(input, output, assetUrl, appOrigin), /Unexpected symlink/);
});

test('rejects a build without the runtime configuration marker', async t => {
  const { input, output } = await fixture(t);
  await writeFile(join(input, 'index.html'), '<html></html>');
  await assert.rejects(prepareClient(input, output, assetUrl, appOrigin), /Missing runtime configuration marker/);
});
