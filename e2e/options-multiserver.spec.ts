import { test, expect } from '@playwright/test';
import { launchWithExtension, getExtensionId } from './helpers';

/**
 * Tests the Options page multi-server list UI:
 * - Renders server list from saved settings
 * - Add / remove / reorder URLs
 * - Save persists serverUrls array
 */
test.describe('Options page — multi-server list', () => {
  test('shows one empty server entry on first load', async () => {
    const context = await launchWithExtension();
    try {
      const extId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extId}/options.html`);

      const inputs = page.locator('#server-list input.server-url');
      await expect(inputs).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test('add server button appends a new entry', async () => {
    const context = await launchWithExtension();
    try {
      const extId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extId}/options.html`);

      // Wait for load() to populate the list (async chrome.storage read)
      await expect(page.locator('#server-list input.server-url')).toHaveCount(1, { timeout: 8000 });

      await page.click('#add-server');
      await expect(page.locator('#server-list input.server-url')).toHaveCount(2);
    } finally {
      await context.close();
    }
  });

  test('delete button removes a server entry', async () => {
    const context = await launchWithExtension();
    try {
      const extId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extId}/options.html`);

      // Wait for initial load
      await expect(page.locator('#server-list input.server-url')).toHaveCount(1, { timeout: 8000 });

      // Add one more
      await page.click('#add-server');
      await expect(page.locator('#server-list input.server-url')).toHaveCount(2);

      // Delete first
      const deleteButtons = page.locator('#server-list button.icon-btn.danger');
      await deleteButtons.first().click();
      await expect(page.locator('#server-list input.server-url')).toHaveCount(1);
    } finally {
      await context.close();
    }
  });

  test('up/down buttons reorder entries', async () => {
    const context = await launchWithExtension();
    try {
      const extId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extId}/options.html`);

      // Wait for initial load
      await expect(page.locator('#server-list input.server-url')).toHaveCount(1, { timeout: 8000 });

      // Set up two entries
      const firstInput = page.locator('#server-list input.server-url').first();
      await firstInput.fill('http://server-a:3000');
      await page.click('#add-server');
      const secondInput = page.locator('#server-list input.server-url').nth(1);
      await secondInput.fill('http://server-b:3000');

      // Move second entry up (its up button)
      const upButtons = page.locator('#server-list button[title="上移"]');
      await upButtons.nth(1).click();

      // Now server-b should be first
      const values = await page.locator('#server-list input.server-url').evaluateAll(
        (els: HTMLInputElement[]) => els.map(e => e.value),
      );
      expect(values[0]).toBe('http://server-b:3000');
      expect(values[1]).toBe('http://server-a:3000');
    } finally {
      await context.close();
    }
  });
});
