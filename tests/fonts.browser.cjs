const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

(async () => {
  const reservation = net.createServer().listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const server = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATABASE_URL: '', UCC_LOCAL_TEST_LEVEL: '100' },
    windowsHide: true
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Server exited: ${code}`)));
      server.stdout.once('data', resolve);
    });
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const failed = [];
    page.on('pageerror', error => failed.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/editor.html`);
    const cases = [
      ['plex', 'SecondChance Plex', 'ibmplexsanskr/IBMPlexSansKR-Regular.ttf'],
      ['noto', 'SecondChance Noto Sans', 'notosanskr/NotoSansKR%5Bwght%5D.ttf'],
      ['gowun', 'SecondChance Gowun Batang', 'gowunbatang/GowunBatang-Regular.ttf'],
      ['blackhan', 'SecondChance Black Han', 'blackhansans/BlackHanSans-Regular.ttf'],
      ['dohyeon', 'SecondChance Do Hyeon', 'dohyeon/DoHyeon-Regular.ttf']
    ];
    for (const [id, family, file] of cases) {
      const response = await context.request.get(`http://127.0.0.1:${port}/fonts/${file}`);
      assert.equal(response.status(), 200, file);
      assert.match(response.headers()['content-type'], /font\/ttf/, file);
      const loaded = await page.evaluate(async name => {
        const faces = await document.fonts.load(`16px "${name}"`, '탐험의 기록');
        return faces.length;
      }, family);
      assert.ok(loaded > 0, `${family} failed to load`);
    }
    await page.locator('#storyTab').click();
    await page.locator('#addLineButton').click();
    const dialogue = page.locator('.dialogue-entry').last();
    await dialogue.getByRole('textbox', { name: '대사' }).fill('탐험의 기록');
    for (const [id, family] of cases) {
      await dialogue.getByLabel('글꼴').selectOption(id);
      await dialogue.getByRole('button', { name: '이 대사 미리보기' }).click();
      assert.match(await page.locator('#dialoguePreviewText').evaluate(node => getComputedStyle(node).fontFamily), new RegExp(family));
      assert.equal(await page.locator('#dialoguePreviewFont').inputValue(), id);
      await page.locator('#dialoguePreviewClose').click();
    }
    await page.goto(`http://127.0.0.1:${port}/`);
    assert.match(await page.locator('body').evaluate(node => getComputedStyle(node).fontFamily), /SecondChance Gowun Batang/);
    assert.ok(await page.evaluate(async () => (await document.fonts.load('16px "SecondChance Gowun Batang"', '탐험')).length > 0));
    assert.deepEqual(failed, []);
    console.log('Five bundled fonts load and appear in Adventure Editor dialogue previews.');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
