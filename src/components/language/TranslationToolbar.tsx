import { FileUp } from 'lucide-react';
import type { FilterMode } from './types';

interface TranslationToolbarProps {
  searchQuery: string;
  filterMode: FilterMode;
  sourceLanguage: string;
  targetLanguage: string | null;
  totalKeys: number;
  filteredCount: number;
  importStatus: string | null;
  isImporting: boolean;
  onSearch: (query: string) => void;
  onFilter: (mode: FilterMode) => void;
  onSyncKeys: () => void;
  onImportSingleLanguage: () => void;
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
  isImporting,
  onSearch,
  onFilter,
  onSyncKeys,
  onImportSingleLanguage,
}: TranslationToolbarProps) {
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
        {importStatus ? (
          <span className="lang-import-status" role="status" title={importStatus}>
            {importStatus}
          </span>
        ) : null}
        <button
          className="lang-btn lang-btn--ghost"
          disabled={!targetLanguage || isImporting}
          onClick={onImportSingleLanguage}
          title={targetLanguage ? '按 key 匹配，仅填充当前语言的空白翻译' : '请先选择目标语言'}
          type="button"
        >
          <FileUp aria-hidden="true" size={14} />
          {isImporting ? '导入中...' : '导入单语言 CSV'}
        </button>
        <button className="lang-btn lang-btn--ghost" onClick={onSyncKeys} type="button">
          同步配置键
        </button>
      </div>
    </div>
  );
}
