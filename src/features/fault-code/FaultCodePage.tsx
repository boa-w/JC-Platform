import { open, save } from '@tauri-apps/plugin-dialog';
import { useState } from 'react';
import { loadTextFile, saveTextFile } from '../../api/commands';
import type {
  FaultCodeInfo,
  FaultCodeItem,
  FaultCodeSource,
  LanguageDocument,
  LoadedProject,
} from '../../types/platform';
import {
  csvToFaultCodes,
  csvToFaultSources,
  faultCodesToCsv,
  faultSourcesToCsv,
} from '../../utils/faultCodeCsv';

interface FaultCodePageProps {
  loadedProject: LoadedProject | null;
  onUpdateSections: (sections: Record<string, unknown>) => void;
}

const sourceLabels: Record<number, string> = {
  1: 'T 牵引',
  2: 'P 油泵',
  3: 'S 转向',
  4: 'Z 助力转向',
  5: 'L 锂电池',
  6: 'V VCU',
};

const typeChars: Record<number, string> = {
  1: 'T',
  2: 'P',
  3: 'S',
  4: 'Z',
  5: 'L',
  6: 'V',
};

const severityOptions = [
  { value: 'info', label: '信息' },
  { value: 'warning', label: '警告' },
  { value: 'fault', label: '故障' },
  { value: 'critical', label: '严重' },
];

const isTauriRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

function defaultFaultCodeInfo(): FaultCodeInfo {
  return {
    enabled: true,
    version: 1,
    sources: [
      {
        source_id: 1,
        type_char: 'T',
        can_id: 648,
        frame_type: 0,
        code_byte: 2,
        clear_code: 0,
        invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      },
      {
        source_id: 2,
        type_char: 'P',
        can_id: 660,
        frame_type: 0,
        code_byte: 2,
        clear_code: 0,
        invalid_codes: [1, 5, 15, 17, 25, 29, 31, 35, 218, 219, 220, 221, 222],
      },
    ],
    codes: [],
  };
}

function defaultLanguageDocument(): LanguageDocument {
  return {
    list_code_language: ['zh', 'en'],
    language_labels: { zh: '中文', en: '英文' },
    list_inner: ['中文', '英文'],
    list_translate: {},
  };
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hexOrDecimal(value: number) {
  return `0x${value.toString(16).toUpperCase()}`;
}

function parseCodeList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      item.startsWith('0x') || item.startsWith('0X') ? Number.parseInt(item, 16) : Number(item),
    )
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.max(0, Math.min(255, Math.trunc(item))));
}

function codeListText(values: number[] | undefined) {
  return (values ?? []).join(', ');
}

function normalizeFaultDocument(value: unknown): FaultCodeInfo {
  const root = typeof value === 'object' && value !== null ? (value as Partial<FaultCodeInfo>) : {};
  const fallback = defaultFaultCodeInfo();
  return {
    enabled: root.enabled ?? fallback.enabled,
    version: root.version ?? fallback.version,
    sources: Array.isArray(root.sources) ? root.sources : fallback.sources,
    codes: Array.isArray(root.codes) ? root.codes : fallback.codes,
  };
}

function messageKeyFor(item: Pick<FaultCodeItem, 'type_char' | 'source_id' | 'code'>) {
  const type = item.type_char || typeChars[item.source_id ?? 0] || 'X';
  return `fault.${type.toLowerCase()}.${String(item.code).padStart(3, '0')}`;
}

function ensureLanguageEntry(
  language: LanguageDocument,
  key: string,
  zhText = '',
): LanguageDocument {
  if (!key.trim()) return language;
  const listInner = language.list_inner.includes(key)
    ? language.list_inner
    : [...language.list_inner, key];
  const existing = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
  const nextValues = Object.fromEntries(
    language.list_code_language.map((code) => [
      code,
      existing[code] ?? (code === 'zh' ? zhText : ''),
    ]),
  );
  return {
    ...language,
    list_inner: listInner,
    list_translate: {
      ...language.list_translate,
      [key]: nextValues,
    },
  };
}

function languageText(language: LanguageDocument, key: string) {
  return (language.list_translate[key] as Record<string, string> | undefined)?.zh ?? '';
}

