import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (port) resolve(port);
        else reject(new Error('无法分配 Playwright 本地测试端口'));
      });
    });
  });
}

const requestedPort = process.env.PLAYWRIGHT_PORT;
const port = requestedPort ? Number(requestedPort) : await availablePort();
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`无效的 PLAYWRIGHT_PORT: ${requestedPort}`);
}

const require = createRequire(import.meta.url);
const cliPath = require.resolve('@playwright/test/cli');
const child = spawn(
  process.execPath,
  [cliPath, 'test', '--fail-on-flaky-tests', ...process.argv.slice(2)],
  {
    env: { ...process.env, PLAYWRIGHT_PORT: String(port) },
    stdio: 'inherit',
  },
);

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
