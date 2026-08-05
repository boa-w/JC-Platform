import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { installRichProjectDesktopMock, richProjectPath } from './fixtures/richProject';

function captureRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const runtimeErrorsByPage = new WeakMap<Page, string[]>();

async function expectNoSeriousAccessibilityViolations(page: Page, context: string) {
  const result = await new AxeBuilder({ page }).analyze();
  const violations = result.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(
    violations,
    `${context} accessibility violations:\n${JSON.stringify(violations, null, 2)}`,
  ).toEqual([]);
}

async function openRichProject(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installRichProjectDesktopMock(page);
  await page.getByLabel('项目文件路径').fill(richProjectPath);
  const openSection = page.locator('.project-section').filter({ hasText: '打开现有项目' });
  await openSection.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.action-bar-project')).toContainText('Rich Fixture');
}

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

test('keeps the workspace interactive while Git context loads in the background', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await installRichProjectDesktopMock(page);
  await page.evaluate(() => {
    (window as unknown as { __GIT_CONTEXT_DELAY_MS__: number }).__GIT_CONTEXT_DELAY_MS__ = 1_500;
  });
  await page.getByLabel('项目文件路径').fill(richProjectPath);
  const openSection = page.locator('.project-section').filter({ hasText: '打开现有项目' });
  await openSection.getByRole('button', { name: '打开', exact: true }).click();
  await expect(page.locator('.action-bar-project')).toContainText('Rich Fixture');
  await expect(page.getByText('正在后台更新仓库状态和版本历史')).toBeVisible();

  await page.getByRole('button', { name: '数据', exact: true }).click();
  await page
    .getByRole('navigation', { name: '数据 功能' })
    .getByRole('button', { name: '设置数据', exact: true })
    .click();
  await expect(page.getByRole('main', { name: '设置数据' })).toBeVisible();
});

test('formats the loaded jcpro file from project management', async ({ page }) => {
  await openRichProject(page);
  await page.evaluate(() => {
    (window as unknown as { __FORMAT_FILE_DELAY_MS__: number }).__FORMAT_FILE_DELAY_MS__ = 1_500;
  });

  const formatButton = page.locator('button[title="格式化当前 .jcpro JSON 文件"]');
  await expect(formatButton).toBeEnabled();
  await formatButton.click();
  await expect(formatButton).toBeDisabled();
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '重载', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(`已格式化 jcpro JSON：${richProjectPath}`, { exact: true }),
  ).toBeVisible();

  const formattedFile = await page.evaluate(
    () =>
      (
        window as unknown as {
          __FORMATTED_JCPRO_FILE__: { path?: string; content?: string } | null;
        }
      ).__FORMATTED_JCPRO_FILE__,
  );
  expect(formattedFile?.path).toBe(richProjectPath);
  expect(formattedFile?.content).toMatch(/^\{\n {2}"config_version"/);
  expect(JSON.parse(formattedFile?.content ?? '{}')).toMatchObject({ config_version: 'jc001' });
});

