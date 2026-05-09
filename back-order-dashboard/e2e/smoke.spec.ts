import { test, expect } from '@playwright/test';

test('app loads without server error', async ({ page }) => {
  const response = await page.goto('/dashboard');
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('body')).toBeVisible();
});
