// Generates public/icon-{16,32,48,128}.png using Playwright.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'src', 'public');
if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:128px; height:128px; background:transparent; overflow:hidden; }

.icon {
  width:128px; height:128px;
  border-radius:24px;
  background: linear-gradient(145deg, #0d0b1e 0%, #1e1b4b 45%, #312e81 100%);
  position:relative;
  display:flex;
  align-items:center;
  justify-content:center;
  overflow:hidden;
}

/* Top-left shine */
.icon::before {
  content:'';
  position:absolute;
  top:-24px; left:-16px;
  width:90px; height:70px;
  background: radial-gradient(ellipse, rgba(255,255,255,0.13) 0%, transparent 70%);
  border-radius:50%;
  pointer-events:none;
}

/* Ambient glow behind T */
.glow {
  position:absolute;
  top:50%; left:50%;
  transform:translate(-50%,-52%);
  width:80px; height:80px;
  background: radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%);
  border-radius:50%;
  pointer-events:none;
}

.letter-t {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 90px;
  font-weight: 700;
  line-height: 1;
  position: relative;
  z-index: 1;
  margin-bottom: 6px;

  /* White → lavender gradient */
  background: linear-gradient(175deg, #ffffff 0%, #e0e7ff 55%, #a5b4fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;

  /* Subtle glow via drop-shadow on the wrapper */
  filter: drop-shadow(0 0 10px rgba(129,140,248,0.7));
}

/* Chinese character — bottom-right */
.letter-zh {
  position: absolute;
  bottom: 6px;
  right: 9px;
  font-family: serif;
  font-size: 30px;
  font-weight: 700;
  color: #818cf8;
  opacity: 0.88;
  line-height: 1;
  filter: drop-shadow(0 0 4px rgba(129,140,248,0.5));
}

/* Bottom edge glow */
.glow-bottom {
  position:absolute;
  bottom:-18px; left:50%;
  transform:translateX(-50%);
  width:88px; height:36px;
  background: radial-gradient(ellipse, rgba(99,102,241,0.35) 0%, transparent 70%);
  border-radius:50%;
}
</style>
</head>
<body>
<div class="icon">
  <div class="glow"></div>
  <div class="letter-t">T</div>
  <div class="letter-zh">文</div>
  <div class="glow-bottom"></div>
</div>
</body>
</html>`;

const sizes = [128, 48, 32, 16];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Render at 128×128, then screenshot at target size using deviceScaleFactor
  await page.setContent(html, { waitUntil: 'load' });

  for (const size of sizes) {
    await page.setViewportSize({ width: 128, height: 128 });
    // Use CSS zoom to scale the 128px design down to target size
    await page.evaluate((s) => {
      document.body.style.zoom = `${s / 128}`;
      document.body.style.width = `${s}px`;
      document.body.style.height = `${s}px`;
    }, size);
    await page.setViewportSize({ width: size, height: size });

    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: size, height: size },
      omitBackground: true,
    });

    const out = path.join(publicDir, `icon-${size}.png`);
    writeFileSync(out, buf);
    console.log(`✓ icon-${size}.png`);
  }

  await browser.close();
  console.log('Done — icons saved to public/');
})();