function sourceCanIdForCode(item: FaultCodeItem, sources: FaultCodeSource[]): number | null {
  const sourceId = item.source_id ?? 1;
  const source = sources.find((candidate) => candidate.source_id === sourceId);
  return typeof source?.can_id === 'number' && Number.isFinite(source.can_id)
    ? source.can_id
    : null;
}

function buildDuplicateFaultCodeHints(sources: FaultCodeSource[], codes: FaultCodeItem[]) {
  const groups = new Map<string, { canId: number; code: number; indexes: number[] }>();

  codes.forEach((item, index) => {
    const canId = sourceCanIdForCode(item, sources);
    if (canId === null || !Number.isFinite(item.code)) return;
    const code = Math.max(0, Math.min(255, Math.trunc(item.code)));
    const key = `${canId}:${code}`;
    const group = groups.get(key) ?? { canId, code, indexes: [] };
    group.indexes.push(index);
    groups.set(key, group);
  });

  const duplicateIndexes = new Set<number>();
  const messages: string[] = [];

  for (const group of groups.values()) {
    if (group.indexes.length <= 1) continue;
    for (const index of group.indexes) duplicateIndexes.add(index);
    messages.push(
      `${hexOrDecimal(group.canId)} 下故障码 ${group.code} 重复 ${group.indexes.length} 次`,
    );
  }

  return { duplicateIndexes, messages };
}

