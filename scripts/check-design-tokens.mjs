import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, normalize, relative } from 'node:path';

const root = process.cwd();
const sourceRoot = join(root, 'src');
const tokenRoot = normalize(join(sourceRoot, 'styles', 'tokens'));
const sourceExtensions = new Set(['.css', '.ts', '.tsx']);
const colorLiteralPattern = /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\(/gi;
const legacyTokenPattern = /--(?:color|tb)-[a-z0-9-]+/gi;
const primitiveReferencePattern = /var\((--palette-[a-z0-9-]+)/gi;
const tokenDefinitionPattern = /(--[a-z0-9-]+)\s*:/gi;
const tokenReferencePattern = /var\((--[a-z0-9-]+)/gi;
const dynamicTokens = new Set(['--activity-accent']);

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function lineNumber(content, index) {
  return content.slice(0, index).split('\n').length;
}

function reportMatches(errors, path, content, pattern, message) {
  for (const match of content.matchAll(pattern)) {
    errors.push(`${relative(root, path)}:${lineNumber(content, match.index)} ${message}: ${match[0]}`);
  }
}

const files = collectFiles(sourceRoot).filter((path) => sourceExtensions.has(extname(path)));
const cssFiles = files.filter((path) => extname(path) === '.css');
const errors = [];
const definitions = new Set();
const references = new Map();

for (const path of files) {
  const content = readFileSync(path, 'utf8');
  const isTokenFile = normalize(path).startsWith(tokenRoot);
  if (!isTokenFile) {
    reportMatches(errors, path, content, colorLiteralPattern, '颜色字面量必须定义在 token 文件中');
  }
  reportMatches(errors, path, content, legacyTokenPattern, '禁止使用旧 Design Token');
}

for (const path of cssFiles) {
  const content = readFileSync(path, 'utf8');
  const canUsePrimitives = ['primitives.css', 'semantic.css'].some((name) => path.endsWith(name));
  if (!canUsePrimitives) {
    reportMatches(errors, path, content, primitiveReferencePattern, '组件不得越层引用 primitive token');
  }
  for (const match of content.matchAll(tokenDefinitionPattern)) definitions.add(match[1]);
  for (const match of content.matchAll(tokenReferencePattern)) {
    if (!references.has(match[1])) references.set(match[1], []);
    references.get(match[1]).push(`${relative(root, path)}:${lineNumber(content, match.index)}`);
  }
}

for (const [token, locations] of references) {
  if (!definitions.has(token) && !dynamicTokens.has(token)) {
    errors.push(`${locations[0]} 引用了未定义的 Design Token: ${token}`);
  }
}

if (errors.length > 0) {
  throw new Error(`Design Token 检查失败：\n${errors.join('\n')}`);
}

console.log(
  `Design Token check passed: ${definitions.size} definitions, ${references.size} referenced tokens.`,
);
