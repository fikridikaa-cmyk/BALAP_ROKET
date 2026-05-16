// ════════════════════════════════════════════════════════════════
//  ROCKET RACE LIVE — RACING FEEL ENGINE
//  racing.js — dimuat SETELAH script.js dan motion.js
//
//  Sistem ini TIDAK mengubah logic ntfy / skor / gameplay.
//  Ia hanya melapisi moveRocket() dengan animasi smooth,
//  dan mengupgrade background + speed lines menjadi dinamis.
//
//  Fitur:
//   [1] Smooth Lerp Movement  — rocket tidak teleport
//   [2] Overtake Burst Visual — glow + tilt saat menyalip
//   [3] Dynamic Star Speed    — background ikuti intensitas race
//   [4] Speed Lines (Canvas)  — garis cepat di depan rocket
//   [5] Lane & Rocket Scale   — ukuran lebih besar
//   [6] Motion Feedback       — tilt + flame saat bergerak
//   [7] Intensity Scaling     — semua makin cepat di akhir
// ════════════════════════════════════════════════════════════════

// ── RACING STATE ─────────────────────────────────────────────────

// Posisi visual saat ini per roket (dalam %, 0-84)
// Ini yang dikembalikan secara halus ke target posisi CSS
var visualPos  = [];   // float %
var targetPos  = [];   // target % dari pos[] skor
var isMoving   = [];   // boolean per roket
var movingTimer = [];  // setTimeout handle

// Kecepatan lerp (0-1): makin besar = makin langsung
// Nilai rendah = halus, nilai tinggi = snappy
var LERP_BASE  = 0.04;  // kecepatan dasar — lebih rendah = lebih lambat & smooth
var lerpSpeed  = [];    // bisa dioverride per roket

// Intensity: 0.0 (race belum mulai) → 1.0 (near finish)
var raceIntensity = 0;

// Overtake burst state per roket
var overtakeBurstTimer = [];

// Speed line canvas (satu canvas per lane, di-inject ke ltrack)
var slCanvases  = [];
var slContexts  = [];
var slParticles = []; // array of { x, y, vx, vy, life, alpha, color }

// RAF untuk loop smooth
var racingRaf = null;

// ── STAR SPEED MULTIPLIER (diakses oleh bgLoop yang sudah ada) ───
// bgLoop di script.js membaca `starSpeedMult` jika ada
window.starSpeedMult = 1.0;

// ══════════════════════════════════════════════════════════════════
//  INIT — dipanggil setelah DOM siap
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', function() {
  setTimeout(initRacing, 150); // tunggu renderTrack selesai
});

function initRacing() {
  var n = cfg.countries.length;

  for (var i = 0; i < n; i++) {
    visualPos[i]          = 0;
    targetPos[i]          = 0;
    isMoving[i]           = false;
    movingTimer[i]        = null;
    lerpSpeed[i]          = LERP_BASE;
    overtakeBurstTimer[i] = null;
    slParticles[i]        = [];
  }

  injectSpeedLineCanvases();
  patchMoveRocket();
  patchBgLoop();
  startRacingLoop();
}

// ══════════════════════════════════════════════════════════════════
//  [1] PATCH moveRocket() — tambahkan smooth lerp target
//  Logic skor TIDAK diubah. Hanya animasi visual.
// ══════════════════════════════════════════════════════════════════
function patchMoveRocket() {
  if (typeof window.moveRocket !== 'function') {
    setTimeout(patchMoveRocket, 100);
    return;
  }

  var origMove = window.moveRocket;

  window.moveRocket = function(idx, rawSteps) {
    // Panggil original (skor, gameplay, dll)
    origMove.apply(this, arguments);

    // Setelah skor diupdate, set target visual baru
    if (typeof pos === 'undefined' || typeof cfg === 'undefined') return;

    var newPct   = (pos[idx] / cfg.finish) * 84;
    targetPos[idx] = newPct;

    // Boost lerp speed saat drama/hype mode
    var base = LERP_BASE;
    if (window.dramaMode)  base = 0.06;
    if (window.hypeMode)   base = 0.08;
    if (window.clutchMode) base = 0.025; // slow-mo
    lerpSpeed[idx] = base;

    // Set moving state
    setMoving(idx, true);

    // Spawn speed lines (lebih banyak saat drama/hype)
    var count = dramaMode || hypeMode ? 18 : 10;
    spawnSpeedLines(idx, count);

    // Overtake burst: dipanggil dari detectOvertake patch di bawah
  };
}

