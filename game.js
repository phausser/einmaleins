/**
 * Einmaleins-Bombenabwehr
 * Phase 0–1: Gerüst, Szene, Partikel, Laser, Explosion
 * Phase 2: Aufgaben, Ablenkantworten, Buttons, Game Over
 */

(() => {
  "use strict";

  // ——— DOM ———
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const finalScoreEl = document.getElementById("final-score");
  const answersEl = document.getElementById("answers");
  const answerBtns = [...document.querySelectorAll(".answer-btn")];
  const gameOverEl = document.getElementById("game-over");
  const restartBtn = document.getElementById("restart-btn");
  const phaseHintEl = document.getElementById("phase-hint");

  // ——— Konstanten ———
  const GROUND_RATIO = 0.12;
  const BOMB_FALL_SPEED = 65; // px/s
  const PARTICLE_RATE = 48;
  const LASER_DURATION = 0.45;
  const EXPLOSION_DURATION = 0.7;
  const RESPAWN_DELAY = 0.55;
  const GAME_OVER_DELAY = 0.75; // Explosion kurz zeigen

  // ——— Zustand ———
  const state = {
    running: false,
    gameOver: false,
    inputLocked: false,
    score: 0,
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

  // ——— Ablenkantworten ———
  /**
   * Drei unique Ergebnisse:
   * 1) korrekt a*b
   * 2) ein Faktor ±1 → neues Produkt
   * 3) korrekt ±1…3
   */
  function generateAnswers(a, b) {
    const correct = a * b;

    let factorWrong = correct;
    for (let tries = 0; tries < 30 && factorWrong === correct; tries++) {
      const changeA = Math.random() < 0.5;
      const delta = Math.random() < 0.5 ? -1 : 1;
      let a2 = a;
      let b2 = b;
      if (changeA) {
        a2 = a + delta;
        if (a2 < 1) a2 = a + 1;
      } else {
        b2 = b + delta;
        if (b2 < 1) b2 = b + 1;
      }
      factorWrong = a2 * b2;
    }
    if (factorWrong === correct) {
      factorWrong = correct + 1;
    }

    const offsets = shuffle([-3, -2, -1, 1, 2, 3]);
    let near = null;
    for (const d of offsets) {
      const n = correct + d;
      if (n > 0 && n !== correct && n !== factorWrong) {
        near = n;
        break;
      }
    }
    if (near === null) {
      // Fallback: nächstes freies positives Ergebnis
      for (let d = 1; d < 50; d++) {
        for (const sign of [1, -1]) {
          const n = correct + d * sign;
          if (n > 0 && n !== correct && n !== factorWrong) {
            near = n;
            break;
          }
        }
        if (near !== null) break;
      }
    }

    return shuffle([
      { value: correct, correct: true },
      { value: factorWrong, correct: false },
      { value: near, correct: false },
    ]);
  }

  // ——— Resize ———
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
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
  }

  // ——— Bombe ———
  /**
   * Faktoren 1–20, aber höchstens einer > 10
   * (z. B. 12×8 ok, 12×15 nicht).
   */
  function randomFactors() {
    let a = randInt(1, 20);
    let b = randInt(1, 20);
    if (a > 10 && b > 10) {
      // einen der beiden auf 1…10 setzen
      if (Math.random() < 0.5) a = randInt(1, 10);
      else b = randInt(1, 10);
    }
    return [a, b];
  }

  function createBomb() {
    const margin = 48;
    const [a, b] = randomFactors();
    const scale = clamp(state.height / 700, 0.75, 1.35);
    const answers = generateAnswers(a, b);
    return {
      x: rand(margin, state.width - margin),
      y: -60 * scale,
      vy: BOMB_FALL_SPEED * scale,
      scale,
      a,
      b,
      correct: a * b,
      answers,
      label: `${a} × ${b}`,
      alive: true,
      particleAcc: 0,
    };
  }

  function spawnBomb() {
    state.bomb = createBomb();
    state.respawnAt = 0;
    state.inputLocked = false;
    showAnswers(state.bomb.answers);
  }

  function showAnswers(answers) {
    answerBtns.forEach((btn, i) => {
      const opt = answers[i];
      btn.textContent = String(opt.value);
      btn.dataset.correct = opt.correct ? "1" : "0";
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

  /**
   * Fliegerbombe: Heckflossen oben, breiter Körper, vorne (unten) rund.
   */
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
    ctx.font = `bold ${Math.round(12 * s)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
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
    state.inputLocked = true;
    hideAnswers();
    finalScoreEl.textContent = String(state.score);
    gameOverEl.hidden = false;
  }

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
  }

  function onAnswerClick(btn) {
    if (state.gameOver || state.inputLocked || !state.bomb || !state.bomb.alive) {
      return;
    }

    const isCorrect = btn.dataset.correct === "1";
    if (isCorrect) {
      btn.classList.add("correct");
      destroyBombWithLaser();
    } else {
      btn.classList.remove("wrong");
      // reflow für erneute Shake-Animation
      void btn.offsetWidth;
      btn.classList.add("wrong");
      window.setTimeout(() => btn.classList.remove("wrong"), 400);
      // Buttons bleiben nutzbar (Spec)
    }
  }

  function resetGame() {
    state.gameOver = false;
    state.inputLocked = false;
    state.score = 0;
    state.particles = [];
    state.lasers = [];
    state.explosions = [];
    state.bomb = null;
    state.time = 0;
    state.respawnAt = 0;
    state.gameOverAt = 0;
    state.cannon.angle = -Math.PI / 2;
    state.cannon.targetAngle = -Math.PI / 2;
    updateScoreUI();
    gameOverEl.hidden = true;
    hideAnswers();
    spawnBomb();
    state.running = true;
    state.lastTs = 0;
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
      // Game Over: Partikel/Explosionen noch auslaufen lassen
      updateParticles(dt);
      updateLasers(dt);
      updateExplosions(dt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ——— Start ———
  function init() {
    resize();
    window.addEventListener("resize", resize);

    restartBtn.addEventListener("click", () => {
      resetGame();
    });

    answerBtns.forEach((btn) => {
      btn.addEventListener("click", () => onAnswerClick(btn));
    });

    if (phaseHintEl) {
      phaseHintEl.textContent = "Wähle das richtige Ergebnis — zerstöre die Bombe!";
    }

    resetGame();
    requestAnimationFrame(frame);
  }

  init();

  window.EinmaleinsGame = {
    state,
    resetGame,
    destroyBombWithLaser,
    bombHitGround,
    showGameOver,
    spawnBomb,
    generateAnswers,
  };
})();
