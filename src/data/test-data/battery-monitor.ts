import type { BatteryMonitorProtocol } from '../../types/platform';
import { defaultBatteryMonitor } from '../../features/project-document/projectDocumentDefaults';

export const batteryMonitorTestData: BatteryMonitorProtocol = JSON.parse(
  JSON.stringify(defaultBatteryMonitor),
) as BatteryMonitorProtocol;
