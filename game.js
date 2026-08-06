/**
 * Einmaleins-Bombenabwehr
 * Phase 0–3: Gerüst, Szene, Logik, Feinschliff
 * Phase 4: Titel, Highscore, Sounds, Tasten 1–3, Speed-Ramp
 */

(() => {
  "use strict";

  // ——— DOM ———
  const gameRoot = document.getElementById("game-root");
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const hudEl = document.getElementById("hud");
  const scoreEl = document.getElementById("score");
  const highscoreEl = document.getElementById("highscore");
  const finalScoreEl = document.getElementById("final-score");
  const finalHighscoreEl = document.getElementById("final-highscore");
  const titleHighscoreEl = document.getElementById("title-highscore");
  const newRecordEl = document.getElementById("new-record");
  const answersEl = document.getElementById("answers");
  const answerBtns = [...document.querySelectorAll(".answer-btn")];
  const gameOverEl = document.getElementById("game-over");
  const titleScreenEl = document.getElementById("title-screen");
  const restartBtn = document.getElementById("restart-btn");
  const startBtn = document.getElementById("start-btn");

  // ——— Konstanten ———
  const GROUND_RATIO = 0.12;
  /** Fallzeit oben→Boden (s): startet bei BASE, sinkt mit Score bis MIN */
  const FALL_DURATION_BASE = 10;
  const FALL_DURATION_MIN = 5;
  /** Nach ~20 Punkten ist die Min-Dauer erreicht */
  const FALL_SPEEDUP_PER_POINT = 0.25;
  const PARTICLE_RATE = 48;
  const LASER_DURATION = 0.45;
  const EXPLOSION_DURATION = 0.7;
  const RESPAWN_DELAY = 0.55;
  const GAME_OVER_DELAY = 0.75;
  const HS_KEY = "einmaleins-bomben-highscore";
  const SLOW_ANSWER_SECONDS = 4.2;
  const MAX_REPEAT_COMBOS = 2;
  const REPEAT_MIN_AFTER_QUESTIONS = 2;
  const REPEAT_MAX_AFTER_QUESTIONS = 10;
  const REPEAT_NORMAL_GAP = 1;

  // ——— Zustand ———
  const state = {
    phase: "title", // title | playing | gameover
    running: false,
    gameOver: false,
    inputLocked: false,
    score: 0,
    highScore: 0,
    width: 0,
    height: 0,
    dpr: 1,
    groundY: 0,
    lastTs: 0,
    bomb: null,
    particles: [],
    lasers: [],
    explosions: [],
    cannon: {
      x: 0,
      y: 0,
      angle: -Math.PI / 2,
      targetAngle: -Math.PI / 2,
    },
    respawnAt: 0,
    time: 0,
    gameOverAt: 0,
    questionsAsked: 0,
    repeatCombos: new Map(),
    lastRepeatQuestionAt: -Infinity,
  };

  // ——— Highscore ———
  function loadHighScore() {
    try {
      const n = parseInt(localStorage.getItem(HS_KEY) || "0", 10);
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  function saveHighScore(n) {
    try {
      localStorage.setItem(HS_KEY, String(n));
    } catch {
      /* private mode / blocked */
    }
  }

  function updateHighScoreUI() {
    if (highscoreEl) highscoreEl.textContent = String(state.highScore);
    if (titleHighscoreEl) titleHighscoreEl.textContent = String(state.highScore);
    if (finalHighscoreEl) finalHighscoreEl.textContent = String(state.highScore);
  }

  // ——— Sounds (Web Audio, ohne Dateien) ———
  const SFX = {
    ctx: null,

    ensure() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!this.ctx) this.ctx = new AC();
      if (this.ctx.state === "suspended") this.ctx.resume();
      return this.ctx;
    },

    tone(freq, dur, type = "square", gain = 0.08, slideTo = null) {
      const ctx = this.ensure();
      if (!ctx) return;
      const t0 = ctx.currentTime;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo != null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
      }
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },

    noiseBurst(dur, gain = 0.12) {
      const ctx = this.ensure();
      if (!ctx) return;
      const n = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < n; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / n);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 900;
      g.gain.value = gain;
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start();
    },

    laser() {
      this.tone(880, 0.12, "sawtooth", 0.06, 220);
      this.tone(1320, 0.08, "square", 0.03, 400);
    },

    boom(big = false) {
      this.noiseBurst(big ? 0.45 : 0.28, big ? 0.18 : 0.12);
      this.tone(big ? 90 : 140, big ? 0.4 : 0.25, "sine", big ? 0.14 : 0.09, 40);
    },

    fail() {
      this.tone(220, 0.12, "square", 0.07, 110);
      window.setTimeout(() => this.tone(160, 0.14, "square", 0.06, 80), 80);
    },

    spawn() {
      this.tone(320, 0.1, "triangle", 0.04, 180);
    },

    ui() {
      this.tone(520, 0.06, "triangle", 0.05);
    },

    record() {
      this.tone(523, 0.1, "square", 0.06);
      window.setTimeout(() => this.tone(659, 0.1, "square", 0.06), 90);
      window.setTimeout(() => this.tone(784, 0.16, "square", 0.07), 180);
    },
  };

  // ——— Hilfen ———
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, maxInclusive) {
    return Math.floor(rand(min, maxInclusive + 1));
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function fallDurationForScore(score) {
    return Math.max(
      FALL_DURATION_MIN,
      FALL_DURATION_BASE - score * FALL_SPEEDUP_PER_POINT
    );
  }

  // ——— Ablenkantworten ———
  function factorWrongCandidates(a, b, correct) {
    const pairs = [
      [a + 1, b],
      [a - 1, b],
      [a, b + 1],
      [a, b - 1],
    ];
    const out = [];
    for (const [fa, fb] of pairs) {
      if (fa < 1 || fb < 1) continue;
      const p = fa * fb;
      if (p > 0 && p !== correct && !out.includes(p)) out.push(p);
    }
    return out;
  }

  function pickNearMiss(correct, used) {
    const offsets = shuffle([-3, -2, -1, 1, 2, 3]);
    for (const d of offsets) {
      const n = correct + d;
      if (n > 0 && !used.has(n)) return n;
    }
    for (let d = 1; d < 80; d++) {
      for (const sign of [1, -1]) {
        const n = correct + d * sign;
        if (n > 0 && !used.has(n)) return n;
      }
    }
    return correct + 4;
  }

  /** Falsch um ±10 (Zehner-Fehler). */
  function pickTenOff(correct, used) {
    for (const d of shuffle([10, -10])) {
      const n = correct + d;
      if (n > 0 && !used.has(n)) return n;
    }
    return null;
  }

  /** Falsch über benachbarten Faktor (a±1)·b bzw. a·(b±1). */
  function pickFactorWrong(a, b, correct, used) {
    const opts = factorWrongCandidates(a, b, correct).filter((p) => !used.has(p));
    if (opts.length > 0) return opts[randInt(0, opts.length - 1)];
    return null;
  }

  /**
   * Drei Berechnungen für Falschantworten:
   *  1) Faktor ±1 (z. B. 6×7 → 5×7 / 6×8 …)
   *  2) Nahtreffer ±1…3
   *  3) Zehner ±10
   * Zwei verschiedene davon werden zufällig gewählt.
   */
  function generateAnswers(a, b) {
    const correct = a * b;
    const used = new Set([correct]);

    const makers = shuffle([
      () => pickFactorWrong(a, b, correct, used),
      () => pickNearMiss(correct, used),
      () => pickTenOff(correct, used),
    ]);

    const wrongs = [];
    for (const make of makers) {
      if (wrongs.length >= 2) break;
      const n = make();
      if (n == null || n <= 0 || used.has(n)) continue;
      used.add(n);
      wrongs.push(n);
    }

    // Fallback, falls eine Strategie keinen gültigen Wert lieferte
    while (wrongs.length < 2) {
      const n = pickNearMiss(correct, used);
      used.add(n);
      wrongs.push(n);
    }

    return shuffle([
      { value: correct, correct: true },
      { value: wrongs[0], correct: false },
      { value: wrongs[1], correct: false },
    ]);
  }

  function assertAnswerGenerator() {
    for (let a = 1; a <= 20; a++) {
      for (let b = 1; b <= 20; b++) {
        if (a > 10 && b > 10) continue;
        const opts = generateAnswers(a, b);
        const vals = opts.map((o) => o.value);
        if (new Set(vals).size !== 3) console.warn("Nicht unique:", a, b, vals);
        if (!opts.some((o) => o.correct && o.value === a * b)) {
          console.warn("Korrekt fehlt:", a, b, opts);
        }
      }
    }
  }

  // ——— Resize / Layout ———
  function getViewportSize() {
    const vv = window.visualViewport;
    if (vv && vv.width > 0 && vv.height > 0) {
      return { w: Math.round(vv.width), h: Math.round(vv.height) };
    }
    return { w: window.innerWidth, h: window.innerHeight };
  }

  function updateLayoutVars() {
    const groundH = state.height * GROUND_RATIO;
    const cannonS = clamp(state.height / 700, 0.75, 1.3);
    const isNarrow = state.width < 480;
    const isShort = state.height < 520;
    const cannonClear = Math.round((isShort ? 56 : isNarrow ? 64 : 72) * cannonS);
    if (gameRoot) {
      gameRoot.style.setProperty("--ground-h", `${groundH}px`);
      gameRoot.style.setProperty("--cannon-clear", `${cannonClear}px`);
    }
  }

  /**
   * Fallgeschwindigkeit so setzen, dass die restliche Strecke
   * in der restlichen Fallzeit ankommt (unabhängig von Fensterhöhe).
   */
  function syncBombVelocity(bomb) {
    if (!bomb || !bomb.alive) return;
    const noseOffset = 40 * bomb.scale;
    const remainingDist = Math.max(1, state.groundY - noseOffset - bomb.y);
    const elapsed = Math.max(0, state.time - bomb.spawnTime);
    const remainingTime = Math.max(0.15, bomb.fallDuration - elapsed);
    bomb.vy = remainingDist / remainingTime;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { w, h } = getViewportSize();
    state.dpr = dpr;
    state.width = w;
    state.height = h;
    state.groundY = h * (1 - GROUND_RATIO);

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.cannon.x = w / 2;
    state.cannon.y = state.groundY - 8;
    updateLayoutVars();

    // Aktive Bombe: Geschwindigkeit an neue Höhe anpassen
    if (state.bomb && state.bomb.alive) {
      const s = clamp(h / 700, 0.75, 1.35);
      state.bomb.scale = s;
      syncBombVelocity(state.bomb);
    }
  }

  // ——— Bombe ———
  function randomFactors() {
    let a = randInt(1, 20);
    let b = randInt(1, 20);
    if (a > 10 && b > 10) {
      if (Math.random() < 0.5) a = randInt(1, 10);
      else b = randInt(1, 10);
    }
    return [a, b];
  }

  function comboKey(a, b) {
    return `${a}x${b}`;
  }

  function nextRepeatDueAt() {
    return (
      state.questionsAsked +
      randInt(REPEAT_MIN_AFTER_QUESTIONS, REPEAT_MAX_AFTER_QUESTIONS)
    );
  }

  function rememberSlowCombo(a, b) {
    const key = comboKey(a, b);
    const existing = state.repeatCombos.get(key);
    if (existing) {
      existing.dueAt = nextRepeatDueAt();
      existing.askedAt = state.questionsAsked;
      return;
    }

    if (state.repeatCombos.size >= MAX_REPEAT_COMBOS) {
      let oldestKey = null;
      let oldestAskedAt = Infinity;
      for (const [k, entry] of state.repeatCombos.entries()) {
        if (entry.askedAt < oldestAskedAt) {
          oldestAskedAt = entry.askedAt;
          oldestKey = k;
        }
      }
      if (oldestKey) state.repeatCombos.delete(oldestKey);
    }

    state.repeatCombos.set(key, {
      a,
      b,
      dueAt: nextRepeatDueAt(),
      askedAt: state.questionsAsked,
    });
  }

  function getDueRepeatCombo() {
    if (state.questionsAsked - state.lastRepeatQuestionAt <= REPEAT_NORMAL_GAP) {
      return null;
    }

    let due = null;
    for (const [key, entry] of state.repeatCombos.entries()) {
      if (entry.dueAt > state.questionsAsked) continue;
      if (!due || entry.dueAt < due.entry.dueAt) due = { key, entry };
    }
    return due;
  }

  function createBomb(forcedFactors = null) {
    const scale = clamp(state.height / 700, 0.75, 1.35);
    const halfW = 22 * scale;
    // Auf schmalen Screens etwas mehr Rand, damit die Aufgabe lesbar bleibt
    const margin = Math.max(state.width < 400 ? 36 : 48, halfW + 16);
    const [a, b] = forcedFactors || randomFactors();
    const answers = generateAnswers(a, b);

    const spawnY = -60 * scale;
    const noseOffset = 40 * scale;
    // Strecke hängt von der Fensterhöhe ab → vy = Strecke / Zeit
    // → Fall dauert immer fallDuration Sekunden, egal wie hoch das Fenster ist
    const travel = Math.max(80, state.groundY - noseOffset - spawnY);
    const duration = fallDurationForScore(state.score);
    const vy = travel / duration;

    return {
      x: rand(margin, Math.max(margin + 1, state.width - margin)),
      y: spawnY,
      vy,
      scale,
      a,
      b,
      correct: a * b,
      answers,
      label: `${a} × ${b}`,
      isRepeat: Boolean(forcedFactors),
      alive: true,
      particleAcc: 0,
      spawnTime: state.time,
      fallDuration: duration,
    };
  }

  function spawnBomb() {
    state.questionsAsked += 1;
    const repeat = getDueRepeatCombo();
    if (repeat) {
      state.repeatCombos.delete(repeat.key);
      state.lastRepeatQuestionAt = state.questionsAsked;
    }
    state.bomb = createBomb(repeat ? [repeat.entry.a, repeat.entry.b] : null);
    state.respawnAt = 0;
    state.inputLocked = false;
    showAnswers(state.bomb.answers);
    SFX.spawn();
  }

  function showAnswers(answers) {
    answerBtns.forEach((btn, i) => {
      const opt = answers[i];
      const valueEl = btn.querySelector(".answer-value");
      if (valueEl) valueEl.textContent = String(opt.value);
      else btn.textContent = String(opt.value);
      btn.dataset.correct = opt.correct ? "1" : "0";
      btn.setAttribute("aria-label", `Antwort ${i + 1}: ${opt.value}`);
      btn.disabled = false;
      btn.classList.remove("wrong", "correct");
    });
    answersEl.hidden = false;
  }

  function hideAnswers() {
    answersEl.hidden = true;
    answerBtns.forEach((btn) => {
      btn.disabled = true;
      btn.classList.remove("wrong", "correct");
    });
  }

  function drawBomb(bomb) {
    const s = bomb.scale;
    const halfW = 22 * s;
    const top = -28 * s;
    const sideBottom = 18 * s;
    const finH = 22 * s;
    const finW = 34 * s;
    const stemH = 10 * s;

    ctx.save();
    ctx.translate(bomb.x, bomb.y);

    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.moveTo(-halfW, top);
    ctx.lineTo(halfW, top);
    ctx.lineTo(halfW, sideBottom);
    ctx.arc(0, sideBottom, halfW, 0, Math.PI, false);
    ctx.closePath();
    ctx.fill();

    const finTop = top - finH;
    const finJoin = top + 2 * s;
    ctx.beginPath();
    ctx.moveTo(-2 * s, finJoin);
    ctx.lineTo(-finW * 0.5, finTop);
    ctx.lineTo(-finW * 0.12, finTop);
    ctx.lineTo(0, finJoin);
    ctx.lineTo(finW * 0.12, finTop);
    ctx.lineTo(finW * 0.5, finTop);
    ctx.lineTo(2 * s, finJoin);
    ctx.closePath();
    ctx.fill();

    ctx.fillRect(-1.5 * s, finTop - stemH * 0.3, 3 * s, stemH + 4 * s);

    ctx.fillStyle = "#ffffff";
    // Mindestens ~13px für Lesbarkeit auf kleinen Screens
    const fontPx = Math.max(13, Math.round(13 * s));
    ctx.font = `bold ${fontPx}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 2;
    ctx.fillText(bomb.label, 0, top + 26 * s);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ——— Kanone ———
  function drawCannon() {
    const c = state.cannon;
    const s = clamp(state.height / 700, 0.8, 1.3);

    ctx.save();
    ctx.translate(c.x, c.y);

    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.moveTo(-32 * s, 8 * s);
    ctx.lineTo(-26 * s, -4 * s);
    ctx.lineTo(26 * s, -4 * s);
    ctx.lineTo(32 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-34 * s, 6 * s, 68 * s, 8 * s);

    ctx.beginPath();
    ctx.ellipse(0, -8 * s, 18 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(0, -12 * s);
    ctx.rotate(c.angle + Math.PI / 2);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(-5 * s, -48 * s, 10 * s, 48 * s);
    ctx.beginPath();
    ctx.moveTo(-8 * s, -48 * s);
    ctx.lineTo(8 * s, -48 * s);
    ctx.lineTo(6 * s, -56 * s);
    ctx.lineTo(-6 * s, -56 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1e3a5f";
    ctx.fillRect(-3 * s, -52 * s, 6 * s, 8 * s);
    ctx.restore();

    ctx.restore();
  }

  function aimCannonAt(x, y) {
    const c = state.cannon;
    const barrelBaseY = c.y - 12 * clamp(state.height / 700, 0.8, 1.3);
    state.cannon.targetAngle = Math.atan2(y - barrelBaseY, x - c.x);
  }

  function updateCannon(dt) {
    const c = state.cannon;
    let diff = c.targetAngle - c.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    c.angle += diff * Math.min(1, 10 * dt);
  }

  // ——— Partikel ———
  function emitTrailParticles(bomb, dt) {
    bomb.particleAcc += PARTICLE_RATE * dt;
    const s = bomb.scale;
    while (bomb.particleAcc >= 1) {
      bomb.particleAcc -= 1;
      const finY = bomb.y - 28 * s;
      state.particles.push({
        x: bomb.x + rand(-6 * s, 6 * s),
        y: finY + rand(-4, 4),
        vx: rand(-18, 18),
        vy: rand(-40, -10),
        life: rand(0.35, 0.75),
        maxLife: 0.75,
        size: rand(3, 7) * s,
        kind: "trail",
        hue: rand(20, 45),
      });
    }
  }

  function spawnExplosion(x, y, big = false) {
    const n = big ? 55 : 32;
    const speed = big ? 280 : 180;
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      const sp = rand(40, speed);
      state.particles.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(0.35, EXPLOSION_DURATION),
        maxLife: EXPLOSION_DURATION,
        size: rand(4, big ? 14 : 10),
        kind: "burst",
        hue: rand(15, 50),
      });
    }
    state.explosions.push({
      x,
      y,
      t: 0,
      duration: EXPLOSION_DURATION,
      big,
    });
    SFX.boom(big);
  }

  function updateParticles(dt) {
    const g = 120;
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === "burst") {
        p.vy += g * dt;
        p.vx *= 0.98;
      } else {
        p.vx *= 0.96;
        p.vy *= 0.98;
      }
      p.size *= 0.995;
    }
  }

  function drawParticles() {
    for (const p of state.particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === "trail") {
        ctx.fillStyle = `hsla(${p.hue}, 90%, ${50 + alpha * 20}%, ${alpha * 0.85})`;
      } else {
        ctx.fillStyle = `hsla(${p.hue}, 100%, ${45 + alpha * 30}%, ${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * alpha), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function updateExplosions(dt) {
    for (let i = state.explosions.length - 1; i >= 0; i--) {
      const e = state.explosions[i];
      e.t += dt;
      if (e.t >= e.duration) state.explosions.splice(i, 1);
    }
  }

  function drawExplosions() {
    for (const e of state.explosions) {
      const u = e.t / e.duration;
      const r = (e.big ? 40 : 24) + u * (e.big ? 90 : 55);
      const alpha = 1 - u;
      ctx.strokeStyle = `rgba(255, 200, 80, ${alpha * 0.9})`;
      ctx.lineWidth = (e.big ? 8 : 5) * (1 - u);
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 220, ${alpha * 0.35})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ——— Laser ———
  function fireLaserAt(tx, ty) {
    aimCannonAt(tx, ty);
    const c = state.cannon;
    const s = clamp(state.height / 700, 0.8, 1.3);
    const barrelLen = 56 * s;
    const baseY = c.y - 12 * s;
    const ang = Math.atan2(ty - baseY, tx - c.x);
    state.cannon.angle = ang;
    state.cannon.targetAngle = ang;
    const sx = c.x + Math.cos(ang) * barrelLen;
    const sy = baseY + Math.sin(ang) * barrelLen;

    state.lasers.push({
      x0: sx,
      y0: sy,
      x1: tx,
      y1: ty,
      t: 0,
      duration: LASER_DURATION,
    });
    SFX.laser();
  }

  function updateLasers(dt) {
    for (let i = state.lasers.length - 1; i >= 0; i--) {
      const L = state.lasers[i];
      L.t += dt;
      if (L.t >= L.duration) state.lasers.splice(i, 1);
    }
  }

  function drawLasers() {
    for (const L of state.lasers) {
      const u = L.t / L.duration;
      const grow = clamp(u / 0.15, 0, 1);
      const fade = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
      const x1 = L.x0 + (L.x1 - L.x0) * grow;
      const y1 = L.y0 + (L.y1 - L.y0) * grow;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.35 * fade})`;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(L.x0, L.y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.strokeStyle = `rgba(220, 250, 255, ${0.95 * fade})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(L.x0, L.y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      if (grow >= 1) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * fade})`;
        ctx.beginPath();
        ctx.arc(L.x1, L.y1, 12 * fade, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // ——— Hintergrund ———
  function drawSkyAndGround() {
    const w = state.width;
    const h = state.height;
    const gy = state.groundY;

    const grad = ctx.createLinearGradient(0, 0, 0, gy);
    grad.addColorStop(0, "#5eb0ef");
    grad.addColorStop(0.55, "#87ceeb");
    grad.addColorStop(1, "#a8d8f0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, gy);

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    drawCloud(w * 0.15, h * 0.12, 40);
    drawCloud(w * 0.55, h * 0.08, 55);
    drawCloud(w * 0.82, h * 0.18, 36);

    const ggrad = ctx.createLinearGradient(0, gy, 0, h);
    ggrad.addColorStop(0, "#4caf50");
    ggrad.addColorStop(0.45, "#3d8b40");
    ggrad.addColorStop(1, "#2e6b30");
    ctx.fillStyle = ggrad;
    ctx.fillRect(0, gy, w, h - gy);
  }

  function drawCloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x + r * 0.55, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 1.1, y, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + r * 0.5, y + r * 0.2, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ——— Spielaktionen ———
  function destroyBombWithLaser() {
    const bomb = state.bomb;
    if (!bomb || !bomb.alive || state.gameOver) return false;

    state.inputLocked = true;
    hideAnswers();
    fireLaserAt(bomb.x, bomb.y);
    bomb.alive = false;

    const bx = bomb.x;
    const by = bomb.y;
    window.setTimeout(() => {
      spawnExplosion(bx, by, false);
    }, LASER_DURATION * 0.2 * 1000);

    state.bomb = null;
    state.score += 1;
    updateScoreUI();
    state.respawnAt = state.time + RESPAWN_DELAY + LASER_DURATION * 0.3;
    return true;
  }

  function bombHitGround() {
    const bomb = state.bomb;
    if (!bomb || !bomb.alive || state.gameOver) return;

    bomb.alive = false;
    state.inputLocked = true;
    hideAnswers();
    spawnExplosion(bomb.x, state.groundY - 10, true);
    state.bomb = null;
    state.gameOverAt = state.time + GAME_OVER_DELAY;
  }

  function showGameOver() {
    state.gameOver = true;
    state.running = false;
    state.phase = "gameover";
    state.inputLocked = true;
    hideAnswers();

    finalScoreEl.textContent = String(state.score);
    let isRecord = false;
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore(state.highScore);
      isRecord = true;
    }
    updateHighScoreUI();
    if (newRecordEl) {
      newRecordEl.hidden = !isRecord;
      if (isRecord) SFX.record();
    }
    gameOverEl.hidden = false;
  }

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
  }

  function onAnswerClick(btn) {
    if (
      state.phase !== "playing" ||
      state.gameOver ||
      state.inputLocked ||
      !state.bomb ||
      !state.bomb.alive
    ) {
      return;
    }

    const isCorrect = btn.dataset.correct === "1";
    if (isCorrect) {
      const bomb = state.bomb;
      const answerSeconds = Math.max(0, state.time - bomb.spawnTime);
      if (!bomb.isRepeat && answerSeconds >= SLOW_ANSWER_SECONDS) {
        rememberSlowCombo(bomb.a, bomb.b);
      }

      btn.classList.add("correct");
      destroyBombWithLaser();
    } else {
      // Falsch: markieren, richtige Lösung aufblinken, keine weitere Eingabe
      state.inputLocked = true;
      SFX.fail();
      btn.classList.remove("wrong");
      void btn.offsetWidth;
      btn.classList.add("wrong");

      answerBtns.forEach((b) => {
        b.disabled = true;
        if (b.dataset.correct === "1") {
          b.classList.remove("correct");
          void b.offsetWidth;
          b.classList.add("correct");
        }
      });
    }
  }

  function clearWorld() {
    state.particles = [];
    state.lasers = [];
    state.explosions = [];
    state.bomb = null;
    state.respawnAt = 0;
    state.gameOverAt = 0;
    state.questionsAsked = 0;
    state.repeatCombos.clear();
    state.lastRepeatQuestionAt = -Infinity;
    state.cannon.angle = -Math.PI / 2;
    state.cannon.targetAngle = -Math.PI / 2;
  }

  function startGame() {
    SFX.ensure();
    SFX.ui();
    state.phase = "playing";
    state.gameOver = false;
    state.inputLocked = false;
    state.score = 0;
    state.time = 0;
    clearWorld();
    updateScoreUI();
    updateHighScoreUI();
    gameOverEl.hidden = true;
    titleScreenEl.hidden = true;
    if (hudEl) hudEl.hidden = false;
    hideAnswers();
    spawnBomb();
    state.running = true;
    state.lastTs = 0;
  }

  function showTitle() {
    state.phase = "title";
    state.running = false;
    state.gameOver = false;
    state.inputLocked = true;
    clearWorld();
    hideAnswers();
    gameOverEl.hidden = true;
    titleScreenEl.hidden = false;
    if (hudEl) hudEl.hidden = true;
    updateHighScoreUI();
  }

  // ——— Update / Draw ———
  function update(dt) {
    state.time += dt;

    if (state.gameOverAt > 0 && state.time >= state.gameOverAt) {
      state.gameOverAt = 0;
      showGameOver();
      return;
    }

    if (!state.bomb && state.respawnAt > 0 && state.time >= state.respawnAt) {
      spawnBomb();
    }

    const bomb = state.bomb;
    if (bomb && bomb.alive) {
      bomb.y += bomb.vy * dt;
      emitTrailParticles(bomb, dt);
      aimCannonAt(bomb.x, bomb.y);

      const noseY = bomb.y + 40 * bomb.scale;
      if (noseY >= state.groundY) {
        bombHitGround();
      }
    }

    updateCannon(dt);
    updateParticles(dt);
    updateLasers(dt);
    updateExplosions(dt);
  }

  function draw() {
    ctx.clearRect(0, 0, state.width, state.height);
    drawSkyAndGround();
    drawParticles();
    if (state.bomb && state.bomb.alive) {
      drawBomb(state.bomb);
    }
    drawLasers();
    drawExplosions();
    drawCannon();
  }

  function frame(ts) {
    const tsSec = ts * 0.001;
    if (!state.lastTs) state.lastTs = tsSec;
    let dt = tsSec - state.lastTs;
    state.lastTs = tsSec;
    dt = Math.min(dt, 0.05);

    if (state.running) {
      update(dt);
    } else {
      updateParticles(dt);
      updateLasers(dt);
      updateExplosions(dt);
      // Idle: Kanone schaut leicht nach oben
      if (state.phase === "title") {
        state.cannon.targetAngle = -Math.PI / 2 + Math.sin(tsSec * 0.6) * 0.15;
        updateCannon(dt);
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  function onKeyDown(e) {
    if (e.code === "Digit1" || e.code === "Numpad1") {
      e.preventDefault();
      if (state.phase === "playing") onAnswerClick(answerBtns[0]);
    } else if (e.code === "Digit2" || e.code === "Numpad2") {
      e.preventDefault();
      if (state.phase === "playing") onAnswerClick(answerBtns[1]);
    } else if (e.code === "Digit3" || e.code === "Numpad3") {
      e.preventDefault();
      if (state.phase === "playing") onAnswerClick(answerBtns[2]);
    } else if (e.code === "Enter" || e.code === "Space") {
      if (state.phase === "title" && !titleScreenEl.hidden) {
        e.preventDefault();
        startGame();
      } else if (state.phase === "gameover" && !gameOverEl.hidden) {
        e.preventDefault();
        startGame();
      }
    }
  }

  // ——— Start ———
  function init() {
    state.highScore = loadHighScore();
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", () => {
      // iOS liefert nach Drehung oft erst verzögert korrekte Maße
      window.setTimeout(resize, 100);
      window.setTimeout(resize, 350);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", resize);
      window.visualViewport.addEventListener("scroll", resize);
    }
    window.addEventListener("keydown", onKeyDown);

    // Pull-to-Refresh / Overscroll auf Touch-Geräten dämpfen
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.target.closest(".overlay-card")) return;
        e.preventDefault();
      },
      { passive: false }
    );

    startBtn.addEventListener("click", () => startGame());
    restartBtn.addEventListener("click", () => startGame());

    answerBtns.forEach((btn) => {
      // pointerdown: sofortiges Feedback auf Touch (kein 300ms-Wartegefühl)
      btn.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        onAnswerClick(btn);
      });
    });

    assertAnswerGenerator();
    showTitle();
    requestAnimationFrame(frame);
  }

  init();

  window.EinmaleinsGame = {
    state,
    startGame,
    showTitle,
    generateAnswers,
    SFX,
  };
})();
