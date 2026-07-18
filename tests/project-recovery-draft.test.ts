import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isProjectRecoveryDraft,
  type RecoveryDraftStorage,
  readProjectRecoveryDraft,
  removeProjectRecoveryDraft,
  sameProjectPath,
  writeProjectRecoveryDraft,
} from '../src/features/project-document/projectRecoveryDraft.ts';

function memoryStorage(): RecoveryDraftStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

test('round trips a project recovery draft', () => {
  const storage = memoryStorage();
  assert.equal(
    writeProjectRecoveryDraft(
      {
        projectPath: 'D:\\projects\\meter.jcpro',
        projectName: 'Meter',
        savedAt: '2026-07-18T00:00:00.000Z',
        document: { project: { name: 'Meter' } },
      },
      storage,
    ),
    true,
  );
  assert.deepEqual(readProjectRecoveryDraft(storage), {
    schemaVersion: 1,
    projectPath: 'D:\\projects\\meter.jcpro',
    projectName: 'Meter',
    savedAt: '2026-07-18T00:00:00.000Z',
    document: { project: { name: 'Meter' } },
  });
});

test('only removes the recovery draft for the matching project', () => {
  const storage = memoryStorage();
  writeProjectRecoveryDraft(
    {
      projectPath: 'D:\\projects\\meter.jcpro',
      projectName: 'Meter',
      savedAt: '2026-07-18T00:00:00.000Z',
      document: {},
    },
    storage,
  );

  assert.equal(removeProjectRecoveryDraft('D:\\projects\\other.jcpro', storage), false);
  assert.notEqual(readProjectRecoveryDraft(storage), null);
  assert.equal(removeProjectRecoveryDraft('D:/projects/meter.jcpro', storage), true);
  assert.equal(readProjectRecoveryDraft(storage), null);
});

test('rejects malformed drafts and normalizes path separators', () => {
  const storage = memoryStorage();
  storage.setItem('jc-custom-platform.projectRecoveryDraft', '{"schemaVersion":0}');
  assert.equal(readProjectRecoveryDraft(storage), null);
  assert.equal(sameProjectPath('D:\\projects\\meter.jcpro', 'D:/projects/meter.jcpro'), true);
  assert.equal(sameProjectPath('D:\\Projects\\METER.jcpro', 'd:/projects/meter.jcpro'), true);
  assert.equal(sameProjectPath('/Projects/Meter.jcpro', '/projects/meter.jcpro'), false);
  assert.equal(isProjectRecoveryDraft({ schemaVersion: 0 }), false);
  assert.equal(
    isProjectRecoveryDraft({
      schemaVersion: 1,
      projectPath: '/projects/meter.jcpro',
      projectName: 'Meter',
      savedAt: '2026-07-18T00:00:00.000Z',
      document: {},
    }),
    true,
  );
});

test('degrades safely when recovery storage is unavailable', () => {
  const storage: RecoveryDraftStorage = {
    getItem: () => {
      throw new Error('storage unavailable');
    },
    removeItem: () => {
      throw new Error('storage unavailable');
    },
    setItem: () => {
      throw new Error('storage unavailable');
    },
  };
  const draft = {
    projectPath: 'D:\\projects\\meter.jcpro',
    projectName: 'Meter',
    savedAt: '2026-07-18T00:00:00.000Z',
    document: {},
  };

  assert.equal(readProjectRecoveryDraft(storage), null);
  assert.equal(writeProjectRecoveryDraft(draft, storage), false);
  assert.equal(removeProjectRecoveryDraft(undefined, storage), false);
});
