import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseSettingDataTypeValue,
  settingDataTypeDefinitions,
  settingDataTypeIsDefaultWrite,
  settingDataTypeUsesBitRange,
  validateDefaultWriteValue,
} from '../src/features/setting-data/settingDataTypes.ts';

test('matches the legacy SDO data type names to their persisted handle values', () => {
  assert.deepEqual(
    settingDataTypeDefinitions.map(({ handle, name }) => [handle, name]),
    [
      [0, 'u8'],
      [1, 's8'],
      [2, 'u16'],
      [3, 's16'],
      [4, 'u32'],
      [5, 's32'],
      [6, 'string'],
      [7, 'default_4字节'],
      [8, 'default_2字节'],
      [9, 'default_1字节'],
      [10, 'bits_4字节'],
      [11, 'bits_2字节'],
      [12, 'bits_1字节'],
    ],
  );
  assert.equal(parseSettingDataTypeValue('s16:3')?.handle, 3);
});

test('identifies type-specific editor behavior and validates default write ranges', () => {
  assert.equal(settingDataTypeUsesBitRange(10), true);
  assert.equal(settingDataTypeUsesBitRange(9), false);
  assert.equal(settingDataTypeIsDefaultWrite(8), true);
  assert.equal(validateDefaultWriteValue('0xFFFFFFFF', 7), true);
  assert.equal(validateDefaultWriteValue('4294967296', 7), false);
  assert.equal(validateDefaultWriteValue('0xFFFF', 8), true);
  assert.equal(validateDefaultWriteValue('65536', 8), false);
  assert.equal(validateDefaultWriteValue('', 9), false);
  assert.equal(validateDefaultWriteValue('255', 9), true);
  assert.equal(validateDefaultWriteValue('256', 9), false);
});
