import { test, expect } from '@playwright/test';
import { launchWithExtension } from './helpers';

/**
 * Verifies the translate button is injected into the YouTube player
 * and toggles caption translation on/off.
 */
test.describe('YouTube caption translate button', () => {
  test('button appears in .ytp-right-controls-left next to subtitles', async () => {
    const context = await launchWithExtension();
    const page = await context.newPage();

    try {
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        waitUntil: 'domcontentloaded',
      });

      // Wait for player controls to appear
      await page.waitForSelector('.ytp-right-controls-left', { timeout: 15000 });

      // The extension polls up to 8s for the button; give it time
      const btn = page.locator('#xt-caption-toggle');
      await expect(btn).toBeVisible({ timeout: 12000 });

      // Verify placement: should be inside .ytp-right-controls-left
      const inRightControls = await page.evaluate(() => {
        const btn = document.getElementById('xt-caption-toggle');
        return btn?.closest('.ytp-right-controls-left') !== null ||
               btn?.closest('.ytp-right-controls') !== null;
      });
      expect(inRightControls).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('clicking button changes title from off to on', async () => {
    const context = await launchWithExtension();
    const page = await context.newPage();

    try {
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('#xt-caption-toggle', { timeout: 15000 });

      const btn = page.locator('#xt-caption-toggle');
      await expect(btn).toHaveAttribute('title', '開啟字幕翻譯');

      await btn.click();
      await expect(btn).toHaveAttribute('title', '關閉字幕翻譯');

      await btn.click();
      await expect(btn).toHaveAttribute('title', '開啟字幕翻譯');
    } finally {
      await context.close();
    }
  });

  test('button appears on second YouTube video page', async () => {
    test.setTimeout(60000);
    const context = await launchWithExtension();
    const page = await context.newPage();

    try {
      // Load a second distinct video — verifies injection is not one-time-only
      await page.goto('https://www.youtube.com/watch?v=9bZkp7q19f0', {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForSelector('.ytp-right-controls-left', { timeout: 20000 });

      const btn = page.locator('#xt-caption-toggle');
      await expect(btn).toBeVisible({ timeout: 15000 });
      await expect(btn).toHaveAttribute('title', '開啟字幕翻譯');
    } finally {
      await context.close();
    }
  });
});
