import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = join(process.cwd(), 'dist');
const html = readFileSync(join(distDir, 'index.html'), 'utf8');
const budgets = {
  // The application-level i18n runtime adds a predictable baseline to the entry chunk.
  // Profile-scoped localization selection adds a small always-loaded
  // document-state layer on top of controller/battery synchronization.
  // Keep a measured margin for the stable entry chunk across supported Node/Vite builds.
  script: 130 * 1024,
  stylesheet: 12.25 * 1024,
};

function resolveAsset(pattern, label) {
  const match = html.match(pattern);
  if (!match?.[1]) throw new Error(`Unable to locate the built ${label} in dist/index.html.`);
  return join(distDir, match[1].replace(/^\//, ''));
}

function verifyGzipBudget(path, budget, label) {
  const content = readFileSync(path);
  const gzipBytes = gzipSync(content).byteLength;
  const rawKiB = statSync(path).size / 1024;
  const gzipKiB = gzipBytes / 1024;
  const budgetKiB = budget / 1024;
  if (gzipBytes > budget) {
    throw new Error(
      `${label} exceeds its ${budgetKiB.toFixed(2)} KiB gzip budget: ${gzipKiB.toFixed(2)} KiB.`,
    );
  }
  return `${label}: ${rawKiB.toFixed(2)} KiB raw / ${gzipKiB.toFixed(2)} KiB gzip`;
}

const entryScript = resolveAsset(/<script[^>]+src="([^"]+\.js)"/, 'entry script');
const mainStylesheet = resolveAsset(/<link[^>]+href="([^"]+\.css)"/, 'main stylesheet');

console.log(
  [
    verifyGzipBudget(entryScript, budgets.script, 'Entry script'),
    verifyGzipBudget(mainStylesheet, budgets.stylesheet, 'Main stylesheet'),
  ].join('\n'),
);
