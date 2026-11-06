'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.env.UI_KIT_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const output = path.resolve(__dirname, '../shared-ui/expedition-ui-kit-v1/applied-preview');
const fs = require('node:fs');
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, ...(process.env.CHROME_EXE ? { executablePath: process.env.CHROME_EXE } : {}) });
  for (const width of [1440, 720, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.locator('#accountScreen').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const font = await page.evaluate(() => document.fonts.check('16px "SecondChance Gowun Batang"'));
    const css = await page.evaluate(() => [...document.styleSheets].some(s => s.href?.includes('game-ui-kit.css')));
    if (!font || !css) throw new Error(`font or stylesheet unavailable at ${width}: ${JSON.stringify({font,css})}`);
    async function capture(name) {
      await page.screenshot({ path: path.join(output, `${name}-${width}.png`) });
      return page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        badButtonLabels: [...document.querySelectorAll('#startMenu:not([hidden]) .start-menu-grid button')]
          .filter(button => {
            const range = document.createRange();
            range.selectNodeContents(button);
            const label = range.getBoundingClientRect();
            const frame = button.getBoundingClientRect();
            return label.top < frame.top + 8 || label.bottom > frame.bottom - 10 || label.left < frame.left + 8 || label.right > frame.right - 8;
          }).map(button => button.textContent.trim()),
        badText: [...document.querySelectorAll('.start-screen:not([hidden]) button, .start-screen:not([hidden]) h3, .start-screen:not([hidden]) p, .guest-profile-line strong, .guest-profile-line span')]
          .filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2)
          .map(el => ({ text: el.textContent.trim().slice(0, 35), width: el.clientWidth, scroll: el.scrollWidth }))
      }));
    }
    const results = {};
    results.account = await capture('account');
    if (width === 390) {
      await page.locator('#guestPlayButton').click();
      await page.locator('#confirmGuestButton').click();
      await page.waitForFunction(() => document.querySelector('#guestProfileMeta')?.textContent?.includes('명성치'));
      const fame = await page.evaluate(() => ({
        meta: document.querySelector('#guestProfileMeta').textContent,
        remaining: document.querySelector('#guestProfileRemainingFame').textContent,
        valueText: document.querySelector('#guestProfileProgress').getAttribute('aria-valuetext')
      }));
      if (/명성치\s+\d/.test(fame.meta) || !fame.remaining.includes('다음 레벨까지') || !fame.valueText.includes(fame.remaining)) {
        throw new Error(`live guest fame display is incorrect: ${JSON.stringify(fame)}`);
      }
      await page.locator('#tutorialDialogue').waitFor({ state: 'visible', timeout: 5000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(output, `tutorial-${width}.png`) });
      await page.locator('#gameSettingsButton').click();
      await page.locator('#gameSettingsOverlay').waitFor({ state: 'visible' });
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(output, `tutorial-settings-${width}.png`) });
      await page.evaluate(() => {
        for (const overlay of document.querySelectorAll('.overlay')) overlay.hidden = true;
        document.querySelector('#startOverlay').hidden = false;
        document.querySelector('#tutorialDialogue').hidden = true;
        document.querySelector('#tutorialPanel').hidden = true;
        document.body.dataset.tutorialSpeaking = 'false';
        document.body.dataset.tutorial = 'false';
        document.body.classList.remove('tm-open', 'tutorial-intro-sequence');
      });
    }
    await page.evaluate(() => {
      document.querySelectorAll('.start-screen').forEach(screen => { screen.hidden = true; });
      document.querySelector('#homeScreen').hidden = false;
      document.querySelector('#guestProfile').hidden = false;
      document.querySelector('#guestProfileName').textContent = '아주긴탐험가닉네임테스트1234';
      document.querySelector('#guestProfileId').textContent = 'LOCAL-5a27408d-6587-4343-8d98-04f3afa7c9ca';
      document.querySelector('#guestProfileMeta').textContent = 'Lv 100 · 명성치 · 임시 기록';
      document.querySelector('#guestProfileLevelProgress').textContent = '현재 레벨 진행도 43 / 510 명성치';
      document.querySelector('#guestProfileRemainingFame').textContent = '다음 레벨까지 467 명성치';
      document.querySelector('#guestProfileProgress').value = 43;
      document.querySelector('#guestProfileProgress').max = 510;
    });
    results.home = await capture('home');
    await page.locator('#guestProfileProgress').focus();
    await page.screenshot({ path: path.join(output, `fame-tooltip-${width}.png`) });
    await page.evaluate(() => {
      document.querySelector('#homeScreen').hidden = true;
      document.querySelector('#startMenu').hidden = false;
    });
    await page.waitForTimeout(550);
    results.modes = await capture('modes');
    if (width === 720) {
      await page.locator('#playMenuHomeButton').click();
      await page.locator('#homeScreen').waitFor({ state: 'visible' });
      await page.locator('#openPlayMenuButton').click();
      await page.locator('#startMenu').waitFor({ state: 'visible' });
      await page.waitForTimeout(550);
    }
    if (width <= 390) {
      await page.evaluate(() => { document.querySelector('#startOverlay').hidden = true; document.querySelector('#deckOverlay').hidden = false; });
      await page.evaluate(() => {
        const card = name => {
          const button = document.createElement('button'); button.className = 'deck-card'; button.type = 'button';
          button.innerHTML = `<div class="card-face"><img class="card-art" src="stone-blue.png" alt=""><span class="card-name">${name}</span></div>`;
          return button;
        };
        for (const name of ['블랙홀 방출', '구조물 투하', '총알 장전', '데이터 장벽']) {
          document.querySelector('#deckPool').append(card(name)); document.querySelector('#deckBag').append(card(name));
        }
      });
      await page.screenshot({ path: path.join(output, `deck-${width}.png`) });
      await page.evaluate(() => { document.querySelector('#deckOverlay').hidden = true; document.querySelector('#catalogOverlay').hidden = false; });
      await page.screenshot({ path: path.join(output, `catalog-${width}.png`) });
      await page.evaluate(() => {
        document.querySelector('#catalogOverlay').hidden = true;
        document.querySelector('#startOverlay').hidden = true;
        document.body.classList.add('game-active');
        document.querySelector('#handPanel0').classList.add('current');
        document.querySelector('#handOwner0').textContent = '아주긴탐험가닉네임테스트1234';
        document.querySelector('#handHero0').hidden = false;
        document.querySelector('#handHero0').textContent = '헌터';
        for (const [owner,names] of [[0,['블랙홀 방출','구조물 투하','데이터 장벽','총알 장전']],[1,['속임수','경질화']]]) {
          const hand = document.querySelector(`#hand${owner}`);
          for (const name of names) {
            const button = document.createElement('button'); button.className = 'ability-card'; button.type = 'button';
            button.innerHTML = `<span class="card-face"><img class="card-art" src="stone-blue.png" alt=""><span class="card-name">${name}</span></span>`;
            hand.append(button);
          }
        }
      });
      await page.screenshot({ path: path.join(output, `game-${width}.png`), fullPage: true });
      await page.addStyleTag({ content: '#powerControl, #powerPanel { display: block !important; } #powerLaunchButton { display: none !important; } #powerControl { position: fixed !important; left: 50% !important; top: 50% !important; transform: translate(-50%, -50%) !important; z-index: 55 !important; }' });
      await page.evaluate(() => { const control = document.querySelector('#powerControl'); control.classList.add('viewport-meter'); });
      await page.screenshot({ path: path.join(output, `power-meter-${width}.png`), fullPage: true });
      const clippedCardNames = await page.locator('.ability-card .card-name, .deck-bag .card-name').evaluateAll(els => els.filter(el => el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
      if (clippedCardNames.length) throw new Error(`clipped card names: ${clippedCardNames.join(', ')}`);
    }
    if (Object.values(results).some(r => r.documentWidth > r.viewport + 2 || r.badText.length || r.badButtonLabels.length)) {
      throw new Error(`layout overflow at ${width}: ${JSON.stringify(results)}`);
    }
    if (errors.length) console.warn(`Non-layout page errors at ${width}: ${errors.join('; ')}`);
    console.log(`${width}px: account, home, modes; no document or text overflow`);
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
