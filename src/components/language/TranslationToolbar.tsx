import { FileSpreadsheet, FileUp, Info } from 'lucide-react';
import { useId, useState } from 'react';
import type { FilterMode } from './types';

interface TranslationToolbarProps {
  searchQuery: string;
  filterMode: FilterMode;
  sourceLanguage: string;
  targetLanguage: string | null;
  totalKeys: number;
  filteredCount: number;
  importStatus: string | null;
  fullImportStatus: string | null;
  isImportingSingleLanguage: boolean;
  isImportingFullLanguage: boolean;
  canImportFullLanguage: boolean;
  onSearch: (query: string) => void;
  onFilter: (mode: FilterMode) => void;
  onSyncKeys: () => void;
  onImportSingleLanguage: () => void;
  onImportFullLanguage: () => void;
}

const filterOptions: { label: string; value: FilterMode }[] = [
  { label: '全部', value: 'all' },
  { label: '已翻译', value: 'translated' },
  { label: '未翻译', value: 'untranslated' },
  { label: '已修改', value: 'modified' },
];

export function TranslationToolbar({
  searchQuery,
  filterMode,
  sourceLanguage,
  targetLanguage,
  totalKeys,
  filteredCount,
  importStatus,
  fullImportStatus,
  isImportingSingleLanguage,
  isImportingFullLanguage,
  canImportFullLanguage,
  onSearch,
  onFilter,
  onSyncKeys,
  onImportSingleLanguage,
  onImportFullLanguage,
}: TranslationToolbarProps) {
  const visibleImportStatus = importStatus ?? fullImportStatus;
  const importHelpId = useId();
  const [showImportHelp, setShowImportHelp] = useState(false);

  return (
    <div className="lang-toolbar">
      <div className="lang-toolbar-left">
        <div className="lang-toolbar-search">
          <span className="lang-toolbar-search-icon">🔍</span>
          <input
            placeholder="搜索翻译键或内容..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
          />
          {searchQuery ? (
            <button
              className="lang-toolbar-search-clear"
              onClick={() => onSearch('')}
              type="button"
            >
              ×
            </button>
          ) : null}
        </div>
        <div className="lang-toolbar-filters">
          {filterOptions.map((opt) => (
            <button
              className={`lang-toolbar-filter ${filterMode === opt.value ? 'active' : ''}`}
              key={opt.value}
              onClick={() => onFilter(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="lang-toolbar-right">
        <span className="lang-toolbar-count">
          {filteredCount === totalKeys ? `${totalKeys} 条` : `${filteredCount} / ${totalKeys} 条`}
        </span>
        <span className="lang-toolbar-lang-pair">
          {sourceLanguage} → {targetLanguage ?? '—'}
        </span>
        {visibleImportStatus ? (
          <span className="lang-import-status" role="status" title={visibleImportStatus}>
            {visibleImportStatus}
          </span>
        ) : null}
        <button
          className="lang-btn lang-btn--ghost"
          disabled={!targetLanguage || isImportingSingleLanguage || isImportingFullLanguage}
          onClick={onImportSingleLanguage}
          title={targetLanguage ? '按 key 匹配，仅填充当前语言的空白翻译' : '请先选择目标语言'}
          type="button"
        >
          <FileUp aria-hidden="true" size={14} />
          {isImportingSingleLanguage ? '导入中...' : '导入单语言 CSV'}
        </button>
        <button
          className="lang-btn lang-btn--ghost"
          disabled={!canImportFullLanguage || isImportingFullLanguage || isImportingSingleLanguage}
          onClick={onImportFullLanguage}
          title="导入包含全部语言和翻译键的 CSV、XLS、XLSX 或 XML 表格"
          type="button"
        >
          <FileSpreadsheet aria-hidden="true" size={14} />
          {isImportingFullLanguage ? '导入中...' : '导入完整语言表'}
        </button>
        <div className="lang-import-help">
          <button
            aria-controls={importHelpId}
            aria-expanded={showImportHelp}
            aria-label="查看语言导入说明"
            className="lang-import-help-trigger"
            onClick={() => setShowImportHelp((visible) => !visible)}
            title="查看语言导入说明"
            type="button"
          >
            <Info aria-hidden="true" size={15} />
          </button>
          {showImportHelp ? (
            <div className="lang-import-help-popover" id={importHelpId} role="note">
              <strong>语言导入说明</strong>
              <p>
                <b>单语言 CSV：</b>两列即可，例如 <code>中文_zh,乌克兰语_uk</code>。按左侧 key
                匹配，只填充当前目标语言的空值。
              </p>
              <p>
                <b>完整语言表：</b>用于整体替换语言配置，需包含 <code>序号</code>、<code>auto</code>{' '}
                和至少一个语言列，支持 CSV、XLS、XLSX、XML。
              </p>
              <p>单语言导入不依赖行顺序，不覆盖已有翻译，也不会新增项目中不存在的 key。</p>
            </div>
          ) : null}
        </div>
        <button className="lang-btn lang-btn--ghost" onClick={onSyncKeys} type="button">
          同步配置键
        </button>
      </div>
    </div>
  );
}
