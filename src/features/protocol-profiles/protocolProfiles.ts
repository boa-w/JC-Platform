import type {
  BatteryMonitorProtocol,
  BatteryProtocolProfile,
  CanOpenProjectDocument,
  ControllerProtocolProfile,
  ControllerProtocolSections,
  FaultCodeInfo,
  FaultCodeProfile,
  LocalizationOverlayDocument,
  ProtocolProfilesDocument,
  SdoNodeDocument,
} from '../../types/platform';
import { defaultBatteryMonitor } from '../project-document/projectDocumentDefaults.ts';

export { syncProtocolProfileSections } from './syncProtocolProfileSections.ts';

export const controllerProtocolSectionKeys = [
  'pdo_global_param',
  'pdo_condition',
  'pdo_recv',
  'pdo_send',
  'sdo_info',
  'canopen',
] as const;

export const batteryProtocolSectionKeys = ['battery_monitor'] as const;

export const faultCodeProtocolSectionKeys = ['fault_code_info'] as const;

export type ProtocolProfileScope = 'controller' | 'battery' | 'fault';

const emptySdoInfo: SdoNodeDocument = {
  type: 0,
  user_auth: 0,
  name_index: 0,
  name: '',
  children: [],
};

const emptyCanopen: CanOpenProjectDocument = {
  schema_version: 1,
  nodes: [],
  pdos: [],
};

