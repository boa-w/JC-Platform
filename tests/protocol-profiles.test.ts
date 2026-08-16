import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addProtocolProfileSections,
  initializeBatteryProtocolSections,
  initializeProtocolProfilesSections,
  protocolProfileSectionsForSelection,
  renameProtocolProfileSections,
  readProtocolProfiles,
  syncProtocolProfileSections,
} from '../src/features/protocol-profiles/protocolProfiles.ts';

function baseDocument() {
  return {
    config_version: 'jc002',
    pdo_global_param: [{ name: 'controller.speed' }],
    pdo_condition: [],
    pdo_recv: [],
    pdo_send: [],
    sdo_info: { type: 0, children: [] },
    canopen: { schema_version: 1, nodes: [], pdos: [] },
    battery_monitor: {
      schema_version: 2,
      enabled: false,
      version: 2,
      default_timeout_ticks: 200,
      page_size: 4,
      frames: [],
      signals: [],
      items: [],
    },
  };
}

test('initializes independent controller and battery registries', () => {
  const initialized = { ...baseDocument(), ...initializeProtocolProfilesSections(baseDocument()) };
  const profiles = readProtocolProfiles(initialized);
  assert.equal(profiles?.schema_version, 2);
  assert.equal(profiles?.controller_profiles.length, 1);
  assert.equal(profiles?.battery_profiles.length, 1);

  const clonedController = {
    ...initialized,
    ...addProtocolProfileSections(initialized, 'controller'),
  };
  const controllerProfiles = readProtocolProfiles(clonedController);
  assert.equal(controllerProfiles?.controller_profiles.length, 2);
  assert.equal(controllerProfiles?.battery_profiles.length, 1);
  assert.equal(controllerProfiles?.active_controller_profile_id, 'controller.default_2');
  assert.equal(controllerProfiles?.active_battery_profile_id, 'battery.default');

  const clonedBattery = {
    ...clonedController,
    ...addProtocolProfileSections(clonedController, 'battery'),
  };
  const batteryProfiles = readProtocolProfiles(clonedBattery);
  assert.equal(batteryProfiles?.controller_profiles.length, 2);
  assert.equal(batteryProfiles?.battery_profiles.length, 2);
  assert.equal(batteryProfiles?.active_battery_profile_id, 'battery.default_2');
});

test('switching controller and battery profiles independently mirrors both active sections', () => {
  const document = {
    ...baseDocument(),
    protocol_profiles: {
      schema_version: 2,
      active_controller_profile_id: 'controller.inmotion',
      active_battery_profile_id: 'battery.b',
      controller_profiles: [
        {
          profile_id: 'controller.acm',
          controller_family: 'ACM',
          controller_revision: '1',
          protocol: {
            pdo_global_param: [{ name: 'acm.speed' }],
            pdo_condition: [],
            pdo_recv: [],
            pdo_send: [],
            sdo_info: { type: 0, children: [] },
          },
        },
        {
          profile_id: 'controller.inmotion',
          controller_family: 'Inmotion',
          controller_revision: '2',
          protocol: {
            pdo_global_param: [{ name: 'inmotion.speed' }],
            pdo_condition: [],
            pdo_recv: [],
            pdo_send: [],
            sdo_info: { type: 0, children: [] },
          },
        },
      ],
      battery_profiles: [
        {
          profile_id: 'battery.a',
          battery_family: 'BMS-A',
          battery_revision: '1',
          protocol: { battery_monitor: { ...baseDocument().battery_monitor } },
        },
        {
          profile_id: 'battery.b',
          battery_family: 'BMS-B',
          battery_revision: '2',
          protocol: {
            battery_monitor: { ...baseDocument().battery_monitor, default_timeout_ticks: 250 },
          },
        },
      ],
    },
  };

  const controllerSwitch = syncProtocolProfileSections(
    document,
    protocolProfileSectionsForSelection(document, 'controller', 'controller.acm'),
  );
  assert.equal(
    (controllerSwitch.protocol_profiles as { active_controller_profile_id: string })
      .active_controller_profile_id,
    'controller.acm',
  );
  assert.equal((controllerSwitch.pdo_global_param as Array<{ name: string }>)[0].name, 'acm.speed');
  assert.equal(
    (controllerSwitch.battery_monitor as { default_timeout_ticks: number }).default_timeout_ticks,
    250,
  );

  const batterySwitch = syncProtocolProfileSections(
    controllerSwitch,
    protocolProfileSectionsForSelection(controllerSwitch, 'battery', 'battery.a'),
  );
  assert.equal(
    (batterySwitch.protocol_profiles as { active_battery_profile_id: string })
      .active_battery_profile_id,
    'battery.a',
  );
  assert.equal((batterySwitch.pdo_global_param as Array<{ name: string }>)[0].name, 'acm.speed');
  assert.equal(
    (batterySwitch.battery_monitor as { default_timeout_ticks: number }).default_timeout_ticks,
    200,
  );
});

test('battery initialization keeps an existing controller registry', () => {
  const controllerOnly = {
    config_version: 'jc002',
    pdo_global_param: [{ name: 'controller.speed' }],
    pdo_condition: [],
    pdo_recv: [],
    pdo_send: [],
    sdo_info: { type: 0, children: [] },
  };
  const initialized = {
    ...controllerOnly,
    ...initializeProtocolProfilesSections(controllerOnly),
  };
  const withBattery = {
    ...initialized,
    ...initializeBatteryProtocolSections(initialized),
  };
  const profiles = readProtocolProfiles(withBattery);
  assert.equal(profiles?.controller_profiles.length, 1);
  assert.equal(profiles?.battery_profiles.length, 1);
  assert.equal(profiles?.active_controller_profile_id, 'controller.default');
  assert.equal(profiles?.active_battery_profile_id, 'battery.default');
});

test('renaming a profile updates its active ID without changing protocol payload', () => {
  const initialized = { ...baseDocument(), ...initializeProtocolProfilesSections(baseDocument()) };
  const before = JSON.stringify(initialized.pdo_global_param);
  const renamed = renameProtocolProfileSections(
    initialized,
    'controller',
    'controller.default',
    'inmotion6',
  );
  assert.equal(renamed.error, undefined);
  const next = syncProtocolProfileSections(initialized, renamed.sections ?? {});
  const profiles = readProtocolProfiles(next);
  assert.equal(profiles?.active_controller_profile_id, 'inmotion6');
  assert.equal(profiles?.controller_profiles[0].profile_id, 'inmotion6');
  assert.equal(JSON.stringify(next.pdo_global_param), before);
});

test('renaming rejects duplicate and overlong profile IDs', () => {
  const document = {
    ...baseDocument(),
    ...initializeProtocolProfilesSections(baseDocument()),
    ...addProtocolProfileSections(
      { ...baseDocument(), ...initializeProtocolProfilesSections(baseDocument()) },
      'controller',
    ),
  };
  assert.equal(
    renameProtocolProfileSections(
      document,
      'controller',
      'controller.default_2',
      'controller.default',
    ).error,
    'duplicate',
  );
  assert.equal(
    renameProtocolProfileSections(document, 'controller', 'controller.default_2', 'x'.repeat(64))
      .error,
    'too_long',
  );
});
