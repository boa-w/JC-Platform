import { expect, type Page, test } from '@playwright/test';

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const runtimeErrorsByPage = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  runtimeErrorsByPage.set(page, captureRuntimeErrors(page));
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(runtimeErrorsByPage.get(page)).toEqual([]);
});

test('navigates core workspaces without runtime errors', async ({ page }) => {
  await page.getByRole('button', { name: '输出', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '输出 功能' })).toBeVisible();
  await page.getByRole('button', { name: 'CAN 测试数据构建', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'CAN 测试数据构建' })).toBeVisible();

  await page.getByRole('button', { name: '协议', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '协议 功能' })).toBeVisible();
  await page.getByRole('button', { name: '业务信号字典', exact: true }).click();
  await expect(page.getByRole('heading', { level: 2, name: '业务信号字典' })).toBeVisible();
});

test('keeps the About dialog above the workspace and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 720 });
  const trigger = page.getByRole('button', { name: '软件版本信息' });
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: '版本信息' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: '关闭版本信息' })).toBeFocused();

  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect(box?.y).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(720);
  await expect(dialog).toHaveCSS('position', 'fixed');
  await expect(dialog).toHaveCSS('z-index', '100');

  await dialog.getByRole('button', { name: '导出诊断报告' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('诊断报告只能在 Tauri 桌面应用中导出。');

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});

test('persists the selected theme across reloads', async ({ page }) => {
  const toggle = page.getByRole('button', { name: '切换主题' });
  const originalTheme = await page.locator('html').getAttribute('data-theme');
  const nextTheme = originalTheme === 'dark' ? 'light' : 'dark';

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', nextTheme);

  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', originalTheme ?? 'light');
});

test('supports keyboard navigation and named settings controls', async ({ page }) => {
  const skipLink = page.getByRole('link', { name: '跳转到主要内容' });
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await page.getByRole('button', { name: '系统', exact: true }).click();
  const settingsButton = page.getByRole('button', { name: '软件设置', exact: true });
  await expect(settingsButton).toHaveAttribute('aria-current', 'page');
  const main = page.getByRole('main', { name: '软件设置' });
  await expect(main).toBeVisible();
  await expect(main.getByRole('heading', { level: 1, name: '软件设置' })).toBeAttached();

  await expect(
    main.getByRole('checkbox', { name: '锂电协议：写入 ConfigUpdate.json' }),
  ).toBeVisible();
  const themeSwitch = main.getByRole('switch', { name: '深色模式' });
  await expect(themeSwitch).toHaveAttribute(
    'aria-checked',
    (await page.locator('html').getAttribute('data-theme')) === 'dark' ? 'true' : 'false',
  );

  await main.getByRole('button', { name: '恢复默认' }).click();
  const resetDialog = page.getByRole('dialog', { name: '恢复导出默认设置？' });
  await expect(resetDialog.getByRole('button', { name: '取消' })).toBeFocused();
  await resetDialog.getByRole('button', { name: '取消' }).click();
  await expect(resetDialog).toBeHidden();

  await main.getByRole('button', { name: '清空配置' }).click();
  const clearDialog = page.getByRole('dialog', { name: '清空翻译配置？' });
  await expect(clearDialog).toContainText('此操作无法撤销');
  await clearDialog.getByRole('button', { name: '取消' }).click();
  await expect(clearDialog).toBeHidden();
});

test('surfaces desktop-only actions as accessible errors in browser preview', async ({ page }) => {
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('系统保存对话框只能在 Tauri 桌面应用中使用。');

  await page.keyboard.press('Control+o');
  await expect(page.getByRole('alert')).toHaveText(
    '系统文件选择器只能在桌面应用中使用；也可以粘贴项目路径后打开。',
  );
});

