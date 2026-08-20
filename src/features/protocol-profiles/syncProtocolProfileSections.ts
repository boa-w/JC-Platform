const controllerSectionKeys = [
  'pdo_global_param',
  'pdo_condition',
  'pdo_recv',
  'pdo_send',
  'sdo_info',
  'canopen',
] as const;
const batterySectionKeys = ['battery_monitor'] as const;
const faultCodeSectionKeys = ['fault_code_info'] as const;
const protocolSectionKeys = [
  ...controllerSectionKeys,
  ...batterySectionKeys,
  ...faultCodeSectionKeys,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function profileIdFromBundle(
  bundle: Record<string, unknown> | null,
  collection: string,
  activeKey: string,
): string {
  if (!bundle) return '';
  const profiles = Array.isArray(bundle[collection]) ? bundle[collection] : [];
  const activeId = typeof bundle[activeKey] === 'string' ? bundle[activeKey] : '';
  if (
    activeId &&
    profiles.some((profile) => isRecord(profile) && profile.profile_id === activeId)
  ) {
    return activeId;
  }
  const first = profiles.find(
    (profile) => isRecord(profile) && typeof profile.profile_id === 'string',
  );
  return isRecord(first) ? (first.profile_id as string) : '';
}

function mergeActiveProfileProtocolPatch(
  profiles: unknown,
  activeProfileId: string,
  patch: Record<string, unknown>,
) {
  if (!Array.isArray(profiles) || !activeProfileId || Object.keys(patch).length === 0) {
    return profiles;
  }
  return profiles.map((profile) => {
    if (!isRecord(profile) || profile.profile_id !== activeProfileId) return profile;
    const protocol = isRecord(profile.protocol) ? profile.protocol : {};
    return { ...profile, protocol: { ...protocol, ...patch } };
  });
}

function sectionPatch(
  sections: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    keys.filter((key) => key in sections).map((key) => [key, sections[key]]),
  );
}

function removeProtocolRootSections(document: Record<string, unknown>) {
  for (const key of protocolSectionKeys) delete document[key];
}

/**
 * Update a jc002 document without creating a second root-level protocol view.
 * Root section names are accepted as an in-memory editor patch only; the
 * resulting document stores every protocol value inside its active Profile.
 */
function syncJc002ProtocolProfileSections(
  document: Record<string, unknown>,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const rootBundle = isRecord(document.protocol_profiles) ? document.protocol_profiles : null;
  const suppliedBundle = isRecord(sections.protocol_profiles)
    ? sections.protocol_profiles
    : null;
  const bundle = suppliedBundle ?? rootBundle;
  const nextDocument = { ...document };

  if (!bundle) {
    for (const key of Object.keys(sections)) {
      if (!protocolSectionKeys.includes(key as (typeof protocolSectionKeys)[number])) {
        nextDocument[key] = sections[key];
      }
    }
    removeProtocolRootSections(nextDocument);
    return nextDocument;
  }

  const nextBundle: Record<string, unknown> = { ...bundle };
  const controllerPatch = sectionPatch(sections, controllerSectionKeys);
  const batteryPatch = sectionPatch(sections, batterySectionKeys);
  const faultPatch = sectionPatch(sections, faultCodeSectionKeys);
  nextBundle.controller_profiles = mergeActiveProfileProtocolPatch(
    bundle.controller_profiles,
    profileIdFromBundle(bundle, 'controller_profiles', 'active_controller_profile_id'),
    controllerPatch,
  );
  nextBundle.battery_profiles = mergeActiveProfileProtocolPatch(
    bundle.battery_profiles,
    profileIdFromBundle(bundle, 'battery_profiles', 'active_battery_profile_id'),
    batteryPatch,
  );
  nextBundle.fault_code_profiles = mergeActiveProfileProtocolPatch(
    bundle.fault_code_profiles,
    profileIdFromBundle(bundle, 'fault_code_profiles', 'active_fault_code_profile_id'),
    faultPatch,
  );

  for (const [key, value] of Object.entries(sections)) {
    if (
      key !== 'protocol_profiles' &&
      !protocolSectionKeys.includes(key as (typeof protocolSectionKeys)[number])
    ) {
      nextDocument[key] = value;
    }
  }
  nextDocument.protocol_profiles = nextBundle;
  removeProtocolRootSections(nextDocument);
  return nextDocument;
}

