import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const loginPassword = 'separate-account-password';
const masterPassword = 'separate-vault-password';

async function unlockWithMaster(page: import('@playwright/test').Page) {
  await expect(page.getByLabel('Mật khẩu chính')).toBeVisible();
  await page.getByLabel('Mật khẩu chính').fill(masterPassword);
  await page.getByRole('button', { name: 'Mở két' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
}

async function login(page: import('@playwright/test').Page, email: string) {
  await page.goto('/');
  await expect(page.locator('.mode-switch')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill(loginPassword);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
  await unlockWithMaster(page);
}

async function addEntry(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: /Thêm thông tin/ }).first().click();
  await page.getByLabel('Tiêu đề').fill(title);
  await page.getByRole('button', { name: 'Lưu thông tin' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('Đã đồng bộ', { exact: true })).toBeVisible();
}

test('syncs between isolated browser contexts and restores an exported backup', async ({ browser, page }) => {
  test.setTimeout(120_000);
  const email = `sync-${crypto.randomUUID()}@example.test`;
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !/40[14] \((Unauthorized|Not Found)\)/.test(message.text())) browserErrors.push(message.text());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Tạo két mới' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill(loginPassword);
  await page.getByLabel('Mật khẩu chính').fill(masterPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo két an toàn' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();

  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('button', { name: 'Thêm thông tin' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  }
  const unnamedButtons = await page.locator('button').evaluateAll(buttons => buttons
    .filter(button => !(button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent?.trim()))
    .map(button => button.outerHTML));
  expect(unnamedButtons).toEqual([]);
  await page.keyboard.press('Tab');
  const focusStyle = await page.evaluate(() => {
    const active = document.activeElement;
    return active instanceof HTMLElement ? getComputedStyle(active).outlineStyle : 'none';
  });
  expect(focusStyle).toBe('solid');

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await login(secondPage, email);
    await addEntry(page, 'Đồng bộ từ phiên một');

    await secondPage.getByRole('button', { name: 'Đăng xuất' }).click();
    await secondPage.locator('.mode-switch').getByRole('button', { name: 'Đăng nhập' }).click();
    await login(secondPage, email);
    await expect(secondPage.getByRole('heading', { name: 'Đồng bộ từ phiên một' })).toBeVisible();

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: /Sao lưu & khôi phục/ }).click();
    await page.getByRole('button', { name: /Tải bản sao lưu mã hóa/ }).click();
    const download = await downloadEvent;
    const backupBytes = await readFile(await download.path());
    await page.getByRole('button', { name: 'Đóng' }).click();

    await addEntry(page, 'Mục thêm sau bản sao lưu');
    await page.getByRole('button', { name: /Sao lưu & khôi phục/ }).click();
    await page.locator('input[type="file"]').setInputFiles({
      name: download.suggestedFilename(), mimeType: 'application/json', buffer: backupBytes,
    });
    await expect(page.getByText('Bản sao lưu hợp lệ')).toBeVisible();
    await page.getByRole('button', { name: 'Khôi phục thành phiên bản mới' }).click();
    await expect(page.getByRole('heading', { name: 'Đồng bộ từ phiên một' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Mục thêm sau bản sao lưu' })).toHaveCount(0);
    await expect(page.getByText(/Đã phục hồi 1 mục thành phiên bản mới/)).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await secondContext.close();
  }
});
