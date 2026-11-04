'use strict';

// Design-only asset generator. It never edits index.html, editor.html, or gameplay code.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const { buttons, modules } = require('./kit-spec.cjs');

const ROOT = __dirname;
const THEMES = {
  salvage: {
    name: 'Salvage Terminal', dark: true, outer: '#987b53', inner: '#4e675f',
    surface: '#142023', surfaceEnd: '#0b1215', text: '#efe7d4', signal: '#74c9c0',
    warm: '#d4a35b', quiet: '#8fa29e', danger: '#d07765'
  },
  signal: {
    name: 'AAB Signal', dark: true, outer: '#437b7a', inner: '#6ab4ae',
    surface: '#0b2024', surfaceEnd: '#081316', text: '#e8f3ed', signal: '#86d9cb',
    warm: '#dfbc7b', quiet: '#87aba5', danger: '#e28b77'
  }
};
const STATES = ['idle', 'hover', 'pressed', 'disabled'];
const BUTTON_SIZES = {
  wide: { desktop: [560, 64], compact: [320, 56] },
  utility: { desktop: [560, 50], compact: [320, 48] },
  tile: { desktop: [272, 92], compact: [154, 86] },
  compact: { desktop: [272, 54], compact: [154, 50] },
  square: { desktop: [54, 54], compact: [46, 46] }
};

