import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bindingCountByDefinition,
  definitionCountByMessageKey,
  normalizeFaultCatalog,
  validateFaultCatalog,
} from '../src/features/fault-code/faultCodeCatalogModel.ts';

const catalog = normalizeFaultCatalog({
  schema_version: 2,
  enabled: true,
  version: 2,
  sources: [
    {
      source_key: 'traction',
      source_id: 1,
      type_char: 'T',
      can_id: 0x288,
    },
    {
      source_key: 'pump',
      source_id: 2,
      type_char: 'P',
      can_id: 0x294,
    },
  ],
  definitions: [
    {
      fault_key: 'fault.traction.052',
      message_key: 'fault.message.dc.bus.low',
      severity: 'fault',
    },
    {
      fault_key: 'fault.pump.052',
      message_key: 'fault.message.dc.bus.low',
      severity: 'fault',
    },
  ],
  bindings: [
    { source_key: 'traction', code: 52, fault_key: 'fault.traction.052' },
    { source_key: 'pump', code: 52, fault_key: 'fault.pump.052' },
  ],
});

test('allows independent fault identities to share one multilingual message', () => {
  const validation = validateFaultCatalog(catalog);
  assert.deepEqual(validation.errors, []);
  assert.equal(
    definitionCountByMessageKey(catalog.definitions ?? []).get('fault.message.dc.bus.low'),
    2,
  );
  assert.equal(bindingCountByDefinition(catalog.bindings ?? []).get('fault.pump.052'), 1);
});

test('rejects duplicate source and code bindings', () => {
  const invalid = {
    ...catalog,
    bindings: [
      ...(catalog.bindings ?? []),
      { source_key: 'pump', code: 52, fault_key: 'fault.pump.052', enabled: true },
    ],
  };
  const validation = validateFaultCatalog(invalid);
  assert.equal(validation.duplicateBindings.has(2), true);
  assert.match(validation.errors.join('\n'), /故障码必须唯一/);
});
