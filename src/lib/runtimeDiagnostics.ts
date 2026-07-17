const diagnosticStorageKey = 'jc-custom-platform.runtimeDiagnostics';
const maxDiagnosticEvents = 50;

export type DiagnosticLevel = 'info' | 'warning' | 'error';

export interface RuntimeDiagnosticEvent {
  at: string;
  level: DiagnosticLevel;
  source: string;
  message: string;
  detail?: string;
}

export interface DiagnosticStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface DiagnosticContext {
  activeModule: string;
  theme: 'light' | 'dark';
  health?: {
    app_name: string;
    version: string;
    commit_hash: string;
    core_status: string;
  } | null;
  project?: {
    name: string;
    version: string;
    path?: string;
    deviceResolution: string;
    updatedAt?: string;
  } | null;
}

interface DiagnosticReportOptions {
  generatedAt?: string;
  events?: RuntimeDiagnosticEvent[];
  runtime?: Record<string, unknown>;
}

let fallbackEvents: RuntimeDiagnosticEvent[] = [];
let diagnosticsInstalled = false;

function browserStorage(): DiagnosticStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function boundedText(value: string, maxLength = 4000) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...[truncated]`;
}

export function redactDiagnosticText(value: string) {
  return boundedText(value)
    .replace(/([a-z]:\\users\\)[^\\\s]+/gi, '$1%USERNAME%')
    .replace(/(\/users\/)[^/\s]+/gi, '$1%USERNAME%')
    .replace(/(\/home\/)[^/\s]+/gi, '$1%USERNAME%')
    .replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED]');
}

function diagnosticText(value: unknown) {
  if (value instanceof Error)
    return redactDiagnosticText(value.stack || value.message || value.name);
  if (typeof value === 'string') return redactDiagnosticText(value);
  try {
    return redactDiagnosticText(JSON.stringify(value));
  } catch {
    return redactDiagnosticText(String(value));
  }
}

export function readRuntimeDiagnostics(storage = browserStorage()) {
  try {
    const raw = storage?.getItem(diagnosticStorageKey);
    if (!raw) return [...fallbackEvents];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...fallbackEvents];
    return parsed
      .filter(
        (item): item is RuntimeDiagnosticEvent =>
          typeof item?.at === 'string' &&
          typeof item?.level === 'string' &&
          typeof item?.source === 'string' &&
          typeof item?.message === 'string',
      )
      .slice(-maxDiagnosticEvents);
  } catch {
    return [...fallbackEvents];
  }
}

export function recordRuntimeDiagnostic(
  level: DiagnosticLevel,
  source: string,
  error: unknown,
  detail?: unknown,
  storage = browserStorage(),
) {
  const event: RuntimeDiagnosticEvent = {
    at: new Date().toISOString(),
    level,
    source: redactDiagnosticText(source),
    message: diagnosticText(error),
    ...(detail === undefined ? {} : { detail: diagnosticText(detail) }),
  };
  const next = [...readRuntimeDiagnostics(storage), event].slice(-maxDiagnosticEvents);
  try {
    if (!storage) throw new Error('storage unavailable');
    storage.setItem(diagnosticStorageKey, JSON.stringify(next));
  } catch {
    fallbackEvents = next;
  }
  return event;
}

function runtimeSnapshot() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return {};
  return {
    user_agent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    device_pixel_ratio: window.devicePixelRatio,
  };
}

function projectFileName(path?: string) {
  return path?.split(/[\\/]/).pop() || null;
}

export function buildDiagnosticReport(
  context: DiagnosticContext,
  options: DiagnosticReportOptions = {},
) {
  const projectPath = context.project?.path;
  return {
    schema_version: 1,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    application: {
      name: context.health?.app_name ?? '自定义开发平台',
      version: context.health?.version ?? 'unknown',
      commit_hash: context.health?.commit_hash ?? 'unknown',
      core_status: context.health?.core_status ?? 'unknown',
    },
    runtime: options.runtime ?? runtimeSnapshot(),
    session: {
      active_module: context.activeModule,
      theme: context.theme,
      project: context.project
        ? {
            name: context.project.name,
            version: context.project.version,
            file_name: projectFileName(projectPath),
            path: projectPath ? redactDiagnosticText(projectPath) : null,
            device_resolution: context.project.deviceResolution,
            updated_at: context.project.updatedAt ?? null,
          }
        : null,
    },
    recent_events: options.events ?? readRuntimeDiagnostics(),
    privacy: {
      project_document_included: false,
    },
  };
}

export function installRuntimeDiagnostics() {
  if (typeof window === 'undefined' || diagnosticsInstalled) return;
  diagnosticsInstalled = true;
  window.addEventListener('error', (event) => {
    recordRuntimeDiagnostic('error', 'window.error', event.error ?? event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    recordRuntimeDiagnostic('error', 'window.unhandledrejection', event.reason);
  });
}
