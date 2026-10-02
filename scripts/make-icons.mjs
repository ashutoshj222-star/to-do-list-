// Renders the PNG app icons from SVG with Playwright's Chromium.
// Usage: node scripts/make-icons.mjs   (needs the `playwright` package)
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const glyph = '<circle cx="256" cy="256" r="132" fill="none" stroke="#fff" stroke-width="30"/><path d="M196 260l42 42 82-88" fill="none" stroke="#fff" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"/>';
const grad = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E8BFF"/><stop offset="1" stop-color="#0066E0"/></linearGradient></defs>';
const fill = '<rect width="512" height="512" fill="url(#g)"/>';
const rounded = `${grad}<rect width="512" height="512" rx="114" fill="url(#g)"/>${glyph}`;
const square = `${grad}${fill}${glyph}`;
const scaled = (s, body) => `<g transform="translate(${256 - 256 * s} ${256 - 256 * s}) scale(${s})">${body}</g>`;

const icons = [
  ['www/icons/icon-192.png', 192, rounded],
  ['www/icons/icon-512.png', 512, rounded],
  ['www/icons/icon-maskable-512.png', 512, `${grad}${fill}${scaled(0.8, glyph)}`],
  ['www/icons/apple-touch-icon.png', 180, square],
  ['www/icons/badge-96.png', 96, scaled(1.18, glyph)],
  // Sources for the native app icon & splash (used by @capacitor/assets).
  ['assets/icon-only.png', 1024, square],
  ['assets/icon-foreground.png', 1024, scaled(0.7, glyph)],
  ['assets/icon-background.png', 1024, `${grad}${fill}`],
  ['assets/splash.png', 2732, `<rect width="512" height="512" fill="#F2F2F7"/>${scaled(0.22, rounded)}`],
  ['assets/splash-dark.png', 2732, `<rect width="512" height="512" fill="#000"/>${scaled(0.22, rounded)}`],
];

const browser = await chromium.launch();
for (const [out, size, body] of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<html><body style="margin:0;background:transparent"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" style="display:block">${body}</svg></body></html>`);
  writeFileSync(out, await page.screenshot({ omitBackground: true }));
  await page.close();
  console.log('wrote', out);
}
await browser.close();
