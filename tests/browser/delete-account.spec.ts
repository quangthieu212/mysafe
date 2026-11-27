import { expect, test } from '@playwright/test';

test('delete account requires confirmation and clears the current device cache', async ({ page }) => {
  const email = `delete-${crypto.randomUUID()}@example.test`;
  const password = 'delete-account-password';
  await page.goto('/');
  await page.getByRole('button', { name: 'Tạo két mới' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill(password);
  await page.getByLabel('Mật khẩu chính').fill('delete-account-master-password');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Tạo két an toàn' }).click();
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.getByRole('button', { name: 'Xóa tài khoản' }).click();
  await expect(page.getByRole('dialog', { name: 'Xóa tài khoản và dữ liệu' })).toBeVisible();
  await expect(page.getByText(/cache mã hóa trên thiết bị khác không thể xóa/)).toBeVisible();
  await page.getByLabel('Nhập email tài khoản').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill('wrong-delete-password');
  await page.getByRole('button', { name: 'Xóa tài khoản vĩnh viễn' }).click();
  await expect(page.locator('.form-error')).toContainText('chưa đúng');
  await expect(page.getByRole('dialog', { name: 'Xóa tài khoản và dữ liệu' })).toBeVisible();

  await page.getByLabel('Mật khẩu đăng nhập').fill(password);
  await page.getByRole('button', { name: 'Xóa tài khoản vĩnh viễn' }).click();
  await expect(page.getByText(/Tài khoản và dữ liệu trên máy chủ đã được xóa/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Xóa tài khoản và dữ liệu' })).toHaveCount(0);

  await page.locator('.mode-switch').getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mật khẩu đăng nhập').fill(password);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.locator('.form-error')).toContainText('chưa đúng');
});
