import assert from 'node:assert/strict';
import test from 'node:test';
import { desktopProjectShortcut } from '../src/features/project-lifecycle/desktopProjectShortcuts.ts';

const baseEvent = {
  key: '',
  ctrlKey: true,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

test('maps desktop project file shortcuts', () => {
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 'o' }), 'open');
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 's' }), 'save');
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 'S', shiftKey: true }), 'save-as');
  assert.equal(
    desktopProjectShortcut({ ...baseEvent, key: 's', ctrlKey: false, metaKey: true }),
    'save',
  );
});

test('ignores conflicting or repeated keyboard input', () => {
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 'o', shiftKey: true }), null);
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 's', altKey: true }), null);
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 's', isComposing: true }), null);
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 's', repeat: true }), null);
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 'x' }), null);
  assert.equal(desktopProjectShortcut({ ...baseEvent, key: 's', ctrlKey: false }), null);
});
