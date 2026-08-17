import type { FeatureModule } from '../types/platform';

export const featureModules: FeatureModule[] = [
  {
    key: 'project',
    titleKey: 'navigation.modules.project.title',
    descriptionKey: 'navigation.modules.project.description',
  },
  {
    key: 'setting-data',
    titleKey: 'navigation.modules.settingData.title',
    descriptionKey: 'navigation.modules.settingData.description',
  },
  {
    key: 'realtime-data',
    titleKey: 'navigation.modules.realtimeData.title',
    descriptionKey: 'navigation.modules.realtimeData.description',
  },
  {
    key: 'signal-dictionary',
    titleKey: 'navigation.modules.signalDictionary.title',
    descriptionKey: 'navigation.modules.signalDictionary.description',
    lifecycle: 'deprecated',
    lifecycleReasonKey: 'navigation.modules.signalDictionary.lifecycleReason',
  },
  {
    key: 'private-protocol',
    titleKey: 'navigation.modules.privateProtocol.title',
    descriptionKey: 'navigation.modules.privateProtocol.description',
    lifecycle: 'experimental-deprecated',
    lifecycleReasonKey: 'navigation.modules.privateProtocol.lifecycleReason',
  },
  {
    key: 'protocol-mapping',
    titleKey: 'navigation.modules.protocolMapping.title',
    descriptionKey: 'navigation.modules.protocolMapping.description',
    lifecycle: 'experimental',
    lifecycleReasonKey: 'navigation.modules.protocolMapping.lifecycleReason',
  },
  {
    key: 'canopen-export',
    titleKey: 'navigation.modules.canopenExport.title',
    descriptionKey: 'navigation.modules.canopenExport.description',
    lifecycle: 'experimental',
    lifecycleReasonKey: 'navigation.modules.canopenExport.lifecycleReason',
  },
  {
    key: 'ui',
    titleKey: 'navigation.modules.uiResources.title',
    descriptionKey: 'navigation.modules.uiResources.description',
  },
  {
    key: 'battery-monitor',
    titleKey: 'navigation.modules.batteryMonitor.title',
    descriptionKey: 'navigation.modules.batteryMonitor.description',
  },
  {
    key: 'fault-code',
    titleKey: 'navigation.modules.faultCode.title',
    descriptionKey: 'navigation.modules.faultCode.description',
  },
  {
    key: 'language',
    titleKey: 'navigation.modules.language.title',
    descriptionKey: 'navigation.modules.language.description',
  },
  {
    key: 'can-test-data',
    titleKey: 'navigation.modules.canTestData.title',
    descriptionKey: 'navigation.modules.canTestData.description',
  },
  {
    key: 'export',
    titleKey: 'navigation.modules.export.title',
    descriptionKey: 'navigation.modules.export.description',
  },
  {
    key: 'settings',
    titleKey: 'navigation.modules.settings.title',
    descriptionKey: 'navigation.modules.settings.description',
  },
];
