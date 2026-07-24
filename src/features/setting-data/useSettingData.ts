import { type MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from 'react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import type { SdoNodeDocument } from '../../types/platform';
import type { JsonPath } from '../../utils/projectDirty';
import { removeStorageItem } from '../../utils/safeStorage';
import { settingColumnWidthStorageKey, settingEditorSections } from './config';
import type { SdoNodeField, SettingEditorField, SettingParameterColumn } from './types';
import {
  settingDataTypeIsDefaultWrite,
  settingDataTypeUsesBitRange,
} from './settingDataTypes';
import {
  clampSettingColumnWidth,
  collectSettingMenus,
  collectSettingParameters,
  formatHandleParamFromBitRange,
  loadSettingColumnWidths,
  parseHandleParam,
  parseSettingBitNumber,
  parseSettingDataTypeSelection,
  pathStringToNumbers,
  saveSettingColumnWidths,
  sdoNodeByNumberPath,
  sdoNodeByPath,
  settingDataTypeSelectValue,
  settingPathNames,
  updateSdoNodeAtPath,
} from './utils';

interface UseSettingDataOptions {
  loadedDocument: Record<string, unknown> | null;
  isActive: boolean;
  updateProjectDocument: (section: string, value: unknown) => void;
  isModifiedPath: (path: JsonPath) => boolean;
  restoreModifiedPath: (path: JsonPath) => void;
}

export function useSettingData({
  loadedDocument,
  isActive,
  updateProjectDocument,
  isModifiedPath,
  restoreModifiedPath,
}: UseSettingDataOptions) {
  const [selectedSettingPath, setSelectedSettingPath] = useState<string | null>(null);
  const [editingSettingPath, setEditingSettingPath] = useState<number[] | null>(null);
  const settingDrawerCloseRef = useRef<HTMLButtonElement | null>(null);
  const settingDrawerRef = useRef<HTMLElement | null>(null);
  const [settingSearchQuery, setSettingSearchQuery] = useState('');
  const [settingColumnWidths, setSettingColumnWidths] =
    useState<Record<string, number>>(loadSettingColumnWidths);

  const sdoDocument = loadedDocument
    ? ((loadedDocument.sdo_info as SdoNodeDocument | undefined) ?? null)
    : null;

  function updateSdoDocument(next: SdoNodeDocument) {
    updateProjectDocument('sdo_info', next);
  }

  function openSettingEditorDrawer(path: number[]) {
    setEditingSettingPath(path);
  }

  function closeSettingEditorDrawer() {
    setEditingSettingPath(null);
  }

  const settingEditorDrawerOpen = Boolean(
    editingSettingPath && sdoNodeByNumberPath(sdoDocument, editingSettingPath),
  );
  useDialogFocus({
    active: settingEditorDrawerOpen,
    containerRef: settingDrawerRef,
    initialFocusRef: settingDrawerCloseRef,
    onEscape: closeSettingEditorDrawer,
  });

  useEffect(() => {
    if (!isActive) {
      setEditingSettingPath(null);
    }
  }, [isActive]);

  useEffect(() => {
    if (editingSettingPath && !sdoNodeByNumberPath(sdoDocument, editingSettingPath)) {
      setEditingSettingPath(null);
    }
  }, [editingSettingPath, sdoDocument]);

  function updateSdoNode(path: number[], field: SdoNodeField, value: string | number) {
    const document = sdoDocument;
    if (!document) return;

    updateSdoDocument(updateSdoNodeAtPath(document, path, (node) => ({ ...node, [field]: value })));
  }

  function settingEditorFieldValue(node: SdoNodeDocument, field: SettingEditorField) {
    const bits = parseHandleParam(node.handle_param);
    switch (field.field) {
      case 'data_type_label':
        return settingDataTypeSelectValue(node);
      case 'bit_start':
        return bits.bitStart || field.defaultValue;
      case 'bit_length':
        return bits.bitLength || field.defaultValue;
      case 'preprocess_label':
        return node.pre_handle_name ?? field.defaultValue;
      case 'scale_value':
        return node.pre_handle_scale ?? field.defaultValue;
      case 'offset_value':
        return node.pre_handle_offset ?? field.defaultValue;
      case 'decimals_value':
        return (
          node.pre_handle_decimal_name ?? String(node.pre_handle_decimal ?? field.defaultValue)
        );
      default: {
        const rawValue = node[field.field];
        return (rawValue ?? field.defaultValue) as string | number;
      }
    }
  }

  function updateSettingEditorField(
    path: number[],
    field: SettingEditorField,
    value: string | number,
  ) {
    const document = sdoDocument;
    if (!document) return;

    const nextNode = (current: SdoNodeDocument): SdoNodeDocument => {
      switch (field.field) {
        case 'data_type_label': {
          const selection = parseSettingDataTypeSelection(value);
          return {
            ...current,
            handle_name: selection.label,
            ...(selection.handle === undefined ? {} : { handle: selection.handle }),
            ...(settingDataTypeIsDefaultWrite(selection.handle)
              ? { control_use_default: 0 }
              : {}),
          };
        }
        case 'bit_start':
          return {
            ...current,
            handle_param: formatHandleParamFromBitRange(current.handle_param, value, null),
          };
        case 'bit_length':
          return {
            ...current,
            handle_param: formatHandleParamFromBitRange(current.handle_param, null, value),
          };
        case 'preprocess_label':
          return { ...current, pre_handle_name: String(value) };
        case 'scale_value':
          return { ...current, pre_handle_scale: String(value) };
        case 'offset_value':
          return { ...current, pre_handle_offset: String(value) };
        case 'decimals_value': {
          const decimals = parseSettingBitNumber(value, current.pre_handle_decimal ?? 0);
          return {
            ...current,
            pre_handle_decimal_name: String(value),
            pre_handle_decimal: decimals,
          };
        }
        default:
          return { ...current, [field.field]: value };
      }
    };

    updateSdoDocument(updateSdoNodeAtPath(document, path, (current) => nextNode(current)));
  }

  function settingColumnWidth(column: SettingParameterColumn) {
    return settingColumnWidths[column.key] ?? column.defaultWidth;
  }

  function resetSettingColumnWidths() {
    setSettingColumnWidths({});
    if (typeof window !== 'undefined') {
      removeStorageItem(settingColumnWidthStorageKey);
    }
  }

  function handleSettingColumnResizeStart(event: ReactMouseEvent, column: SettingParameterColumn) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = settingColumnWidth(column);
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    let latestWidths = { ...settingColumnWidths };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = clampSettingColumnWidth(startWidth + moveEvent.clientX - startX, column);
      setSettingColumnWidths((current) => {
        const next = { ...current, [column.key]: nextWidth };
        latestWidths = next;
        return next;
      });
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      saveSettingColumnWidths(latestWidths);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }

  function visibleSettingEditorSections(node: SdoNodeDocument) {
    const nodeKind = node.type === 1 ? 'parameter' : 'menu';
    return settingEditorSections
      .map((section) => ({
        ...section,
        fields: section.fields.filter(
          (field) =>
            (field.visibleFor === undefined ||
              field.visibleFor === 'all' ||
              field.visibleFor === nodeKind) &&
            (!['bit_start', 'bit_length'].includes(field.field) ||
              settingDataTypeUsesBitRange(node.handle)),
        ),
      }))
      .filter((section) => section.fields.length > 0);
  }

  function addSdoMenu(parentPath: number[]) {
    const document = sdoDocument;
    if (!document) return;

    const parentNode = sdoNodeByNumberPath(document, parentPath);
    const nextIndex = parentNode?.children?.length ?? 0;
    const child: SdoNodeDocument = {
      type: 0,
      user_auth: 0,
      name_index: 0,
      name: `新菜单${nextIndex + 1}`,
      children: [],
    };
    updateSdoDocument(
      updateSdoNodeAtPath(document, parentPath, (node) => ({
        ...node,
        children: [...(node.children ?? []), child],
      })),
    );
    const nextPath = [...parentPath, nextIndex];
    setSelectedSettingPath(nextPath.join('/'));
    openSettingEditorDrawer(nextPath);
  }

  function addSdoParameter(parentPath: number[]) {
    const document = sdoDocument;
    if (!document) return;

    const parentNode = sdoNodeByNumberPath(document, parentPath);
    const nextIndex = parentNode?.children?.length ?? 0;
    const child: SdoNodeDocument = {
      type: 1,
      user_auth: 0,
      name_index: 0,
      name: `新参数${nextIndex + 1}`,
      children: [],
      control_protocol: 0,
      control_rw: 0,
      control_use_default: 0,
      control_use_min_max: 0,
      fid: 0,
      mid: 0,
      sid: 0,
      handle: 0,
      handle_name: '',
      handle_param: '',
      data_default: '',
      data_min: '',
      data_max: '',
      pre_handle: 0,
      pre_handle_name: '原始数据',
      pre_handle_scale: '',
      pre_handle_offset: '',
      pre_handle_decimal: 0,
      pre_handle_decimal_name: '',
    };
    updateSdoDocument(
      updateSdoNodeAtPath(document, parentPath, (node) => ({
        ...node,
        children: [...(node.children ?? []), child],
      })),
    );
    openSettingEditorDrawer([...parentPath, nextIndex]);
  }

  function removeSdoNode(path: number[]) {
    const document = sdoDocument;
    if (!document || path.length === 0) return;

    const parentPath = path.slice(0, -1);
    const removeIndex = path[path.length - 1];
    updateSdoDocument(
      updateSdoNodeAtPath(document, parentPath, (node) => ({
        ...node,
        children: (node.children ?? []).filter((_, currentIndex) => currentIndex !== removeIndex),
      })),
    );
  }

  function removeSdoNodes(paths: number[][]) {
    const document = sdoDocument;
    const pathKeys = new Set(paths.filter((path) => path.length > 0).map((path) => path.join('/')));
    if (!document || pathKeys.size === 0) return;

    function removeFromNode(node: SdoNodeDocument, parentPath: number[]): SdoNodeDocument {
      return {
        ...node,
        children: (node.children ?? []).flatMap((child, index) => {
          const childPath = [...parentPath, index];
          if (pathKeys.has(childPath.join('/'))) return [];
          return [removeFromNode(child, childPath)];
        }),
      };
    }

    updateSdoDocument(removeFromNode(document, []));
  }

  const currentSdoDocument = sdoDocument;
  const settingMenus = collectSettingMenus(currentSdoDocument, settingSearchQuery);
  const activeSettingPath = selectedSettingPath ?? settingMenus[0]?.key ?? null;
  const activeSettingPathNumbers = pathStringToNumbers(activeSettingPath);
  const activeSettingNode = sdoNodeByPath(currentSdoDocument, activeSettingPath);
  const activeSettingPathNames = settingPathNames(currentSdoDocument, activeSettingPathNumbers);
  const settingParameters = collectSettingParameters(
    activeSettingNode,
    activeSettingPathNumbers,
    activeSettingPathNames,
    settingSearchQuery,
  );
  const readonlySettingParameterCount = settingParameters.filter((row) => row.isReadonly).length;
  const booleanMonitorParameterCount = settingParameters.filter(
    (row) => row.isBooleanMonitor,
  ).length;
  const hasBooleanMonitorParameters = booleanMonitorParameterCount > 0;
  const editingSettingNode = sdoNodeByNumberPath(currentSdoDocument, editingSettingPath);

  return {
    addSdoMenu,
    addSdoParameter,
    activeSettingNode,
    activeSettingPath,
    activeSettingPathNames,
    activeSettingPathNumbers,
    booleanMonitorParameterCount,
    closeSettingEditorDrawer,
    currentSdoDocument,
    editingSettingNode,
    editingSettingPath,
    handleSettingColumnResizeStart,
    hasBooleanMonitorParameters,
    isModifiedPath,
    openSettingEditorDrawer,
    readonlySettingParameterCount,
    removeSdoNode,
    removeSdoNodes,
    resetSettingColumnWidths,
    restoreModifiedPath,
    selectedSettingPath,
    setEditingSettingPath,
    setSelectedSettingPath,
    setSettingSearchQuery,
    settingColumnWidth,
    settingDrawerCloseRef,
    settingDrawerRef,
    settingEditorFieldValue,
    settingMenus,
    settingParameters,
    settingSearchQuery,
    updateSettingEditorField,
    updateSdoNode,
    visibleSettingEditorSections,
  };
}
