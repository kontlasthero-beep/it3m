(function attachSecondChanceCardDetail(global) {
  "use strict";

  const ROOT_CLASS = "sc-card-detail-root";
  const MOTION_MS = 210;
  let current = null;

  function readText(source, keys, fallback) {
    if (typeof source === "string" && keys.includes("name")) return source;
    if (!source || typeof source !== "object") return fallback;
    for (const key of keys) {
      const value = source[key];
      if (typeof value === "string" && value.trim()) return value.trim();
      if (Array.isArray(value)) {
        const items = value.filter((item) => typeof item === "string" && item.trim());
        if (items.length) return items.join("\n");
      }
    }
    return fallback;
  }

  function normalizeCard(source, artOverride, fallbackName) {
    const name = readText(source, ["name", "title", "cardName"], fallbackName);
    const effect = readText(source, ["effect", "description", "rules", "text"], "카드 효과 정보가 없습니다.");
    const artSrc = artOverride || readText(source, ["artSrc", "image", "art", "imageSrc"], "");
    const alt = readText(source, ["artAlt", "alt"], `${name} 카드 삽화`);
    return { name, effect, artSrc, alt };
  }

  function deckRefinedCard(base) {
    // The deck editor passes the displayed card, while the catalog passes a full
    // refinedCard. Match the editor's base name against the shared registry.
    if (base.effect === "잠금 해제 후 카드 효과를 확인할 수 있습니다.") return null;
    const definitions = global.SecondChanceRefinedCardDefinitions;
    if (!definitions || typeof definitions !== "object") return null;
    const entry = Object.values(definitions).find((card) => card.name === `정제된 ${base.name}`);
    if (!entry || !entry.id) return null;
    return {
      name: entry.name,
      description: entry.description,
      artSrc: `Card_illustration/refined/${entry.id}.webp`,
      artAlt: `${entry.name} 카드 삽화`
    };
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function focusableElements(dialog) {
    return Array.from(dialog.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getAttribute("aria-hidden") !== "true");
  }

  function disposeActive(restoreFocus) {
    if (!current) return;
    const instance = current;
    current = null;
    document.removeEventListener("keydown", instance.onDocumentKeydown);
    document.body.style.overflow = instance.previousOverflow;
    if (instance.closeTimer) global.clearTimeout(instance.closeTimer);
    if (instance.swapTimer) global.clearTimeout(instance.swapTimer);
    if (instance.removeTimer) global.clearTimeout(instance.removeTimer);
    instance.root.remove();
    if (restoreFocus && instance.previousFocus && instance.previousFocus.isConnected && typeof instance.previousFocus.focus === "function") {
      instance.previousFocus.focus({ preventScroll: true });
    }
  }

  function close() {
    if (!current || current.closing) return;
    const instance = current;
    instance.closing = true;
    instance.root.classList.add("sc-card-detail-is-closing");
    instance.removeTimer = global.setTimeout(() => {
      if (current === instance) disposeActive(true);
    }, MOTION_MS);
  }

  function open(options) {
    const settings = options && typeof options === "object" ? options : {};
    const inheritedFocus = current ? current.previousFocus : null;
    if (current) disposeActive(false);

    const base = normalizeCard(settings.card, settings.artSrc, "이름 없는 카드");
    const showRecord = settings.showRecord === true;
    const refinedSource = settings.refinedCard && typeof settings.refinedCard === "object"
      ? settings.refinedCard
      : !showRecord ? deckRefinedCard(base) : null;
    const refined = refinedSource
      ? normalizeCard(refinedSource, null, `정제된 ${base.name}`)
      : null;
    if (refined && refined.name === "이름 없는 카드") refined.name = `정제된 ${base.name}`;
    if (refined && refined.effect === "카드 효과 정보가 없습니다.") {
      refined.effect = readText(refinedSource, ["effect", "description", "rules", "text"], refined.effect);
    }
    const story = typeof settings.storyText === "string" ? settings.storyText.trim() : "";

    const root = makeElement("div", ROOT_CLASS);
    root.setAttribute("data-sc-card-detail-modal", "");
    const dialog = makeElement("section", "sc-card-detail-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "sc-card-detail-title");
    dialog.setAttribute("tabindex", "-1");
    root.append(dialog);

    const header = makeElement("header", "sc-card-detail-header");
    const headingGroup = makeElement("div", "sc-card-detail-heading-group");
    headingGroup.append(
      makeElement("span", "sc-card-detail-eyebrow", showRecord ? "카드 기록" : "카드 설명"),
      makeElement("h2", "sc-card-detail-title", base.name)
    );
    headingGroup.querySelector("h2").id = "sc-card-detail-title";
    const headerTools = makeElement("div", "sc-card-detail-header-tools");
    const versionLabel = refined ? makeElement("span", "sc-card-detail-version", "기본형") : null;
    if (versionLabel) {
      versionLabel.setAttribute("aria-live", "polite");
      headerTools.append(versionLabel);
    }
    const closeButton = makeElement("button", "sc-card-detail-close", "×");
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "카드 정보 닫기");
    closeButton.title = "닫기";
    headerTools.append(closeButton);
    header.append(headingGroup, headerTools);

    const main = makeElement("div", "sc-card-detail-main");
    const artFrame = makeElement("div", "sc-card-detail-art-frame");
    const artImage = makeElement("img", "sc-card-detail-art");
    artImage.alt = base.alt;
    artImage.decoding = "async";
    artImage.draggable = false;
    const artPlaceholder = makeElement("div", "sc-card-detail-art-placeholder", "◇");
    artPlaceholder.setAttribute("aria-hidden", "true");
    artFrame.append(artImage, artPlaceholder);
    const copy = makeElement("div", "sc-card-detail-copy");
    const effectSection = makeElement("section", "sc-card-detail-effect-section");
    const effectLabel = makeElement("span", "sc-card-detail-section-label", "카드 효과");
    const effectText = makeElement("p", "sc-card-detail-effect", base.effect);
    effectText.setAttribute("aria-live", "polite");
    effectSection.append(effectLabel, effectText);
    const toggleRow = makeElement("div", "sc-card-detail-toggle-row");
    let toggleButton = null;
    if (refined) {
      toggleButton = makeElement("button", "sc-card-detail-toggle", "정제된 버전 보기");
      toggleButton.type = "button";
      toggleButton.setAttribute("aria-pressed", "false");
      toggleRow.append(toggleButton);
    }
    copy.append(effectSection);
    if (refined) copy.append(toggleRow);
    let addButton = null;
    if (typeof settings.addToBag === "function" || settings.addDisabled === true) {
      addButton = makeElement("button", "sc-card-detail-add", settings.addButtonLabel || "가방에 추가하기");
      addButton.type = "button";
      addButton.disabled = settings.addDisabled === true;
      copy.append(addButton);
    }
    main.append(artFrame, copy);

    dialog.append(header, main);
    if (showRecord) {
      const storySection = makeElement("section", "sc-card-detail-story");
      storySection.append(
        makeElement("h3", "sc-card-detail-story-title", "기록의 편린"),
        makeElement("p", "sc-card-detail-story-text", story || "이 카드에 얽힌 이야기가 기록될 자리입니다.")
      );
      dialog.append(storySection);
    }
    document.body.append(root);

    const instance = {
      root,
      dialog,
      previousFocus: inheritedFocus && inheritedFocus.isConnected ? inheritedFocus : document.activeElement,
      previousOverflow: document.body.style.overflow,
      closing: false,
      isRefined: false,
      swapTimer: null,
      removeTimer: null,
      onDocumentKeydown: null
    };
    current = instance;
    document.body.style.overflow = "hidden";

    function setArtwork(card) {
      if (card.artSrc) {
        artImage.alt = card.alt;
        artImage.hidden = false;
        artPlaceholder.hidden = true;
        artImage.onerror = () => {
          artImage.hidden = true;
          artPlaceholder.hidden = false;
        };
        artImage.src = card.artSrc;
      } else {
        artImage.removeAttribute("src");
        artImage.hidden = true;
        artPlaceholder.hidden = false;
      }
    }
    setArtwork(base);

    root.addEventListener("click", (event) => {
      if (event.target === root) close();
    });
    closeButton.addEventListener("click", close);
    if (addButton && typeof settings.addToBag === "function") {
      addButton.addEventListener("click", () => {
        if (instance.closing || addButton.disabled) return;
        const added = settings.addToBag();
        if (added) close();
      });
    }

    if (toggleButton && refined) {
      toggleButton.addEventListener("click", () => {
        if (instance.closing || toggleButton.disabled) return;
        instance.isRefined = !instance.isRefined;
        toggleButton.disabled = true;
        toggleButton.setAttribute("aria-pressed", String(instance.isRefined));
        dialog.classList.add("sc-card-detail-is-swapping");
        dialog.classList.toggle("sc-card-detail-is-refined", instance.isRefined);
        const next = instance.isRefined ? refined : base;
        const nextLabel = instance.isRefined ? "정제형" : "기본형";
        toggleButton.textContent = instance.isRefined ? "기본 버전 보기" : "정제된 버전 보기";
        toggleButton.setAttribute("aria-label", instance.isRefined ? "기본 카드 효과 보기" : "정제된 카드 효과 보기");
        instance.swapTimer = global.setTimeout(() => {
          if (current !== instance || instance.closing) return;
          headingGroup.querySelector("h2").textContent = next.name;
          effectText.textContent = next.effect;
          if (versionLabel) versionLabel.textContent = nextLabel;
          setArtwork(next);
          instance.swapTimer = global.setTimeout(() => {
            if (current !== instance) return;
            dialog.classList.remove("sc-card-detail-is-swapping");
            toggleButton.disabled = false;
            toggleButton.focus({ preventScroll: true });
          }, 90);
        }, 85);
      });
    }

    instance.onDocumentKeydown = (event) => {
      if (!current || current !== instance) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = focusableElements(dialog);
      if (!focusables.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", instance.onDocumentKeydown);

    global.requestAnimationFrame(() => {
      if (current !== instance) return;
      root.classList.add("sc-card-detail-is-open");
      closeButton.focus({ preventScroll: true });
    });
    return root;
  }

  global.SecondChanceCardDetail = Object.freeze({ open, close });
})(window);