function emptyFaultCodeInfo(): FaultCodeInfo {
  return {
    schema_version: 2,
    enabled: false,
    version: 2,
    sources: [],
    definitions: [],
    bindings: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emptyLocalizationOverlay(): LocalizationOverlayDocument {
  return { locales: {} };
}

function faultCodeInfoFromRoot(document: unknown): FaultCodeInfo | undefined {
  const root = isRecord(document) ? document : {};
  return isRecord(root.fault_code_info) ? clone(root.fault_code_info as FaultCodeInfo) : undefined;
}

function localizationOverlayFromProfile(
  value: Record<string, unknown>,
): LocalizationOverlayDocument | undefined {
  return isRecord(value.localization_overlay)
    ? clone(value.localization_overlay as LocalizationOverlayDocument)
    : undefined;
}

function normalizeControllerProtocol(
  value: unknown,
  fallback: Record<string, unknown>,
): ControllerProtocolSections {
  const source = isRecord(value) ? value : {};
  return {
    pdo_global_param: Array.isArray(source.pdo_global_param)
      ? clone(source.pdo_global_param)
      : Array.isArray(fallback.pdo_global_param)
        ? clone(fallback.pdo_global_param)
        : [],
    pdo_condition: Array.isArray(source.pdo_condition)
      ? clone(source.pdo_condition)
      : Array.isArray(fallback.pdo_condition)
        ? clone(fallback.pdo_condition)
        : [],
    pdo_recv: Array.isArray(source.pdo_recv)
      ? clone(source.pdo_recv)
      : Array.isArray(fallback.pdo_recv)
        ? clone(fallback.pdo_recv)
        : [],
    pdo_send: Array.isArray(source.pdo_send)
      ? clone(source.pdo_send)
      : Array.isArray(fallback.pdo_send)
        ? clone(fallback.pdo_send)
        : [],
    sdo_info: isRecord(source.sdo_info)
      ? clone(source.sdo_info as SdoNodeDocument)
      : isRecord(fallback.sdo_info)
        ? clone(fallback.sdo_info as SdoNodeDocument)
        : clone(emptySdoInfo),
    ...(isRecord(source.canopen)
      ? { canopen: clone(source.canopen as unknown as CanOpenProjectDocument) }
      : isRecord(fallback.canopen)
        ? { canopen: clone(fallback.canopen as unknown as CanOpenProjectDocument) }
        : {}),
  };
}

function normalizeBatteryProtocol(value: unknown): BatteryMonitorProtocol | null {
  const source = isRecord(value) ? value.battery_monitor : undefined;
  return isRecord(source) ? clone(source as BatteryMonitorProtocol) : null;
}

function normalizeControllerProfile(value: unknown): ControllerProtocolProfile | null {
  if (!isRecord(value)) return null;
  const profileId = typeof value.profile_id === 'string' ? value.profile_id.trim() : '';
  if (!profileId) return null;
  return {
    profile_id: profileId,
    controller_family:
      typeof value.controller_family === 'string' && value.controller_family.trim()
        ? value.controller_family.trim()
        : 'generic',
    controller_revision:
      typeof value.controller_revision === 'string' ? value.controller_revision.trim() : '',
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(localizationOverlayFromProfile(value)
      ? { localization_overlay: localizationOverlayFromProfile(value) }
      : {}),
    protocol: normalizeControllerProtocol(value.protocol, {}),
  };
}

function normalizeBatteryProfile(value: unknown): BatteryProtocolProfile | null {
  if (!isRecord(value)) return null;
  const profileId = typeof value.profile_id === 'string' ? value.profile_id.trim() : '';
  const batteryMonitor = normalizeBatteryProtocol(value.protocol);
  if (!profileId || !batteryMonitor) return null;
  return {
    profile_id: profileId,
    battery_family:
      typeof value.battery_family === 'string' && value.battery_family.trim()
        ? value.battery_family.trim()
        : 'generic',
    battery_revision:
      typeof value.battery_revision === 'string' ? value.battery_revision.trim() : '',
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(localizationOverlayFromProfile(value)
      ? { localization_overlay: localizationOverlayFromProfile(value) }
      : {}),
    protocol: { battery_monitor: batteryMonitor },
  };
}

function normalizeFaultCodeProfile(value: unknown): FaultCodeProfile | null {
  if (!isRecord(value)) return null;
  const profileId = typeof value.profile_id === 'string' ? value.profile_id.trim() : '';
  const faultCodeInfo = isRecord(value.protocol) ? value.protocol.fault_code_info : undefined;
  if (!profileId || !isRecord(faultCodeInfo)) return null;
  return {
    profile_id: profileId,
    fault_family:
      typeof value.fault_family === 'string' && value.fault_family.trim()
        ? value.fault_family.trim()
        : 'generic',
    fault_revision: typeof value.fault_revision === 'string' ? value.fault_revision.trim() : '',
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(localizationOverlayFromProfile(value)
      ? { localization_overlay: localizationOverlayFromProfile(value) }
      : {}),
    protocol: { fault_code_info: clone(faultCodeInfo as FaultCodeInfo) },
  };
}

export function readProtocolProfiles(document: unknown): ProtocolProfilesDocument | null {
  const root = isRecord(document) ? document : {};
  const value = root.protocol_profiles;
  if (
    !isRecord(value) ||
    value.schema_version !== 2 ||
    !Array.isArray(value.controller_profiles) ||
    !Array.isArray(value.battery_profiles)
  ) {
    return null;
  }

  const controllerProfiles = value.controller_profiles
    .map(normalizeControllerProfile)
    .filter((profile): profile is ControllerProtocolProfile => profile !== null);
  const batteryProfiles = value.battery_profiles
    .map(normalizeBatteryProfile)
    .filter((profile): profile is BatteryProtocolProfile => profile !== null);
  if (
    controllerProfiles.length !== value.controller_profiles.length ||
    batteryProfiles.length !== value.battery_profiles.length ||
    controllerProfiles.length === 0
  ) {
    return null;
  }

  const requestedControllerId =
    typeof value.active_controller_profile_id === 'string'
      ? value.active_controller_profile_id
      : '';
  const activeControllerId = controllerProfiles.some(
    (profile) => profile.profile_id === requestedControllerId,
  )
    ? requestedControllerId
    : controllerProfiles[0].profile_id;
  const requestedBatteryId =
    typeof value.active_battery_profile_id === 'string' ? value.active_battery_profile_id : '';
  const activeBatteryId = batteryProfiles.some(
    (profile) => profile.profile_id === requestedBatteryId,
  )
    ? requestedBatteryId
    : batteryProfiles[0]?.profile_id;

  const rawFaultCodeProfiles = value.fault_code_profiles;
  const hasFaultProfileArray = Array.isArray(rawFaultCodeProfiles);
  const rawFaultCodeProfileList: unknown[] = hasFaultProfileArray ? rawFaultCodeProfiles : [];
  let faultCodeProfiles = rawFaultCodeProfileList
    .map(normalizeFaultCodeProfile)
    .filter((profile): profile is FaultCodeProfile => profile !== null);
  if (hasFaultProfileArray && faultCodeProfiles.length !== rawFaultCodeProfileList.length) {
    return null;
  }
  const requestedFaultCodeId =
    typeof value.active_fault_code_profile_id === 'string'
      ? value.active_fault_code_profile_id
      : '';
  if (!hasFaultProfileArray) {
    const rootFaultCodeInfo = faultCodeInfoFromRoot(document);
    if (rootFaultCodeInfo) {
      faultCodeProfiles = [
        {
          profile_id: 'fault.default',
          fault_family: 'generic',
          fault_revision: '',
          localization_overlay: emptyLocalizationOverlay(),
          protocol: { fault_code_info: rootFaultCodeInfo },
        },
      ];
    }
  }
  const activeFaultCodeId = faultCodeProfiles.some(
    (profile) => profile.profile_id === requestedFaultCodeId,
  )
    ? requestedFaultCodeId
    : faultCodeProfiles[0]?.profile_id;

  return {
    schema_version: 2,
    active_controller_profile_id: activeControllerId,
    ...(activeBatteryId ? { active_battery_profile_id: activeBatteryId } : {}),
    ...(activeFaultCodeId ? { active_fault_code_profile_id: activeFaultCodeId } : {}),
    controller_profiles: controllerProfiles,
    battery_profiles: batteryProfiles,
    fault_code_profiles: faultCodeProfiles,
  };
}

export function activeControllerProtocolProfile(
  document: unknown,
): ControllerProtocolProfile | null {
  const profiles = readProtocolProfiles(document);
  if (!profiles) return null;
  return (
    profiles.controller_profiles.find(
      (profile) => profile.profile_id === profiles.active_controller_profile_id,
    ) ??
    profiles.controller_profiles[0] ??
    null
  );
}

export function activeBatteryProtocolProfile(document: unknown): BatteryProtocolProfile | null {
  const profiles = readProtocolProfiles(document);
  if (!profiles?.active_battery_profile_id) return null;
  return (
    profiles.battery_profiles.find(
      (profile) => profile.profile_id === profiles.active_battery_profile_id,
    ) ?? null
  );
}

export function activeFaultCodeProtocolProfile(document: unknown): FaultCodeProfile | null {
  const profiles = readProtocolProfiles(document);
  if (!profiles?.active_fault_code_profile_id) return null;
  return (
    profiles.fault_code_profiles.find(
      (profile) => profile.profile_id === profiles.active_fault_code_profile_id,
    ) ?? null
  );
}

function controllerProtocolFromRoot(document: unknown): ControllerProtocolSections {
  const root = isRecord(document) ? document : {};
  return normalizeControllerProtocol(root, root);
}

function batteryProtocolFromRoot(document: unknown): BatteryMonitorProtocol | null {
  const root = isRecord(document) ? document : {};
  return isRecord(root.battery_monitor)
    ? clone(root.battery_monitor as BatteryMonitorProtocol)
    : null;
}

function faultCodeProtocolFromRoot(document: unknown): FaultCodeInfo {
  return faultCodeInfoFromRoot(document) ?? emptyFaultCodeInfo();
}

export function createProtocolProfilesDocument(document: unknown): ProtocolProfilesDocument {
  const batteryMonitor = batteryProtocolFromRoot(document);
  const batteryProfile = batteryMonitor
    ? {
        profile_id: 'battery.default',
        battery_family: 'generic',
        battery_revision: '',
        protocol: { battery_monitor: batteryMonitor },
      }
    : null;
  const faultCodeProfile = faultCodeInfoFromRoot(document)
    ? {
        profile_id: 'fault.default',
        fault_family: 'generic',
        fault_revision: '',
        localization_overlay: emptyLocalizationOverlay(),
        protocol: { fault_code_info: faultCodeProtocolFromRoot(document) },
      }
    : null;
  return {
    schema_version: 2,
    active_controller_profile_id: 'controller.default',
    ...(batteryProfile ? { active_battery_profile_id: batteryProfile.profile_id } : {}),
    ...(faultCodeProfile ? { active_fault_code_profile_id: faultCodeProfile.profile_id } : {}),
    controller_profiles: [
      {
        profile_id: 'controller.default',
        controller_family: 'generic',
        controller_revision: '',
        localization_overlay: emptyLocalizationOverlay(),
        protocol: controllerProtocolFromRoot(document),
      },
    ],
    battery_profiles: batteryProfile ? [batteryProfile] : [],
    fault_code_profiles: faultCodeProfile ? [faultCodeProfile] : [],
  };
}

function normalizedProfiles(document: unknown): ProtocolProfilesDocument {
  return readProtocolProfiles(document) ?? createProtocolProfilesDocument(document);
}

function activeProtocolSections(profiles: ProtocolProfilesDocument): Record<string, unknown> {
  const controller =
    profiles.controller_profiles.find(
      (profile) => profile.profile_id === profiles.active_controller_profile_id,
    ) ?? profiles.controller_profiles[0];
  const battery = profiles.active_battery_profile_id
    ? profiles.battery_profiles.find(
        (profile) => profile.profile_id === profiles.active_battery_profile_id,
      )
    : undefined;
  const fault = profiles.active_fault_code_profile_id
    ? profiles.fault_code_profiles.find(
        (profile) => profile.profile_id === profiles.active_fault_code_profile_id,
      )
    : undefined;
  return {
    ...(controller ? clone(controller.protocol) : {}),
    ...(battery ? clone(battery.protocol) : {}),
    ...(fault ? clone(fault.protocol) : {}),
  };
}

export function protocolProfileSectionsForSelection(
  document: unknown,
  scope: ProtocolProfileScope,
  profileId: string,
): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  const selected =
    scope === 'controller'
      ? profiles.controller_profiles.some((profile) => profile.profile_id === profileId)
      : scope === 'battery'
        ? profiles.battery_profiles.some((profile) => profile.profile_id === profileId)
        : profiles.fault_code_profiles.some((profile) => profile.profile_id === profileId);
  if (!selected) return {};
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    ...(scope === 'controller'
      ? { active_controller_profile_id: profileId }
      : scope === 'battery'
        ? { active_battery_profile_id: profileId }
        : { active_fault_code_profile_id: profileId }),
  };
  return {
    protocol_profiles: nextProfiles,
    ...activeProtocolSections(nextProfiles),
  };
}

