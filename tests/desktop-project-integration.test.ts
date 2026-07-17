import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildProjectWindowTitle,
  isJcproProjectPath,
  selectDroppedProjectPath,
} from '../src/features/project-lifecycle/desktopProjectIntegration.ts';

test('recognizes jcpro paths without depending on extension casing', () => {
  assert.equal(isJcproProjectPath('D:\\projects\\meter.JCPRO'), true);
  assert.equal(isJcproProjectPath('D:\\projects\\meter.json'), false);
});

test('selects the first dropped jcpro project', () => {
  assert.equal(
    selectDroppedProjectPath(['D:\\notes.txt', 'D:\\projects\\meter.jcpro']),
    'D:\\projects\\meter.jcpro',
  );
  assert.equal(selectDroppedProjectPath(['D:\\notes.txt']), null);
});

test('builds a desktop title with project and unsaved state', () => {
  assert.equal(buildProjectWindowTitle(), '自定义开发平台');
  assert.equal(
    buildProjectWindowTitle('', 'D:\\projects\\meter.jcpro', false),
    'meter - 自定义开发平台',
  );
  assert.equal(
    buildProjectWindowTitle('测试项目', 'D:\\projects\\meter.jcpro', true),
    '* 测试项目 - 自定义开发平台',
  );
});
