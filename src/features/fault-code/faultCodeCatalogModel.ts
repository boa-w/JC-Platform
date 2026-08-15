import type {
  FaultCodeBinding,
  FaultCodeDefinition,
  FaultCodeInfo,
  FaultCodeSource,
  LocalizationDocument,
} from '../../types/platform';

const sourceTypes: Record<number, string> = {
  1: 'T',
  2: 'P',
  3: 'S',
  4: 'Z',
  5: 'L',
  6: 'V',
};

function sourceKeyFor(source: FaultCodeSource) {
  return source.source_key || `source_${source.source_id}`;
}

function normalizeSource(source: FaultCodeSource): FaultCodeSource {
  return {
    ...source,
    source_key: sourceKeyFor(source),
    type_char: source.type_char || sourceTypes[source.source_id] || 'X',
    name: source.name || sourceKeyFor(source),
    enabled: source.enabled ?? true,
  };
}

export interface FaultCatalogValidation {
  duplicateBindings: Set<number>;
  invalidBindings: Set<number>;
  duplicateDefinitionKeys: Set<number>;
  duplicateSourceKeys: Set<number>;
  errors: string[];
}

export function normalizeFaultCatalog(value: unknown): FaultCodeInfo {
  const root = value && typeof value === 'object' ? (value as Partial<FaultCodeInfo>) : {};
  return {
    schema_version: 2,
    enabled: root.enabled ?? true,
    version: root.version ?? 2,
    sources: (Array.isArray(root.sources) ? root.sources : []).map(normalizeSource),
    definitions: (Array.isArray(root.definitions) ? root.definitions : []).map(normalizeDefinition),
    bindings: (Array.isArray(root.bindings) ? root.bindings : []).map(normalizeBinding),
  };
}

export function normalizeDefinition(value: FaultCodeDefinition): FaultCodeDefinition {
  return {
    ...value,
    fault_key: String(value.fault_key ?? '').trim(),
    message_key: String(value.message_key ?? '').trim(),
    name: String(value.name ?? ''),
    severity: value.severity || 'fault',
    enabled: value.enabled ?? true,
  };
}

export function normalizeBinding(value: FaultCodeBinding): FaultCodeBinding {
  return {
    ...value,
    source_key: String(value.source_key ?? '').trim(),
    code: clampCatalogCode(value.code),
    fault_key: String(value.fault_key ?? '').trim(),
    enabled: value.enabled ?? true,
  };
}

export function clampCatalogCode(value: unknown) {
  const parsed = Number(value);
  return Math.max(0, Math.min(255, Number.isFinite(parsed) ? Math.trunc(parsed) : 0));
}

export function faultKeyForBinding(sourceKey: string, code: number) {
  return `fault.${sourceKey || 'source'}.${String(clampCatalogCode(code)).padStart(3, '0')}`;
}

export function validateFaultCatalog(catalog: FaultCodeInfo): FaultCatalogValidation {
  const sources = catalog.sources ?? [];
  const definitions = catalog.definitions ?? [];
  const bindings = catalog.bindings ?? [];
  const sourceKeys = new Set<string>();
  const definitionKeys = new Set<string>();
  const bindingKeys = new Set<string>();
  const duplicateSourceKeys = new Set<number>();
  const duplicateDefinitionKeys = new Set<number>();
  const duplicateBindings = new Set<number>();
  const invalidBindings = new Set<number>();
  const errors: string[] = [];

  sources.forEach((source, index) => {
    const key = sourceKeyFor(source);
    if (!key || sourceKeys.has(key)) duplicateSourceKeys.add(index);
    else sourceKeys.add(key);
  });
  definitions.forEach((definition, index) => {
    const key = definition.fault_key.trim();
    if (!key || definitionKeys.has(key)) duplicateDefinitionKeys.add(index);
    else definitionKeys.add(key);
    if (!definition.message_key.trim()) {
      errors.push(`故障定义 ${key || index + 1} 缺少 message_key`);
    }
  });
  bindings.forEach((binding, index) => {
    const key = `${binding.source_key}:${clampCatalogCode(binding.code)}`;
    if (bindingKeys.has(key)) duplicateBindings.add(index);
    else bindingKeys.add(key);
    if (!sourceKeys.has(binding.source_key) || !definitionKeys.has(binding.fault_key)) {
      invalidBindings.add(index);
    }
  });

  if (duplicateSourceKeys.size) errors.push('来源 Key 必须唯一且不能为空');
  if (duplicateDefinitionKeys.size) errors.push('故障定义 Key 必须唯一且不能为空');
  if (duplicateBindings.size) errors.push('同一来源下的故障码必须唯一');
  if (invalidBindings.size) errors.push('存在引用了无效来源或故障定义的绑定');
  return {
    duplicateBindings,
    invalidBindings,
    duplicateDefinitionKeys,
    duplicateSourceKeys,
    errors,
  };
}

export function bindingCountByDefinition(bindings: FaultCodeBinding[]) {
  return bindings.reduce((counts, binding) => {
    counts.set(binding.fault_key, (counts.get(binding.fault_key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

export function definitionCountByMessageKey(definitions: FaultCodeDefinition[]) {
  return definitions.reduce((counts, definition) => {
    counts.set(definition.message_key, (counts.get(definition.message_key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
}

export function localizationText(
  localization: LocalizationDocument,
  locale: string,
  messageKey: string,
) {
  const value = localization.locales[locale]?.translations[messageKey];
  return typeof value === 'string' ? value : '';
}

export function updateLocalizationText(
  localization: LocalizationDocument,
  locale: string,
  messageKey: string,
  text: string,
): LocalizationDocument {
  const currentLocale = localization.locales[locale];
  if (!currentLocale || !messageKey.trim()) return localization;
  return {
    ...localization,
    locales: {
      ...localization.locales,
      [locale]: {
        ...currentLocale,
        translations: {
          ...currentLocale.translations,
          [messageKey]: text,
        },
      },
    },
  };
}

export function createFaultDefinition(index: number): FaultCodeDefinition {
  const suffix = String(index + 1).padStart(3, '0');
  return {
    fault_key: `fault.custom.${suffix}`,
    message_key: `fault.message.custom.${suffix}`,
    name: '',
    severity: 'fault',
    enabled: true,
  };
}