export function initializeProtocolProfilesSections(document: unknown): Record<string, unknown> {
  const profiles = createProtocolProfilesDocument(document);
  return { protocol_profiles: profiles, ...activeProtocolSections(profiles) };
}

export function initializeControllerProtocolSections(document: unknown): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  return { protocol_profiles: profiles, ...activeProtocolSections(profiles) };
}

export function initializeBatteryProtocolSections(document: unknown): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  if (profiles.battery_profiles.length > 0) {
    return { protocol_profiles: profiles, ...activeProtocolSections(profiles) };
  }
  const batteryProfile: BatteryProtocolProfile = {
    profile_id: 'battery.default',
    battery_family: 'generic',
    battery_revision: '',
    localization_overlay: emptyLocalizationOverlay(),
    protocol: {
      battery_monitor: batteryProtocolFromRoot(document) ?? clone(defaultBatteryMonitor),
    },
  };
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    active_battery_profile_id: batteryProfile.profile_id,
    battery_profiles: [batteryProfile],
  };
  return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
}

export function initializeFaultCodeProtocolSections(document: unknown): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  if (profiles.fault_code_profiles.length > 0) {
    return { protocol_profiles: profiles, ...activeProtocolSections(profiles) };
  }
  const faultProfile: FaultCodeProfile = {
    profile_id: 'fault.default',
    fault_family: 'generic',
    fault_revision: '',
    localization_overlay: emptyLocalizationOverlay(),
    protocol: { fault_code_info: faultCodeProtocolFromRoot(document) },
  };
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    active_fault_code_profile_id: faultProfile.profile_id,
    fault_code_profiles: [faultProfile],
  };
  return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
}

