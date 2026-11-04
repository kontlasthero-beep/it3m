'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXE || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.join(__dirname, 'review.html')).href);
  await page.waitForFunction(() => document.querySelectorAll('#buttons article.tile').length === window.UI_KIT?.buttons.length && document.querySelectorAll('#modules article.tile').length === window.UI_KIT?.modules.length);
  const missing = await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src));
  if (missing.length || errors.length) throw new Error(JSON.stringify({ missing, errors }));
  await page.screenshot({ path: path.join(__dirname, 'review-desktop-top.png') });
  await page.screenshot({ path: path.join(__dirname, 'review-desktop.png'), fullPage: true });
  await page.selectOption('#theme', 'signal');
  await page.click('#compact');
  await page.selectOption('#state', 'hover');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('#buttons .tile img')?.getAttribute('src')?.includes('compact--hover'));
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  const missingMobile = await page.locator('img').evaluateAll(images => images.filter(img => !img.complete || img.naturalWidth === 0).map(img => img.src));
  if (mobileOverflow || missingMobile.length || errors.length) throw new Error(JSON.stringify({ mobileOverflow, missingMobile, errors }));
  await page.screenshot({ path: path.join(__dirname, 'review-compact-top.png') });
  await page.screenshot({ path: path.join(__dirname, 'review-compact.png'), fullPage: true });
  console.log('Review page rendered at desktop and 390px compact widths with no missing images or horizontal overflow.');
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