// ══════════════════════════════════════════════════════════════════
//  MOVING STATE — toggle class dan tilt
// ══════════════════════════════════════════════════════════════════
function setMoving(idx, state) {
  isMoving[idx] = state;

  var rw   = document.getElementById('rw' + idx);
  var lane = document.getElementById('lane' + idx);
  if (!rw || !lane) return;

  if (state) {
    rw.classList.add('racing-moving');
    lane.classList.add('moving');
    clearTimeout(movingTimer[idx]);
    movingTimer[idx] = setTimeout(function() {
      setMoving(idx, false);
    }, 700);
  } else {
    rw.classList.remove('racing-moving');
    lane.classList.remove('moving');
  }
}

// ══════════════════════════════════════════════════════════════════
//  [2] OVERTAKE BURST — patch detectOvertake untuk tambah burst
// ══════════════════════════════════════════════════════════════════
(function patchOvertake() {
  if (typeof window.detectOvertake !== 'function') {
    setTimeout(patchOvertake, 150);
    return;
  }

  var origDetect = window.detectOvertake;

  window.detectOvertake = function(movedIdx, prevPosArg) {
    var ranksBefore = window.getRanks ? getRanks() : [];

    // Panggil original
    origDetect.apply(this, arguments);

    var ranksAfter = window.getRanks ? getRanks() : [];

    // Cek apakah terjadi overtake
    if (ranksBefore.length && ranksAfter.length) {
      var oldR = ranksBefore[movedIdx];
      var newR = ranksAfter[movedIdx];
      if (oldR > 0 && newR < oldR) {
        triggerOvertakeBurst(movedIdx);
      }
    }
  };
})();

function triggerOvertakeBurst(idx) {
  var rw = document.getElementById('rw' + idx);
  if (!rw) return;

  // Speed burst visual
  rw.classList.add('overtake-burst');
  clearTimeout(overtakeBurstTimer[idx]);
  overtakeBurstTimer[idx] = setTimeout(function() {
    var el = document.getElementById('rw' + idx);
    if (el) el.classList.remove('overtake-burst');
  }, 600);

  // Spawn lebih banyak speed lines
  spawnSpeedLines(idx, 30);
}

// ══════════════════════════════════════════════════════════════════
//  [4] SPEED LINE CANVAS — injeksi dan particle system
// ══════════════════════════════════════════════════════════════════
function injectSpeedLineCanvases() {
  cfg.countries.forEach(function(c, i) {
    var lt = document.getElementById('lt' + i);
    if (!lt || lt.querySelector('.sl-canvas')) return;

    var cv = document.createElement('canvas');
    cv.className = 'sl-canvas';
    cv.style.cssText = [
      'position:absolute',
      'inset:0',
      'pointer-events:none',
      'z-index:6',
      'width:100%',
      'height:100%'
    ].join(';');
    lt.appendChild(cv);

    slCanvases[i]  = cv;
    slContexts[i]  = cv.getContext('2d');
    slParticles[i] = [];
  });
}

function spawnSpeedLines(idx, count) {
  var cv = slCanvases[idx];
  if (!cv) return;

  var w = cv.offsetWidth  || 600;
  var h = cv.offsetHeight || 64;

  for (var n = 0; n < count; n++) {
    // Mulai dari dekat posisi roket (kira-kira visual %)
    var startX = (visualPos[idx] / 100) * w;
    var colors  = ['rgba(255,255,255,', 'rgba(0,207,255,', 'rgba(255,215,0,'];
    var col     = colors[Math.floor(Math.random() * colors.length)];

    slParticles[idx].push({
      x:      startX + Math.random() * 20,  // sedikit di depan roket
      y:      h * 0.3 + Math.random() * h * 0.4,
      vx:     3 + Math.random() * 5,         // bergerak ke KANAN (ke depan)
      vy:     (Math.random() - 0.5) * 0.4,
      life:   1.0,
      decay:  0.04 + Math.random() * 0.06,
      len:    20 + Math.random() * 60,       // panjang garis
      alpha:  0.3 + Math.random() * 0.4,
      color:  col
    });
  }
}

function updateSpeedLines(idx) {
  var cv  = slCanvases[idx];
  var ctx = slContexts[idx];
  if (!cv || !ctx) return;

  // Resize canvas ke ukuran aktual
  if (cv.width !== cv.offsetWidth || cv.height !== cv.offsetHeight) {
    cv.width  = cv.offsetWidth  || 600;
    cv.height = cv.offsetHeight || 64;
  }

  ctx.clearRect(0, 0, cv.width, cv.height);

  var alive = [];
  slParticles[idx].forEach(function(p) {
    p.life -= p.decay;
    if (p.life <= 0) return;

    p.x += p.vx;
    p.y += p.vy;

    var alpha = p.life * p.alpha;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.len * p.life, p.y);  // garis ke kiri = efek trail
    ctx.strokeStyle = p.color + alpha + ')';
    ctx.lineWidth   = 1 + p.life * 1.5;
    ctx.stroke();

    alive.push(p);
  });

  slParticles[idx] = alive;
}

