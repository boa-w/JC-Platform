import assert from 'node:assert/strict';
import test from 'node:test';
import { csvToSignals, signalsToCsv } from '../src/utils/batteryCsv.ts';

const signal = {
  signal_key: 'battery_voltage',
  name: 'battery.voltage.name',
  inner: -1,
  frame_key: 'battery_status',
  pos: 0,
  len: 16,
  byte_order: 'little_endian' as const,
  raw_offset: 0,
  raw_type: 'u16_le' as const,
  value_type: 'u16' as const,
  parse_resolution: 0.1,
  parse_offset: 0,
  parse_mask: 0xffffffff,
  parse_shift: 0,
  receiver: 'bms',
  comment: '',
};

test('exports Battery V2 signal CSV without param_id', () => {
  const csv = signalsToCsv([signal]);
  assert.match(csv, /^signal_key,name,inner,/);
  assert.doesNotMatch(csv, /param_id/);
  assert.deepEqual(csvToSignals(csv), { signals: [signal], errors: [] });
});

test('rejects the removed param_id signal CSV layout instead of shifting columns', () => {
  const legacyHeader =
    'signal_key,param_id,name,inner,frame_key,pos,len,byte_order,raw_offset,raw_type,value_type,parse_resolution,parse_offset,parse_mask,parse_shift,receiver,comment';
  const result = csvToSignals(`${legacyHeader}\nlegacy,OLD_ID,Old name,-1,status,0,8,little_endian,0,u8,u8,1,0,0xFFFFFFFF,0,bms,`);

  assert.deepEqual(result.signals, []);
  assert.deepEqual(result.errors, ['Battery V2 信号 CSV 不支持 param_id，请使用 signal_key,name 列']);
});
