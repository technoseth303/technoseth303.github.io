(() => {
  // ----- DOM -----
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const how = document.getElementById("how");
  const gameover = document.getElementById("gameover");

  const playBtn = document.getElementById("playBtn");
  const howBtn = document.getElementById("howBtn");
  const backBtn = document.getElementById("backBtn");
  const retryBtn = document.getElementById("retryBtn");
  const menuBtn = document.getElementById("menuBtn");
  const pauseBtn = document.getElementById("pauseBtn");

  const finalScoreEl = document.getElementById("finalScore");
  const finalBestEl = document.getElementById("finalBest");

  const soundToggle = document.getElementById("soundToggle");
  const hapticToggle = document.getElementById("hapticToggle");

  // ----- Settings & storage -----
  const STORE_KEY = "neonDodgeBest";
  let best = Number(localStorage.getItem(STORE_KEY) || 0);
  bestEl.textContent = best;

  const state = {
    running: false,
    paused: false,
    over: false,
    t: 0,
    dt: 0,
    last: 0,
    score: 0,
    shake: 0,
    w: 0,
    h: 0,
    dpr: Math.max(1, Math.min(2.5, window.devicePixelRatio || 1)),
    sound: true,
    haptic: true
  };

  // ----- Audio (tiny synth beeps) -----
  let audioCtx = null;
  function beep(freq = 440, dur = 0.06, type = "sine", gain = 0.03) {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(gain, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur);
    } catch {}
  }
  function vibrate(ms) {
    if (!state.haptic) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // ----- Game objects -----
  const player = { x: 0, y: 0, r: 14, vx: 0 };
  let hazards = [];
  let coins = [];
  let particles = [];

  // ----- Helpers -----
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function resize() {
    state.w = Math.floor(window.innerWidth * state.dpr);
    state.h = Math.floor(window.innerHeight * state.dpr);
    canvas.width = state.w;
    canvas.height = state.h;
    ctx.imageSmoothingEnabled = true;

    // Place player near bottom
    player.r = Math.round(14 * state.dpr);
    player.x = state.w * 0.5;
    player.y = state.h * 0.78;
  }
  window.addEventListener("resize", resize, { passive: true });
  resize();

  // ----- Input (one-thumb drag) -----
  let dragging = false;
  function pointerToX(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (("clientX" in e ? e.clientX : e.touches[0].clientX) - rect.left) / rect.width;
    return x * state.w;
  }
  function onDown(e) { dragging = true; player.x = pointerToX(e); }
  function onMove(e) { if (dragging) player.x = pointerToX(e); }
  function onUp() { dragging = false; }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  // Prevent mobile scrolling / pull-to-refresh during gameplay
  document.addEventListener("touchmove", (e) => {
    if (state.running) e.preventDefault();
  }, { passive: false });

  // ----- Spawning -----
  function spawnHazard() {
    const size = rand(14, 26) * state.dpr;
    hazards.push({
      x: rand(size, state.w - size),
      y: -size,
      r: size,
      vy: rand(220, 330) * state.dpr, // base fall speed
      wobble: rand(-1, 1) * 0.6,
      rot: rand(0, Math.PI * 2)
    });
  }
  function spawnCoin() {
    const r = 10 * state.dpr;
    coins.push({
      x: rand(r, state.w - r),
      y: -r,
      r,
      vy: rand(200, 260) * state.dpr
    });
  }
  function burst(x, y, color, n = 16, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(120, 420) * state.dpr * power;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.35, 0.8),
        t: 0,
        color,
        r: rand(2, 4) * state.dpr
      });
    }
  }

  // ----- Difficulty curve -----
  function difficulty() {
    // smoothly ramps 0 → 1 → 2...
    return Math.min(3, state.score / 900);
  }

  // ----- Collisions -----
  function hitCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx, dy = ay - by;
    const rr = ar + br;
    return (dx * dx + dy * dy) <= rr * rr;
  }

  // ----- Game flow -----
  function resetGame() {
    hazards = [];
    coins = [];
    particles = [];
    state.score = 0;
    state.t = 0;
    state.over = false;
    state.paused = false;
    player.x = state.w * 0.5;
    player.y = state.h * 0.78;
    scoreEl.textContent = "0";
  }

  function startGame() {
    overlay.classList.remove("show");
    how.classList.remove("show");
    gameover.classList.remove("show");
    resetGame();
    state.running = true;
    state.paused = false;
    state.last = performance.now();
    beep(523, 0.05, "triangle", 0.035);
    requestAnimationFrame(loop);
  }

  function endGame() {
    state.running = false;
    state.over = true;

    // Save best
    if (state.score > best) {
      best = state.score;
      localStorage.setItem(STORE_KEY, String(best));
      bestEl.textContent = best;
    }

    finalScoreEl.textContent = state.score;
    finalBestEl.textContent = best;

    gameover.classList.add("show");
    vibrate(80);
    beep(220, 0.08, "sawtooth", 0.03);
    beep(160, 0.10, "sawtooth", 0.03);
  }

  function togglePause() {
    if (!state.running) return;
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? "▶️" : "⏸";
    if (!state.paused) {
      state.last = performance.now();
      requestAnimationFrame(loop);
    }
  }

  // ----- Drawing -----
  function clear() {
    // subtle vignette-ish background
    ctx.fillStyle = "#071024";
    ctx.fillRect(0, 0, state.w, state.h);
  }

  function drawGlowCircle(x, y, r, fill, glow) {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = 22 * state.dpr;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawHazard(h) {
    // spiky-ish orb
    const spikes = 10;
    const r1 = h.r;
    const r2 = h.r * 0.62;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.fillStyle = "#ff3b3b";
    ctx.shadowColor = "#ff3b3b";
    ctx.shadowBlur = 20 * state.dpr;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const rr = (i % 2 === 0) ? r1 : r2;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawCoin(c) {
    ctx.save();
    ctx.shadowColor = "#ffd24a";
    ctx.shadowBlur = 18 * state.dpr;
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // inner ring
    ctx.strokeStyle = "#fff2b0";
    ctx.lineWidth = 2 * state.dpr;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r * 0.62, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawParticles() {
    for (const p of particles) {
      const k = 1 - (p.t / p.life);
      ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ----- Update -----
  function update(dt) {
    state.t += dt;

    // Clamp player to screen
    player.x = clamp(player.x, player.r, state.w - player.r);

    // Spawn rates scale with difficulty
    const d = difficulty();
    const hazardRate = 0.55 + d * 0.45; // hazards per second-ish
    const coinRate = 0.22 + d * 0.08;

    // probabilistic spawns
    if (Math.random() < hazardRate * dt) spawnHazard();
    if (Math.random() < coinRate * dt) spawnCoin();

    const speedBoost = 1 + d * 0.45;

    // update hazards
    for (const h of hazards) {
      h.y += h.vy * dt * speedBoost;
      h.x += Math.sin((state.t * 0.8) + h.rot) * h.wobble * 30 * state.dpr * dt;
      h.rot += 2.2 * dt;
    }
    hazards = hazards.filter(h => h.y < state.h + h.r * 2);

    // update coins
    for (const c of coins) {
      c.y += c.vy * dt * speedBoost;
    }
    coins = coins.filter(c => c.y < state.h + c.r * 2);

    // particles
    for (const p of particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= (1 - 1.5 * dt);
      p.vy *= (1 - 1.5 * dt);
    }
    particles = particles.filter(p => p.t < p.life);

    // collisions: hazards
    for (const h of hazards) {
      if (hitCircle(player.x, player.y, player.r * 0.92, h.x, h.y, h.r * 0.72)) {
        state.shake = 10 * state.dpr;
        burst(player.x, player.y, "#2b6cff", 22, 1.4);
        burst(h.x, h.y, "#ff3b3b", 26, 1.2);
        vibrate(120);
        beep(140, 0.08, "sawtooth", 0.03);
        endGame();
        return;
      }
    }

    // collisions: coins
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      if (hitCircle(player.x, player.y, player.r, c.x, c.y, c.r)) {
        coins.splice(i, 1);
        state.score += 120;
        burst(c.x, c.y, "#ffd24a", 18, 1.1);
        vibrate(25);
        beep(880, 0.04, "triangle", 0.03);
      }
    }

    // score increases with survival time
    state.score += Math.floor(60 * dt);
    scoreEl.textContent = state.score;

    // tiny screen shake decay
    state.shake = Math.max(0, state.shake - 40 * state.dpr * dt);
  }

  function render() {
    clear();

    // screen shake
    let ox = 0, oy = 0;
    if (state.shake > 0) {
      ox = rand(-state.shake, state.shake);
      oy = rand(-state.shake, state.shake);
      ctx.save();
      ctx.translate(ox, oy);
    }

    // neon grid lines (subtle)
    ctx.strokeStyle = "rgba(63,120,255,0.08)";
    ctx.lineWidth = 1 * state.dpr;
    for (let y = 0; y < state.h; y += 90 * state.dpr) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(state.w, y);
      ctx.stroke();
    }

    // draw coins & hazards
    for (const c of coins) drawCoin(c);
    for (const h of hazards) drawHazard(h);

    // player glow
    drawGlowCircle(player.x, player.y, player.r, "#2b6cff", "#2b6cff");
    // player core
    drawGlowCircle(player.x, player.y, player.r * 0.52, "#cfe0ff", "#8ab4ff");

    drawParticles();

    if (state.shake > 0) ctx.restore();
  }

  function loop(now) {
    if (!state.running || state.paused) return;
    const dt = Math.min(0.033, (now - state.last) / 1000);
    state.last = now;

    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // ----- UI wiring -----
  playBtn.addEventListener("click", () => startGame());
  howBtn.addEventListener("click", () => { overlay.classList.remove("show"); how.classList.add("show"); });
  backBtn.addEventListener("click", () => { how.classList.remove("show"); overlay.classList.add("show"); });
  retryBtn.addEventListener("click", () => startGame());
  menuBtn.addEventListener("click", () => { gameover.classList.remove("show"); overlay.classList.add("show"); });
  pauseBtn.addEventListener("click", () => togglePause());

  soundToggle.addEventListener("change", () => { state.sound = soundToggle.checked; if (state.sound) beep(660, 0.03); });
  hapticToggle.addEventListener("change", () => { state.haptic = hapticToggle.checked; if (state.haptic) vibrate(20); });

  // initialize toggles
  state.sound = soundToggle.checked;
  state.haptic = hapticToggle.checked;

  // Show menu on load
  overlay.classList.add("show");
})();
