import { test, expect, BrowserContext } from '@playwright/test';
import { launchWithExtension } from './helpers';

const TEST_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Scroll test</title></head>
<body>
  <p id="static">This is a static English paragraph that should be translated.</p>
  <div id="spacer" style="height:2000px;"></div>
  <div id="container"></div>
  <script>
    let added = false;
    window.addEventListener('scroll', () => {
      if (added) return;
      if (window.scrollY > 500) {
        added = true;
        const p = document.createElement('p');
        p.id = 'dynamic';
        p.textContent = 'This dynamic paragraph was added after scrolling.';
        document.getElementById('container').appendChild(p);
      }
    });
  </script>
</body>
</html>`;

async function serveTestPage(context: BrowserContext, path: string, html: string) {
  await context.route(`http://xt-local-test.invalid${path}`, route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }),
  );
}

// #xt-floating-host is the outermost host div; it has the mousedown handler.
// .xt-fab-btn has pointer-events:none so Playwright cannot click it directly.
const FAB_HOST = '#xt-floating-host';

test.describe('FAB appears and translation starts on English page', () => {
  test('FAB is injected and click triggers translation placeholders', async () => {
    test.setTimeout(40000);
    const context = await launchWithExtension();
    const page = await context.newPage();
    try {
      await serveTestPage(context, '/test.html', TEST_PAGE_HTML);
      await page.goto('http://xt-local-test.invalid/test.html');

      await expect(page.locator(FAB_HOST)).toBeVisible({ timeout: 10000 });

      // Combine click + check in one synchronous evaluate.
      // floatingBtn.updateState({ loading:true }) and injectPlaceholder() both run
      // synchronously before the first await in translatePage(), so .xt-loading
      // elements exist in the DOM when this evaluate callback returns — regardless
      // of how quickly the IPC call resolves.
      const hasLoading = await page.evaluate(() => {
        const host = document.getElementById('xt-floating-host');
        if (!host) return false;
        host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        // Either auto-translate is in progress (already has .xt-loading) or the click
        // just started a new translate; either way .xt-loading should now be present.
        return document.querySelectorAll('.xt-loading').length > 0;
      });
      expect(hasLoading).toBe(true);
    } finally {
      await context.close();
    }
  });
});

test.describe('Dynamic content is included when translation starts', () => {
  test('paragraph added before FAB click is detected by getTargets and gets a placeholder', async () => {
    test.setTimeout(40000);
    const context = await launchWithExtension();
    const page = await context.newPage();
    try {
      await serveTestPage(context, '/test.html', TEST_PAGE_HTML);
      await page.goto('http://xt-local-test.invalid/test.html');

      await expect(page.locator(FAB_HOST)).toBeVisible({ timeout: 10000 });

      // Wait for any in-progress auto-translate to finish so isTranslating is false.
      // When loading is done the FAB button loses the xt-loading class.
      await page.waitForFunction(
        () => !document.querySelector('#xt-fab .xt-fab-btn.xt-loading'),
        { timeout: 10000 },
      );

      // Scroll to inject #dynamic BEFORE clicking the FAB.
      // getTargets() will then include it in the initial batch.
      await page.evaluate(() => window.scrollTo(0, 1500));
      await page.waitForSelector('#dynamic', { timeout: 5000 });

      // Combine click + check in one synchronous evaluate so the DOM query runs in
      // the same JS task as injectPlaceholder(). translatePage() calls injectPlaceholder()
      // synchronously (before the first await), so data-xt-id is present by the time
      // this evaluate function returns — regardless of how quickly the IPC call resolves.
      const detected = await page.evaluate(() => {
        const host = document.getElementById('xt-floating-host');
        if (!host) return false;
        host.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        return document.getElementById('dynamic')?.hasAttribute('data-xt-id') ?? false;
      });
      expect(detected).toBe(true);
    } finally {
      await context.close();
    }
  });
});

test.describe('YouTube: FAB appears on page', () => {
  test('FAB is visible on YouTube video page', async () => {
    test.setTimeout(40000);
    const context = await launchWithExtension();
    const page = await context.newPage();
    try {
      await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
        waitUntil: 'domcontentloaded',
      });
      // content.ts runs on <all_urls> including YouTube
      await expect(page.locator(FAB_HOST)).toBeVisible({ timeout: 10000 });
    } finally {
      await context.close();
    }
  });
});
