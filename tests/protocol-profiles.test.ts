import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addProtocolProfileSections,
  createNewProtocolProfileSections,
  initializeBatteryProtocolSections,
  initializeFaultCodeProtocolSections,
  initializeProtocolProfilesSections,
  protocolProfileSectionsForSelection,
  readProtocolProfiles,
  renameProtocolProfileSections,
  syncProtocolProfileSections,
} from '../src/features/protocol-profiles/protocolProfiles.ts';

function emptyControllerProtocol() {
  return {
    pdo_global_param: [],
    pdo_condition: [],
    pdo_recv: [],
    pdo_send: [],
    sdo_info: { type: 0, user_auth: 0, name_index: 0, name: '', children: [] },
    canopen: { schema_version: 1, nodes: [], pdos: [] },
  };
}

function emptyBatteryMonitor() {
  return {
    schema_version: 2,
    enabled: false,
    version: 2,
    default_timeout_ticks: 200,
    page_size: 4,
    frames: [],
    signals: [],
    items: [],
  };
}

function emptyFaultCodeInfo() {
  return {
    schema_version: 2,
    enabled: false,
    version: 2,
    sources: [],
    definitions: [],
    bindings: [],
  };
}

function baseDocument() {
  return {
    config_version: 'jc002',
    protocol_profiles: {
      schema_version: 2,
      active_controller_profile_id: 'controller.default',
      controller_profiles: [
        {
          profile_id: 'controller.default',
          controller_family: 'generic',
          controller_revision: '',
          protocol: emptyControllerProtocol(),
        },
      ],
      battery_profiles: [],
      fault_code_profiles: [],
    },
  };
}

function withAllProfileKinds() {
  let document = { ...baseDocument() };
  document = { ...document, ...initializeBatteryProtocolSections(document) };
  document = { ...document, ...initializeFaultCodeProtocolSections(document) };
  return document;
}

test('uses one canonical protocol_profiles registry without root mirrors', () => {
  const initialized = { ...baseDocument(), ...initializeProtocolProfilesSections(baseDocument()) };
  const profiles = readProtocolProfiles(initialized);

  assert.equal(profiles?.controller_profiles.length, 1);
  assert.equal(profiles?.battery_profiles.length, 0);
  assert.equal(profiles?.fault_code_profiles.length, 0);
  assert.equal('pdo_global_param' in initialized, false);
  assert.equal('sdo_info' in initialized, false);

  const withBattery = { ...initialized, ...initializeBatteryProtocolSections(initialized) };
  const withFault = { ...withBattery, ...initializeFaultCodeProtocolSections(withBattery) };
  const complete = readProtocolProfiles(withFault);
  assert.equal(complete?.battery_profiles.length, 1);
  assert.equal(complete?.fault_code_profiles.length, 1);
});

test('creates an independent blank controller profile inside the registry', () => {
  const document = baseDocument();
  document.protocol_profiles.controller_profiles[0].protocol.pdo_global_param = [
    { name: 'controller.speed' },
  ];
  const created = {
    ...document,
    ...createNewProtocolProfileSections(document, 'controller'),
  };
  const profiles = readProtocolProfiles(created);
  const next = profiles?.controller_profiles.find(
    (profile) => profile.profile_id === 'controller.new',
  );

  assert.deepEqual(next?.protocol.pdo_global_param, []);
  assert.equal('pdo_global_param' in created, false);
  assert.notEqual(
    next?.protocol,
    profiles?.controller_profiles[0].protocol,
  );
});

test('switches controller, battery, and fault profiles without producing root sections', () => {
  const document = withAllProfileKinds();
  const cloned = { ...document, ...addProtocolProfileSections(document, 'controller') };
  const switched = {
    ...cloned,
    ...syncProtocolProfileSections(
      cloned,
      protocolProfileSectionsForSelection(cloned, 'controller', 'controller.default_2'),
    ),
  };
  const profiles = readProtocolProfiles(switched);
  assert.equal(profiles?.active_controller_profile_id, 'controller.default_2');
  assert.equal(profiles?.active_battery_profile_id, 'battery.default');
  assert.equal('pdo_global_param' in switched, false);
  assert.equal('battery_monitor' in switched, false);
  assert.equal('fault_code_info' in switched, false);

  const edited = syncProtocolProfileSections(switched, {
    pdo_global_param: [{ name: 'controller.new.speed' }],
  });
  const editedProfiles = readProtocolProfiles(edited);
  assert.deepEqual(
    editedProfiles?.controller_profiles.find((profile) => profile.profile_id === 'controller.default_2')
      ?.protocol.pdo_global_param,
    [{ name: 'controller.new.speed' }],
  );
  assert.deepEqual(
    editedProfiles?.controller_profiles.find((profile) => profile.profile_id === 'controller.default')
      ?.protocol.pdo_global_param,
    [],
  );
});

