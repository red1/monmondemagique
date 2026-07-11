/**
 * Capture app screenshots for README documentation (Expo web).
 * Usage: node scripts/capture-screenshots.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '../assets/docs/screenshots');
const BASE = process.argv[2] || 'http://localhost:19006';

const ROUTES = [
  { name: '01-home', path: '/', wait: 2500 },
  { name: '02-coloring-library', path: '/library', wait: 2000 },
  { name: '03-math', path: '/math', wait: 2000 },
  { name: '04-logic', path: '/logic', wait: 2000 },
  { name: '05-hangman', path: '/hangman', wait: 2000 },
  { name: '06-reading', path: '/reading', wait: 2000 },
  { name: '07-stories-library', path: '/stories', wait: 3000 },
  { name: '08-story-packages', path: '/story_packages', wait: 3000 },
  { name: '09-jokes', path: '/jokes', wait: 2000 },
  { name: '10-puzzle-library', path: '/puzzle', wait: 2000 },
  { name: '11-connect4', path: '/connect4', wait: 2000 },
  { name: '12-differences', path: '/diff_library', wait: 2000 },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 768 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log(`Capturing from ${BASE} → ${OUT_DIR}`);

  for (const route of ROUTES) {
    const url = `${BASE}${route.path}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(route.wait);
      const out = path.join(OUT_DIR, `${route.name}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`✓ ${route.name}`);
    } catch (e) {
      console.warn(`✗ ${route.name}: ${e.message}`);
    }
  }

  // Coloring canvas — open first image from library
  try {
    await page.goto(`${BASE}/library`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const firstImage = page.locator('[data-testid], img, [role="button"]').first();
    const tiles = page.locator('div').filter({ has: page.locator('img') });
    const count = await tiles.count();
    if (count > 0) {
      await tiles.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    await page.screenshot({
      path: path.join(OUT_DIR, '13-coloring-canvas.png'),
      fullPage: false,
    });
    console.log('✓ 13-coloring-canvas');
  } catch (e) {
    console.warn(`✗ 13-coloring-canvas: ${e.message}`);
  }

  // Parental settings modal on home
  try {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const settingsBtn = page.getByRole('button').filter({ hasText: /settings|param|réglages|⚙|engrenage/i }).first();
    const gearIcon = page.locator('[aria-label*="settings" i], [accessibilitylabel*="settings" i]').first();
    const candidates = [
      page.locator('div').filter({ has: page.locator('svg') }).last(),
      page.getByText('⚙').first(),
    ];
    let clicked = false;
    for (const c of candidates) {
      if (await c.count() > 0) {
        await c.click({ timeout: 2000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // top-right corner tap area (settings gear on home header)
      await page.mouse.click(980, 40);
    }
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(OUT_DIR, '14-parental-settings.png'),
      fullPage: false,
    });
    console.log('✓ 14-parental-settings');
  } catch (e) {
    console.warn(`✗ 14-parental-settings: ${e.message}`);
  }

  await browser.close();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