test('keeps protocol field explanations and long language keys readable', async ({ page }) => {
  await openRichProject(page);

  await page.getByRole('button', { name: '协议', exact: true }).click();
  const protocolNavigation = page.getByRole('navigation', { name: '协议 功能' });
  await protocolNavigation.getByRole('button', { name: '锂电监控协议', exact: true }).click();
  const batteryMain = page.getByRole('main', { name: '锂电监控协议' });
  const signalHeader = batteryMain
    .locator('.battery-monitor-signal-table th')
    .filter({ hasText: 'signal_key' });
  await expect(signalHeader).toContainText('信号标识');
  await expect(signalHeader.locator('.battery-signal-header-code')).toHaveText('signal_key');
  await expect(signalHeader.locator('.battery-signal-header-label')).toHaveText('信号标识');

  await page.getByRole('button', { name: '多国语言', exact: true }).click();
  const longKey = 'battery_monitor.signal_with_an_intentionally_long_translation_key';
  await page.getByLabel('新增翻译键').fill(longKey);
  await page.getByRole('button', { name: '添加键', exact: true }).click();
  const translationRow = page.locator('.lang-table tbody tr').filter({ hasText: longKey });
  await expect(translationRow).toBeVisible();

  const editorLayout = await translationRow.evaluate((element) => {
    const keyCell = element.querySelector<HTMLElement>('.lang-table-cell-key');
    const sourceCell = element.querySelector<HTMLElement>('.lang-table-cell-source');
    const keyText = element.querySelector<HTMLElement>('.lang-table-key-text');
    const keyRect = keyCell?.getBoundingClientRect();
    const sourceRect = sourceCell?.getBoundingClientRect();
    const style = keyText ? getComputedStyle(keyText) : null;
    return {
      keyWidth: keyRect?.width ?? 0,
      keyRight: keyRect?.right ?? 0,
      sourceLeft: sourceRect?.left ?? 0,
      sourceWidth: sourceRect?.width ?? 0,
      keyHeight: keyText?.getBoundingClientRect().height ?? 0,
      whiteSpace: style?.whiteSpace,
      overflowWrap: style?.overflowWrap,
    };
  });
  expect(editorLayout.keyWidth).toBeLessThan(260);
  expect(editorLayout.sourceWidth).toBeGreaterThan(0);
  expect(editorLayout.keyRight).toBeLessThanOrEqual(editorLayout.sourceLeft);
  expect(editorLayout.keyHeight).toBeGreaterThan(24);
  expect(editorLayout.whiteSpace).toBe('normal');
  expect(editorLayout.overflowWrap).toBe('anywhere');

  await page.getByRole('button', { name: '全语言对比', exact: true }).click();
  const comparisonRow = page
    .locator('.lang-comparison-table tbody tr')
    .filter({ hasText: longKey });
  await expect(comparisonRow).toBeVisible();
  const comparisonLayout = await comparisonRow.evaluate((element) => {
    const keyCell = element.querySelector<HTMLElement>('.lang-comparison-cell-key');
    const translationCell = element.querySelector<HTMLElement>('.lang-comparison-cell');
    const keyText = element.querySelector<HTMLElement>('.lang-comparison-key-text');
    const keyRect = keyCell?.getBoundingClientRect();
    const translationRect = translationCell?.getBoundingClientRect();
    return {
      keyWidth: keyRect?.width ?? 0,
      keyRight: keyRect?.right ?? 0,
      translationLeft: translationRect?.left ?? 0,
      translationWidth: translationRect?.width ?? 0,
      keyHeight: keyText?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(comparisonLayout.keyWidth).toBeLessThan(260);
  expect(comparisonLayout.translationWidth).toBeGreaterThan(0);
  expect(comparisonLayout.keyRight).toBeLessThanOrEqual(comparisonLayout.translationLeft);
  expect(comparisonLayout.keyHeight).toBeGreaterThan(24);
});

test('meets the serious accessibility baseline across primary surfaces', async ({ page }) => {
  test.setTimeout(60_000);
  await expectNoSeriousAccessibilityViolations(page, '默认工作区');

  await page.getByRole('button', { name: '系统', exact: true }).click();
  await expect(page.getByRole('main', { name: '软件设置' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '软件设置');

  await page.getByRole('button', { name: '软件版本信息' }).click();
  await expect(page.getByRole('dialog', { name: '版本信息' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '版本信息弹层');

  await page.getByRole('button', { name: '关闭版本信息' }).click();
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectNoSeriousAccessibilityViolations(page, '深色软件设置');

  await page.getByRole('button', { name: '软件版本信息' }).click();
  await expect(page.getByRole('dialog', { name: '版本信息' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '深色版本信息弹层');
});

test('meets the serious accessibility baseline across every workspace', async ({ page }) => {
  test.setTimeout(180_000);
  const workspaceGroups = [
    {
      group: '项目',
      modules: ['项目管理'],
    },
    {
      group: '数据',
      modules: ['设置数据', '实时数据'],
    },
    {
      group: '协议',
      modules: [
        '业务信号字典',
        '私有协议 实验/废弃',
        '协议映射 实验',
        'CANopen 导出 实验',
        '锂电监控协议',
      ],
    },
    {
      group: '配置',
      modules: ['UI 资源编辑', '故障代码'],
    },
    {
      group: '多国语言',
      modules: ['多国语言'],
    },
    {
      group: '输出',
      modules: ['项目导出', 'CAN 测试数据构建'],
    },
    {
      group: '系统',
      modules: ['软件设置'],
    },
  ] as const;

  for (const theme of ['light', 'dark'] as const) {
    if ((await page.locator('html').getAttribute('data-theme')) !== theme) {
      await page.getByRole('button', { name: '切换主题' }).click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    }

    for (const { group, modules } of workspaceGroups) {
      const groupButton = page.getByRole('button', { name: group, exact: true });
      if ((await groupButton.getAttribute('aria-expanded')) !== 'true') {
        await groupButton.click();
      }
      const navigation = page.getByRole('navigation', { name: `${group} 功能` });

      for (const accessibleName of modules) {
        await navigation.getByRole('button', { name: accessibleName, exact: true }).click();
        const title = accessibleName.replace(/ (实验\/废弃|实验)$/, '');
        await expect(page.getByRole('main', { name: title })).toBeVisible();
        await expectNoSeriousAccessibilityViolations(
          page,
          `${theme === 'dark' ? '深色' : '浅色'}${title}工作区`,
        );
      }
    }
  }
});

test('honors the reduced motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '系统', exact: true }).click();
  const settings = page.getByRole('main', { name: '软件设置' });
  await settings.getByRole('textbox', { name: 'App ID' }).fill('reduced-motion-app');
  await settings.getByRole('textbox', { name: 'API Key' }).fill('reduced-motion-secret');
  await settings.getByRole('button', { name: '清空配置' }).click();

  const dialog = page.getByRole('dialog', { name: '清空翻译配置？' });
  await expect(dialog.locator('..')).toHaveCSS('animation-duration', '0.001s');
  await expect(dialog.getByRole('button', { name: '取消' })).toHaveCSS(
    'transition-duration',
    '0.001s',
  );
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
    main.getByRole('checkbox', { name: '写入锂电监控配置' }),
  ).toHaveCount(0);
  const themeSwitch = main.getByRole('switch', { name: '深色模式' });
  await expect(themeSwitch).toHaveAttribute(
    'aria-checked',
    (await page.locator('html').getAttribute('data-theme')) === 'dark' ? 'true' : 'false',
  );

  await main.getByRole('textbox', { name: 'App ID' }).fill('browser-preview-app');
  await main.getByRole('textbox', { name: 'API Key' }).fill('browser-preview-secret');
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .map((key) => localStorage.getItem(key) ?? '')
        .join('\n'),
    ),
  ).not.toContain('browser-preview-secret');
  await expect(main.getByRole('button', { name: '保存凭据' })).toBeDisabled();

  await main.getByRole('button', { name: '清空配置' }).click();
  const clearDialog = page.getByRole('dialog', { name: '清空翻译配置？' });
  await expect(clearDialog).toContainText('此操作无法撤销');
  await clearDialog.getByRole('button', { name: '取消' }).click();
  await expect(clearDialog).toBeHidden();

  await page.getByRole('button', { name: '输出', exact: true }).click();
  const exportNavigation = page.getByRole('navigation', { name: '输出 功能' });
  await exportNavigation.getByRole('button', { name: '项目导出', exact: true }).click();
  const exportMain = page.getByRole('main', { name: '项目导出' });
  await expect(exportMain).toBeVisible();
  await expect(
    exportMain.getByRole('checkbox', { name: '写入锂电监控配置' }),
  ).toBeVisible();
  await expect(
    exportMain.getByRole('checkbox', { name: '写入故障码配置' }),
  ).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).not.toContain(
    'jc-platform.export.battery-options',
  );
});

test('surfaces desktop-only actions as accessible errors in browser preview', async ({ page }) => {
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('系统保存对话框只能在 Tauri 桌面应用中使用。');

  await page.keyboard.press('Control+o');
  await expect(page.getByRole('alert')).toHaveText(
    '系统文件选择器只能在桌面应用中使用；也可以粘贴项目路径后打开。',
  );
});

test('supports accessible loaded-project editing and save', async ({ page }) => {
  test.setTimeout(180_000);
  await openRichProject(page);

  await page.getByRole('button', { name: '数据', exact: true }).click();
  const dataNavigation = page.getByRole('navigation', { name: '数据 功能' });
  await dataNavigation.getByRole('button', { name: '设置数据', exact: true }).click();
  await expect(page.getByRole('main', { name: '设置数据' })).toBeVisible();
  await expect(page.getByText('最高车速', { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '已加载项目的设置数据工作区');

  const parameterRow = page.getByRole('row').filter({ hasText: '最高车速' });
  const tableRadix = page.getByRole('group', { name: '通信索引显示进制' });
  await expect(parameterRow).toContainText('0x2002');
  await tableRadix.getByRole('button', { name: '十进制', exact: true }).click();
  await expect(parameterRow).toContainText('8194');
  await parameterRow.getByRole('button', { name: '编辑定义' }).click();
  const parameterDialog = page.getByRole('dialog', { name: '参数编辑：最高车速' });
  await expect(parameterDialog.getByRole('button', { name: '关闭设置数据编辑面板' })).toBeFocused();
  await expectNoSeriousAccessibilityViolations(page, '设置参数编辑抽屉');
  await expect(parameterDialog.getByLabel('MID')).toHaveValue('8194');
  await parameterDialog
    .getByRole('group', { name: '通信索引显示进制' })
    .getByRole('button', { name: '十六进制', exact: true })
    .click();
  await expect(parameterDialog.getByLabel('MID')).toHaveValue('0x2002');
  await parameterDialog.getByLabel('MID').fill('0x2003');
  await parameterDialog.getByLabel('MID').blur();
  await expect(parameterDialog.getByLabel('MID')).toHaveValue('0x2003');
  const dataTypeSelect = parameterDialog.getByLabel('数据类型');
  await dataTypeSelect.selectOption('s16:3');
  await expect(parameterDialog.getByText('配置写入 handle=3', { exact: false })).toBeVisible();
  await expect(parameterDialog.getByLabel('bit开始位置')).toHaveCount(0);
  await expect(parameterDialog.getByLabel('bit长度')).toHaveCount(0);
  await dataTypeSelect.selectOption('bits_4字节:10');
  await expect(parameterDialog.getByLabel('bit开始位置')).toBeVisible();
  await expect(parameterDialog.getByLabel('bit长度')).toBeVisible();
  await dataTypeSelect.selectOption('s16:3');
  const preprocessSelect = parameterDialog.getByLabel('数据预处理');
  await expect(preprocessSelect).toHaveValue('原始数据:0');
  await expect(parameterDialog.getByLabel('缩放值')).toBeDisabled();
  await expect(parameterDialog.getByLabel('偏移值')).toBeDisabled();
  await expect(parameterDialog.getByLabel('保留小数')).toBeDisabled();
  await preprocessSelect.selectOption('缩小偏移:1');
  await expect(parameterDialog.getByText('配置写入 pre_handle=1', { exact: false })).toBeVisible();
  await parameterDialog.getByLabel('缩放值').fill('10');
  await parameterDialog.getByLabel('偏移值').fill('1.5');
  await parameterDialog.getByLabel('保留小数').selectOption('2');
  await parameterDialog.getByLabel('名称').fill('最大车速');
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '保存', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(parameterDialog).toBeHidden();
  await expect(page.getByRole('row').filter({ hasText: '最大车速' })).toContainText('0x2003');

  await dataNavigation.getByRole('button', { name: '实时数据', exact: true }).click();
  await expect(page.getByRole('main', { name: '实时数据' })).toBeVisible();
  await expect(page.locator('input[value="车辆状态"]')).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '已加载项目的实时数据工作区');

  await page.getByRole('button', { name: '打开 JSON 编辑器' }).click();
  const jsonEditor = page.getByRole('dialog', { name: 'JSON 编辑器' });
  await expect(jsonEditor).toBeVisible();
  await expect(jsonEditor).toHaveCSS('position', 'fixed');
  await expect(jsonEditor).toHaveCSS('opacity', '1');
  await expectNoSeriousAccessibilityViolations(page, 'JSON 编辑器');
  await jsonEditor.getByRole('button', { name: '关闭 JSON 编辑器' }).click();
  await expect(jsonEditor).toBeHidden();

  await page.getByRole('button', { name: '生成测试数据', exact: true }).click();
  const testDataDialog = page.getByRole('dialog', { name: '确认生成测试数据' });
  await expect(testDataDialog).toContainText('PDO 简化配置');
  await testDataDialog.getByRole('button', { name: '确认生成', exact: true }).click();
  await expect(testDataDialog).toBeHidden();
  await expect(page.locator('input[value="电机运行状态"]')).toBeVisible();

  await page.getByRole('button', { name: '配置', exact: true }).click();
  await page
    .getByRole('navigation', { name: '配置 功能' })
    .getByRole('button', { name: '故障代码', exact: true })
    .click();
  await expect(page.getByText('牵引故障', { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '已加载项目的故障代码工作区');

  await page.getByRole('button', { name: '多国语言', exact: true }).click();
  await expect(page.getByRole('main', { name: '多国语言' })).toBeVisible();
  const existingEnglishTranslation = page.getByRole('textbox', { name: '最高车速 英文' });
  const emptyEnglishTranslation = page.getByRole('textbox', { name: '诊断模式 英文' });
  await expect(existingEnglishTranslation).toHaveValue('Maximum speed');
  await expect(emptyEnglishTranslation).toHaveValue('');
  await expectNoSeriousAccessibilityViolations(page, '已加载项目的多国语言工作区');
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '导入', exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: '导入完整语言表', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '查看语言导入说明' }).click();
  await expect(page.getByRole('note')).toContainText('中文_zh,乌克兰语_uk');
  await expect(page.getByRole('note')).toContainText('不覆盖已有翻译');

  await page.getByRole('button', { name: '导入单语言 CSV', exact: true }).click();
  await expect(emptyEnglishTranslation).toHaveValue('Diagnostic mode');
  await expect(existingEnglishTranslation).toHaveValue('Maximum speed');
  await expect(page.locator('.lang-import-status')).toContainText(
    '填充 1 条；跳过已有 1、未知 key 1、空值 1、重复 1',
  );
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __SINGLE_LANGUAGE_IMPORT_REQUEST__: { language_code?: string; path?: string } | null;
          }
        ).__SINGLE_LANGUAGE_IMPORT_REQUEST__,
    ),
  ).toMatchObject({ language_code: 'en', path: 'D:\\imports\\en.csv' });

  await page.getByRole('button', { name: '导入完整语言表', exact: true }).click();
  await expect(page.locator('.lang-import-status')).toHaveText('完整语言表已导入。');
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __FULL_LANGUAGE_IMPORT_REQUEST__: { path?: string } | null;
          }
        ).__FULL_LANGUAGE_IMPORT_REQUEST__,
    ),
  ).toMatchObject({ path: 'D:\\imports\\en.csv' });

  await page.keyboard.press('Control+s');
  const saveDialog = page.getByRole('dialog', { name: '确认保存' });
  await saveDialog.getByRole('button', { name: '确认保存', exact: true }).click();
  await expect(saveDialog).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __SAVED_PROJECT_DOCUMENT__: {
              sdo_info?: {
                children?: Array<{
                  children?: Array<{
                    name?: string;
                    handle?: number;
                    handle_name?: string;
                    pre_handle?: number;
                    pre_handle_name?: string;
                    pre_handle_scale?: string;
                    pre_handle_offset?: string;
                    pre_handle_decimal?: number;
                    pre_handle_decimal_name?: string;
                  }>;
                }>;
              };
            };
          }
        ).__SAVED_PROJECT_DOCUMENT__?.sdo_info?.children?.[0]?.children?.[0]?.name,
    ),
  ).toBe('最大车速');
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __SAVED_PROJECT_DOCUMENT__: {
              sdo_info?: {
                children?: Array<{
                  children?: Array<{
                    handle?: number;
                    handle_name?: string;
                    pre_handle?: number;
                    pre_handle_name?: string;
                    pre_handle_scale?: string;
                    pre_handle_offset?: string;
                    pre_handle_decimal?: number;
                    pre_handle_decimal_name?: string;
                  }>;
                }>;
              };
            };
          }
        ).__SAVED_PROJECT_DOCUMENT__?.sdo_info?.children?.[0]?.children?.[0],
    ),
  ).toMatchObject({
    handle: 3,
    handle_name: 's16',
    pre_handle: 1,
    pre_handle_name: '缩小偏移',
    pre_handle_scale: '10',
    pre_handle_offset: '1.5',
    pre_handle_decimal: 2,
    pre_handle_decimal_name: '2位',
  });
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '保存', exact: true }),
  ).toBeDisabled();

  await page.getByRole('button', { name: '输出', exact: true }).click();
  await page
    .getByRole('navigation', { name: '输出 功能' })
    .getByRole('button', { name: '项目导出', exact: true })
    .click();
  const exportMain = page.getByRole('main', { name: '项目导出' });
  const batteryConfigSwitch = exportMain.getByRole('checkbox', {
    name: '写入锂电监控配置',
  });
  await batteryConfigSwitch.uncheck();
  await expect(
    page.locator('.action-bar').getByRole('button', { name: '保存', exact: true }),
  ).toBeEnabled();
  await page.keyboard.press('Control+s');
  const exportSaveDialog = page.getByRole('dialog', { name: '确认保存' });
  await exportSaveDialog.getByRole('button', { name: '确认保存', exact: true }).click();
  await expect(exportSaveDialog).toBeHidden();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __SAVED_PROJECT_DOCUMENT__?: {
              export_info?: { battery_monitor?: { config?: boolean; bin?: boolean } };
            };
          }
        ).__SAVED_PROJECT_DOCUMENT__?.export_info?.battery_monitor,
    ),
  ).toMatchObject({ config: false, bin: true });
});

