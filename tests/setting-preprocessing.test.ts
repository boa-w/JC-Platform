import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSettingPreprocessValue,
  settingPreprocessDecimalName,
  settingPreprocessDefinitions,
  validateSettingPreprocessOffset,
  validateSettingPreprocessScale,
} from '../src/features/setting-data/settingPreprocessing.ts';

test('matches legacy preprocessing names to persisted pre_handle values', () => {
  assert.deepEqual(
    settingPreprocessDefinitions.map(({ handle, name }) => [handle, name]),
    [
      [0, '原始数据'],
      [5, '缩小'],
      [6, '放大'],
      [7, '偏移'],
      [1, '缩小偏移'],
      [2, '放大偏移'],
      [3, '偏移缩小'],
      [4, '偏移放大'],
    ],
  );
  assert.equal(parseSettingPreprocessValue('偏移缩小:3')?.handle, 3);
});

test('matches legacy preprocessing validation and decimal options', () => {
  assert.equal(validateSettingPreprocessScale('10', 1), true);
  assert.equal(validateSettingPreprocessScale('0', 1), false);
  assert.equal(validateSettingPreprocessScale('32768', 2), false);
  assert.equal(validateSettingPreprocessOffset('1.5', 2), true);
  assert.equal(validateSettingPreprocessOffset('', 2), false);
  assert.equal(validateSettingPreprocessOffset('', 5), true);
  assert.equal(settingPreprocessDecimalName(4), '4位');
});
