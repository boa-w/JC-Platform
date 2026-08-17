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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeActiveProfileProtocolPatch(
  profiles: unknown,
  activeProfileId: unknown,
  patch: Record<string, unknown>,
) {
  if (!Array.isArray(profiles) || typeof activeProfileId !== 'string') return profiles;
  if (Object.keys(patch).length === 0) return profiles;
  return profiles.map((profile) => {
    if (!isRecord(profile) || profile.profile_id !== activeProfileId) return profile;
    const protocol = isRecord(profile.protocol) ? profile.protocol : {};
    return { ...profile, protocol: { ...protocol, ...patch } };
  });
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
  const batteryProfiles =
    bundle && Array.isArray(bundle.battery_profiles) ? bundle.battery_profiles : [];
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
  const faultProfiles =
    bundle && Array.isArray(bundle.fault_code_profiles) ? bundle.fault_code_profiles : [];
  const activeFaultId =
    bundle && typeof bundle.active_fault_code_profile_id === 'string'
      ? bundle.active_fault_code_profile_id
      : 'fault.default';
  const fault = faultProfiles.find(
    (candidate) =>
      isRecord(candidate) && candidate.profile_id === activeFaultId && isRecord(candidate.protocol),
  );
  const fallbackFault =
    faultProfiles.length === 0 && isRecord(root.fault_code_info)
      ? { profileId: activeFaultId, protocol: { fault_code_info: root.fault_code_info } }
      : null;
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
        : fallbackFault,
  };
}

function mirrorActiveProtocolSections(
  nextDocument: Record<string, unknown>,
): Record<string, unknown> {
  const active = activeProfiles(nextDocument);
  for (const key of [...controllerSectionKeys, ...batterySectionKeys, ...faultCodeSectionKeys]) {
    delete nextDocument[key];
  }
  if (active.controller) Object.assign(nextDocument, active.controller.protocol);
  if (active.battery) Object.assign(nextDocument, active.battery.protocol);
  if (active.fault) Object.assign(nextDocument, active.fault.protocol);
  return nextDocument;
}

export function syncProtocolProfileSections(
  document: unknown,
  sections: Record<string, unknown>,
): Record<string, unknown> {
  const root = isRecord(document) ? document : {};
  if ('protocol_profiles' in sections) {
    const nextDocument = { ...root, ...sections };
    const bundle = isRecord(nextDocument.protocol_profiles) ? nextDocument.protocol_profiles : null;
    if (bundle) {
      const controllerPatch = Object.fromEntries(
        controllerSectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
      );
      const batteryPatch = Object.fromEntries(
        batterySectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
      );
      const faultPatch = Object.fromEntries(
        faultCodeSectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
      );
      nextDocument.protocol_profiles = {
        ...bundle,
        controller_profiles: mergeActiveProfileProtocolPatch(
          bundle.controller_profiles,
          bundle.active_controller_profile_id,
          controllerPatch,
        ),
        battery_profiles: mergeActiveProfileProtocolPatch(
          bundle.battery_profiles,
          bundle.active_battery_profile_id,
          batteryPatch,
        ),
        fault_code_profiles: mergeActiveProfileProtocolPatch(
          bundle.fault_code_profiles,
          bundle.active_fault_code_profile_id,
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
  const controllerPatch = Object.fromEntries(
    controllerSectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
  );
  const batteryPatch = Object.fromEntries(
    batterySectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
  );
  const faultPatch = Object.fromEntries(
    faultCodeSectionKeys.filter((key) => key in sections).map((key) => [key, sections[key]]),
  );
  const nextFaultProfiles =
    faultProfiles.length === 0 && active.fault && Object.keys(faultPatch).length > 0
      ? [
          {
            profile_id: active.fault.profileId,
            fault_family: 'generic',
            fault_revision: '',
            localization_overlay: { locales: {} },
            protocol: { ...active.fault.protocol, ...faultPatch },
          },
        ]
      : faultProfiles.map((profile) =>
          active.fault && isRecord(profile) && profile.profile_id === active.fault.profileId
            ? {
                ...profile,
                protocol: { ...active.fault.protocol, ...faultPatch },
              }
            : profile,
        );
  const nextDocument = {
    ...root,
    ...sections,
    protocol_profiles: {
      ...(bundle ?? {}),
      controller_profiles: controllerProfiles.map((profile) =>
        active.controller && isRecord(profile) && profile.profile_id === active.controller.profileId
          ? {
              ...profile,
              protocol: { ...active.controller.protocol, ...controllerPatch },
            }
          : profile,
      ),
      battery_profiles: batteryProfiles.map((profile) =>
        active.battery && isRecord(profile) && profile.profile_id === active.battery.profileId
          ? {
              ...profile,
              protocol: { ...active.battery.protocol, ...batteryPatch },
            }
          : profile,
      ),
      fault_code_profiles: nextFaultProfiles,
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
  if (!active.fault) {
    for (const key of faultCodeSectionKeys) {
      if (key in sections) mirrored[key] = sections[key];
    }
  }
  return mirrored;
}