const a = (value, alpha) => {
  const hex = value.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
};
const p = (x, y, w, h, c = 8) => `M ${x + c} ${y} H ${x + w - c} L ${x + w} ${y + c} V ${y + h - c} L ${x + w - c} ${y + h} H ${x + c} L ${x} ${y + h - c} V ${y + c} Z`;
const rect = (x, y, w, h, fill, stroke = 'none', sw = 1, radius = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const line = (x1, y1, x2, y2, stroke, sw = 1, opacity = 1) =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" fill="none" stroke="${stroke}" stroke-width="${sw}" opacity="${opacity}" stroke-linecap="round"/>`;
const circle = (x, y, r, fill, stroke = 'none', sw = 1) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const pathEl = (d, stroke, sw = 2, fill = 'none') =>
  `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;

function iconGeometry(name, color) {
  const S = color;
  switch (name) {
    case 'play': return `<path d="M8 5.5 19 12 8 18.5Z" fill="${S}"/>`;
    case 'compass': return circle(12, 12, 9, 'none', S, 1.8) + pathEl('M15.5 8.5 13.2 13.2 8.5 15.5 10.8 10.8Z', S, 1.5);
    case 'book': return pathEl('M12 5v14M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1m0-13c3-2 6-2 9-1v13c-3-1-6-1-9 1', S, 1.7);
    case 'cards': return pathEl('M7 5h12v15H7zm-3 3H2v13h13v-2', S, 1.7) + line(10, 9, 16, 9, S, 1.4);
    case 'person': return circle(12, 8.2, 3.2, 'none', S, 1.8) + pathEl('M5 20c.3-4.2 2.6-6 7-6s6.7 1.8 7 6', S, 1.8);
    case 'person-add': return circle(9, 8, 3, 'none', S, 1.8) + pathEl('M3 19c.3-4 2.2-5.3 6-5.3 2 0 3.6.4 4.6 1.3M18 13v8m-4-4h8', S, 1.8);
    case 'search': return circle(10, 10, 5.8, 'none', S, 1.9) + line(14.6, 14.6, 21, 21, S, 1.9);
    case 'code': return pathEl('m8 6-5 6 5 6m8-12 5 6-5 6M13 5l-2 14', S, 1.8);
    case 'people': return circle(8, 8, 2.7, 'none', S, 1.7) + circle(16, 8, 2.7, 'none', S, 1.7) + pathEl('M2.4 19c.3-3.8 2.1-5.4 5.6-5.4 2.2 0 3.8.7 4.6 2.2M21.6 19c-.3-3.8-2.1-5.4-5.6-5.4-1.8 0-3.1.4-4 1.4', S, 1.7);
    case 'network': return circle(12, 4.5, 2, 'none', S, 1.5) + circle(5, 18.5, 2, 'none', S, 1.5) + circle(19, 18.5, 2, 'none', S, 1.5) + pathEl('M11 6.5 6 16m7-9.5 5 9.5M7 18.5h10', S, 1.5);
    case 'chip': return rect(5, 5, 14, 14, 'none', S, 1.7, 2) + rect(9, 9, 6, 6, 'none', S, 1.4, 1) + [6, 12, 18].map(v => line(v, 2, v, 5, S, 1.3) + line(v, 19, v, 22, S, 1.3) + line(2, v, 5, v, S, 1.3) + line(19, v, 22, v, S, 1.3)).join('');
    case 'back': return pathEl('M12 5 4 12l8 7M4 12h16', S, 1.9);
    case 'enter': return pathEl('M13 4h6v16h-6M3 12h12m-5-5 5 5-5 5', S, 1.9);
    case 'exit': return pathEl('M11 4H5v16h6m1-8h9m-5-5 5 5-5 5', S, 1.9);
    case 'refresh': return pathEl('M19 8a8 8 0 0 0-14-1L3 9m0-5v5h5M5 16a8 8 0 0 0 14 1l2-2m0 5v-5h-5', S, 1.7);
    case 'settings': return circle(12, 12, 3.3, 'none', S, 1.7) + pathEl('M10 2h4l.5 2.3 2 1 2.1-.8 2.3 3.2-1.5 1.8.2 2.5 1.6 1.5-1.5 3.8-2.3-.2-1.8 1.3-.4 2.5h-4l-.5-2.4-2-1.1-2.2.8-2.2-3.1 1.5-1.9-.3-2.4-1.5-1.5 1.4-3.8 2.4.2 1.8-1.3Z', S, 1.2);
    case 'edit': return pathEl('m4 17 1 3 3-1L20 7l-3-3L5 16m-1 5h16', S, 1.7);
    case 'chevron-left': return pathEl('m15 5-7 7 7 7', S, 2.2);
    case 'chevron-right': return pathEl('m9 5 7 7-7 7', S, 2.2);
    case 'save': return pathEl('M4 3h14l2 3v15H4Zm4 0v6h8V3M7 21v-8h10v8', S, 1.7);
    case 'next-turn': return pathEl('M4 6v6h6m-6 0c.4-5 4-8 8.2-8 4.6 0 8 3.4 8 8 0 4.2-3.3 8-8 8-3.3 0-5.8-1.5-7-4', S, 1.7) + pathEl('m12 8 4 4-4 4', S, 1.6);
    case 'fire': return pathEl('M4 12h12m-4-5 6 5-6 5M3 8h4M3 16h4', S, 2) + circle(19, 12, 2, 'none', S, 1.5);
    case 'check': return pathEl('m4 12 5 5L20 6', S, 2.2);
    default: return circle(12, 12, 8, 'none', S, 1.8);
  }
}

function icon(name, x, y, size, color) {
  const scale = size / 24;
  return `<g transform="translate(${x} ${y}) scale(${scale})">${iconGeometry(name, color)}</g>`;
}

function svgWrap(w, h, body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;
}

function frame(theme, w, h, state = 'idle', accent = 'normal', id = 'face') {
  const c = THEMES[theme];
  const idle = state === 'idle';
  const disabled = state === 'disabled';
  const pressed = state === 'pressed';
  const focus = state === 'hover';
  const accentColor = accent === 'danger' ? c.danger : accent === 'primary' ? c.warm : c.signal;
  const rim = disabled ? c.quiet : focus ? accentColor : c.outer;
  const glow = disabled ? 0 : focus ? .32 : accent === 'primary' ? .17 : .08;
  const fill1 = disabled ? '#20292a' : pressed ? '#071214' : c.surface;
  const fill2 = disabled ? '#171d1e' : c.surfaceEnd;
  const defs = `<linearGradient id="g-${id}" x2="0" y2="1"><stop offset="0" stop-color="${fill1}"/><stop offset="1" stop-color="${fill2}"/></linearGradient><filter id="halo-${id}" x="-12%" y="-45%" width="124%" height="190%"><feGaussianBlur stdDeviation="${focus ? 3.2 : 1.5}"/></filter>`;
  const big = Math.min(11, Math.round(h * .18));
  let body = '';
  if (theme === 'salvage') {
    body += `<path d="${p(1, 1, w - 2, h - 2, big)}" fill="${a(rim, glow)}" filter="url(#halo-${id})"/>`;
    body += `<path d="${p(2, 2, w - 4, h - 4, big)}" fill="url(#g-${id})" stroke="${rim}" stroke-width="2"/>`;
    body += `<path d="${p(6, 6, w - 12, h - 12, Math.max(3, big - 4))}" fill="none" stroke="${a(c.inner, disabled ? .28 : .75)}" stroke-width="1"/>`;
    body += line(18, h - 8, Math.min(w * .27, 76), h - 8, accentColor, 2, disabled ? .22 : focus ? .95 : .58);
    body += line(w - 16, 8, w - Math.min(w * .18, 60), 8, c.outer, 1.4, disabled ? .25 : .78);
    body += `<path d="M9 18V12L16 5h14M${w - 10} ${h - 18}v6l-7 7h-14" fill="none" stroke="${a(c.outer, .75)}" stroke-width="1.5"/>`;
    if (w > 90) body += circle(w - 17, h / 2, 3.2, a(accentColor, disabled ? .2 : .66), c.outer, 1);
  } else {
    body += `<path d="${p(2, 2, w - 4, h - 4, Math.max(5, big - 2))}" fill="url(#g-${id})" stroke="${rim}" stroke-width="1.4"/>`;
    body += `<path d="${p(6, 6, w - 12, h - 12, Math.max(2, big - 6))}" fill="none" stroke="${a(c.inner, disabled ? .2 : focus ? .9 : .58)}" stroke-width=".9"/>`;
    body += line(16, h - 5, w - 16, h - 5, accentColor, 1.5, disabled ? .18 : focus ? .9 : .42);
    body += line(w - 35, 3, w - 12, 3, c.warm, 2, disabled ? .15 : accent === 'primary' ? .95 : .44);
    body += circle(w - 14, h / 2, 2.3, accentColor);
    if (focus) body += `<path d="${p(1, 1, w - 2, h - 2, big)}" fill="none" stroke="${a(accentColor, .8)}" stroke-width="2"/>`;
  }
  if (pressed) body += `<path d="${p(5, 5, w - 10, h - 10, Math.max(3, big - 5))}" fill="${a(c.text, .065)}"/>`;
  if (disabled) body += `<path d="${p(3, 3, w - 6, h - 6, big)}" fill="${a('#8d9997', .22)}"/>`;
  return { body, defs, rim, accentColor };
}

function buttonSvg(theme, item, variant, state) {
  const [w, h] = BUTTON_SIZES[item.role][variant];
  const accent = ['home-play', 'mode-adventure', 'adventure-play', 'fire', 'power-confirm', 'ai-start'].includes(item.id)
    ? 'primary' : item.id === 'logout' ? 'danger' : 'normal';
  const f = frame(theme, w, h, state, accent, 'button');
  const c = THEMES[theme];
  const color = state === 'disabled' ? a(c.text, .38) : accent === 'danger' ? c.danger : c.text;
  let iconSize, ix, iy, safe;
  if (item.role === 'square') {
    iconSize = Math.round(h * .46); ix = (w - iconSize) / 2; iy = (h - iconSize) / 2;
    safe = [0, 0, 0, 0];
  } else if (item.role === 'tile') {
    iconSize = variant === 'desktop' ? 28 : 22; ix = (w - iconSize) / 2; iy = 10;
    safe = [10, h * .52, w - 20, h * .39];
  } else {
    iconSize = variant === 'desktop' ? 23 : 20; ix = variant === 'desktop' ? 23 : 17; iy = (h - iconSize) / 2;
    safe = [ix + iconSize + 12, 5, w - ix - iconSize - 37, h - 10];
  }
  const inner = f.body + icon(item.icon, ix, iy, iconSize, color);
  return { svg: svgWrap(w, h, inner, f.defs), width: w, height: h, safe };
}

function moduleDecor(theme, item, w, h) {
  const c = THEMES[theme];
  const fg = c.text, mark = c.signal, edge = c.outer;
  const small = w < 400;
  const pad = small ? 13 : 19;
  const title = line(pad, 19, Math.min(w - pad, pad + 74), 19, mark, 1.5, .8);
  const separator = line(pad, Math.min(h - 40, 52), w - pad, Math.min(h - 40, 52), edge, 1, .62);
  switch (item.type) {
    case 'identity':
      return circle(pad + 25, h / 2, Math.min(29, h * .31), a(c.surfaceEnd, .8), edge, 2)
        + circle(pad + 25, h / 2 - 7, 6, 'none', mark, 1.3)
        + pathEl(`M${pad + 10} ${h / 2 + 14}q15-18 30 0`, mark, 1.3)
        + line(pad + 68, 33, w - pad - 23, 33, fg, 1, .22)
        + line(pad + 68, 60, w - pad - 86, 60, edge, 1, .4)
        + circle(w - pad - 14, h / 2, 8, c.warm, 'none');
    case 'fame': {
      const lx = pad + 29;
      return `<path d="M${lx} 22l19 12v24l-19 12-19-12V34Z" fill="${a(mark, .13)}" stroke="${mark}" stroke-width="1.8"/>`
        + line(pad + 67, 36, w - pad - 23, 36, fg, 1, .26)
        + line(pad + 67, 61, w - pad - 75, 61, edge, 1, .4)
        + rect(pad + 67, h - 30, w - pad * 2 - 74, 8, c.surfaceEnd, edge, 1, 3)
        + rect(pad + 69, h - 28, (w - pad * 2 - 78) * .42, 4, c.warm, 'none', 0, 2);
    }
    case 'score': return rect(pad, pad, 5, h - pad * 2, mark) + line(pad + 19, h - 23, w - pad - 32, h - 23, fg, 2, .34);
    case 'match': return title + separator + circle(w / 2, h - 19, 4, mark) + circle(w / 2 - 17, h - 19, 2, edge) + circle(w / 2 + 17, h - 19, 2, edge);
    case 'timer': return circle(w / 2, h / 2, Math.min(h * .31, 26), 'none', edge, 1.5) + pathEl(`M${w / 2} ${h / 2 - 12}v12l10 6`, mark, 2);
    case 'stones': return [0, 1, 2, 3, 4].map(i => circle(pad + 17 + i * ((w - pad * 2 - 34) / 4), h / 2, small ? 8 : 11, a(mark, .19), edge, 2)).join('');
    case 'speed': return pathEl(`M${pad} ${h / 2 - 8}l10 8-10 8m13-16 10 8-10 8`, mark, 2) + line(pad + 37, h / 2, w - pad, h / 2, edge, 1, .6);
    case 'turn': return rect(pad, 14, 6, h - 28, c.warm) + line(pad + 18, h / 2, w - pad - 18, h / 2, mark, 1, .45);
    case 'trigger': return circle(w / 2, h / 2 - 3, Math.min(w * .3, 27), a(mark, .13), mark, 2) + circle(w / 2, h / 2 - 3, 6, 'none', edge, 2) + circle(w * .73, h * .74, 10, c.surfaceEnd, c.warm, 1.5);
    case 'bag': return [0, 1, 2].map(i => rect(pad + i * 4, 17 - i * 3, w - pad * 2 - 8, h - 36, c.surfaceEnd, edge, 1.4, 2)).join('') + rect(w - 31, h - 27, 20, 17, c.warm, 'none', 0, 2);
    case 'card': case 'card-selected': case 'card-locked': {
      const border = item.type === 'card-selected' ? c.warm : item.type === 'card-locked' ? c.quiet : edge;
      const artBottom = Math.round(h * .72);
      const mask = `<mask id="art-hole"><rect width="${w}" height="${h}" fill="white"/><rect x="${pad}" y="${pad}" width="${w - pad * 2}" height="${artBottom - pad}" fill="black"/></mask>`;
      const frameFill = `<path d="${p(3, 3, w - 6, h - 6, 7)}" fill="${c.surface}" mask="url(#art-hole)" stroke="${border}" stroke-width="2"/>`;
      const artStroke = rect(pad, pad, w - pad * 2, artBottom - pad, 'none', border, 1.2, 2);
      const nameplate = rect(pad - 2, artBottom + 7, w - pad * 2 + 4, h - artBottom - 18, a(c.surfaceEnd, .84), border, 1, 2);
      const lock = item.type === 'card-locked' ? pathEl(`M${w / 2 - 9} ${h / 2 - 4}v-8a9 9 0 0 1 18 0v8M${w / 2 - 12} ${h / 2 - 4}h24v22h-24Z`, border, 2, a(c.surfaceEnd, .75)) : '';
      return mask + frameFill + artStroke + nameplate + lock;
    }
    case 'hand-active': case 'hand-inactive': {
      const active = item.type === 'hand-active';
      return rect(pad, 11, active ? 112 : 92, 3, active ? c.warm : c.quiet)
        + [0, 1, 2, 3].map(i => rect(pad + i * (small ? 47 : 80), 42, small ? 42 : 69, h - 65,
          a(c.surfaceEnd, active ? .28 : .12), active ? edge : c.quiet, 1, 3)).join('')
        + circle(w - pad - 48, h - 26, 14, 'none', mark, 2)
        + rect(w - pad - 22, h - 44, 18, 26, a(mark, .15), edge, 1, 2);
    }
    case 'deck-builder': {
      const split = Math.round(w * (small ? .53 : .59));
      return title + line(pad, 55, w - pad, 55, edge, 1, .7)
        + line(split, 70, split, h - 74, mark, 1.5, .65)
        + rect(pad, 73, split - pad * 2, h - 154, a(c.surfaceEnd, .21), edge, 1, 3)
        + rect(split + 13, 73, w - split - pad - 13, h - 154, a(c.surfaceEnd, .27), edge, 1, 3)
        + [0, 1, 2].map(i => circle(split + 38 + i * (small ? 30 : 42), h - 53, small ? 10 : 14, 'none', i === 0 ? c.warm : edge, 1.5)).join('')
        + line(pad, h - 69, w - pad, h - 69, edge, 1, .64);
    }
    case 'collection': case 'stage': case 'map': case 'hero': case 'trigger-picker': {
      const lead = Math.round(w * (small ? .47 : .55));
      return title + separator + rect(pad, 69, lead - pad - 8, h - 128, a(c.surfaceEnd, .22), edge, 1, 3)
        + rect(lead + 8, 69, w - lead - pad - 8, h - 128, a(c.surfaceEnd, .2), edge, 1, 3)
        + line(pad, h - 48, w - pad, h - 48, mark, 1, .55);
    }
    case 'portrait': return rect(pad, pad, w - pad * 2, h * .69, 'none', edge, 1.5, 3)
      + line(pad + 10, h * .82, w - pad - 10, h * .82, mark, 1.8, .7)
      + [0, 1, 2].map(i => circle(w / 2 - 21 + i * 21, h - 22, 5, i === 0 ? c.warm : 'none', edge, 1)).join('');
    case 'dialogue': return rect(pad, pad, h * .61, h - pad * 2, 'none', edge, 1.6, 2)
      + line(pad + h * .61 + 17, pad + 21, w - pad - 20, pad + 21, c.warm, 1.5, .85)
      + line(pad + h * .61 + 17, h - 36, w - pad - 25, h - 36, edge, 1, .4);
    case 'tooltip': return rect(pad - 3, pad - 2, 3, h - pad * 2 + 4, mark)
      + line(pad + 13, 30, w - pad - 15, 30, c.warm, 1.5, .78)
      + [0, 1].map(i => line(pad + 13, 61 + i * 25, w - pad - 25 - i * 24, 61 + i * 25, fg, 1, .27)).join('');
    case 'settings': return title + separator
      + [0, 1].map(i => line(pad + 14, 119 + i * 68, w - pad - 18, 119 + i * 68, edge, 3, .55)
        + circle(w * (i === 0 ? .63 : .76), 119 + i * 68, 9, c.warm, edge, 1)).join('')
      + line(pad, h - 115, w - pad, h - 115, mark, 1, .66);
    case 'power': return rect(w * .39, 23, w * .22, h - 96, a(c.surfaceEnd, .38), edge, 1.5, 3)
      + line(w * .5, 28, w * .5, h - 86, c.warm, 2, .7)
      + [0, 1, 2, 3, 4].map(i => line(w * .35, 35 + i * ((h - 134) / 4), w * .65, 35 + i * ((h - 134) / 4), mark, 1, .55)).join('')
      + rect(pad, h - 53, w - pad * 2, 35, a(c.warm, .22), c.warm, 1.4, 2);
    case 'room-row': return circle(pad + 18, h / 2, 10, a(mark, .2), edge, 1.5)
      + line(pad + 47, h / 2 - 9, w - pad - 80, h / 2 - 9, fg, 1.4, .34)
      + line(pad + 47, h / 2 + 12, w - pad - 130, h / 2 + 12, edge, 1, .42)
      + rect(w - pad - 58, h / 2 - 16, 55, 32, a(mark, .18), mark, 1, 3);
    case 'result': case 'reward': return title + separator
      + [0, 1, 2].map(i => circle(w / 2 - 52 + i * 52, h * .36, 16, i === 0 ? a(c.warm, .35) : 'none', i === 0 ? c.warm : edge, 1.8)).join('')
      + line(w * .2, h * .67, w * .8, h * .67, mark, 1.3, .6);
    case 'input': return line(pad, h - 16, w - pad - 18, h - 16, mark, 1.5, .8)
      + circle(w - pad - 10, h / 2, 4, c.warm);
    case 'tabs': return [0, 1, 2].map(i => rect(pad + i * (w - pad * 2) / 3, 15, (w - pad * 2) / 3 - 5, h - 29,
      i === 0 ? a(c.warm, .24) : a(c.surfaceEnd, .21), i === 0 ? c.warm : edge, 1, 2)).join('');
    case 'connection': return circle(pad + 11, h / 2, 6, c.signal)
      + line(pad + 29, h / 2, w - pad - 14, h / 2, edge, 1, .5);
    case 'map-badge': return icon('compass', pad + 8, h / 2 - 11, 22, mark)
      + line(pad + 40, h - 14, w - pad - 38, h - 14, edge, 1, .55)
      + rect(w - pad - 30, h / 2 - 14, 28, 28, a(mark, .1), edge, 1, 3);
    case 'score-breakdown': return title + separator
      + [0, 1, 2, 3].map(i => line(pad + 12, 80 + i * 29, w - pad - 18, 80 + i * 29, i === 3 ? c.warm : edge, i === 3 ? 2 : 1, .55)).join('')
      + rect(w - pad - 46, h - 43, 38, 24, a(c.warm, .16), c.warm, 1, 2);
    case 'deck-presets': return [0, 1, 2].map(i => {
      const x = pad + i * (w - pad * 2) / 3;
      return rect(x, 11, (w - pad * 2) / 3 - 7, h - 22, i === 0 ? a(c.warm, .2) : a(c.surfaceEnd, .25), i === 0 ? c.warm : edge, 1.5, 3);
    }).join('');
    case 'card-inspector': return title + separator
      + rect(pad, 68, w * .44, h * .53, a(c.surfaceEnd, .16), edge, 1.5, 2)
      + rect(w * .51, 68, w * .49 - pad, h * .22, a(c.surfaceEnd, .2), edge, 1, 2)
      + line(pad, h * .69, w - pad, h * .69, c.warm, 1.4, .7)
      + [0, 1, 2].map(i => line(pad + 5, h * .74 + i * 30, w - pad - 13 - i * 25, h * .74 + i * 30, edge, 1, .53)).join('');
    case 'card-draw': return [0, 1, 2].map(i => rect(pad + i * 5, 17 - i * 3, 38, h - 32, a(c.surfaceEnd, .6), edge, 1, 2)).join('')
      + pathEl(`M${pad + 65} ${h / 2}h28m-8-8 8 8-8 8`, mark, 2)
      + line(pad + 105, h - 19, w - pad - 15, h - 19, edge, 1, .55);
    case 'stage-locked': return rect(pad, pad, w - pad * 2, h * .69, a(c.surfaceEnd, .75), edge, 1.5, 2)
      + pathEl(`M${w / 2 - 18} ${h * .37}v-12a18 18 0 0 1 36 0v12M${w / 2 - 22} ${h * .37}h44v42h-44Z`, c.quiet, 2.5, a(c.surface, .9))
      + line(pad + 12, h * .83, w - pad - 12, h * .83, edge, 1.3, .48);
    case 'stage-objective': return rect(pad, pad + 6, 5, h - pad * 2 - 12, c.warm)
      + line(pad + 19, h - 29, w - pad - 22, h - 29, edge, 1, .5)
      + circle(w - pad - 15, h / 2, 12, a(c.warm, .18), c.warm, 1.5);
    case 'tutorial-step': return circle(pad + 27, h / 2, 19, a(mark, .13), mark, 2)
      + pathEl(`M${pad + 73} ${h - 18}h${w - pad * 2 - 100}`, edge, 1)
      + rect(w - pad - 40, h / 2 - 13, 31, 26, a(c.warm, .13), c.warm, 1, 2);
    case 'achievement': return `<path d="M${pad + 27} 20l8 14 16 2-11 12 2 16-15-7-15 7 2-16-11-12 16-2Z" fill="${a(c.warm, .16)}" stroke="${c.warm}" stroke-width="1.7"/>`
      + line(pad + 69, h - 25, w - pad - 18, h - 25, edge, 1.2, .55);
    case 'mark-strip': return [0, 1, 2].map(i => {
      const x = pad + 23 + i * ((w - pad * 2 - 46) / 2);
      return `<path d="M${x} ${h / 2 - 14}l12 14-12 14-12-14Z" fill="${i === 2 ? a(c.quiet, .15) : a(c.warm, .3)}" stroke="${i === 2 ? c.quiet : c.warm}" stroke-width="1.6"/>`;
    }).join('');
    case 'volume': return line(pad + 12, h / 2, w - pad - 12, h / 2, edge, 4, .8)
      + line(pad + 12, h / 2, w * .68, h / 2, mark, 4)
      + circle(w * .68, h / 2, 10, c.warm, edge, 1.5);
    case 'loading': return [0, 1, 2].map(i => circle(w / 2 - 28 + i * 28, h / 2, i === 1 ? 7 : 5, i === 1 ? mark : a(mark, .27))).join('')
      + line(pad, h - 19, w - pad, h - 19, edge, 1, .5);
    default: return title + separator;
  }
}

function moduleSvg(theme, item, variant) {
  const [w, h] = variant === 'desktop' ? item.size : item.compact;
  const f = frame(theme, w, h, 'idle', ['fame', 'stage', 'result', 'reward'].includes(item.type) ? 'primary' : 'normal', 'module');
  return { svg: svgWrap(w, h, f.body + moduleDecor(theme, item, w, h), f.defs), width: w, height: h };
}

async function writeAsset(rel, svg, w, h, rasters = true) {
  const dest = path.join(ROOT, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, svg, 'utf8');
  if (!rasters) return;
  const png = dest.replace(/\.svg$/, '.png');
  const webp = dest.replace(/\.svg$/, '.webp');
  const raster = sharp(Buffer.from(svg)).resize(w * 2, h * 2);
  await Promise.all([
    raster.clone().png({ compressionLevel: 9 }).toFile(png),
    raster.clone().webp({ quality: 90, effort: 5 }).toFile(webp)
  ]);
}

async function main() {
  const manifest = {
    version: 1, status: 'design-only', madeFor: 'Second Chance',
    themes: Object.fromEntries(Object.entries(THEMES).map(([key, value]) => [key, { name: value.name, colors: value }])),
    formats: ['svg', 'png', 'webp'], rasterScale: 2, textIsLiveHTML: true, buttonSizes: BUTTON_SIZES,
    buttons: [], modules: []
  };
  for (const item of buttons) {
    const record = { ...item, sizes: BUTTON_SIZES[item.role], safeAreas: {}, files: {} };
    for (const theme of Object.keys(THEMES)) {
      record.files[theme] = {};
      for (const variant of ['desktop', 'compact']) {
        record.files[theme][variant] = {};
        for (const state of STATES) {
          const rendered = buttonSvg(theme, item, variant, state);
          const rel = `buttons/${theme}/${item.id}--${variant}--${state}.svg`;
          await writeAsset(rel, rendered.svg, rendered.width, rendered.height);
          record.files[theme][variant][state] = rel;
          record.safeAreas[variant] = rendered.safe;
        }
      }
    }
    manifest.buttons.push(record);
  }
  for (const item of modules) {
    const record = { ...item, files: {} };
    for (const theme of Object.keys(THEMES)) {
      record.files[theme] = {};
      for (const variant of ['desktop', 'compact']) {
        const rendered = moduleSvg(theme, item, variant);
        const rel = `modules/${theme}/${item.id}--${variant}.svg`;
        await writeAsset(rel, rendered.svg, rendered.width, rendered.height);
        record.files[theme][variant] = rel;
      }
    }
    manifest.modules.push(record);
  }
  for (const name of new Set(buttons.map(item => item.icon))) {
    const svg = svgWrap(48, 48, icon(name, 4, 4, 40, '#e6c88f'));
    await writeAsset(`icons/${name}.svg`, svg, 48, 48);
  }
  await fs.writeFile(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  await fs.writeFile(path.join(ROOT, 'review-data.js'), `window.UI_KIT = ${JSON.stringify(manifest)};\n`, 'utf8');
  console.log(`Generated ${manifest.buttons.length} button roles and ${manifest.modules.length} HUD modules in ${Object.keys(THEMES).length} themes, SVG + 2x PNG/WebP.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