function nextProfileId(ids: string[], baseId: string): string {
  const used = new Set(ids);
  let suffix = 2;
  let profileId = `${baseId}_${suffix}`;
  while (used.has(profileId)) profileId = `${baseId}_${++suffix}`;
  return profileId;
}

function availableProfileId(ids: string[], baseId: string): string {
  return ids.includes(baseId) ? nextProfileId(ids, baseId) : baseId;
}

/** Create an independent blank profile; protocol payload is never copied from the active profile. */
export function createNewProtocolProfileSections(
  document: unknown,
  scope: ProtocolProfileScope,
): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  if (scope === 'controller') {
    const profileId = availableProfileId(
      profiles.controller_profiles.map((profile) => profile.profile_id),
      'controller.new',
    );
    const nextProfile: ControllerProtocolProfile = {
      profile_id: profileId,
      controller_family: 'generic',
      controller_revision: '',
      localization_overlay: emptyLocalizationOverlay(),
      protocol: {
        pdo_global_param: [],
        pdo_condition: [],
        pdo_recv: [],
        pdo_send: [],
        sdo_info: clone(emptySdoInfo),
        canopen: clone(emptyCanopen),
      },
    };
    const nextProfiles: ProtocolProfilesDocument = {
      ...profiles,
      active_controller_profile_id: profileId,
      controller_profiles: [...profiles.controller_profiles, nextProfile],
    };
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  if (scope === 'fault') {
    const profileId = availableProfileId(
      profiles.fault_code_profiles.map((profile) => profile.profile_id),
      'fault.new',
    );
    const nextProfile: FaultCodeProfile = {
      profile_id: profileId,
      fault_family: 'generic',
      fault_revision: '',
      localization_overlay: emptyLocalizationOverlay(),
      protocol: { fault_code_info: emptyFaultCodeInfo() },
    };
    const nextProfiles: ProtocolProfilesDocument = {
      ...profiles,
      active_fault_code_profile_id: profileId,
      fault_code_profiles: [...profiles.fault_code_profiles, nextProfile],
    };
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  const profileId = availableProfileId(
    profiles.battery_profiles.map((profile) => profile.profile_id),
    'battery.new',
  );
  const nextProfile: BatteryProtocolProfile = {
    profile_id: profileId,
    battery_family: 'generic',
    battery_revision: '',
    localization_overlay: emptyLocalizationOverlay(),
    protocol: { battery_monitor: clone(defaultBatteryMonitor) },
  };
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    active_battery_profile_id: profileId,
    battery_profiles: [...profiles.battery_profiles, nextProfile],
  };
  return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
}

