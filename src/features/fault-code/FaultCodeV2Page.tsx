import { Link2, Plus, Search, Trash2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { ConfirmDialogHost } from '../../components/ConfirmDialog';
import {
  localizationForScope,
  updateLocalizationScopeText,
} from '../../components/language/localizationAdapter';
import { ProtocolProfileBar } from '../../components/protocol/ProtocolProfileBar';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import type {
  FaultCodeBinding,
  FaultCodeDefinition,
  FaultCodeInfo,
  FaultCodeSource,
  LoadedProject,
  LocalizationDocument,
} from '../../types/platform';
import {
  activeFaultCodeProtocolProfile,
  readProtocolProfiles,
} from '../protocol-profiles/protocolProfiles';
import {
  bindingCountByDefinition,
  clampCatalogCode,
  createFaultDefinition,
  definitionCountByMessageKey,
  localizationText,
  normalizeFaultCatalog,
  validateFaultCatalog,
} from './faultCodeCatalogModel';
import {
  codeListText,
  hexOrDecimal,
  normalizeSource,
  numberValue,
  parseCodeList,
  sourceKeyFor,
  sourceOptionLabel,
} from './faultCodeModel';

interface FaultCodeV2PageProps {
  loadedProject: LoadedProject;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

type CatalogTab = 'bindings' | 'definitions' | 'sources';

const severityOptions = [
  ['info', '信息'],
  ['warning', '警告'],
  ['fault', '故障'],
  ['critical', '严重'],
] as const;

export function FaultCodeV2Page({ loadedProject, onUpdateSections }: FaultCodeV2PageProps) {
  const document = loadedProject.document as Record<string, unknown>;
  const profiles = readProtocolProfiles(document);
  const activeFaultProfile = activeFaultCodeProtocolProfile(document);
  const faultScope = activeFaultProfile
    ? { kind: 'fault' as const, profileId: activeFaultProfile.profile_id }
    : undefined;
  const catalog = useMemo(
    () =>
      normalizeFaultCatalog(
        document.fault_code_info ?? activeFaultProfile?.protocol.fault_code_info,
      ),
    [activeFaultProfile, document.fault_code_info],
  );
  const localization = document.localization as LocalizationDocument | undefined;
  const effectiveLocalization =
    localization && faultScope
      ? localizationForScope(localization, profiles ?? undefined, faultScope)
      : localization;
  const sources = catalog.sources ?? [];
  const definitions = catalog.definitions ?? [];
  const bindings = catalog.bindings ?? [];
  const [activeTab, setActiveTab] = useState<CatalogTab>('bindings');
  const [query, setQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [locale, setLocale] = useState(
    effectiveLocalization?.default_locale || effectiveLocalization?.locale_order[0] || '',
  );
  const confirmation = useConfirmDialog();
  const messageKeyListId = useId();
  const validation = useMemo(() => validateFaultCatalog(catalog), [catalog]);
  const definitionByKey = useMemo(
    () => new Map(definitions.map((definition) => [definition.fault_key, definition])),
    [definitions],
  );
  const sourceByKey = useMemo(
    () => new Map(sources.map((source) => [sourceKeyFor(source), source])),
    [sources],
  );
  const bindingCounts = useMemo(() => bindingCountByDefinition(bindings), [bindings]);
  const messageCounts = useMemo(() => definitionCountByMessageKey(definitions), [definitions]);
  const messageKeys = useMemo(() => {
    if (!effectiveLocalization) return [];
    const keys = new Set<string>();
    for (const currentLocale of effectiveLocalization.locale_order) {
      for (const key of Object.keys(
        effectiveLocalization.locales[currentLocale]?.translations ?? {},
      )) {
        keys.add(key);
      }
    }
    return [...keys].sort((left, right) => left.localeCompare(right));
  }, [effectiveLocalization]);
  const keyword = query.trim().toLowerCase();

  const filteredBindings = bindings
    .map((binding, index) => ({ binding, index }))
    .filter(({ binding }) => {
      if (sourceFilter !== 'all' && binding.source_key !== sourceFilter) return false;
      if (!keyword) return true;
      const definition = definitionByKey.get(binding.fault_key);
      const text = effectiveLocalization
        ? localizationText(effectiveLocalization, locale, definition?.message_key ?? '')
        : '';
      return `${binding.source_key} ${binding.code} ${binding.fault_key} ${definition?.message_key ?? ''} ${text}`
        .toLowerCase()
        .includes(keyword);
    });
  const filteredDefinitions = definitions
    .map((definition, index) => ({ definition, index }))
    .filter(({ definition }) => {
      if (!keyword) return true;
      const text = effectiveLocalization
        ? localizationText(effectiveLocalization, locale, definition.message_key)
        : '';
      return `${definition.fault_key} ${definition.message_key} ${definition.name ?? ''} ${text}`
        .toLowerCase()
        .includes(keyword);
    });
  const filteredSources = sources
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => {
      if (!keyword) return true;
      return `${sourceKeyFor(source)} ${source.name ?? ''} ${source.type_char} ${source.can_id}`
        .toLowerCase()
        .includes(keyword);
    });

  function updateCatalog(nextCatalog: FaultCodeInfo) {
    onUpdateSections({
      fault_code_info: { ...nextCatalog, schema_version: 2 },
    });
  }

  function updateFaultLocalizationText(key: string, text: string) {
    if (!localization || !faultScope) return;
    const updated = updateLocalizationScopeText(
      localization,
      profiles ?? undefined,
      faultScope,
      locale,
      key,
      text,
    );
    onUpdateSections({
      localization: updated.localization,
      ...(updated.protocolProfiles ? { protocol_profiles: updated.protocolProfiles } : {}),
    });
  }

  function updateSource(index: number, patch: Partial<FaultCodeSource>) {
    const previousKey = sourceKeyFor(sources[index]);
    const nextSource = normalizeSource({ ...sources[index], ...patch });
    const nextKey = sourceKeyFor(nextSource);
    updateCatalog({
      ...catalog,
      sources: sources.map((source, current) => (current === index ? nextSource : source)),
      bindings: bindings.map((binding) =>
        binding.source_key === previousKey ? { ...binding, source_key: nextKey } : binding,
      ),
    });
  }

  function updateDefinition(index: number, patch: Partial<FaultCodeDefinition>) {
    const previousKey = definitions[index].fault_key;
    const nextDefinition = { ...definitions[index], ...patch };
    updateCatalog({
      ...catalog,
      definitions: definitions.map((definition, current) =>
        current === index ? nextDefinition : definition,
      ),
      bindings:
        patch.fault_key === undefined
          ? bindings
          : bindings.map((binding) =>
              binding.fault_key === previousKey
                ? { ...binding, fault_key: String(patch.fault_key).trim() }
                : binding,
            ),
    });
  }

  function updateBinding(index: number, patch: Partial<FaultCodeBinding>) {
    updateCatalog({
      ...catalog,
      bindings: bindings.map((binding, current) =>
        current === index
          ? {
              ...binding,
              ...patch,
              code: patch.code === undefined ? binding.code : clampCatalogCode(patch.code),
            }
          : binding,
      ),
    });
  }

  function addSource() {
    const nextId = Math.max(0, ...sources.map((source) => source.source_id)) + 1;
    updateCatalog({
      ...catalog,
      sources: [
        ...sources,
        normalizeSource({
          source_key: `source_${nextId}`,
          source_id: nextId,
          name: `故障来源 ${nextId}`,
          type_char: 'X',
          can_id: 0,
          frame_type: 0,
          code_byte: 2,
          clear_code: 0,
          invalid_codes: [],
          enabled: true,
        }),
      ],
    });
  }

  function addDefinition() {
    let index = definitions.length;
    let definition = createFaultDefinition(index);
    const used = new Set(definitions.map((item) => item.fault_key));
    while (used.has(definition.fault_key)) {
      index += 1;
      definition = createFaultDefinition(index);
    }
    updateCatalog({ ...catalog, definitions: [...definitions, definition] });
  }

  function addBinding() {
    const sourceKey = sourceFilter !== 'all' ? sourceFilter : sourceKeyFor(sources[0]);
    const usedCodes = new Set(
      bindings.filter((binding) => binding.source_key === sourceKey).map((binding) => binding.code),
    );
    const code = [...Array(256).keys()].find((value) => !usedCodes.has(value)) ?? 0;
    updateCatalog({
      ...catalog,
      bindings: [
        ...bindings,
        {
          source_key: sourceKey,
          code,
          fault_key: definitions[0]?.fault_key ?? '',
          enabled: true,
        },
      ],
    });
  }

  async function removeSource(index: number) {
    const source = sources[index];
    const key = sourceKeyFor(source);
    const count = bindings.filter((binding) => binding.source_key === key).length;
    if (
      !(await confirmation.ask({
        title: '删除故障来源？',
        message: `将删除来源“${source.name || key}”及其 ${count} 条绑定。故障定义和翻译文案会保留。`,
        confirmLabel: '删除来源',
        danger: true,
      }))
    )
      return;
    updateCatalog({
      ...catalog,
      sources: sources.filter((_, current) => current !== index),
      bindings: bindings.filter((binding) => binding.source_key !== key),
    });
  }

  async function removeDefinition(index: number) {
    const definition = definitions[index];
    const count = bindingCounts.get(definition.fault_key) ?? 0;
    if (
      !(await confirmation.ask({
        title: '删除故障定义？',
        message: `将删除“${definition.fault_key}”及其 ${count} 条来源绑定。共享翻译文案不会删除。`,
        confirmLabel: '删除定义',
        danger: true,
      }))
    )
      return;
    updateCatalog({
      ...catalog,
      definitions: definitions.filter((_, current) => current !== index),
      bindings: bindings.filter((binding) => binding.fault_key !== definition.fault_key),
    });
  }

  async function removeBinding(index: number) {
    const binding = bindings[index];
    if (
      !(await confirmation.ask({
        title: '删除故障绑定？',
        message: `将删除 ${binding.source_key} 来源下的故障码 ${binding.code}。故障定义和翻译文案会保留。`,
        confirmLabel: '删除绑定',
        danger: true,
      }))
    )
      return;
    updateCatalog({
      ...catalog,
      bindings: bindings.filter((_, current) => current !== index),
    });
  }

  if (!localization) {
    return (
      <section className="fault-code-page fault-catalog-page">
        <ProtocolProfileBar document={document} onUpdateSections={onUpdateSections} scope="fault" />
        <section className="table-spec-card">
          <h2>故障代码</h2>
          <p>当前 jc002 项目缺少 localization，无法编辑故障文案。</p>
        </section>
      </section>
    );
  }

  const displayLocalization = effectiveLocalization ?? localization;

  return (
    <section className="fault-code-page fault-catalog-page">
      <ProtocolProfileBar document={document} onUpdateSections={onUpdateSections} scope="fault" />
      <section className="table-spec-card fault-catalog-header">
        <div className="fault-code-header">
          <div>
            <h2>故障代码</h2>
            <p>故障身份、来源报码和多语言文案独立管理；多个故障可安全复用同一文案。</p>
          </div>
          <label className="settings-check">
            <input
              checked={catalog.enabled}
              type="checkbox"
              onChange={(event) => updateCatalog({ ...catalog, enabled: event.target.checked })}
            />
            <span>启用</span>
          </label>
        </div>
        <div className="fault-catalog-summary">
          <div>
            <span>来源</span>
            <strong>{sources.length}</strong>
          </div>
          <div>
            <span>故障定义</span>
            <strong>{definitions.length}</strong>
          </div>
          <div>
            <span>报码绑定</span>
            <strong>{bindings.length}</strong>
          </div>
          <div>
            <span>复用文案</span>
            <strong>{[...messageCounts.values()].filter((count) => count > 1).length}</strong>
          </div>
        </div>
        {validation.errors.length ? (
          <div className="fault-code-duplicate-alert">{validation.errors.join('；')}</div>
        ) : null}
      </section>

      <section className="table-spec-card fault-catalog-workspace">
        <div className="fault-catalog-toolbar">
          <div className="fault-catalog-tabs" role="tablist" aria-label="故障配置视图">
            <button
              role="tab"
              aria-selected={activeTab === 'bindings'}
              className={activeTab === 'bindings' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('bindings')}
            >
              报码绑定
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'definitions'}
              className={activeTab === 'definitions' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('definitions')}
            >
              故障定义
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'sources'}
              className={activeTab === 'sources' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('sources')}
            >
              来源规则
            </button>
          </div>
          <div className="fault-catalog-controls">
            {activeTab === 'bindings' ? (
              <select
                aria-label="筛选来源"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
              >
                <option value="all">全部来源</option>
                {sources.map((source) => (
                  <option key={sourceKeyFor(source)} value={sourceKeyFor(source)}>
                    {sourceOptionLabel(source)}
                  </option>
                ))}
              </select>
            ) : null}
            {activeTab === 'definitions' ? (
              <select
                aria-label="编辑语言"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
              >
                {effectiveLocalization?.locale_order.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            ) : null}
            <label className="fault-catalog-search">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label="搜索故障配置"
                type="search"
                placeholder="搜索 Key、报码或文案"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              className="primary"
              type="button"
              onClick={
                activeTab === 'bindings'
                  ? addBinding
                  : activeTab === 'definitions'
                    ? addDefinition
                    : addSource
              }
            >
              <Plus aria-hidden="true" size={15} />
              {activeTab === 'bindings'
                ? '新增绑定'
                : activeTab === 'definitions'
                  ? '新增定义'
                  : '新增来源'}
            </button>
          </div>
        </div>

        {activeTab === 'bindings' ? (
          <div className="config-table-frame">
            <table className="config-table fault-catalog-table">
              <thead>
                <tr>
                  <th>启用</th>
                  <th>来源</th>
                  <th>CAN ID</th>
                  <th>报码</th>
                  <th>故障定义</th>
                  <th>文案 Key</th>
                  <th>{locale} 文案</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredBindings.map(({ binding, index }) => {
                  const definition = definitionByKey.get(binding.fault_key);
                  const invalid =
                    validation.invalidBindings.has(index) ||
                    validation.duplicateBindings.has(index);
                  return (
                    <tr
                      className={invalid ? 'fault-code-duplicate-row' : undefined}
                      key={`${binding.source_key}-${binding.code}-${index}`}
                    >
                      <td>
                        <input
                          aria-label={`${binding.source_key} 故障码 ${binding.code} 启用`}
                          checked={binding.enabled ?? true}
                          type="checkbox"
                          onChange={(event) =>
                            updateBinding(index, { enabled: event.target.checked })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${binding.source_key} 故障码 ${binding.code} 来源`}
                          value={binding.source_key}
                          onChange={(event) =>
                            updateBinding(index, { source_key: event.target.value })
                          }
                        >
                          {sources.map((source) => (
                            <option key={sourceKeyFor(source)} value={sourceKeyFor(source)}>
                              {source.name || sourceKeyFor(source)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="fault-code-readonly-value">
                          {sourceByKey.get(binding.source_key)
                            ? hexOrDecimal(sourceByKey.get(binding.source_key)?.can_id ?? 0)
                            : '-'}
                        </span>
                      </td>
                      <td>
                        <input
                          aria-label={`${binding.source_key} 故障码 ${binding.code} 报码`}
                          min={0}
                          max={255}
                          type="number"
                          value={binding.code}
                          onChange={(event) =>
                            updateBinding(index, { code: numberValue(event.target.value) })
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`${binding.source_key} 故障码 ${binding.code} 故障定义`}
                          value={binding.fault_key}
                          onChange={(event) =>
                            updateBinding(index, { fault_key: event.target.value })
                          }
                        >
                          {definitions.map((item) => (
                            <option key={item.fault_key} value={item.fault_key}>
                              {item.fault_key}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <code>{definition?.message_key || '无效引用'}</code>
                      </td>
                      <td className="fault-catalog-preview">
                        {definition
                          ? localizationText(displayLocalization, locale, definition.message_key) ||
                            '未翻译'
                          : '-'}
                      </td>
                      <td>
                        <button
                          className="icon-button danger"
                          title="删除绑定"
                          type="button"
                          onClick={() => void removeBinding(index)}
                        >
                          <Trash2 aria-hidden="true" size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === 'definitions' ? (
          <div className="config-table-frame">
            <table className="config-table fault-catalog-table">
              <thead>
                <tr>
                  <th>启用</th>
                  <th>故障 Key</th>
                  <th>文案 Key</th>
                  <th>等级</th>
                  <th>{locale} 文案</th>
                  <th>绑定</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredDefinitions.map(({ definition, index }) => (
                  <tr
                    className={
                      validation.duplicateDefinitionKeys.has(index)
                        ? 'fault-code-duplicate-row'
                        : undefined
                    }
                    key={`${definition.fault_key}-${index}`}
                  >
                    <td>
                      <input
                        aria-label={`${definition.fault_key} 启用`}
                        checked={definition.enabled ?? true}
                        type="checkbox"
                        onChange={(event) =>
                          updateDefinition(index, { enabled: event.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${definition.fault_key} 故障 Key`}
                        value={definition.fault_key}
                        onChange={(event) =>
                          updateDefinition(index, { fault_key: event.target.value.trim() })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${definition.fault_key} 文案 Key`}
                        list={messageKeyListId}
                        value={definition.message_key}
                        onChange={(event) =>
                          updateDefinition(index, { message_key: event.target.value.trim() })
                        }
                      />
                    </td>
                    <td>
                      <select
                        aria-label={`${definition.fault_key} 等级`}
                        value={definition.severity ?? 'fault'}
                        onChange={(event) =>
                          updateDefinition(index, { severity: event.target.value })
                        }
                      >
                        {severityOptions.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${definition.fault_key} ${locale} 文案`}
                        value={localizationText(
                          displayLocalization,
                          locale,
                          definition.message_key,
                        )}
                        onChange={(event) =>
                          updateFaultLocalizationText(definition.message_key, event.target.value)
                        }
                      />
                    </td>
                    <td>
                      <span className="fault-catalog-reference">
                        <Link2 aria-hidden="true" size={14} />
                        {bindingCounts.get(definition.fault_key) ?? 0}
                        {(messageCounts.get(definition.message_key) ?? 0) > 1 ? ' · 共享文案' : ''}
                      </span>
                    </td>
                    <td>
                      <button
                        className="icon-button danger"
                        title="删除定义"
                        type="button"
                        onClick={() => void removeDefinition(index)}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <datalist id={messageKeyListId}>
              {messageKeys.map((key) => (
                <option key={key} value={key} />
              ))}
            </datalist>
          </div>
        ) : null}

        {activeTab === 'sources' ? (
          <div className="config-table-frame">
            <table className="config-table fault-catalog-source-table">
              <thead>
                <tr>
                  <th>启用</th>
                  <th>来源 Key</th>
                  <th>名称</th>
                  <th>ID</th>
                  <th>标识</th>
                  <th>CAN ID</th>
                  <th>帧类型</th>
                  <th>取码字节</th>
                  <th>清除码</th>
                  <th>无效码</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSources.map(({ source, index }) => (
                  <tr
                    className={
                      validation.duplicateSourceKeys.has(index)
                        ? 'fault-code-duplicate-row'
                        : undefined
                    }
                    key={`${sourceKeyFor(source)}-${index}`}
                  >
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 来源启用`}
                        checked={source.enabled ?? true}
                        type="checkbox"
                        onChange={(event) => updateSource(index, { enabled: event.target.checked })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 来源 Key`}
                        value={sourceKeyFor(source)}
                        onChange={(event) =>
                          updateSource(index, { source_key: event.target.value.trim() })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 来源名称`}
                        value={source.name ?? ''}
                        onChange={(event) => updateSource(index, { name: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 来源 ID`}
                        min={1}
                        type="number"
                        value={source.source_id}
                        onChange={(event) =>
                          updateSource(index, { source_id: numberValue(event.target.value, 1) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 来源标识`}
                        maxLength={1}
                        value={source.type_char}
                        onChange={(event) =>
                          updateSource(index, {
                            type_char: event.target.value.slice(0, 1).toUpperCase(),
                          })
                        }
                      />
                    </td>
                    <td>
                      <div className="fault-catalog-can-id">
                        <input
                          aria-label={`${sourceKeyFor(source)} CAN ID`}
                          value={source.can_id}
                          onChange={(event) =>
                            updateSource(index, { can_id: numberValue(event.target.value) })
                          }
                        />
                        <small>{hexOrDecimal(source.can_id)}</small>
                      </div>
                    </td>
                    <td>
                      <select
                        aria-label={`${sourceKeyFor(source)} 帧类型`}
                        value={source.frame_type ?? source.type ?? 0}
                        onChange={(event) =>
                          updateSource(index, { frame_type: numberValue(event.target.value) })
                        }
                      >
                        <option value={0}>标准帧</option>
                        <option value={1}>扩展帧</option>
                      </select>
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 取码字节`}
                        min={0}
                        max={7}
                        type="number"
                        value={source.code_byte ?? source.code_offset ?? 2}
                        onChange={(event) =>
                          updateSource(index, { code_byte: numberValue(event.target.value, 2) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 清除码`}
                        min={0}
                        max={255}
                        type="number"
                        value={source.clear_code ?? 0}
                        onChange={(event) =>
                          updateSource(index, { clear_code: numberValue(event.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`${sourceKeyFor(source)} 无效码`}
                        value={codeListText(source.invalid_codes)}
                        onChange={(event) =>
                          updateSource(index, { invalid_codes: parseCodeList(event.target.value) })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button danger"
                        title="删除来源"
                        type="button"
                        onClick={() => void removeSource(index)}
                      >
                        <Trash2 aria-hidden="true" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <ConfirmDialogHost controller={confirmation} />
    </section>
  );
}
