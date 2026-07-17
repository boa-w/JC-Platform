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
  await expect(page.getByRole('heading', { name: 'CAN 测试数据构建' })).toBeVisible();

  await page.getByRole('button', { name: '协议', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '协议 功能' })).toBeVisible();
  await page.getByRole('button', { name: '业务信号字典', exact: true }).click();
  await expect(page.getByRole('heading', { name: '业务信号字典' })).toBeVisible();
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

test('surfaces desktop-only actions as accessible errors in browser preview', async ({ page }) => {
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('系统保存对话框只能在 Tauri 桌面应用中使用。');
});