/** Clone the active profile, preserving its protocol payload as a starting point. */
export function addProtocolProfileSections(
  document: unknown,
  scope: ProtocolProfileScope,
): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  if (scope === 'controller') {
    const current = activeControllerProtocolProfile(document) ?? profiles.controller_profiles[0];
    if (!current) return {};
    const profileId = nextProfileId(
      profiles.controller_profiles.map((profile) => profile.profile_id),
      current.profile_id,
    );
    const nextProfile: ControllerProtocolProfile = {
      ...clone(current),
      profile_id: profileId,
      description: current.description ? `${current.description} copy` : undefined,
    };
    const nextProfiles: ProtocolProfilesDocument = {
      ...profiles,
      active_controller_profile_id: profileId,
      controller_profiles: [...profiles.controller_profiles, nextProfile],
    };
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  if (scope === 'fault') {
    const current = activeFaultCodeProtocolProfile(document);
    if (!current) return initializeFaultCodeProtocolSections(document);
    const profileId = nextProfileId(
      profiles.fault_code_profiles.map((profile) => profile.profile_id),
      current.profile_id,
    );
    const nextProfile: FaultCodeProfile = {
      ...clone(current),
      profile_id: profileId,
      description: current.description ? `${current.description} copy` : undefined,
    };
    const nextProfiles: ProtocolProfilesDocument = {
      ...profiles,
      active_fault_code_profile_id: profileId,
      fault_code_profiles: [...profiles.fault_code_profiles, nextProfile],
    };
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  const current = activeBatteryProtocolProfile(document);
  if (!current) return initializeBatteryProtocolSections(document);
  const profileId = nextProfileId(
    profiles.battery_profiles.map((profile) => profile.profile_id),
    current.profile_id,
  );
  const nextProfile: BatteryProtocolProfile = {
    ...clone(current),
    profile_id: profileId,
    description: current.description ? `${current.description} copy` : undefined,
  };
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    active_battery_profile_id: profileId,
    battery_profiles: [...profiles.battery_profiles, nextProfile],
  };
  return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
}