// ══════════════════════════════════════════════════════════════════
//  [3] PATCH bgLoop — dynamic star speed
// ══════════════════════════════════════════════════════════════════
function patchBgLoop() {
  if (typeof window.bgLoop !== 'function' || typeof starLayers === 'undefined') {
    setTimeout(patchBgLoop, 200);
    return;
  }

  var origBgLoop = window.bgLoop;

  // Override bgLoop dengan versi yang membaca starSpeedMult
  window.bgLoop = function() {
    if (!bgCtx) return;
    bgCtx.clearRect(0, 0, bgW, bgH);

    // Nebula gradient
    var grad = bgCtx.createRadialGradient(bgW*0.6,bgH*0.4,0,bgW*0.6,bgH*0.4,bgW*0.7);

    // Makin intense = nebula makin terang
    var intensity = window.raceIntensity || 0;
    var nebulaR   = Math.floor(20 + intensity * 40);
    var nebulaG   = Math.floor(5  + intensity * 10);
    var nebulaB   = Math.floor(50 + intensity * 30);
    grad.addColorStop(0,   'rgba(' + nebulaR + ',' + nebulaG + ',' + nebulaB + ',0.6)');
    grad.addColorStop(0.5, 'rgba(5,5,25,0.3)');
    grad.addColorStop(1,   'rgba(3,3,15,0)');
    bgCtx.fillStyle = grad;
    bgCtx.fillRect(0, 0, bgW, bgH);

    // Layer configs: [base speed] × speed multiplier
    // Layer 0 = jauh (lambat), Layer 2 = dekat (cepat)
    var layerMults = [0.8, 1.8, 4.0]; // parallax ratio per layer
    var globalMult = window.starSpeedMult || 1.0;

    starLayers.forEach(function(layer, li) {
      var mult = layerMults[li] * globalMult;
      layer.forEach(function(s) {
        s.x -= s.speed * mult;
        if (s.x < -5) s.x = bgW + 5;
        s.twinkle += 0.03;

        var radius  = s.r;
        var alpha   = s.opacity * (0.7 + 0.3 * Math.sin(s.twinkle));

        // Streak effect saat kecepatan tinggi
        if (mult > 2.5) {
          var streakLen = (mult - 2) * s.speed * 8;
          bgCtx.beginPath();
          bgCtx.moveTo(s.x, s.y);
          bgCtx.lineTo(s.x + streakLen, s.y);
          bgCtx.strokeStyle = 'rgba(255,255,255,' + (alpha * 0.5) + ')';
          bgCtx.lineWidth   = s.r * 0.8;
          bgCtx.stroke();
        }

        bgCtx.beginPath();
        bgCtx.arc(s.x, s.y, radius, 0, Math.PI * 2);
        bgCtx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
        bgCtx.fill();
      });
    });

    requestAnimationFrame(window.bgLoop);
  };

  // Restart dengan versi baru
  requestAnimationFrame(window.bgLoop);
}

// ══════════════════════════════════════════════════════════════════
//  [7] INTENSITY SCALING
//  Makin dekat finish → intensitas lebih tinggi → semua lebih cepat
// ══════════════════════════════════════════════════════════════════
function updateRaceIntensity() {
  if (typeof pos === 'undefined' || typeof cfg === 'undefined') return;

  var maxPos = Math.max.apply(null, pos);
  var rawPct = maxPos / cfg.finish; // 0 → 1

  // Smooth intensity: mulai terasa di 50%, max di 90%
  var intensity = 0;
  if (rawPct > 0.5) {
    intensity = (rawPct - 0.5) / 0.4; // 0 → 1 antara 50%-90%
    intensity = Math.min(1, intensity);
  }

  // Drama/hype mode boost intensitas
  if (window.dramaMode)  intensity = Math.max(intensity, 0.7);
  if (window.hypeMode)   intensity = Math.max(intensity, 0.8);
  if (window.clutchMode) intensity = Math.max(intensity, 0.6);

  window.raceIntensity = intensity;

  // Star speed: 1.0x (idle) → 4.5x (max)
  window.starSpeedMult = 1.0 + intensity * 3.5;

  // Lerp speed global: lebih cepat saat intense
  var baseLerp = LERP_BASE + intensity * 0.03;
  if (window.clutchMode) baseLerp = 0.025; // slow-mo override
  for (var i = 0; i < cfg.countries.length; i++) {
    if (!isMoving[i]) lerpSpeed[i] = baseLerp;
  }

  // Body intensity class untuk CSS hooks
  document.body.classList.toggle('race-intense',   intensity > 0.4);
  document.body.classList.toggle('race-max',       intensity > 0.8);
}