function activeProfiles(document: unknown): {
  controller: { profileId: string; protocol: Record<string, unknown> } | null;
  battery: { profileId: string; protocol: Record<string, unknown> } | null;
  fault: { profileId: string; protocol: Record<string, unknown> } | null;
} {
  const root = isRecord(document) ? document : {};
  const bundle = isRecord(root.protocol_profiles) ? root.protocol_profiles : null;
  const controllerProfiles =
    bundle && Array.isArray(bundle.controller_profiles) ? bundle.controller_profiles : [];
  const activeControllerId = profileIdFromBundle(
    bundle,
    'controller_profiles',
    'active_controller_profile_id',
  );
  const controller = controllerProfiles.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.profile_id === activeControllerId &&
      isRecord(candidate.protocol),
  );
  const batteryProfiles =
    bundle && Array.isArray(bundle.battery_profiles) ? bundle.battery_profiles : [];
  const activeBatteryId = profileIdFromBundle(
    bundle,
    'battery_profiles',
    'active_battery_profile_id',
  );
  const battery = batteryProfiles.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.profile_id === activeBatteryId &&
      isRecord(candidate.protocol),
  );
  const faultProfiles =
    bundle && Array.isArray(bundle.fault_code_profiles) ? bundle.fault_code_profiles : [];
  const activeFaultId = profileIdFromBundle(
    bundle,
    'fault_code_profiles',
    'active_fault_code_profile_id',
  );
  const fault = faultProfiles.find(
    (candidate) =>
      isRecord(candidate) && candidate.profile_id === activeFaultId && isRecord(candidate.protocol),
  );
  return {
    controller:
      isRecord(controller) && isRecord(controller.protocol)
        ? { profileId: activeControllerId, protocol: controller.protocol }
        : null,
    battery:
      isRecord(battery) && isRecord(battery.protocol)
        ? { profileId: activeBatteryId, protocol: battery.protocol }
        : null,
    fault:
      isRecord(fault) && isRecord(fault.protocol)
        ? { profileId: activeFaultId, protocol: fault.protocol }
        : null,
  };
}

function mirrorActiveProtocolSections(
  nextDocument: Record<string, unknown>,
): Record<string, unknown> {
  const active = activeProfiles(nextDocument);
  for (const key of protocolSectionKeys) delete nextDocument[key];
  if (active.controller) Object.assign(nextDocument, active.controller.protocol);
  if (active.battery) Object.assign(nextDocument, active.battery.protocol);
  if (active.fault) Object.assign(nextDocument, active.fault.protocol);
  return nextDocument;
}

/** Preserve the pre-v2 editor projection behavior for jc001 documents. */
function syncLegacyProtocolProfileSections(
  document: unknown,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const root = isRecord(document) ? document : {};
  if ('protocol_profiles' in sections) {
    const nextDocument = { ...root, ...sections };
    const bundle = isRecord(nextDocument.protocol_profiles) ? nextDocument.protocol_profiles : null;
    if (bundle) {
      const controllerPatch = sectionPatch(sections, controllerSectionKeys);
      const batteryPatch = sectionPatch(sections, batterySectionKeys);
      const faultPatch = sectionPatch(sections, faultCodeSectionKeys);
      nextDocument.protocol_profiles = {
        ...bundle,
        controller_profiles: mergeActiveProfileProtocolPatch(
          bundle.controller_profiles,
          profileIdFromBundle(bundle, 'controller_profiles', 'active_controller_profile_id'),
          controllerPatch,
        ),
        battery_profiles: mergeActiveProfileProtocolPatch(
          bundle.battery_profiles,
          profileIdFromBundle(bundle, 'battery_profiles', 'active_battery_profile_id'),
          batteryPatch,
        ),
        fault_code_profiles: mergeActiveProfileProtocolPatch(
          bundle.fault_code_profiles,
          profileIdFromBundle(bundle, 'fault_code_profiles', 'active_fault_code_profile_id'),
          faultPatch,
        ),
      };
    }
    return mirrorActiveProtocolSections(nextDocument);
  }

  const active = activeProfiles(root);
  if (!active.controller && !active.battery && !active.fault) return { ...root, ...sections };
  const bundle = isRecord(root.protocol_profiles) ? root.protocol_profiles : null;
  const controllerProfiles =
    bundle && Array.isArray(bundle.controller_profiles) ? bundle.controller_profiles : [];
  const batteryProfiles =
    bundle && Array.isArray(bundle.battery_profiles) ? bundle.battery_profiles : [];
  const faultProfiles =
    bundle && Array.isArray(bundle.fault_code_profiles) ? bundle.fault_code_profiles : [];
  const controllerPatch = sectionPatch(sections, controllerSectionKeys);
  const batteryPatch = sectionPatch(sections, batterySectionKeys);
  const faultPatch = sectionPatch(sections, faultCodeSectionKeys);
  const nextDocument = {
    ...root,
    ...sections,
    protocol_profiles: {
      ...(bundle ?? {}),
      controller_profiles: controllerProfiles.map((profile) =>
        active.controller && isRecord(profile) && profile.profile_id === active.controller.profileId
          ? { ...profile, protocol: { ...active.controller.protocol, ...controllerPatch } }
          : profile,
      ),
      battery_profiles: batteryProfiles.map((profile) =>
        active.battery && isRecord(profile) && profile.profile_id === active.battery.profileId
          ? { ...profile, protocol: { ...active.battery.protocol, ...batteryPatch } }
          : profile,
      ),
      fault_code_profiles: faultProfiles.map((profile) =>
        active.fault && isRecord(profile) && profile.profile_id === active.fault.profileId
          ? { ...profile, protocol: { ...active.fault.protocol, ...faultPatch } }
          : profile,
      ),
    },
  };
  return mirrorActiveProtocolSections(nextDocument);
}

export function syncProtocolProfileSections(
  document: unknown,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const root = isRecord(document) ? document : {};
  if (root.config_version === 'jc002') {
    return syncJc002ProtocolProfileSections(root, sections);
  }
  return syncLegacyProtocolProfileSections(document, sections);
}
