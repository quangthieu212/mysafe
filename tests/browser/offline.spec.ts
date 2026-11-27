import { expect, test } from '@playwright/test';

test('reopens an encrypted local vault after an offline cold start and syncs on reconnect', async ({ page }) => {
  test.setTimeout(120_000);
  const email = `offline-${crypto.randomUUID()}@example.test`;
  const loginPassword = 'offline-account-password';
  const masterPassword = 'offline-vault-password';

  await page.goto('/');
  await page.getByRole('button', { name: 'Tạo két mới' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill(loginPassword);
  await page.getByLabel('Mật khẩu chính').fill(masterPassword);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo két an toàn' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button', { name: 'Thêm thông tin' }).first().click();
  await page.getByLabel('Tiêu đề').fill('Ghi chú khi offline');
  await page.getByRole('button', { name: 'Lưu thông tin' }).click();
  await expect(page.getByRole('heading', { name: 'Ghi chú khi offline' })).toBeVisible();
  await expect(page.getByText('Đã đồng bộ', { exact: true })).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Mật khẩu chính')).toBeVisible();
  await expect(page.getByText(/Ngoại tuyến/)).toBeVisible();

  const apiResponses: number[] = [];
  page.on('response', response => { if (response.url().includes('/api/')) apiResponses.push(response.status()); });
  await page.getByLabel('Mật khẩu chính').fill(masterPassword);
  await page.getByRole('button', { name: 'Mở két' }).click();
  await expect(page.getByRole('heading', { name: 'Ghi chú khi offline' })).toBeVisible();
  await page.getByRole('button', { name: 'Thêm thông tin' }).first().click();
  await page.getByLabel('Tiêu đề').fill('Tạo khi mất mạng');
  await page.getByRole('button', { name: 'Lưu thông tin' }).click();
  await expect(page.getByRole('heading', { name: 'Tạo khi mất mạng' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('sẽ đồng bộ khi có mạng');
  expect(apiResponses).toEqual([]);

  await page.context().setOffline(false);
  await expect(page.getByText('Đã đồng bộ', { exact: true })).toBeVisible({ timeout: 15_000 });
});
