(() => {
  const overlay = document.querySelector('#startOverlay');
  const canvas = overlay?.querySelector('.preservation-webcg__atmosphere');
  const context = canvas?.getContext('2d', { alpha: true });
  if (!overlay || !canvas || !context) return;

  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const random = (() => {
    let seed = 2041;
    return () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  })();
  const lights = Array.from({ length: 42 }, () => ({
    x: .19 + random() * .62,
    y: .25 + random() * .53,
    radius: 1.1 + random() * 2.2,
    phase: random() * Math.PI * 2,
    speed: .35 + random() * .8,
    warm: random() > .26
  }));
  let width = 0;
  let height = 0;
  let frame = 0;
  let lastFrame = 0;
  let running = false;
  let elapsed = 0;

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const paintCloud = (x, y, rx, ry, phase, opacity, dark = false) => {
    context.save();
    context.translate(x, y);
    context.rotate(Math.sin(phase) * .12);
    context.scale(1, ry / rx);
    const radius = rx;
    const gradient = context.createRadialGradient(-radius * .12, 0, radius * .08, 0, 0, radius);
    if (dark) {
      gradient.addColorStop(0, `rgba(5, 11, 13, ${opacity})`);
      gradient.addColorStop(.56, `rgba(9, 17, 19, ${opacity * .62})`);
      gradient.addColorStop(1, 'rgba(8, 14, 16, 0)');
    } else {
      gradient.addColorStop(0, `rgba(183, 194, 188, ${opacity})`);
      gradient.addColorStop(.45, `rgba(143, 158, 151, ${opacity * .64})`);
      gradient.addColorStop(1, 'rgba(125, 142, 137, 0)');
    }
    context.fillStyle = gradient;
    context.beginPath();
    context.ellipse(0, 0, radius, radius * .62, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const draw = timestamp => {
    frame = 0;
    if (!running) return;
    if (!lastFrame) lastFrame = timestamp;
    elapsed += Math.min((timestamp - lastFrame) / 1000, .05);
    lastFrame = timestamp;
    context.clearRect(0, 0, width, height);

    // Broad, slow fog banks cross the horizon; smaller lobes billow at a different pace.
    const fogScale = Math.max(width, height);
    for (let bank = 0; bank < 4; bank++) {
      const speed = [.024, .036, -.027, .018][bank];
      const travel = ((elapsed * speed + bank * .31) % 1.5 + 1.5) % 1.5 - .25;
      const y = height * [.2, .78, .52, .9][bank] + Math.sin(elapsed * .17 + bank * 2.1) * height * .035;
      const x = travel * width;
      const rx = fogScale * [.26, .34, .2, .3][bank];
      const pulse = .11 + .07 * (Math.sin(elapsed * .34 + bank * 2.7) + 1) / 2;
      paintCloud(x, y, rx, rx * [.44, .32, .55, .28][bank], elapsed * .2 + bank, pulse);
      paintCloud(x + rx * .48, y - height * .035, rx * .62, rx * .2, elapsed * .24 + bank + 1, pulse * .66);
      paintCloud(x - rx * .42, y + height * .025, rx * .58, rx * .19, elapsed * .18 + bank + 3, pulse * .56);
    }

    // Unreadable exterior silhouettes breathe through passing dark vapor.
    for (let i = 0; i < 3; i++) {
      const x = width * (.08 + ((elapsed * [.009, .006, .011][i] + i * .47) % 1.12));
      const y = height * [.16, .83, .55][i] + Math.sin(elapsed * .13 + i) * height * .05;
      paintCloud(x, y, fogScale * [.23, .31, .2][i], fogScale * [.1, .12, .11][i], elapsed + i, .14, true);
    }

    // Interior lights pulse independently, like scattered districts still in use.
    context.save();
    context.globalCompositeOperation = 'screen';
    for (const light of lights) {
      const flicker = .43 + .34 * Math.sin(elapsed * light.speed + light.phase)
        + .2 * Math.sin(elapsed * light.speed * 2.13 + light.phase * .7);
      const alpha = Math.max(.08, flicker) * (light.warm ? .46 : .3);
      const x = width * light.x + Math.sin(elapsed * .025 + light.phase) * 3;
      const y = height * light.y + Math.cos(elapsed * .03 + light.phase) * 2;
      const color = light.warm ? '232, 166, 76' : '144, 201, 197';
      const glow = context.createRadialGradient(x, y, 0, x, y, light.radius * 5.5);
      glow.addColorStop(0, `rgba(${color}, ${alpha})`);
      glow.addColorStop(1, `rgba(${color}, 0)`);
      context.fillStyle = glow;
      context.fillRect(x - light.radius * 6, y - light.radius * 6, light.radius * 12, light.radius * 12);
      context.fillStyle = `rgba(${color}, ${alpha * .85})`;
      context.fillRect(x - light.radius * .45, y - light.radius * .45, light.radius * .9, light.radius * .9);
    }

    // A very soft, moving haze catches the wall and far-off structures.
    const sweepX = width * (.12 + .76 * ((Math.sin(elapsed * .11) + 1) / 2));
    const beam = context.createLinearGradient(sweepX - width * .15, 0, sweepX + width * .15, height);
    beam.addColorStop(0, 'rgba(170, 207, 197, 0)');
    beam.addColorStop(.5, 'rgba(170, 207, 197, .055)');
    beam.addColorStop(1, 'rgba(170, 207, 197, 0)');
    context.fillStyle = beam;
    context.fillRect(0, 0, width, height);
    context.restore();

    frame = window.requestAnimationFrame(draw);
  };

  const syncMotionState = () => {
    const shouldRun = !document.hidden && !motionPreference.matches
      && !overlay.hidden && overlay.classList.contains('is-home-lobby');
    overlay.classList.toggle('is-paused', !shouldRun);
    if (shouldRun === running) return;
    running = shouldRun;
    lastFrame = 0;
    if (running) {
      resize();
      frame = window.requestAnimationFrame(draw);
    } else if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  new ResizeObserver(resize).observe(overlay);
  new MutationObserver(syncMotionState).observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', syncMotionState, { passive: true });
  motionPreference.addEventListener?.('change', syncMotionState);
  resize();
  syncMotionState();
})();
