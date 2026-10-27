(function (root, factory) {
  const presentation = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = presentation;
  else root.SecondChanceDialoguePresentation = presentation;
})(typeof globalThis === 'object' ? globalThis : this, function (root) {
  'use strict';

  const FONT_OPTIONS = Object.freeze([
    { id: 'default', label: '기본 UI · IBM Plex Sans KR', family: 'inherit' },
    { id: 'serif', label: '기존 명조 · 시스템', family: 'Georgia, "Nanum Myeongjo", serif' },
    { id: 'mono', label: '기존 고정폭 · 시스템', family: 'Consolas, "D2Coding", monospace' },
    { id: 'plex', label: 'IBM Plex Sans KR · 기술 UI', family: '"SecondChance Plex", "Malgun Gothic", sans-serif' },
    { id: 'noto', label: 'Noto Sans KR · 본문', family: '"SecondChance Noto Sans", "Malgun Gothic", sans-serif' },
    { id: 'gowun', label: 'Gowun Batang · 기록', family: '"SecondChance Gowun Batang", "Nanum Myeongjo", serif' },
    { id: 'blackhan', label: 'Black Han Sans · 강조 제목', family: '"SecondChance Black Han", "Malgun Gothic", sans-serif' },
    { id: 'dohyeon', label: 'Do Hyeon · 스테이지 제목', family: '"SecondChance Do Hyeon", "Malgun Gothic", sans-serif' }
  ]);
  const FONTS = Object.freeze(Object.fromEntries(FONT_OPTIONS.map(option => [option.id, option.family])));
  const REVEALS = new Set(['instant', 'typewriter', 'fade']);

  function normalize(input) {
    const data = input && typeof input === 'object' ? input : {};
    const size = Number(data.fontSize);
    const speed = Number(data.speed);
    return {
      font: Object.hasOwn(FONTS, data.font) ? data.font : 'default',
      fontSize: Number.isFinite(size) ? Math.max(14, Math.min(28, Math.round(size))) : 16,
      reveal: REVEALS.has(data.reveal) ? data.reveal : 'instant',
      speed: Number.isFinite(speed) ? Math.max(5, Math.min(90, Math.round(speed))) : 32,
      typingSoundAssetId: String(data.typingSoundAssetId || '').slice(0, 180),
      direction: String(data.direction || '').slice(0, 2000)
    };
  }

  function presentText(node, line, options = {}) {
    const style = normalize(line?.presentation);
    const content = String(line?.text || '');
    node.style.fontFamily = FONTS[style.font];
    node.style.fontSize = `${style.fontSize}px`;
    node.style.whiteSpace = 'pre-wrap';
    node.style.overflowWrap = 'anywhere';
    const reduced = root.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    let timer = null;
    let animation = null;
    let finished = false;
    const finish = () => {
      if (timer !== null) { root.clearInterval(timer); timer = null; }
      animation?.finish();
      node.textContent = content;
      finished = true;
    };
    const stop = () => {
      if (timer !== null) { root.clearInterval(timer); timer = null; }
      animation?.cancel();
      finished = true;
    };
    if (reduced || style.reveal === 'instant' || !content) finish();
    else if (style.reveal === 'fade') {
      finish();
      animation = node.animate?.([{ opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)' }], { duration: 450, easing: 'ease-out' }) || null;
    } else {
      const letters = Array.from(content);
      let index = 0;
      let audibleCount = 0;
      node.textContent = '';
      timer = root.setInterval(() => {
        index += 1;
        const letter = letters[index - 1];
        node.textContent = letters.slice(0, index).join('');
        if (letter?.trim() && ++audibleCount % 3 === 1) options.onTick?.(style.typingSoundAssetId);
        if (index >= letters.length) finish();
      }, Math.max(16, Math.round(1000 / style.speed)));
    }
    return { finish, stop, get isFinished() { return finished; } };
  }

  return { FONTS, FONT_OPTIONS, normalize, presentText };
});