test('switching the controller preserves fault Profile data byte-for-byte', () => {
  const document = withAllProfileKinds() as ReturnType<typeof withAllProfileKinds> & {
    protocol_profiles: {
      fault_code_profiles: Array<Record<string, unknown>>;
    };
  };
  const faultProfile = document.protocol_profiles.fault_code_profiles[0];
  faultProfile.vendor_extension = { source_order: ['acm', 'inmotion'], enabled: true };
  const protocol = faultProfile.protocol as Record<string, unknown>;
  const faultCodeInfo = protocol.fault_code_info as Record<string, unknown>;
  faultCodeInfo.runtime_extension = { retain_order: true, sentinel: 'fault-profile' };

  const cloned = { ...document, ...addProtocolProfileSections(document, 'controller') };
  const before = structuredClone(cloned.protocol_profiles.fault_code_profiles);
  const sections = protocolProfileSectionsForSelection(
    cloned,
    'controller',
    'controller.default_2',
  );
  const switched = syncProtocolProfileSections(cloned, sections) as typeof cloned;

  assert.equal(
    switched.protocol_profiles.active_controller_profile_id,
    'controller.default_2',
  );
  assert.deepEqual(switched.protocol_profiles.fault_code_profiles, before);
});

test('keeps a battery patch in the selected battery Profile when the registry is updated atomically', () => {
  const document = withAllProfileKinds();
  const profiles = readProtocolProfiles(document);
  assert.ok(profiles);
  const nextBatteryMonitor = { ...emptyBatteryMonitor(), default_timeout_ticks: 333 };
  const updated = syncProtocolProfileSections(document, {
    protocol_profiles: profiles,
    battery_monitor: nextBatteryMonitor,
  });
  const updatedProfiles = readProtocolProfiles(updated);

  assert.equal('battery_monitor' in updated, false);
  assert.equal(
    updatedProfiles?.battery_profiles[0].protocol.battery_monitor.default_timeout_ticks,
    333,
  );
});

test('initializes a missing battery or fault collection without reading root legacy data', () => {
  const document = {
    ...baseDocument(),
    battery_monitor: { ...emptyBatteryMonitor(), default_timeout_ticks: 999 },
    fault_code_info: { ...emptyFaultCodeInfo(), enabled: true },
  };
  const withBattery = syncProtocolProfileSections(
    document,
    initializeBatteryProtocolSections(document),
  );
  const withFault = syncProtocolProfileSections(
    withBattery,
    initializeFaultCodeProtocolSections(withBattery),
  );
  const profiles = readProtocolProfiles(withFault);

  assert.equal(profiles?.battery_profiles[0].protocol.battery_monitor.default_timeout_ticks, 200);
  assert.equal(profiles?.fault_code_profiles[0].protocol.fault_code_info.enabled, false);
});

test('renames a profile while preserving its protocol payload and in-memory active id', () => {
  const document = withAllProfileKinds();
  const before = readProtocolProfiles(document)?.controller_profiles[0].protocol;
  const renamed = renameProtocolProfileSections(
    document,
    'controller',
    'controller.default',
    'inmotion6',
  );
  assert.equal(renamed.error, undefined);
  const next = syncProtocolProfileSections(document, renamed.sections ?? {});
  const profiles = readProtocolProfiles(next);
  assert.equal(profiles?.active_controller_profile_id, 'inmotion6');
  assert.deepEqual(profiles?.controller_profiles[0].protocol, before);
  assert.equal('sdo_info' in next, false);
});

test('rejects a mixed v2 document at the frontend Profile boundary', () => {
  const mixed = { ...baseDocument(), pdo_recv: [] };
  assert.equal(readProtocolProfiles(mixed), null);
});