// ══════════════════════════════════════════════════════════════════
//  MAIN RACING RAF LOOP
//  Smooth lerp positions + speed lines + intensity update
// ══════════════════════════════════════════════════════════════════
var lastRacingTs = 0;

function startRacingLoop() {
  function loop(ts) {
    var dt = Math.min((ts - lastRacingTs) / 1000, 0.05);
    lastRacingTs = ts;

    if (!window.finished) {
      updateRaceIntensity();
    }

    cfg.countries.forEach(function(c, i) {
      // ── [1] Smooth lerp ─────────────────────────────────────
      var diff = targetPos[i] - visualPos[i];

      if (Math.abs(diff) > 0.05) {
        // Easing: ease-out — cepat di awal, lambat di akhir
        var ease = lerpSpeed[i] + Math.abs(diff) * 0.003;
        ease = Math.min(ease, 0.12); // clamp lebih rendah = lebih perlahan

        visualPos[i] += diff * ease;

        // Terapkan ke DOM
        var rw = document.getElementById('rw' + i);
        if (rw) {
          rw.style.left = visualPos[i].toFixed(2) + '%';
        }
      } else {
        // Snap ke target jika sudah sangat dekat
        visualPos[i] = targetPos[i];
      }

      // ── [4] Speed lines update ───────────────────────────────
      updateSpeedLines(i);

      // ── [6] Motion feedback: tilt ke depan saat bergerak ────
      applyMotionFeedback(i, diff);
    });

    racingRaf = requestAnimationFrame(loop);
  }

  racingRaf = requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════════════
//  [6] MOTION FEEDBACK — tilt + scale berdasarkan kecepatan gerak
// ══════════════════════════════════════════════════════════════════
function applyMotionFeedback(idx, diff) {
  var unit = document.querySelector('#rw' + idx + ' .rocket-unit');
  if (!unit) return;

  var intensity = window.raceIntensity || 0;
  var absDiff   = Math.abs(diff);

  if (absDiff > 0.5) {
    // Sedang bergerak: tilt ke depan (ke kanan)
    var tilt  = Math.min(absDiff * 1.8, 12); // max 12deg
    var scaleX = 1 + Math.min(absDiff * 0.015, 0.12); // squeeze horizontal
    unit.style.transform  = 'rotate(' + tilt + 'deg) scaleX(' + scaleX + ')';
    unit.style.transition = 'transform 0.05s ease-out';
  } else {
    // Kembali normal
    unit.style.transform  = 'rotate(0deg) scaleX(1)';
    unit.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)';
  }
}

// ══════════════════════════════════════════════════════════════════
//  RE-INIT saat race reset
// ══════════════════════════════════════════════════════════════════
(function patchResetRace() {
  if (typeof window.resetRace !== 'function') {
    setTimeout(patchResetRace, 200);
    return;
  }

  var origReset = window.resetRace;

  window.resetRace = function() {
    origReset.apply(this, arguments);

    // Reset racing state
    var n = cfg.countries.length;
    for (var i = 0; i < n; i++) {
      visualPos[i]  = 0;
      targetPos[i]  = 0;
      isMoving[i]   = false;
      slParticles[i] = [];
      clearTimeout(movingTimer[i]);
      clearTimeout(overtakeBurstTimer[i]);
    }

    window.raceIntensity  = 0;
    window.starSpeedMult  = 1.0;

    document.body.classList.remove('race-intense', 'race-max');

    // Re-inject speed line canvases jika perlu
    setTimeout(function() {
      injectSpeedLineCanvases();
    }, 50);
  };
})();

// ══════════════════════════════════════════════════════════════════
//  OVERRIDE: Pastikan moveRocket awal (sebelum gift pertama)
//  tidak langsung terapkan left% via style — biarkan lerp yang handle
// ══════════════════════════════════════════════════════════════════
// Intercept set left pada rw saat renderTrack dipanggil
(function patchRenderTrackRacing() {
  if (typeof window.renderTrack !== 'function') {
    setTimeout(patchRenderTrackRacing, 200);
    return;
  }

  var origRT = window.renderTrack;
  window.renderTrack = function() {
    origRT.apply(this, arguments);
    // Setelah render, sync visual positions ke 0
    setTimeout(function() {
      for (var i = 0; i < cfg.countries.length; i++) {
        visualPos[i] = 0;
        targetPos[i] = 0;
        var rw = document.getElementById('rw' + i);
        if (rw) rw.style.left = '0%';
      }
      injectSpeedLineCanvases();
    }, 30);
  };
})();