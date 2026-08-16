const controllerSectionKeys = [
  'pdo_global_param',
  'pdo_condition',
  'pdo_recv',
  'pdo_send',
  'sdo_info',
  'canopen',
] as const;
const batterySectionKeys = ['battery_monitor'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activeProfiles(document: unknown): {
  controller: { profileId: string; protocol: Record<string, unknown> } | null;
  battery: { profileId: string; protocol: Record<string, unknown> } | null;
} {
  const root = isRecord(document) ? document : {};
  const bundle = isRecord(root.protocol_profiles) ? root.protocol_profiles : null;
  const controllerProfiles = bundle && Array.isArray(bundle.controller_profiles)
    ? bundle.controller_profiles
    : [];
  const activeControllerId =
    bundle && typeof bundle.active_controller_profile_id === 'string'
      ? bundle.active_controller_profile_id
      : '';
  const controller = controllerProfiles.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.profile_id === activeControllerId &&
      isRecord(candidate.protocol),
  );
  const batteryProfiles = bundle && Array.isArray(bundle.battery_profiles)
    ? bundle.battery_profiles
    : [];
  const activeBatteryId =
    bundle && typeof bundle.active_battery_profile_id === 'string'
      ? bundle.active_battery_profile_id
      : '';
  const battery = batteryProfiles.find(
    (candidate) =>
      isRecord(candidate) &&
      candidate.profile_id === activeBatteryId &&
      isRecord(candidate.protocol),
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
  };
}

function mirrorActiveProtocolSections(
  nextDocument: Record<string, unknown>,
): Record<string, unknown> {
  const active = activeProfiles(nextDocument);
  for (const key of [...controllerSectionKeys, ...batterySectionKeys]) {
    delete nextDocument[key];
  }
  if (active.controller) Object.assign(nextDocument, active.controller.protocol);
  if (active.battery) Object.assign(nextDocument, active.battery.protocol);
  return nextDocument;
}

export function syncProtocolProfileSections(
  document: unknown,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const root = isRecord(document) ? document : {};
  if ('protocol_profiles' in sections) {
    const nextDocument = { ...root, ...sections };
    return mirrorActiveProtocolSections(nextDocument);
  }

  const active = activeProfiles(root);
  if (!active.controller && !active.battery) return { ...root, ...sections };
  const bundle = isRecord(root.protocol_profiles) ? root.protocol_profiles : null;
  const controllerProfiles = bundle && Array.isArray(bundle.controller_profiles)
    ? bundle.controller_profiles
    : [];
  const batteryProfiles = bundle && Array.isArray(bundle.battery_profiles)
    ? bundle.battery_profiles
    : [];
  const controllerPatch = Object.fromEntries(
    controllerSectionKeys
      .filter((key) => key in sections)
      .map((key) => [key, sections[key]]),
  );
  const batteryPatch = Object.fromEntries(
    batterySectionKeys
      .filter((key) => key in sections)
      .map((key) => [key, sections[key]]),
  );
  const nextDocument = {
    ...root,
    ...sections,
    protocol_profiles: {
      ...(bundle ?? {}),
      controller_profiles: controllerProfiles.map((profile) =>
        active.controller &&
        isRecord(profile) &&
        profile.profile_id === active.controller.profileId
          ? {
              ...profile,
              protocol: { ...active.controller.protocol, ...controllerPatch },
            }
          : profile,
      ),
      battery_profiles: batteryProfiles.map((profile) =>
        active.battery &&
        isRecord(profile) &&
        profile.profile_id === active.battery.profileId
          ? {
              ...profile,
              protocol: { ...active.battery.protocol, ...batteryPatch },
            }
          : profile,
      ),
    },
  };
  const mirrored = mirrorActiveProtocolSections(nextDocument);
  if (!active.controller) {
    for (const key of controllerSectionKeys) {
      if (key in sections) mirrored[key] = sections[key];
    }
  }
  if (!active.battery) {
    for (const key of batterySectionKeys) {
      if (key in sections) mirrored[key] = sections[key];
    }
  }
  return mirrored;
}