export function FaultCodePage({ loadedProject, onUpdateSections }: FaultCodePageProps) {
  const [csvStatus, setCsvStatus] = useState<string | null>(null);
  const [isCsvBusy, setIsCsvBusy] = useState(false);
  const document = (loadedProject?.document as Record<string, unknown> | undefined) ?? {};
  const faultCode = normalizeFaultDocument(document.fault_code_info);
  const language =
    (document.language_info as LanguageDocument | undefined) ?? defaultLanguageDocument();
  const sources = faultCode.sources ?? [];
  const codes = faultCode.codes ?? [];
  const duplicateFaultCodes = buildDuplicateFaultCodeHints(sources, codes);

  function updateFaultCode(next: FaultCodeInfo, nextLanguage = language) {
    onUpdateSections({
      fault_code_info: next,
      language_info: nextLanguage,
    });
  }

  function updateRoot(field: keyof FaultCodeInfo, value: unknown) {
    updateFaultCode({ ...faultCode, [field]: value });
  }

  function updateSource(index: number, patch: Partial<FaultCodeSource>) {
    const nextSources = sources.map((source, currentIndex) => {
      if (currentIndex !== index) return source;
      const next = { ...source, ...patch };
      if (patch.source_id !== undefined && patch.type_char === undefined) {
        next.type_char = typeChars[patch.source_id] ?? next.type_char;
      }
      return next;
    });
    updateFaultCode({ ...faultCode, sources: nextSources });
  }

  function addSource() {
    const sourceId = 1;
    updateFaultCode({
      ...faultCode,
      sources: [
        ...sources,
        {
          source_id: sourceId,
          type_char: typeChars[sourceId],
          can_id: 0,
          frame_type: 0,
          code_byte: 2,
          clear_code: 0,
          invalid_codes: [],
        },
      ],
    });
  }

  function removeSource(index: number) {
    updateFaultCode({
      ...faultCode,
      sources: sources.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  function updateCode(index: number, patch: Partial<FaultCodeItem>) {
    let nextLanguage = language;
    const nextCodes = codes.map((item, currentIndex) => {
      if (currentIndex !== index) return item;
      const next = { ...item, ...patch };
      if (patch.source_id !== undefined && patch.type_char === undefined) {
        next.type_char = typeChars[patch.source_id] ?? next.type_char;
      }
      if (!next.message_key) {
        next.message_key = messageKeyFor(next);
      }
      nextLanguage = ensureLanguageEntry(nextLanguage, next.message_key, next.name ?? '');
      return next;
    });
    updateFaultCode({ ...faultCode, codes: nextCodes }, nextLanguage);
  }

  function updateCodeText(index: number, text: string) {
    const item = codes[index];
    if (!item) return;
    const key = item.message_key || item.name_key || messageKeyFor(item);
    const values = (language.list_translate[key] as Record<string, string> | undefined) ?? {};
    const nextLanguage = ensureLanguageEntry(
      {
        ...language,
        list_translate: {
          ...language.list_translate,
          [key]: { ...values, zh: text },
        },
      },
      key,
      text,
    );
    onUpdateSections({
      fault_code_info: {
        ...faultCode,
        codes: codes.map((code, currentIndex) =>
          currentIndex === index ? { ...code, message_key: key, name: text } : code,
        ),
      },
      language_info: nextLanguage,
    });
  }

  function addCode() {
    const sourceId = sources[0]?.source_id ?? 1;
    const item: FaultCodeItem = {
      source_id: sourceId,
      type_char: typeChars[sourceId] ?? sources[0]?.type_char ?? 'T',
      code: 1,
      severity: 'fault',
      enabled: true,
    };
    item.message_key = messageKeyFor(item);
    const nextLanguage = ensureLanguageEntry(language, item.message_key, '新故障');
    updateFaultCode({ ...faultCode, codes: [...codes, { ...item, name: '新故障' }] }, nextLanguage);
  }

  function removeCode(index: number) {
    updateFaultCode({
      ...faultCode,
      codes: codes.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function exportSourcesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await save({
      filters: [{ name: '故障来源 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsCsvBusy(true);
    try {
      await saveTextFile(selected, `\uFEFF${faultSourcesToCsv(sources)}`);
      setCsvStatus(`来源规则 CSV 已导出：${selected}`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function importSourcesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: '故障来源 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsCsvBusy(true);
    try {
      const text = await loadTextFile(selected);
      const { sources: nextSources, errors } = csvToFaultSources(text);
      if (errors.length > 0) {
        setCsvStatus(`导入来源规则 CSV 出错：${errors.join('；')}`);
        return;
      }
      updateFaultCode({ ...faultCode, sources: nextSources });
      setCsvStatus(`已导入 ${nextSources.length} 条来源规则`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function exportCodesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统保存对话框只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await save({
      filters: [{ name: '故障码 CSV', extensions: ['csv'] }],
    });
    if (!selected) return;

    setIsCsvBusy(true);
    try {
      await saveTextFile(selected, `\uFEFF${faultCodesToCsv(codes, language)}`);
      setCsvStatus(`故障码 CSV 已导出：${selected}`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  async function importCodesCsv() {
    setCsvStatus(null);
    if (!isTauriRuntime()) {
      setCsvStatus('系统文件选择器只能在 Tauri 桌面应用中使用。');
      return;
    }
    const selected = await open({
      multiple: false,
      filters: [{ name: '故障码 CSV', extensions: ['csv'] }],
    });
    if (typeof selected !== 'string') return;

    setIsCsvBusy(true);
    try {
      const text = await loadTextFile(selected);
      const { codes: nextCodes, language: nextLanguage, errors } = csvToFaultCodes(text, language);
      if (errors.length > 0) {
        setCsvStatus(`导入故障码 CSV 出错：${errors.join('；')}`);
        return;
      }
      updateFaultCode({ ...faultCode, codes: nextCodes }, nextLanguage);
      setCsvStatus(`已导入 ${nextCodes.length} 条故障码，并同步多语言文案`);
    } catch (error) {
      setCsvStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCsvBusy(false);
    }
  }

  if (!loadedProject) {
    return (
      <section className="table-spec-card">
        <div>
          <h2>故障代码</h2>
          <p>打开项目后可编辑故障来源帧、故障码和多语言文案绑定。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="fault-code-page">
      <section className="table-spec-card">
        <div className="fault-code-header">
          <div>
            <h2>故障代码</h2>
            <p>配置会随项目导出写入 data.bin，设备端优先读取动态配置。</p>
          </div>
          <label className="settings-check">
            <input
              checked={faultCode.enabled}
              onChange={(event) => updateRoot('enabled', event.target.checked)}
              type="checkbox"
            />
            <span>启用</span>
          </label>
        </div>
        <div className="structured-list fault-code-meta">
          <label>
            版本
            <input
              min={1}
              type="number"
              value={faultCode.version ?? 1}
              onChange={(event) => updateRoot('version', numberValue(event.target.value, 1))}
            />
          </label>
          <label>
            来源数量
            <input readOnly value={sources.length} />
          </label>
          <label>
            故障码数量
            <input readOnly value={codes.length} />
          </label>
        </div>
        {csvStatus ? <p className="fault-code-csv-status">{csvStatus}</p> : null}
      </section>

      <section className="table-spec-card">
        <div className="config-table-toolbar">
          <strong>来源规则</strong>
          <div className="fault-code-toolbar-actions">
            <button type="button" onClick={addSource}>
              新增来源
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void exportSourcesCsv()}>
              导出 CSV
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void importSourcesCsv()}>
              导入 CSV
            </button>
          </div>
        </div>
        <div className="config-table-frame">
          <table className="config-table fault-code-source-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>类型</th>
                <th>CAN ID</th>
                <th>帧类型</th>
                <th>取码字节</th>
                <th>清除码</th>
                <th>无效码</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source, index) => (
                <tr key={`${source.source_id}-${source.type_char}-${source.can_id}`}>
                  <td>
                    <select
                      value={source.source_id}
                      onChange={(event) =>
                        updateSource(index, { source_id: numberValue(event.target.value) })
                      }
                    >
                      {Object.entries(sourceLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
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
                    <input
                      value={source.can_id}
                      onChange={(event) =>
                        updateSource(index, { can_id: numberValue(event.target.value) })
                      }
                    />
                    <small>{hexOrDecimal(source.can_id)}</small>
                  </td>
                  <td>
                    <select
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
                      value={codeListText(source.invalid_codes)}
                      onChange={(event) =>
                        updateSource(index, { invalid_codes: parseCodeList(event.target.value) })
                      }
                    />
                  </td>
                  <td>
                    <button className="danger" type="button" onClick={() => removeSource(index)}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-spec-card">
        <div className="config-table-toolbar">
          <strong>故障码</strong>
          <div className="fault-code-toolbar-actions">
            <button type="button" onClick={addCode}>
              新增故障码
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void exportCodesCsv()}>
              导出 CSV
            </button>
            <button disabled={isCsvBusy} type="button" onClick={() => void importCodesCsv()}>
              导入 CSV
            </button>
          </div>
        </div>
        {duplicateFaultCodes.messages.length > 0 ? (
          <div className="fault-code-duplicate-alert">
            {duplicateFaultCodes.messages.join('；')}
          </div>
        ) : null}
        <div className="config-table-frame">
          <table className="config-table fault-code-table">
            <thead>
              <tr>
                <th>启用</th>
                <th>来源</th>
                <th>类型</th>
                <th>Code</th>
                <th>等级</th>
                <th>文案 Key</th>
                <th>中文文案</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((item, index) => {
                const key = item.message_key || item.name_key || messageKeyFor(item);
                const duplicateCanId = sourceCanIdForCode(item, sources);
                const isDuplicate = duplicateFaultCodes.duplicateIndexes.has(index);
                return (
                  <tr
                    className={isDuplicate ? 'fault-code-duplicate-row' : undefined}
                    key={key || `${item.type_char ?? item.source_id}-${item.code}`}
                  >
                    <td>
                      <input
                        checked={item.enabled ?? true}
                        type="checkbox"
                        onChange={(event) => updateCode(index, { enabled: event.target.checked })}
                      />
                    </td>
                    <td>
                      <select
                        value={item.source_id ?? 1}
                        onChange={(event) =>
                          updateCode(index, { source_id: numberValue(event.target.value) })
                        }
                      >
                        {Object.entries(sourceLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        maxLength={1}
                        value={item.type_char ?? typeChars[item.source_id ?? 0] ?? ''}
                        onChange={(event) =>
                          updateCode(index, {
                            type_char: event.target.value.slice(0, 1).toUpperCase(),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        min={0}
                        max={255}
                        type="number"
                        value={item.code}
                        onChange={(event) =>
                          updateCode(index, { code: numberValue(event.target.value) })
                        }
                      />
                      {isDuplicate && duplicateCanId !== null ? (
                        <small className="fault-code-duplicate-hint">
                          {hexOrDecimal(duplicateCanId)} 下已存在相同故障码
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <select
                        value={item.severity ?? 'fault'}
                        onChange={(event) => updateCode(index, { severity: event.target.value })}
                      >
                        {severityOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        value={key}
                        onChange={(event) => updateCode(index, { message_key: event.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        value={languageText(language, key) || item.name || ''}
                        onChange={(event) => updateCodeText(index, event.target.value)}
                      />
                    </td>
                    <td>
                      <button className="danger" type="button" onClick={() => removeCode(index)}>
                        删除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
