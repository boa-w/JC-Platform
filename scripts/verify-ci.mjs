import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const strict = process.argv.includes('--strict');
const steps = [
  ['Frontend quality', 'verify:frontend'],
  ['Rust quality', 'verify:rust'],
  ['UI quality', strict ? 'verify:ui:strict' : 'verify:ui'],
];

function runStep(label, script) {
  return new Promise((resolve) => {
    console.log(`\n[local-ci] ${label}: npm run ${script}`);
    let child;
    try {
      child = spawn(npmCommand, ['run', script], {
        env: { ...process.env, CI: 'true' },
        shell: process.platform === 'win32',
        stdio: 'inherit',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[local-ci] ${label} could not start: ${message}`);
      resolve(1);
      return;
    }
    child.once('error', (error) => {
      console.error(`[local-ci] ${label} could not start: ${error.message}`);
      resolve(1);
    });
    child.once('exit', (code, signal) => {
      resolve(signal ? 1 : (code ?? 1));
    });
  });
}

for (const [label, script] of steps) {
  const exitCode = await runStep(label, script);
  if (exitCode !== 0) {
    console.error(`\n[local-ci] FAILED: ${label}`);
    process.exitCode = exitCode;
    break;
  }
}

if (!process.exitCode) {
  console.log('\n[local-ci] All Action quality checks passed.');
}
