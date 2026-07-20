import type { Page } from '@playwright/test';

export const richProjectPath = 'D:\\projects\\rich-fixture.jcpro';

export const richProjectDocument = {
  config_version: 'jc001',
  project: {
    name: 'Rich Fixture',
    from: 'e2e',
    base_path: '',
    create_time: '2026-07-20T00:00:00.000Z',
    update_time: '2026-07-20T00:00:00.000Z',
  },
  device: { resolution_w: 800, resolution_h: 480 },
  ui_info: {},
  sdo_info: {
    type: 0,
    user_auth: 0,
    name_index: 0,
    name: '菜单',
    children: [
      {
        type: 0,
        user_auth: 0,
        name_index: 0,
        name: '车辆设置',
        children: [
          {
            type: 1,
            user_auth: 0,
            name_index: 2,
            name: '最高车速',
            children: [],
            control_protocol: 0,
            control_rw: 1,
            control_use_default: 1,
            control_use_min_max: 1,
            handle: 0,
            handle_name: 'u8',
            handle_param: '0->7->1',
            fid: 0x600,
            mid: 0x2002,
            sid: 1,
            data_default: '12',
            data_min: '0',
            data_max: '25',
            pre_handle: 0,
            pre_handle_name: 'linear',
            pre_handle_scale: '1',
            pre_handle_offset: '0',
            pre_handle_decimal: 0,
            pre_handle_decimal_name: '0',
          },
          {
            type: 1,
            user_auth: 0,
            name_index: 3,
            name: '驻车开关',
            children: [],
            control_protocol: 0,
            control_rw: 0,
            handle: 11,
            handle_name: 'bit',
            handle_param: '0->0->1',
            fid: 0x580,
            mid: 0x2020,
            sid: 2,
            data_default: '0',
            data_min: '0',
            data_max: '1',
          },
        ],
      },
    ],
  },
  pdo_simple_send_recv: {
    pdo_recv: [
      {
        id: 0x180,
        type: 0,
        desc: '车辆状态',
        data: [
          {
            pos: 0,
            len: 16,
            show_type: 0,
            pdo_param_index: 0,
            pdo_param_name: '车辆速度',
          },
          {
            pos: 16,
            len: 1,
            show_type: 1,
            pdo_param_index: 1,
            pdo_param_name: '驻车状态',
          },
        ],
      },
    ],
    pdo_send: [
      {
        id: 0x280,
        type: 0,
        desc: '仪表控制',
        data: [
          {
            pos: 0,
            len: 8,
            show_type: 0,
            pdo_param_index: 2,
            pdo_param_name: '背光等级',
          },
        ],
      },
    ],
  },
  pdo_global_param: [
    { param_id: 'VEHICLE_SPEED', name: '车辆速度', def: '0', reserved: 0, type: 0, inner: 1 },
  ],
  pdo_condition: [],
  pdo_recv: [],
  pdo_send: [],
  signal_dictionary: { signals: [] },
  private_protocol: { enabled: false, frames: [] },
  protocol_mapping: [],
  language_info: {
    list_code_language: ['zh', 'en'],
    language_labels: { zh: '中文', en: '英文' },
    list_inner: ['中文', '英文', '最高车速', '驻车开关', '牵引故障', '诊断模式'],
    list_translate: {
      最高车速: { zh: '最高车速', en: 'Maximum speed' },
      驻车开关: { zh: '驻车开关', en: 'Parking switch' },
      牵引故障: { zh: '牵引故障', en: 'Traction fault' },
      诊断模式: { zh: '诊断模式', en: '' },
    },
  },
  battery_protocol: {},
  battery_monitor_info: { enabled: true, page_size: 4, items: [] },
  fault_code_info: {
    schema_version: 1,
    enabled: true,
    version: 1,
    sources: [
      {
        source_key: 'traction',
        source_id: 1,
        type_char: 'T',
        name: '牵引',
        can_id: 0x288,
        frame_type: 0,
        code_byte: 2,
        clear_code: 0,
        invalid_codes: [],
        enabled: true,
      },
    ],
    codes: [
      {
        source_key: 'traction',
        source_id: 1,
        type_char: 'T',
        code: 42,
        severity: 'fault',
        message_key: '牵引故障',
      },
    ],
  },
};

