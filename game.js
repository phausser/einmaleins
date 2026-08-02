/**
 * Einmaleins-Bombenabwehr
 * Phase 0: Gerüst (Loop, Resize, Start/Reset, UI-Hooks)
 * Phase 1: Szene, Bombe, Kanone, Partikel, Laser, Explosion
 *
 * Demo-Steuerung (nur Phase 1):
 *   Leertaste / Klick Canvas → Laser zerstört aktuelle Bombe
 *   G → simuliert Boden-Treffer (große Explosion, dann neue Bombe)
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
  const GROUND_RATIO = 0.12; // Anteil der Höhe als Grasboden
  const BOMB_FALL_SPEED = 90; // px/s (Basis)
  const PARTICLE_RATE = 48; // Partikel pro Sekunde an der Bombe
  const LASER_DURATION = 0.45; // s
  const EXPLOSION_DURATION = 0.7; // s
  const DEMO_RESPAWN_DELAY = 0.55; // s nach Zerstörung

  // ——— Zustand ———
  const state = {
    running: false,
    gameOver: false,
    score: 0,
    width: 0,
    height: 0,
    dpr: 1,
    groundY: 0,
    lastTs: 0,
    // Bombe (eine aktiv)
    bomb: null,
    // Effekte
    particles: [],
    lasers: [],
    explosions: [],
    // Kanone
    cannon: {
      x: 0,
      y: 0,
      angle: -Math.PI / 2, // nach oben
      targetAngle: -Math.PI / 2,
    },
    // Demo / Phase-1: nächste Spawn-Zeit
    respawnAt: 0,
    // Zeit (Sekunden seit Start)
    time: 0,
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
  function createBomb() {
    const margin = 48;
    const a = randInt(1, 20);
    const b = randInt(1, 20);
    const scale = clamp(state.height / 700, 0.75, 1.35);
    return {
      x: rand(margin, state.width - margin),
      y: -60 * scale,
      vy: BOMB_FALL_SPEED * scale,
      scale,
      a,
      b,
      label: `${a} × ${b}`,
      alive: true,
      // Partikel-Akkumulator
      particleAcc: 0,
    };
  }

  function spawnBomb() {
    state.bomb = createBomb();
    state.respawnAt = 0;
  }

  /**
   * Klassische Fliegerbombe (Silhouette wie Referenz):
   * Heckflossen + Stab oben, tropfenförmiger Körper, spitze Nase unten.
   * y = Mitte des Körpers; zeichnet nach unten fallend (Nase = vorne).
   */
  function drawBomb(bomb) {
    const s = bomb.scale;
    const bodyH = 72 * s;
    const bodyW = 28 * s;
    const finH = 22 * s;
    const finW = 28 * s;
    const stemH = 10 * s;

    ctx.save();
    ctx.translate(bomb.x, bomb.y);

    // Körper: abgerundet oben, spitz unten
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    // oben (Schulter am Heck)
    const top = -bodyH * 0.35;
    const bottom = bodyH * 0.55;
    const mid = bodyH * 0.15;
    // tropfenartig
    ctx.moveTo(0, bottom); // Spitze
    ctx.bezierCurveTo(bodyW * 0.55, mid, bodyW * 0.5, top + 8 * s, bodyW * 0.42, top);
    ctx.lineTo(-bodyW * 0.42, top);
    ctx.bezierCurveTo(-bodyW * 0.5, top + 8 * s, -bodyW * 0.55, mid, 0, bottom);
    ctx.closePath();
    ctx.fill();

    // Heckflossen (zwei trapezförmige Flügel + Mittelstab)
    const finTop = top - finH;
    const finJoin = top + 2 * s;
    ctx.beginPath();
    // linker Flügel
    ctx.moveTo(-2 * s, finJoin);
    ctx.lineTo(-finW * 0.5, finTop);
    ctx.lineTo(-finW * 0.12, finTop);
    ctx.lineTo(0, finJoin);
    // rechter Flügel
    ctx.lineTo(finW * 0.12, finTop);
    ctx.lineTo(finW * 0.5, finTop);
    ctx.lineTo(2 * s, finJoin);
    ctx.closePath();
    ctx.fill();

    // Mittelstab
    ctx.fillRect(-1.5 * s, finTop - stemH * 0.3, 3 * s, stemH + 4 * s);

    // Aufgabe (hell auf dunklem Körper)
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.round(13 * s)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // leichter Schatten für Lesbarkeit
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 2;
    ctx.fillText(bomb.label, 0, top + bodyH * 0.28);
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  // ——— Kanone (Silhouette) ———
  function drawCannon() {
    const c = state.cannon;
    const s = clamp(state.height / 700, 0.8, 1.3);

    ctx.save();
    ctx.translate(c.x, c.y);

    // Lafette / Sockel
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.moveTo(-36 * s, 10 * s);
    ctx.lineTo(-28 * s, -6 * s);
    ctx.lineTo(28 * s, -6 * s);
    ctx.lineTo(36 * s, 10 * s);
    ctx.closePath();
    ctx.fill();

    // Räder
    ctx.beginPath();
    ctx.arc(-22 * s, 12 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(22 * s, 12 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e293b";
    ctx.beginPath();
    ctx.arc(-22 * s, 12 * s, 4 * s, 0, Math.PI * 2);
    ctx.arc(22 * s, 12 * s, 4 * s, 0, Math.PI * 2);
    ctx.fill();

    // Turm
    ctx.fillStyle = "#0a0a0a";
    ctx.beginPath();
    ctx.ellipse(0, -8 * s, 18 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Lauf (rotiert)
    ctx.save();
    ctx.translate(0, -12 * s);
    ctx.rotate(c.angle + Math.PI / 2); // angle 0 = rechts; wir speichern math. Winkel von +x
    // angle: -PI/2 = nach oben
    ctx.fillStyle = "#0a0a0a";
    // Lauf-Körper
    ctx.fillRect(-5 * s, -48 * s, 10 * s, 48 * s);
    // Mündung
    ctx.beginPath();
    ctx.moveTo(-8 * s, -48 * s);
    ctx.lineTo(8 * s, -48 * s);
    ctx.lineTo(6 * s, -56 * s);
    ctx.lineTo(-6 * s, -56 * s);
    ctx.closePath();
    ctx.fill();
    // kleiner „Laser-Emitter“
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
    // sanft zum Zielwinkel
    let diff = c.targetAngle - c.angle;
    // kürzester Winkelweg
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
      // Spur am Heck (oben an der Bombe)
      const finY = bomb.y - 28 * s;
      state.particles.push({
        x: bomb.x + rand(-6 * s, 6 * s),
        y: finY + rand(-4, 4),
        vx: rand(-18, 18),
        vy: rand(-40, -10), // nach oben (Antrieb)
        life: rand(0.35, 0.75),
        maxLife: 0.75,
        size: rand(3, 7) * s,
        kind: "trail",
        hue: rand(20, 45), // orange-gelb
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
    // Blitz-Ring
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
        // trail: langsam verlöschen, leicht steigen
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
    // Start am Laufende (aktueller target angle für Präzision)
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
      // Strahl wächst schnell, dann ausblenden
      const grow = clamp(u / 0.15, 0, 1);
      const fade = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
      const x1 = L.x0 + (L.x1 - L.x0) * grow;
      const y1 = L.y0 + (L.y1 - L.y0) * grow;

      ctx.save();
      ctx.lineCap = "round";
      // Glow
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.35 * fade})`;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(L.x0, L.y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // Kern
      ctx.strokeStyle = `rgba(220, 250, 255, ${0.95 * fade})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(L.x0, L.y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      // Hit-Flash am Ende
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

    // Himmel Verlauf
    const grad = ctx.createLinearGradient(0, 0, 0, gy);
    grad.addColorStop(0, "#5eb0ef");
    grad.addColorStop(0.55, "#87ceeb");
    grad.addColorStop(1, "#a8d8f0");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, gy);

    // leichte Wolken (dekorativ, statisch-ish)
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    drawCloud(w * 0.15, h * 0.12, 40);
    drawCloud(w * 0.55, h * 0.08, 55);
    drawCloud(w * 0.82, h * 0.18, 36);

    // Boden
    const ggrad = ctx.createLinearGradient(0, gy, 0, h);
    ggrad.addColorStop(0, "#4caf50");
    ggrad.addColorStop(0.4, "#3d8b40");
    ggrad.addColorStop(1, "#2e6b30");
    ctx.fillStyle = ggrad;
    ctx.fillRect(0, gy, w, h - gy);

    // Gras-Kante
    ctx.fillStyle = "#66bb6a";
    ctx.fillRect(0, gy, w, 6);
    // kleine Grashalme
    ctx.strokeStyle = "#2e7d32";
    ctx.lineWidth = 2;
    for (let x = 0; x < w; x += 14) {
      const hx = x + (Math.sin(x * 0.2) * 3);
      ctx.beginPath();
      ctx.moveTo(hx, gy + 4);
      ctx.lineTo(hx - 2, gy - 6 - (x % 5));
      ctx.stroke();
    }
  }

  function drawCloud(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
    ctx.arc(x + r * 0.55, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
    ctx.arc(x + r * 1.1, y, r * 0.55, 0, Math.PI * 2);
    ctx.arc(x + r * 0.5, y + r * 0.2, r * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ——— Aktionen (Phase 1 Demo + Hooks für Phase 2) ———
  function destroyBombWithLaser() {
    const bomb = state.bomb;
    if (!bomb || !bomb.alive || state.gameOver) return false;
    fireLaserAt(bomb.x, bomb.y);
    bomb.alive = false;
    // Explosion etwas verzögert zum Laser-Hit
    const bx = bomb.x;
    const by = bomb.y;
    window.setTimeout(() => {
      spawnExplosion(bx, by, false);
    }, LASER_DURATION * 0.2 * 1000);
    state.bomb = null;
    state.score += 1;
    updateScoreUI();
    state.respawnAt = state.time + DEMO_RESPAWN_DELAY + LASER_DURATION * 0.3;
    return true;
  }

  function bombHitGround() {
    const bomb = state.bomb;
    if (!bomb || !bomb.alive) return;
    bomb.alive = false;
    spawnExplosion(bomb.x, state.groundY - 10, true);
    state.bomb = null;
    // Phase 1: nur Demo — kurze Pause, dann neu (Phase 2: Game Over)
    state.respawnAt = state.time + 1.2;
    // Vorschau Game-Over-Hook (noch nicht endgültig)
    // showGameOver();
  }

  function showGameOver() {
    state.gameOver = true;
    state.running = false;
    finalScoreEl.textContent = String(state.score);
    gameOverEl.hidden = false;
  }

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
  }

  function resetGame() {
    state.gameOver = false;
    state.score = 0;
    state.particles = [];
    state.lasers = [];
    state.explosions = [];
    state.bomb = null;
    state.time = 0;
    state.respawnAt = 0;
    state.cannon.angle = -Math.PI / 2;
    state.cannon.targetAngle = -Math.PI / 2;
    updateScoreUI();
    gameOverEl.hidden = true;
    answersEl.hidden = true;
    spawnBomb();
    state.running = true;
    state.lastTs = 0;
  }

  // ——— Update / Draw ———
  function update(dt) {
    state.time += dt;

    // Respawn
    if (!state.bomb && state.respawnAt > 0 && state.time >= state.respawnAt) {
      spawnBomb();
    }

    const bomb = state.bomb;
    if (bomb && bomb.alive) {
      bomb.y += bomb.vy * dt;
      emitTrailParticles(bomb, dt);
      // Kanone schaut zur Bombe
      aimCannonAt(bomb.x, bomb.y);

      // Boden-Kollision (Nase ungefähr)
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
    if (!state.running && !state.gameOver) {
      // trotzdem zeichnen nach Stop? nur wenn running
    }
    const tsSec = ts * 0.001;
    if (!state.lastTs) state.lastTs = tsSec;
    let dt = tsSec - state.lastTs;
    state.lastTs = tsSec;
    // Clamp dt (Tab-Wechsel)
    dt = Math.min(dt, 0.05);

    if (state.running) {
      update(dt);
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ——— Input (Phase-1 Demo) ———
  function onKeyDown(e) {
    if (e.code === "Space") {
      e.preventDefault();
      destroyBombWithLaser();
    } else if (e.code === "KeyG") {
      e.preventDefault();
      bombHitGround();
    } else if (e.code === "KeyR") {
      resetGame();
    }
  }

  function onCanvasPointer(e) {
    // Klick = Laser-Demo (Phase 2: Buttons übernehmen)
    if (state.gameOver) return;
    destroyBombWithLaser();
  }

  // ——— Start ———
  function init() {
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("keydown", onKeyDown);
    canvas.addEventListener("pointerdown", onCanvasPointer);
    restartBtn.addEventListener("click", () => {
      resetGame();
    });

    // Antwort-Buttons: Stub für Phase 2
    answerBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        /* Phase 2 */
      });
    });

    resetGame();
    requestAnimationFrame(frame);

    if (phaseHintEl) {
      phaseHintEl.textContent =
        "Phase 0–1 · Demo: Bombe fällt · Klick/Leertaste = Laser · G = Boden-Explosion · R = Reset";
    }
  }

  init();

  // Debug / spätere Anbindung
  window.EinmaleinsGame = {
    state,
    resetGame,
    destroyBombWithLaser,
    bombHitGround,
    showGameOver,
    spawnBomb,
  };
})();
