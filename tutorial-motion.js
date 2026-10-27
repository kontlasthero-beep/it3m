/* Load after the game's inline script. The game remains the owner of dialogue state. */
(() => {
  'use strict';

  function init() {
    const dialogue = document.getElementById('tutorialDialogue');
    const text = document.getElementById('tutorialDialogueText');
    const next = document.getElementById('tutorialDialogueNext');
    const nicknameForm = document.getElementById('tutorialNicknameForm');
    const settings = document.getElementById('gameSettingsOverlay');
    const settingsButton = document.getElementById('gameSettingsButton');
    if (!dialogue || !text || !next || !nicknameForm) return;

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const backdrop = document.createElement('div');
    backdrop.className = 'tm-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.append(backdrop);

    let visible = false;
    let lineId = null;
    let sourceText = '';
    let renderedText = text.textContent;
    let graphemes = [];
    let frame = 0;
    let index = 0;
    let lastTick = 0;
    let typing = false;
    const originalLive = text.getAttribute('aria-live');

    function write(value) {
      renderedText = value;
      text.textContent = value;
    }

    function stopTyping() {
      cancelAnimationFrame(frame);
      frame = 0;
      typing = false;
    }

    function finishTyping() {
      if (!typing) return;
      stopTyping();
      write(sourceText);
      text.removeAttribute('aria-label');
      if (originalLive === null) text.removeAttribute('aria-live');
      else text.setAttribute('aria-live', originalLive);
    }

    function tick(now) {
      if (!typing) return;
      if (now - lastTick >= 27) {
        index = Math.min(index + Math.max(1, Math.floor((now - lastTick) / 27)), graphemes.length);
        write(graphemes.slice(0, index).join(''));
        lastTick = now;
      }
      if (index < graphemes.length) frame = requestAnimationFrame(tick);
      else finishTyping();
    }

    function beginTyping(value) {
      stopTyping();
      sourceText = value;
      if (motionQuery.matches || !nicknameForm.hidden || !value || document.hidden) {
        write(value);
        text.removeAttribute('aria-label');
        if (originalLive === null) text.removeAttribute('aria-live');
        else text.setAttribute('aria-live', originalLive);
        return;
      }
      graphemes = typeof Intl.Segmenter === 'function'
        ? [...new Intl.Segmenter(document.documentElement.lang || 'ko', { granularity: 'grapheme' }).segment(value)].map(part => part.segment)
        : Array.from(value);
      index = 0;
      lastTick = performance.now();
      typing = true;
      text.setAttribute('aria-label', value);
      text.setAttribute('aria-live', 'off');
      write('');
      frame = requestAnimationFrame(tick);
    }

    function exitGhost() {
      if (motionQuery.matches || !nicknameForm.hidden) return;
      const ghost = dialogue.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.removeAttribute('role');
      ghost.removeAttribute('aria-modal');
      ghost.removeAttribute('aria-labelledby');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.querySelectorAll('form, .tutorial-dialogue-actions, #tutorialDialogueError').forEach(node => node.remove());
      ghost.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      ghost.querySelectorAll('button, input').forEach(node => { node.tabIndex = -1; });
      ghost.hidden = false;
      ghost.classList.remove('tm-enter');
      ghost.classList.add('tm-exit-ghost');
      document.body.append(ghost);
      ghost.addEventListener('animationend', () => ghost.remove(), { once: true });
      setTimeout(() => ghost.remove(), 380);
    }

    function sync() {
      const open = !dialogue.hidden && document.body.dataset.tutorialSpeaking === 'true';
      if (open && !visible) {
        visible = true;
        document.body.classList.add('tm-open');
        dialogue.classList.remove('tm-enter');
        void dialogue.offsetWidth;
        dialogue.classList.add('tm-enter');
      } else if (!open && visible) {
        visible = false;
        finishTyping();
        exitGhost();
        document.body.classList.remove('tm-open');
        dialogue.classList.remove('tm-enter');
        lineId = null;
        sourceText = '';
        renderedText = text.textContent;
      }

      if (!open) return;
      if (settings && !settings.hidden) finishTyping();
      const nextLineId = dialogue.dataset.lineId || '';
      const currentText = text.textContent;
      if (!nicknameForm.hidden && typing) finishTyping();
      if (nextLineId !== lineId || currentText !== renderedText) {
        lineId = nextLineId;
        beginTyping(currentText);
      }
    }

    const observer = new MutationObserver(sync);
    observer.observe(dialogue, { attributes: true, attributeFilter: ['hidden', 'data-line-id'], subtree: false });
    observer.observe(text, { childList: true, characterData: true, subtree: true });
    observer.observe(nicknameForm, { attributes: true, attributeFilter: ['hidden'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-tutorial-speaking', 'data-tutorial-stage'] });
    if (settings) observer.observe(settings, { attributes: true, attributeFilter: ['hidden'] });

    next.addEventListener('click', event => {
      if (!typing || !nicknameForm.hidden) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      finishTyping();
    }, true);
    dialogue.addEventListener('click', event => {
      if (typing && nicknameForm.hidden && !event.target.closest('button, input, form, a')) finishTyping();
    });
    settingsButton?.addEventListener('click', event => {
      if (!visible || document.body.dataset.tutorialSettings !== 'false' || !settings) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.getElementById('gameSettingsTitle').textContent = '튜토리얼 설정';
      document.getElementById('settingsAudioControls').hidden = false;
      document.getElementById('tutorialSettingsActions').hidden = true;
      document.getElementById('gameLeaveActions').hidden = true;
      document.getElementById('gameSettingsMainActions').hidden = false;
      document.getElementById('gameLeaveConfirm').hidden = true;
      settings.hidden = false;
      document.getElementById('musicVolume').focus();
    }, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden) finishTyping(); });
    motionQuery.addEventListener?.('change', () => { if (motionQuery.matches) finishTyping(); });
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
