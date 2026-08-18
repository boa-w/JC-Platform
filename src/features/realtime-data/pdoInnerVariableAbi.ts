import abiDocument from '../../data/common-can-pdo-inner-abi.json';

export interface PdoInnerVariableAbiEntry {
  id: number;
  code: string;
  label: string;
}

interface PdoInnerVariableAbiDocument {
  abi_version: string;
  source: string;
  unbound_id: number;
  variables: PdoInnerVariableAbiEntry[];
}

const document = abiDocument as PdoInnerVariableAbiDocument;

export const PDO_INNER_VARIABLE_ABI_VERSION = document.abi_version;
export const PDO_INNER_VARIABLE_ABI_SOURCE = document.source;
export const PDO_INNER_VARIABLE_UNBOUND_ID = document.unbound_id;
export const PDO_INNER_VARIABLES = document.variables;

export function isKnownPdoInnerVariableId(value: number) {
  return (
    value === PDO_INNER_VARIABLE_UNBOUND_ID ||
    PDO_INNER_VARIABLES.some((item) => item.id === value)
  );
}

export function pdoInnerVariableLabel(value: number) {
  if (value === PDO_INNER_VARIABLE_UNBOUND_ID) return '不绑定';
  const item = PDO_INNER_VARIABLES.find((entry) => entry.id === value);
  return item ? `${item.code} · ${item.label}` : `未知 ABI ID ${value}`;
}
