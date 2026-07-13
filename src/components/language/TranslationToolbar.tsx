import type { FilterMode } from './types';

interface TranslationToolbarProps {
  searchQuery: string;
  filterMode: FilterMode;
  sourceLanguage: string;
  targetLanguage: string | null;
  totalKeys: number;
  filteredCount: number;
  onSearch: (query: string) => void;
  onFilter: (mode: FilterMode) => void;
  onSyncKeys: () => void;
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
  onSearch,
  onFilter,
  onSyncKeys,
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
        <button className="lang-btn lang-btn--ghost" onClick={onSyncKeys} type="button">
          同步配置键
        </button>
      </div>
    </div>
  );
}