test('supports accessible Git review and comparison views', async ({ page }) => {
  test.setTimeout(60_000);
  await openRichProject(page);

  const gitTrigger = page.locator('.action-bar-git-trigger');
  await expect(gitTrigger).toContainText('main');
  await gitTrigger.click();
  const gitSummary = page.getByRole('dialog', { name: 'Git 版本摘要' });
  await gitSummary.getByRole('button', { name: /审阅更改/ }).click();
  const gitReview = page.getByRole('region', { name: 'Git 更改审阅' });
  await expect(gitReview).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, 'Git 更改审阅工作区');
  await gitReview.getByRole('button', { name: '并排对比视图' }).click();
  await expect(gitReview.getByRole('button', { name: '并排对比视图' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await gitReview.getByRole('button', { name: '编辑当前工作区文件' }).click();
  const worktreeEditor = gitReview.getByRole('region', { name: '对照编辑 rich-fixture.jcpro' });
  await expect(worktreeEditor).toBeVisible({ timeout: 15_000 });
  await expect(worktreeEditor.getByText('HEAD 原始版本')).toBeVisible();
  await expect(worktreeEditor.getByText('当前工作区（可编辑）')).toBeVisible();
  await expect(worktreeEditor.getByRole('button', { name: '回退此差异块' }).first()).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, 'Git 工作树对照编辑');
  const saveWorktreeButton = worktreeEditor.getByRole('button', { name: '保存文件' });
  await expect(saveWorktreeButton).toBeDisabled();
  await worktreeEditor.getByRole('button', { name: '回退此差异块' }).first().click();
  await expect(saveWorktreeButton).toBeEnabled();
  await saveWorktreeButton.click();
  await expect(worktreeEditor).toBeHidden();
  const savedWorktreeFile = await page.evaluate(
    () =>
      (
        window as unknown as {
          __SAVED_GIT_WORKTREE_FILE__: { path?: string; content?: string } | null;
        }
      ).__SAVED_GIT_WORKTREE_FILE__,
  );
  expect(savedWorktreeFile?.path).toBe('rich-fixture.jcpro');
  expect(JSON.parse(savedWorktreeFile?.content ?? '{}')).toMatchObject({ config_version: 'jc000' });
  await gitReview.getByRole('button', { name: '关闭审阅' }).click();
});

test('keeps loaded-project workspaces accessible in dark mode', async ({ page }) => {
  test.setTimeout(120_000);
  await openRichProject(page);
  await page.getByRole('button', { name: '切换主题' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  const surfaces = [
    { group: '数据', module: '设置数据' },
    { group: '数据', module: '实时数据' },
    { group: '配置', module: '故障代码' },
    { group: '多国语言', module: '多国语言' },
  ] as const;

  for (const surface of surfaces) {
    const groupButton = page.getByRole('button', { name: surface.group, exact: true });
    if ((await groupButton.getAttribute('aria-expanded')) !== 'true') {
      await groupButton.click();
    }
    await page
      .getByRole('navigation', { name: `${surface.group} 功能` })
      .getByRole('button', { name: surface.module, exact: true })
      .click();
    await expect(page.getByRole('main', { name: surface.module })).toBeVisible();
    await expectNoSeriousAccessibilityViolations(page, `深色数据态${surface.module}工作区`);
  }

  await page.locator('.action-bar-git-trigger').click();
  const gitSummary = page.getByRole('dialog', { name: 'Git 版本摘要' });
  await gitSummary.getByRole('button', { name: /审阅更改/ }).click();
  const gitReview = page.getByRole('region', { name: 'Git 更改审阅' });
  await expect(gitReview).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page, '深色 Git 更改审阅工作区');
});

test('offers to restore an unsaved project draft', async ({ page }) => {
  const projectPath = 'D:\\projects\\recovery-fixture.jcpro';
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.evaluate((path) => {
    const baseDocument = {
      project: { name: 'Recovery Fixture', revision: 1 },
      battery_monitor: {
        schema_version: 1,
        enabled: true,
        version: 1,
        default_timeout_ticks: 200,
        page_size: 4,
        frames: [],
        signals: [],
        items: [],
      },
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
      invoke: async (command: string, args?: Record<string, unknown>) => {
        const updateCalls = (window as unknown as { __UPDATE_CALLS__?: string[] }).__UPDATE_CALLS__;
        if (command.startsWith('plugin:updater|') || command === 'plugin:process|restart') {
          updateCalls?.push(command);
        }
        if (command.startsWith('plugin:event|')) return 1;
        if (command === 'plugin:window|set_title') return null;
        if (command === 'plugin:app|name') return '自定义开发平台';
        if (command === 'plugin:app|version') return '0.1.0';
        if (command === 'open_project_window') {
          return { action: 'current', windowLabel: 'main', path };
        }
        if (command === 'create_project_window') {
          return { action: 'current', windowLabel: 'main', path };
        }
        if (command === 'release_project_window') return null;
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
        if (command === 'load_project_recovery_draft') {
          return (window as unknown as { __RECOVERY_DRAFT__: Record<string, unknown> | null })
            .__RECOVERY_DRAFT__;
        }
        if (command === 'save_project_recovery_draft') {
          updateCalls?.push(command);
          if ((window as unknown as { __FAIL_RECOVERY_SAVE__: boolean }).__FAIL_RECOVERY_SAVE__) {
            throw new Error('recovery storage unavailable');
          }
          (
            window as unknown as { __RECOVERY_DRAFT__: Record<string, unknown> | null }
          ).__RECOVERY_DRAFT__ = (args?.draft as Record<string, unknown>) ?? null;
          return null;
        }
        if (command === 'clear_project_recovery_draft') {
          (
            window as unknown as { __RECOVERY_DRAFT__: Record<string, unknown> | null }
          ).__RECOVERY_DRAFT__ = null;
          return true;
        }
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
    (window as unknown as { __FAIL_RECOVERY_SAVE__: boolean }).__FAIL_RECOVERY_SAVE__ = false;
    (
      window as unknown as { __RECOVERY_DRAFT__: Record<string, unknown> | null }
    ).__RECOVERY_DRAFT__ = null;
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
  ).toBeNull();
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as {
            __RECOVERY_DRAFT__: { document?: { project?: { revision?: number } } } | null;
          }
        ).__RECOVERY_DRAFT__?.document?.project?.revision,
    ),
  ).toBe(2);

  const beforeUpdateEventPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(beforeUpdateEventPrevented).toBe(true);

  await page.getByRole('button', { name: '软件版本信息' }).click();
  const aboutDialog = page.getByRole('dialog', { name: '版本信息' });
  const aboutPanel = page.locator('.version-popup');
  await aboutDialog.getByRole('button', { name: '检查更新' }).click();
  const installButton = aboutDialog.getByRole('button', { name: '安装更新' });
  await expect(installButton).toBeVisible();
  await installButton.click();

  const updateDialog = page.getByRole('dialog', { name: '安装并重启应用？' });
  await expect(updateDialog).toContainText('当前项目存在未保存修改');
  await expect(aboutPanel).toHaveAttribute('aria-hidden', 'true');
  await expect(updateDialog.locator('..')).toHaveCSS('z-index', '200');
  await expect(updateDialog.getByRole('button', { name: '返回保存' })).toBeFocused();
  const updateDialogBox = await updateDialog.boundingBox();
  expect(updateDialogBox).not.toBeNull();
  expect((updateDialogBox?.x ?? 0) + (updateDialogBox?.width ?? 0)).toBeLessThanOrEqual(1024);
  expect((updateDialogBox?.y ?? 0) + (updateDialogBox?.height ?? 0)).toBeLessThanOrEqual(720);
  await page.keyboard.press('Escape');
  await expect(updateDialog).toBeHidden();
  await expect(aboutDialog).toBeVisible();
  await expect(aboutPanel).not.toHaveAttribute('aria-hidden', 'true');
  await expect(installButton).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__.filter((command) =>
          command.includes('download_and_install'),
        ).length,
    ),
  ).toBe(0);

  await aboutDialog.getByRole('button', { name: '安装更新' }).click();
  await page.evaluate(() => {
    (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__ = [];
    (window as unknown as { __FAIL_RECOVERY_SAVE__: boolean }).__FAIL_RECOVERY_SAVE__ = true;
  });
  await updateDialog.getByRole('button', { name: '继续更新' }).click();
  await expect(aboutDialog.getByText('无法安全保存恢复草稿，更新重启已取消。')).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__,
    ),
  ).not.toContain('plugin:process|restart');

  await page.evaluate(() => {
    (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__ = [];
    (window as unknown as { __FAIL_RECOVERY_SAVE__: boolean }).__FAIL_RECOVERY_SAVE__ = false;
  });
  await aboutDialog.getByRole('button', { name: '检查更新' }).click();
  await expect(installButton).toBeVisible();
  await installButton.click();
  await updateDialog.getByRole('button', { name: '继续更新' }).click();
  await expect(aboutDialog.getByText('更新已安装，正在重启应用', { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__,
    ),
  ).toEqual(
    expect.arrayContaining([
      'plugin:updater|download_and_install',
      'save_project_recovery_draft',
      'plugin:process|restart',
    ]),
  );
  const updateCalls = await page.evaluate(
    () => (window as unknown as { __UPDATE_CALLS__: string[] }).__UPDATE_CALLS__,
  );
  expect(updateCalls.lastIndexOf('save_project_recovery_draft')).toBeLessThan(
    updateCalls.indexOf('plugin:process|restart'),
  );
  const authorizedUpdateEventPrevented = await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(authorizedUpdateEventPrevented).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem('jc-custom-platform.projectRecoveryDraft')),
  ).toBeNull();

  await page.keyboard.press('Escape');
  await expect(aboutDialog).toBeHidden();

  await page.keyboard.press('Control+s');
  const saveDialog = page.getByRole('dialog', { name: '确认保存' });
  await expect(saveDialog).toBeVisible();
  await saveDialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(saveDialog).toBeHidden();
});