export function updateProtocolProfileMetadataSections(
  document: unknown,
  scope: ProtocolProfileScope,
  profileId: string,
  patch: Record<string, string>,
): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    controller_profiles:
      scope === 'controller'
        ? profiles.controller_profiles.map((profile) =>
            profile.profile_id === profileId ? { ...profile, ...patch } : profile,
          )
        : profiles.controller_profiles,
    battery_profiles:
      scope === 'battery'
        ? profiles.battery_profiles.map((profile) =>
            profile.profile_id === profileId ? { ...profile, ...patch } : profile,
          )
        : profiles.battery_profiles,
    fault_code_profiles:
      scope === 'fault'
        ? profiles.fault_code_profiles.map((profile) =>
            profile.profile_id === profileId ? { ...profile, ...patch } : profile,
          )
        : profiles.fault_code_profiles,
  };
  return { protocol_profiles: nextProfiles };
}

export type ProtocolProfileIdError = 'empty' | 'too_long' | 'duplicate';

export interface ProtocolProfileIdUpdateResult {
  sections?: Record<string, unknown>;
  error?: ProtocolProfileIdError;
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Rename the selected profile without changing the protocol payload. */
export function renameProtocolProfileSections(
  document: unknown,
  scope: ProtocolProfileScope,
  profileId: string,
  nextProfileIdValue: string,
): ProtocolProfileIdUpdateResult {
  const nextProfileIdValueTrimmed = nextProfileIdValue.trim();
  if (!nextProfileIdValueTrimmed) return { error: 'empty' };
  if (utf8ByteLength(nextProfileIdValueTrimmed) > 63) return { error: 'too_long' };

  const profiles = normalizedProfiles(document);
  const collection =
    scope === 'controller'
      ? profiles.controller_profiles
      : scope === 'battery'
        ? profiles.battery_profiles
        : profiles.fault_code_profiles;
  if (
    collection.some(
      (profile) =>
        profile.profile_id !== profileId && profile.profile_id === nextProfileIdValueTrimmed,
    )
  ) {
    return { error: 'duplicate' };
  }

  const nextProfiles: ProtocolProfilesDocument =
    scope === 'controller'
      ? {
          ...profiles,
          active_controller_profile_id:
            profiles.active_controller_profile_id === profileId
              ? nextProfileIdValueTrimmed
              : profiles.active_controller_profile_id,
          controller_profiles: profiles.controller_profiles.map((profile) =>
            profile.profile_id === profileId
              ? { ...profile, profile_id: nextProfileIdValueTrimmed }
              : profile,
          ),
        }
      : scope === 'battery'
        ? {
            ...profiles,
            ...(profiles.active_battery_profile_id === profileId
              ? { active_battery_profile_id: nextProfileIdValueTrimmed }
              : {}),
            battery_profiles: profiles.battery_profiles.map((profile) =>
              profile.profile_id === profileId
                ? { ...profile, profile_id: nextProfileIdValueTrimmed }
                : profile,
            ),
          }
        : {
            ...profiles,
            ...(profiles.active_fault_code_profile_id === profileId
              ? { active_fault_code_profile_id: nextProfileIdValueTrimmed }
              : {}),
            fault_code_profiles: profiles.fault_code_profiles.map((profile) =>
              profile.profile_id === profileId
                ? { ...profile, profile_id: nextProfileIdValueTrimmed }
                : profile,
            ),
          };

  return { sections: { protocol_profiles: nextProfiles } };
}

export function removeProtocolProfileSections(
  document: unknown,
  scope: ProtocolProfileScope,
  profileId: string,
): Record<string, unknown> {
  const profiles = normalizedProfiles(document);
  if (scope === 'controller') {
    if (profiles.controller_profiles.length <= 1) return {};
    const remaining = profiles.controller_profiles.filter(
      (profile) => profile.profile_id !== profileId,
    );
    if (remaining.length === profiles.controller_profiles.length) return {};
    const nextActive =
      profiles.active_controller_profile_id === profileId
        ? remaining[0].profile_id
        : profiles.active_controller_profile_id;
    const nextProfiles = {
      ...profiles,
      active_controller_profile_id: nextActive,
      controller_profiles: remaining,
    };
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  if (scope === 'fault') {
    const remaining = profiles.fault_code_profiles.filter(
      (profile) => profile.profile_id !== profileId,
    );
    if (remaining.length === profiles.fault_code_profiles.length) return {};
    const nextActive =
      profiles.active_fault_code_profile_id === profileId
        ? remaining[0]?.profile_id
        : profiles.active_fault_code_profile_id;
    const nextProfiles: ProtocolProfilesDocument = {
      ...profiles,
      ...(nextActive ? { active_fault_code_profile_id: nextActive } : {}),
      fault_code_profiles: remaining,
    };
    if (!nextActive) delete nextProfiles.active_fault_code_profile_id;
    return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
  }

  const remaining = profiles.battery_profiles.filter((profile) => profile.profile_id !== profileId);
  if (remaining.length === profiles.battery_profiles.length) return {};
  const nextActive =
    profiles.active_battery_profile_id === profileId
      ? remaining[0]?.profile_id
      : profiles.active_battery_profile_id;
  const nextProfiles: ProtocolProfilesDocument = {
    ...profiles,
    ...(nextActive ? { active_battery_profile_id: nextActive } : {}),
    battery_profiles: remaining,
  };
  if (!nextActive) delete nextProfiles.active_battery_profile_id;
  return { protocol_profiles: nextProfiles, ...activeProtocolSections(nextProfiles) };
}

export function materializeActiveProtocolProfiles(document: unknown): Record<string, unknown> {
  const root = isRecord(document) ? clone(document) : {};
  const profiles = readProtocolProfiles(document);
  if (!profiles) return root;
  delete root.protocol_profiles;
  for (const key of [
    ...controllerProtocolSectionKeys,
    ...batteryProtocolSectionKeys,
    ...faultCodeProtocolSectionKeys,
  ]) {
    delete root[key];
  }
  Object.assign(root, activeProtocolSections(profiles));
  return root;
}