test('offers to restore an unsaved project draft', async ({ page }) => {
  const projectPath = 'D:\\projects\\recovery-fixture.jcpro';
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.evaluate((path) => {
    const baseDocument = {
      project: { name: 'Recovery Fixture', revision: 1 },
      battery_protocol: {},
      battery_monitor_info: {},
      fault_code_info: {},
    };
    localStorage.setItem(
      'jc-custom-platform.projectRecoveryDraft',
      JSON.stringify({
        schemaVersion: 1,
        projectPath: path,
        projectName: 'Recovery Fixture',
        savedAt: '2026-07-18T00:00:00.000Z',
        document: { ...baseDocument, project: { name: 'Recovery Fixture', revision: 2 } },
      }),
    );

    const internals = {
      metadata: { currentWindow: { label: 'main' } },
      transformCallback: () => 1,
      unregisterCallback: () => undefined,
      invoke: async (command: string) => {
        const updateCalls = (window as unknown as { __UPDATE_CALLS__?: string[] }).__UPDATE_CALLS__;
        if (command.startsWith('plugin:updater|') || command === 'plugin:process|restart') {
          updateCalls?.push(command);
        }
        if (command.startsWith('plugin:event|')) return 1;
        if (command === 'plugin:window|set_title') return null;
        if (command === 'plugin:app|name') return '自定义开发平台';
        if (command === 'plugin:app|version') return '0.1.0';
        if (command === 'plugin:updater|check') {
          return {
            rid: 7,
            currentVersion: '0.1.0',
            version: '0.2.0',
            date: '2026-07-18T00:00:00.000Z',
            body: '安全更新测试',
            rawJson: {},
          };
        }
        if (command === 'plugin:updater|download_and_install') return null;
        if (command === 'plugin:process|restart') return null;
        if (command === 'load_project') {
          return {
            summary: {
              name: 'Recovery Fixture',
              version: '1.0.0',
              path,
              deviceResolution: '800×480',
            },
            validation: { valid: true, missing_sections: [], warnings: [] },
            document: baseDocument,
          };
        }
        if (command === 'load_json_file') throw new Error('optional sidecar not found');
        if (command === 'validate_project_document') {
          return { valid: true, missing_sections: [], warnings: [] };
        }
        if (command === 'parse_ui_resources_with_project_path') {
          return { valid: true, logo: null, main_items: [], errors: [] };
        }
        if (command === 'load_project_git_context') {
          return {
            status: {
              available: false,
              managed_paths: [],
              changed_paths: [],
              additions: 0,
              deletions: 0,
              has_staged_changes: false,
            },
            revisions: [],
          };
        }
        throw new Error(`Unexpected desktop command: ${command}`);
      },
    };
    (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__ = [];
    (window as unknown as { __TAURI_INTERNALS__: typeof internals }).__TAURI_INTERNALS__ =
      internals;
  }, projectPath);

  await page.getByLabel('项目文件路径').fill(projectPath);
  const openSection = page.locator('.project-section').filter({ hasText: '打开现有项目' });
  await openSection.getByRole('button', { name: '打开', exact: true }).click();

  const recoveryDialog = page.getByRole('dialog', { name: '恢复未保存修改' });
  await expect(recoveryDialog).toBeVisible();
  await expect(recoveryDialog.getByRole('button', { name: '稍后' })).toBeFocused();
  const dialogBox = await recoveryDialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(1024);
  expect((dialogBox?.y ?? 0) + (dialogBox?.height ?? 0)).toBeLessThanOrEqual(720);
  await recoveryDialog.getByRole('button', { name: '恢复草稿' }).click();
  await expect(recoveryDialog).toBeHidden();
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '保存', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem('jc-custom-platform.projectRecoveryDraft')),
  ).not.toBeNull();

  const beforeUpdateEventPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(beforeUpdateEventPrevented).toBe(true);

  await page.getByRole('button', { name: '软件版本信息' }).click();
  const aboutDialog = page.getByRole('dialog', { name: '版本信息' });
  await aboutDialog.getByRole('button', { name: '检查更新' }).click();
  const installButton = aboutDialog.getByRole('button', { name: '安装更新' });
  await expect(installButton).toBeVisible();
  await installButton.click();

  const updateDialog = page.getByRole('dialog', { name: '安装并重启应用？' });
  await expect(updateDialog).toContainText('当前项目存在未保存修改');
  await expect(updateDialog.getByRole('button', { name: '返回保存' })).toBeFocused();
  const updateDialogBox = await updateDialog.boundingBox();
  expect(updateDialogBox).not.toBeNull();
  expect((updateDialogBox?.x ?? 0) + (updateDialogBox?.width ?? 0)).toBeLessThanOrEqual(1024);
  expect((updateDialogBox?.y ?? 0) + (updateDialogBox?.height ?? 0)).toBeLessThanOrEqual(720);
  await updateDialog.getByRole('button', { name: '返回保存' }).click();
  await expect(updateDialog).toBeHidden();
  await expect(aboutDialog).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__.filter((command) =>
          command.includes('download_and_install'),
        ).length,
    ),
  ).toBe(0);

  await aboutDialog.getByRole('button', { name: '安装更新' }).click();
  await updateDialog.getByRole('button', { name: '继续更新' }).click();
  await expect(aboutDialog.getByText('更新已安装，正在重启应用', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__,
    ),
  ).toEqual(
    expect.arrayContaining(['plugin:updater|download_and_install', 'plugin:process|restart']),
  );
  const authorizedUpdateEventPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(authorizedUpdateEventPrevented).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem('jc-custom-platform.projectRecoveryDraft')),
  ).not.toBeNull();

  await page.keyboard.press('Escape');
  await expect(aboutDialog).toBeHidden();

  await page.keyboard.press('Control+s');
  const saveDialog = page.getByRole('dialog', { name: '确认保存' });
  await expect(saveDialog).toBeVisible();
  await saveDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(saveDialog).toBeHidden();
});
