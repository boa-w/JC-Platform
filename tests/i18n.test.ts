import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const localePath = join(root, 'src', 'i18n', 'locales', 'zh-CN.json');
const locale = JSON.parse(readFileSync(localePath, 'utf8')) as Record<string, unknown>;

function flatten(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}.${key}` : key),
  );
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test('application i18n is strict and has no Chinese fallback', () => {
  const source = readFileSync(join(root, 'src', 'i18n', 'index.tsx'), 'utf8');
  assert.match(source, /fallbackLng:\s*false/);
  assert.match(source, /supportedLngs:\s*supportedAppLanguages/);
  assert.match(
    readFileSync(join(root, 'src', 'i18n', 'resources.ts'), 'utf8'),
    /'zh-CN':\s*\{/,
  );
});

test('registered locale JSON contains no empty leaf values', () => {
  for (const key of flatten(locale)) {
    const value = key.split('.').reduce<unknown>((current, segment) => {
      if (!current || typeof current !== 'object') return undefined;
      return (current as Record<string, unknown>)[segment];
    }, locale);
    assert.equal(typeof value, 'string', `${key} must be a string leaf`);
    assert.notEqual((value as string).trim(), '', `${key} must not be empty`);
  }
});

test('literal translation keys used by source files exist in zh-CN', () => {
  const keys = new Set(flatten(locale));
  const missing = new Set<string>();
  for (const path of sourceFiles(join(root, 'src'))) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) {
      const key = match[1];
      if (!keys.has(key)) missing.add(`${key} (${path})`);
    }
  }
  assert.deepEqual([...missing], []);
});
