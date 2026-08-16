import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('keeps local CI preflight, workflow, and documentation aligned', async () => {
  const [packageText, workflow, documentation] = await Promise.all([
    read('package.json'),
    read('.github/workflows/build.yml'),
    read('docs/ci-preflight.md'),
  ]);
  const packageJson = JSON.parse(packageText) as { scripts: Record<string, string> };

  assert.equal(packageJson.scripts['verify:frontend'], 'npm run lint && npm run test:frontend && npm run build');
  assert.equal(packageJson.scripts['verify:rust'], 'npm run test:rust');
  assert.equal(packageJson.scripts['verify:ui'], 'npm run test:e2e');
  assert.equal(packageJson.scripts['verify:ci'], 'node scripts/verify-ci.mjs');
  assert.match(workflow, /run: npm run verify:frontend/);
  assert.match(workflow, /run: npm run verify:rust/);
  assert.match(workflow, /run: npm run verify:ui/);
  assert.doesNotMatch(workflow, /run: npm run lint && npm run test:frontend && npm run build/);
  assert.match(documentation, /npm run verify:ci/);
  assert.match(documentation, /npx playwright install chromium/);
  assert.match(documentation, /verify:frontend/);
  assert.match(documentation, /verify:rust/);
  assert.match(documentation, /verify:ui/);
});
