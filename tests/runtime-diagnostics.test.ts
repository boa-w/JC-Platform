import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDiagnosticReport,
  type DiagnosticStorage,
  readRuntimeDiagnostics,
  recordRuntimeDiagnostic,
  redactDiagnosticText,
} from '../src/lib/runtimeDiagnostics.ts';

function memoryStorage(): DiagnosticStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test('redacts user directories and credentials from diagnostics', () => {
  const redacted = redactDiagnosticText(
    'C:\\Users\\Alice\\project token=abc123 Bearer secret-token /home/bob/source',
  );
  assert.equal(redacted.includes('Alice'), false);
  assert.equal(redacted.includes('abc123'), false);
  assert.equal(redacted.includes('secret-token'), false);
  assert.equal(redacted.includes('/home/bob'), false);
  assert.match(redacted, /%USERNAME%/);
  assert.match(redacted, /\[REDACTED\]/);
});

test('keeps a bounded diagnostic event history', () => {
  const storage = memoryStorage();
  for (let index = 0; index < 55; index += 1) {
    recordRuntimeDiagnostic('info', `test.${index}`, `event ${index}`, undefined, storage);
  }
  const events = readRuntimeDiagnostics(storage);
  assert.equal(events.length, 50);
  assert.equal(events[0].source, 'test.5');
  assert.equal(events[49].source, 'test.54');
});

test('builds a report without project document content', () => {
  const report = buildDiagnosticReport(
    {
      activeModule: 'project',
      theme: 'dark',
      health: {
        app_name: '自定义开发平台',
        version: '1.2.3',
        commit_hash: 'abc1234',
        core_status: 'ready',
      },
      project: {
        name: 'Meter',
        version: '2',
        path: 'C:\\Users\\Alice\\projects\\meter.jcpro',
        deviceResolution: '800×480',
      },
    },
    {
      generatedAt: '2026-07-18T00:00:00.000Z',
      events: [],
      runtime: { user_agent: 'test' },
    },
  );
  const serialized = JSON.stringify(report);
  assert.equal(report.privacy.project_document_included, false);
  assert.equal(serialized.includes('Alice'), false);
  assert.equal(serialized.includes('document'), true);
  assert.equal('document' in (report.session.project ?? {}), false);
});