export async function installRichProjectDesktopMock(page: Page) {
  await page.evaluate(
    ({ document, projectPath }) => {
      const loadedProject = (nextDocument: unknown) => ({
        summary: {
          name: 'Rich Fixture',
          version: '1.0.0',
          path: projectPath,
          deviceResolution: '800×480',
        },
        validation: { valid: true, missing_sections: [], warnings: [] },
        document: nextDocument,
      });
      const gitRevision = {
        hash: '0123456789abcdef0123456789abcdef01234567',
        short_hash: '0123456',
        author: 'E2E',
        authored_at: '2026-07-20T00:00:00.000Z',
        subject: '更新项目配置',
      };
      const gitContext = {
        status: {
          available: true,
          repo_root: 'D:\\projects',
          branch: 'main',
          head_hash: gitRevision.hash,
          head_short_hash: gitRevision.short_hash,
          head_subject: gitRevision.subject,
          managed_paths: ['rich-fixture.jcpro'],
          changed_paths: ['rich-fixture.jcpro'],
          additions: 2,
          deletions: 1,
          has_staged_changes: false,
        },
        revisions: [gitRevision],
      };
      const gitReview = {
        repo_root: 'D:\\projects',
        branch: 'main',
        base_ref: 'HEAD',
        additions: 2,
        deletions: 1,
        files: [
          {
            path: 'rich-fixture.jcpro',
            status: 'modified',
            additions: 2,
            deletions: 1,
            hunks: [
              {
                header: '@@ -1,3 +1,4 @@',
                old_start: 1,
                new_start: 1,
                lines: [
                  { kind: 'context', old_line: 1, new_line: 1, content: '{' },
                  {
                    kind: 'deletion',
                    old_line: 2,
                    content: '  "name": "旧项目名称"',
                  },
                  {
                    kind: 'addition',
                    new_line: 2,
                    content: '  "name": "Rich Fixture",',
                  },
                  { kind: 'addition', new_line: 3, content: '  "revision": 2' },
                  { kind: 'context', old_line: 3, new_line: 4, content: '}' },
                ],
              },
            ],
          },
        ],
      };
      const originalWorktreeContent = JSON.stringify(
        { ...document, config_version: 'jc000' },
        null,
        2,
      );
      let worktreeContent = JSON.stringify(document, null, 2);

      const internals = {
        metadata: { currentWindow: { label: 'main' } },
        transformCallback: () => 1,
        unregisterCallback: () => undefined,
        invoke: async (command: string, args?: Record<string, unknown>) => {
          if (command.startsWith('plugin:event|')) return 1;
          if (command === 'plugin:dialog|open') return 'D:\\imports\\en.csv';
          if (command === 'plugin:window|set_title') return null;
          if (command === 'plugin:app|name') return '自定义开发平台';
          if (command === 'plugin:app|version') return '0.1.0';
          if (command === 'load_project') return loadedProject(JSON.parse(worktreeContent));
          if (command === 'load_json_file') throw new Error('optional sidecar not found');
          if (command === 'validate_project_document') {
            return { valid: true, missing_sections: [], warnings: [] };
          }
          if (command === 'parse_ui_resources_with_project_path') {
            return { valid: true, logo: null, main_items: [], errors: [] };
          }
          if (command === 'load_project_git_context') {
            const delay = (
              window as unknown as { __GIT_CONTEXT_DELAY_MS__: number }
            ).__GIT_CONTEXT_DELAY_MS__;
            if (delay > 0) await new Promise((resolve) => window.setTimeout(resolve, delay));
            return gitContext;
          }
          if (command === 'review_project_git_changes') return gitReview;
          if (command === 'load_project_git_worktree_file') {
            return {
              path: args?.path,
              original_content: originalWorktreeContent,
              current_content: worktreeContent,
            };
          }
          if (command === 'save_project_git_worktree_file') {
            const content = args?.content as string;
            JSON.parse(content);
            worktreeContent = content;
            (
              window as unknown as { __SAVED_GIT_WORKTREE_FILE__: unknown }
            ).__SAVED_GIT_WORKTREE_FILE__ = {
              path: args?.path,
              content,
            };
            return null;
          }
          if (command === 'import_single_language_csv') {
            const request = args?.request as {
              document: typeof document.language_info;
              language_code: string;
              path: string;
            };
            (
              window as unknown as { __SINGLE_LANGUAGE_IMPORT_REQUEST__: unknown }
            ).__SINGLE_LANGUAGE_IMPORT_REQUEST__ = request;
            const nextDocument = structuredClone(request.document);
            nextDocument.list_translate.诊断模式.en = 'Diagnostic mode';
            return {
              valid: true,
              language_code: request.language_code,
              filled: 1,
              skipped_existing: 1,
              skipped_unknown: 1,
              skipped_empty: 1,
              skipped_duplicate: 1,
              errors: [],
              document: nextDocument,
            };
          }
          if (command === 'import_language_csv') {
            const request = args?.request as { path: string };
            (
              window as unknown as { __FULL_LANGUAGE_IMPORT_REQUEST__: unknown }
            ).__FULL_LANGUAGE_IMPORT_REQUEST__ = request;
            return {
              valid: true,
              table: {
                valid: true,
                expected_headers: ['序号', 'auto'],
                actual_headers: ['序号', 'auto', '中文_zh', '英文_en'],
                errors: [],
              },
              errors: [],
              document: structuredClone(document.language_info),
            };
          }
          if (command === 'load_project_recovery_draft') return null;
          if (command === 'save_project_recovery_draft') return null;
          if (command === 'clear_project_recovery_draft') return true;
          if (command === 'save_project') {
            const request = args?.request as { document?: unknown } | undefined;
            const savedDocument = request?.document ?? document;
            (
              window as unknown as { __SAVED_PROJECT_DOCUMENT__: unknown }
            ).__SAVED_PROJECT_DOCUMENT__ = savedDocument;
            return loadedProject(savedDocument);
          }
          throw new Error(`Unexpected desktop command: ${command}`);
        },
      };
      (window as unknown as { __SAVED_PROJECT_DOCUMENT__: unknown }).__SAVED_PROJECT_DOCUMENT__ =
        null;
      (
        window as unknown as { __SINGLE_LANGUAGE_IMPORT_REQUEST__: unknown }
      ).__SINGLE_LANGUAGE_IMPORT_REQUEST__ = null;
      (
        window as unknown as { __FULL_LANGUAGE_IMPORT_REQUEST__: unknown }
      ).__FULL_LANGUAGE_IMPORT_REQUEST__ = null;
      (window as unknown as { __SAVED_GIT_WORKTREE_FILE__: unknown }).__SAVED_GIT_WORKTREE_FILE__ =
        null;
      (window as unknown as { __GIT_CONTEXT_DELAY_MS__: number }).__GIT_CONTEXT_DELAY_MS__ = 0;
      (window as unknown as { __TAURI_INTERNALS__: typeof internals }).__TAURI_INTERNALS__ =
        internals;
    },
    { document: richProjectDocument, projectPath: richProjectPath },
  );
}
