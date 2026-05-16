// ════════════════════════════════════════════════════════════════
//  ROCKET RACE LIVE — UPGRADED ENGINE v2.0
//  Semua fitur gameplay baru ditambahkan, sistem lama dipertahankan
// ════════════════════════════════════════════════════════════════

// ── ✏️ EDIT KONFIGURASI DI SINI ─────────────────────────────────
var CONFIG = {
  topic:     'rocket-fikridikaa2025',   // ← ganti NTFY topic kamu
  finish:    20,                         // ← target poin menang
  countries: [
    'Indonesia',
    'Vietnam',
    'Thailand',
    'Singapore',
    'Malaysia'
  ]
};
// ────────────────────────────────────────────────────────────────

// ── CONSTANTS ────────────────────────────────────────────────────
var FLAGS = {
  indonesia:   'https://flagcdn.com/w40/id.png',
  vietnam:     'https://flagcdn.com/w40/vn.png',
  thailand:    'https://flagcdn.com/w40/th.png',
  singapore:   'https://flagcdn.com/w40/sg.png',
  malaysia:    'https://flagcdn.com/w40/my.png',
  philippines: 'https://flagcdn.com/w40/ph.png',
  myanmar:     'https://flagcdn.com/w40/mm.png',
  cambodia:    'https://flagcdn.com/w40/kh.png',
  laos:        'https://flagcdn.com/w40/la.png',
  brunei:      'https://flagcdn.com/w40/bn.png'
};
var COLORS = ['#ff2060','#ff8c00','#00cfff','#9b30ff','#00ff99'];
var CONFETTI_COLORS = ['#ff2060','#00cfff','#ffd700','#00ff99','#9b30ff','#ff8c00','#ffffff'];

// Gift power map — SEMUA GIFT SAMA, tidak ada perbedaan kecil/besar
var GIFT_POWER = {
  small:  { step: 1, boost: false, label: '+1',    color: '#00ff99' },
  medium: { step: 1, boost: false, label: '+1 ⚡',  color: '#00cfff' },
  big:    { step: 1, boost: false, label: '+1 🔥',  color: '#ffd700' }
};
var MEDIUM_KEYWORDS = ['rose','galaxy','heart','ice cream','lion','cap'];
var BIG_KEYWORDS    = ['drama queen','universe','tiktok','airplane','castle','diamond'];

// ── STATE ────────────────────────────────────────────────────────
var cfg      = { topic: CONFIG.topic, finish: CONFIG.finish, countries: [] };
var pos      = [];       // current position (steps) per country
var finished = false;
var es       = null;
var ntimer   = null;

// Feature state (lama)
var prevRanks     = [];
var demoGiftSize  = 'small';
var streamerMode  = false;
var supporters    = {};
var boostTimers   = [];
var fireCanvases  = [];
var fireContexts  = [];
var fireParticles = [];

// ── STATE GAMEPLAY BARU ──────────────────────────────────────────

// [FITUR 2] Drama Mode state
var dramaMode = false;
var dramaActivated = false;

// [FITUR 6] Hype Mode state
var hypeMode = false;
var hypeModeTimer = null;
var recentGiftTimestamps = [];

// [FITUR 7] Clutch Moment state
var clutchMode = false;
var clutchTimer = null;

// [FITUR 5] Random Micro Event state
var microEventCooldown = false;

// Build countries
CONFIG.countries.forEach(function(name, i) {
  var k = name.toLowerCase();
  cfg.countries.push({
    name:  name,
    flag:  FLAGS[k] || 'https://flagcdn.com/w40/un.png',
    color: COLORS[i % COLORS.length],
    score: 0,
    wins:  0,
    boosting: false
  });
  boostTimers[i] = null;
  fireParticles[i] = [];
});
pos = new Array(cfg.countries.length).fill(0);
prevRanks = new Array(cfg.countries.length).fill(0);

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', function() {
  initBgCanvas();
  renderAll();
  initFireCanvases();
  startFireLoop();
  connectNtfy();

  document.addEventListener('click',     function() { SFX.init(); }, { once: true });
  document.addEventListener('keydown',   function() { SFX.init(); }, { once: true });
  document.addEventListener('touchstart',function() { SFX.init(); }, { once: true });
  try { SFX.init(); } catch(e) {}
});

// ── NTFY CONNECTION ───────────────────────────────────────────────
function connectNtfy() {
  if (es) es.close();
  setStatus('', 'Menghubungkan ke ntfy.sh...');
  es = new EventSource('https://ntfy.sh/' + cfg.topic + '/sse');

  es.onopen = function() { setStatus('on', 'Terhubung — ' + cfg.topic); };

  es.onmessage = function(e) {
    try {
      var d    = JSON.parse(e.data);
      if (d.event === 'keepalive') return;
      var msg  = ((d.message || d.title || '')).toLowerCase().trim();
      var user = d.title || 'Viewer';

      var gsize = 'small';
      BIG_KEYWORDS.forEach(function(kw){    if (msg.indexOf(kw) !== -1) gsize = 'big'; });
      MEDIUM_KEYWORDS.forEach(function(kw){ if (msg.indexOf(kw) !== -1 && gsize !== 'big') gsize = 'medium'; });

      for (var i = 0; i < cfg.countries.length; i++) {
        var cn = cfg.countries[i].name.toLowerCase();
        if (msg.indexOf(cn) !== -1 || cn.indexOf(msg) !== -1) {
          document.getElementById('lgift').textContent = '⚡ ' + user + ' → ' + cfg.countries[i].name;
          trackSupporter(user);
          showGiftNotify(user, cfg.countries[i].name, cfg.countries[i].flag, gsize);
          processGift(i, gsize, user);
          return;
        }
      }
    } catch(x) {}
  };

  es.onerror = function() {
    setStatus('err', 'Koneksi terputus, mencoba ulang...');
    setTimeout(function() { if (es) connectNtfy(); }, 4000);
  };
}

// ══════════════════════════════════════════════════════════════════
//  GIFT PROCESSING — semua gift sama
// ══════════════════════════════════════════════════════════════════
function processGift(idx, gsize, user) {
  SFX.giftReceived(gsize);

  var now = Date.now();
  recentGiftTimestamps.push(now);
  recentGiftTimestamps = recentGiftTimestamps.filter(function(t){ return now - t < 3000; });
  checkHypeMode();

  maybeRandomEvent(idx);
  moveRocket(idx, 1);
}

// ══════════════════════════════════════════════════════════════════
//  CORE MOVE
// ══════════════════════════════════════════════════════════════════
function moveRocket(idx, rawSteps) {
  if (finished) return;
  if (rawSteps === undefined) rawSteps = 1;

  // [FITUR 1] Catch-up
  var steps = applyCatchUpMechanic(idx, rawSteps);

  // [FITUR 4] Near-finish boost
  steps = applyNearFinishBoost(idx, steps);

  // [FITUR 2] Drama mode speed
  if (dramaMode) { steps = steps + (Math.random() < 0.4 ? 1 : 0); }

  // [FITUR 7] Clutch slow
  if (clutchMode) { steps = Math.max(1, Math.floor(steps * 0.6)); }

  // [FITUR 6] Hype bonus
  if (hypeMode) { steps = steps + (Math.random() < 0.5 ? 1 : 0); }

  var prevPos = pos[idx];
  pos[idx] = Math.min(pos[idx] + steps, cfg.finish);
  cfg.countries[idx].score = pos[idx];

  var pct = (pos[idx] / cfg.finish) * 84;
  var rw  = document.getElementById('rw' + idx);
  if (!rw) return;

  if (steps >= 2) {
    rw.classList.add('boost-anim');
    setTimeout(function(){ rw.classList.remove('boost-anim'); }, 400);
  }

  rw.style.left = pct + '%';
  rw.classList.remove('burst');
  void rw.offsetWidth;
  rw.classList.add('burst');
  // [BARU] Speed trail saat bergerak
rw.classList.add('moving-trail');
setTimeout(function(){ rw.classList.remove('moving-trail'); }, 500);
  setTimeout(function(){ rw.classList.remove('burst'); }, 300);

  if (pos[idx] >= cfg.finish * 0.85) { rw.style.fontSize = '32px'; }

  var lane = document.getElementById('lane' + idx);
  if (lane) {
    lane.classList.add('moving');
    setTimeout(function(){ if(lane) lane.classList.remove('moving'); }, 600);
  }

  showScoreFloat(idx, steps);
  spawnFireBurst(idx, steps);
  SFX.rocketMove(steps);
  if (pos[idx] >= cfg.finish * 0.80) { SFX.nearFinish(); }

  renderLeaderboard();
  updateRankBadges();
  updateGlobalProgress();

  // [FITUR 3] Overtake
  detectOvertake(idx, prevPos);
  // [FITUR 2] Drama check
  checkDramaMode();
  // [FITUR 7] Clutch check
  checkClutchMoment();

  if (pos[idx] >= cfg.finish) finishRace(idx);
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 1] CATCH-UP MECHANIC
// ══════════════════════════════════════════════════════════════════
function applyCatchUpMechanic(idx, steps) {
  var maxPos = Math.max.apply(null, pos);
  var gap = maxPos - pos[idx];

  if (pos[idx] === maxPos && maxPos > 0) {
    if (Math.random() < 0.20) return 0;
    return steps;
  }
  if (gap >= 6) { return steps + (Math.random() < 0.60 ? 1 : 0); }
  if (gap >= 3) { return steps + (Math.random() < 0.30 ? 1 : 0); }
  return steps;
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 4] NEAR FINISH BOOST ZONE
// ══════════════════════════════════════════════════════════════════
function applyNearFinishBoost(idx, steps) {
  var pct = pos[idx] / cfg.finish;
  if (pct >= 0.80) { return steps + (Math.random() < 0.45 ? 1 : 0); }
  return steps;
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 2] DRAMA MODE
// ══════════════════════════════════════════════════════════════════
function checkDramaMode() {
  if (dramaActivated || finished) return;
  var allPast70  = pos.every(function(p){ return p >= cfg.finish * 0.70; });
  var maxPos     = Math.max.apply(null, pos);
  var leaderPast = maxPos >= cfg.finish * 0.85;
  if (allPast70 || leaderPast) activateDramaMode();
}

function activateDramaMode() {
  if (dramaActivated) return;
  dramaActivated = true;
  dramaMode = true;
  showEventBanner('🏁 FINAL SPRINT! 🏁');
  SFX.dramaMode();
  cameraShake('light');
  document.body.classList.add('drama-mode');
  cfg.countries.forEach(function(c, i) {
    var lane = document.getElementById('lane' + i);
    if (lane) lane.classList.add('drama-glow');
  });
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 3] OVERTAKE TRIGGER SYSTEM
// ══════════════════════════════════════════════════════════════════
function detectOvertake(movedIdx, prevPos) {
  var newRanks = getRanks();
  cfg.countries.forEach(function(c, i) {
    if (i !== movedIdx) return;
    var oldR = prevRanks[i], newR = newRanks[i];
    if (oldR > 0 && newR < oldR) {
      var overtakedName = '';
      cfg.countries.forEach(function(oc, oi) {
        if (oi !== i && prevRanks[oi] === newR) overtakedName = oc.name.toUpperCase();
      });
      var text = c.name.toUpperCase() + ' MENYALIP!';
      if (overtakedName) text += ' (vs ' + overtakedName + ')';
      showOvertake(text);
      SFX.overtake();
      cameraShake('light');
      flashLane(movedIdx);
    }
  });
  prevRanks = newRanks.slice();
}

function flashLane(idx) {
  var lane = document.getElementById('lane' + idx);
  if (!lane) return;
  lane.classList.add('overtake-flash');
  setTimeout(function(){ if(lane) lane.classList.remove('overtake-flash'); }, 500);
}

function getRanks() {
  var sorted = pos.map(function(p,i){ return {p:p,i:i}; }).sort(function(a,b){ return b.p-a.p; });
  var ranks = new Array(pos.length).fill(0);
  sorted.forEach(function(item,r){ ranks[item.i] = r; });
  return ranks;
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 5] RANDOM MICRO EVENT
// ══════════════════════════════════════════════════════════════════
function maybeRandomEvent(triggerIdx) {
  if (microEventCooldown || finished) return;
  if (Math.random() > 0.08) return;
  microEventCooldown = true;
  setTimeout(function(){ microEventCooldown = false; }, 12000);
  var events = [
    { name: '💨 ANGIN KENCANG!', fn: function(){ doRocketShake(); } },
    { name: '⚡ MINI BOOST ACAK!', fn: function(){ doMiniBoostRandom(triggerIdx); } }
  ];
  var ev = events[Math.floor(Math.random() * events.length)];
  showEventBanner(ev.name);
  SFX.microEvent();
  ev.fn();
}

function doRocketShake() {
  cfg.countries.forEach(function(c, i) {
    var rw = document.getElementById('rw' + i);
    if (!rw) return;
    rw.classList.add('micro-shake');
    setTimeout(function(){ if(rw) rw.classList.remove('micro-shake'); }, 600);
  });
  cameraShake('light');
}

function doMiniBoostRandom(excludeIdx) {
  var maxPos = Math.max.apply(null, pos);
  var candidates = pos.map(function(p,i){ return {i:i,p:p}; }).filter(function(x){ return x.p < maxPos; });
  if (!candidates.length) return;
  var pick = candidates[Math.floor(Math.random() * candidates.length)];
  pos[pick.i] = Math.min(pos[pick.i] + 1, cfg.finish);
  cfg.countries[pick.i].score = pos[pick.i];
  var pct = (pos[pick.i] / cfg.finish) * 84;
  var rw  = document.getElementById('rw' + pick.i);
  if (rw) rw.style.left = pct + '%';
  renderLeaderboard();
  updateRankBadges();
  updateGlobalProgress();
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 6] HYPE MODE
// ══════════════════════════════════════════════════════════════════
function checkHypeMode() {
  if (recentGiftTimestamps.length >= 5 && !hypeMode) activateHypeMode();
}

function activateHypeMode() {
  hypeMode = true;
  showEventBanner('🔥 HYPE MODE! SEMUA NGEBUT! 🔥');
  SFX.hypeMode();
  document.body.classList.add('hype-mode');
  cfg.countries.forEach(function(c, i) {
    var lane = document.getElementById('lane' + i);
    if (lane) lane.classList.add('hype-glow');
  });
  clearTimeout(hypeModeTimer);
  hypeModeTimer = setTimeout(function() {
    hypeMode = false;
    document.body.classList.remove('hype-mode');
    cfg.countries.forEach(function(c, i) {
      var lane = document.getElementById('lane' + i);
      if (lane) lane.classList.remove('hype-glow');
    });
  }, 5000);
}

// ══════════════════════════════════════════════════════════════════
//  [FITUR 7] CLUTCH MOMENT
// ══════════════════════════════════════════════════════════════════
function checkClutchMoment() {
  if (clutchTimer || finished) return;
  var maxPos = Math.max.apply(null, pos);
  if (maxPos < cfg.finish * 0.70) return;
  var closeCount = pos.filter(function(p){ return Math.abs(p - maxPos) <= 1 && p > 0; }).length;
  if (closeCount >= 2) triggerClutchMoment();
}

function triggerClutchMoment() {
  if (clutchMode) return;
  clutchMode = true;
  showEventBanner('😱 KEJAR-KEJARAN! SANGAT DEKAT!');
  SFX.clutchMoment();
  cameraShake('light');
  document.body.classList.add('clutch-slow');
  setTimeout(function() {
    document.body.classList.remove('clutch-slow');
    document.body.classList.add('clutch-speedup');
    setTimeout(function() {
      document.body.classList.remove('clutch-speedup');
      clutchMode = false;
      clutchTimer = null;
    }, 300);
  }, 600);
  clutchTimer = setTimeout(function(){ clutchTimer = null; }, 8000);
}

// ══════════════════════════════════════════════════════════════════
//  FINISH RACE
// ══════════════════════════════════════════════════════════════════
function finishRace(idx) {
  finished = true;
  var w = cfg.countries[idx];
  w.wins++;
  cameraShake('big');
  SFX.winner();

  var ws  = document.getElementById('winner-screen');
  var wfb = document.getElementById('winner-flag-big');
  var wnb = document.getElementById('winner-name-big');
  var wsb = document.getElementById('winner-sub');
  if (wfb) wfb.innerHTML = '<img src="' + w.flag + '" alt="' + w.name + '" style="width:80px;height:auto;border-radius:6px;box-shadow:0 0 20px rgba(255,215,0,0.6);">';
  if (wnb) wnb.textContent = w.name.toUpperCase();
  if (wsb) wsb.textContent = '🏆 Total ' + w.wins + ' kemenangan';
  if (ws)  ws.classList.add('show');

  for (var i = 0; i < 120; i++) {
    (function(d){ setTimeout(function(){ mkConfetti(); SFX.confettiPop(); }, d); })(i * 30);
  }
  startWinnerFireworks();
  // [FITUR 8] Fast rematch
  setTimeout(resetRace, 2500);
}

function resetRace() {
  finished       = false;
  dramaMode      = false;
  dramaActivated = false;
  hypeMode       = false;
  clutchMode     = false;
  clutchTimer    = null;
  recentGiftTimestamps = [];
  microEventCooldown   = false;
  clearTimeout(hypeModeTimer);

  pos       = new Array(cfg.countries.length).fill(0);
  prevRanks = new Array(cfg.countries.length).fill(0);

  document.body.classList.remove('drama-mode','hype-mode','clutch-slow','clutch-speedup');

  cfg.countries.forEach(function(c, i) {
    c.score = 0; c.boosting = false;
    clearTimeout(boostTimers[i]);
  });

  var ws = document.getElementById('winner-screen');
  if (ws) ws.classList.remove('show');

  cfg.countries.forEach(function(c, i) {
    var rw   = document.getElementById('rw' + i);
    var lane = document.getElementById('lane' + i);
    if (rw) {
      rw.style.left = '0%';
      rw.classList.remove('boosting','leader','near-finish');
      rw.style.fontSize = '';
    }
    if (lane) lane.classList.remove('drama-glow','hype-glow','overtake-flash');
  });

  renderLeaderboard();
  updateGlobalProgress();
  stopWinnerFireworks();
  SFX.raceReset();
}

// ══════════════════════════════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════════════════════════════
function renderAll() {
  renderTrack();
  renderLeaderboard();
  renderDemo();
}

function renderTrack() {
  var t = document.getElementById('track');
  t.innerHTML = cfg.countries.map(function(c, i) {
    // Buat 14 repetisi nama supaya loop seamless (7 asli + 7 duplikat)
    var nameReps = '';
    for (var r = 0; r < 14; r++) {
      nameReps += '<span>' + c.name.toUpperCase() + '</span>';
    }
    // Speed lines (lama)
    var spd = '';
    for (var s = 0; s < 8; s++) {
      spd += '<div class="spd-line" style="' +
        'top:' + (20 + Math.random()*60) + '%;' +
        'width:' + (30 + Math.random()*80) + 'px;' +
        'animation-duration:' + (0.3 + Math.random()*0.4) + 's;' +
        'animation-delay:-' + (Math.random()*0.5) + 's;' +
      '"></div>';
    }
    // Variasikan kecepatan scroll teks per lane
    var scrollSpeed = (7 + i * 1.5) + 's';

    return '<div class="lane" id="lane' + i + '">' +

      // [BARU] Track text scroll
      '<div class="track-text-wrap">' +
        '<div class="track-text-inner" style="animation-duration:' + scrollSpeed + '">' +
          nameReps +
        '</div>' +
      '</div>' +

      '<div class="speed-lines">' + spd + '</div>' +
      '<div class="lleft">' +
        '<div class="lrank" id="lrank' + i + '"></div>' +
        '<img class="lflag-img" src="' + c.flag + '" alt="' + c.name + '">' +
        '<span class="lname">' + c.name.toUpperCase() + '</span>' +
      '</div>' +
      '<div class="ltrack" id="lt' + i + '">' +
        '<div class="fline"></div>' +
        '<div class="rocket-wrap" id="rw' + i + '" style="color:' + c.color + '">' +
          '<canvas class="fire-canvas" id="fc' + i + '" width="60" height="40"></canvas>' +

          // [BARU] Speed trail
          '<div class="speed-trail" id="st' + i + '"></div>' +

          // [BARU] Multi-layer flame
          '<div class="flame-wrap">' +
            '<div class="flame-glow"></div>' +
            '<div class="flame-outer"></div>' +
            '<div class="flame-inner"></div>' +
          '</div>' +

          '<div class="rocket-unit">' +
            '<img class="rocket-flag" id="rf' + i + '" src="' + c.flag + '" alt="' + c.name + '" style="animation-delay:' + (i * 0.18) + 's">' +
            '<span class="rocket-emoji">🚀</span>' +
          '</div>' +
        '</div>' +
        '<div class="score-pill" id="sp' + i + '">0/' + cfg.finish + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderLeaderboard() {
  var sb = document.getElementById('leaderboard');
  if (!sb) return;
  var sorted = cfg.countries.map(function(c,i){ return {c:c,i:i,p:pos[i]}; })
    .sort(function(a,b){ return b.p-a.p; });
  var maxScore = sorted[0] ? sorted[0].p : 0;

  sb.innerHTML = sorted.map(function(item, rank) {
    return '<div class="lb-item pos-' + (rank+1) + '" id="lb' + item.i + '">' +
      '<span class="lb-rank">#' + (rank+1) + '</span>' +
      '<img src="' + item.c.flag + '" alt="' + item.c.name + '" style="width:18px;height:auto;vertical-align:middle;border-radius:2px;margin-right:3px;">' +
      '<span>' + item.c.score + '</span>' +
      (item.c.wins > 0 ? '<span class="lb-wins">🏆' + item.c.wins + '</span>' : '') +
    '</div>';
  }).join('');

  cfg.countries.forEach(function(c, i) {
    var lane = document.getElementById('lane' + i);
    var rw   = document.getElementById('rw' + i);
    var sp   = document.getElementById('sp' + i);
    if (!lane) return;
    var isLead = (pos[i] === maxScore && pos[i] > 0);
    lane.classList.toggle('leading', isLead);
    if (rw) rw.classList.toggle('leader', isLead);
    if (sp) sp.textContent = pos[i] + '/' + cfg.finish;
  });
}

function updateRankBadges() {
  var sorted = pos.map(function(p,i){ return {p:p,i:i}; }).sort(function(a,b){ return b.p-a.p; });
  sorted.forEach(function(item, rank) {
    var el = document.getElementById('lrank' + item.i);
    if (!el) return;
    if (rank < 3 && item.p > 0) {
      el.textContent = rank + 1;
      el.style.background = rank===0?'gold':rank===1?'#c0c0c0':'#cd7f32';
      el.classList.add('show');
    } else { el.classList.remove('show'); }
  });
}

function updateGlobalProgress() {
  var maxPos = Math.max.apply(null, pos);
  var pct    = Math.min(100, Math.round((maxPos / cfg.finish) * 100));
  var fill   = document.getElementById('gp-fill');
  var label  = document.getElementById('gp-pct');
  if (fill)  fill.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
}

function renderDemo() {
  var el = document.getElementById('dbtns');
  if (!el) return;
  el.innerHTML = cfg.countries.map(function(c, i) {
    return '<button class="dbtn" onclick="demoMove(' + i + ')"><img src="' + c.flag + '" alt="' + c.name + '" style="width:20px;height:auto;vertical-align:middle;border-radius:2px;"></button>';
  }).join('');
}

function demoMove(idx) { processGift(idx, demoGiftSize, 'Demo'); }

function setDemoSize(size) {
  demoGiftSize = size;
  ['small','medium','big'].forEach(function(s) {
    var btn = document.getElementById('btn-' + (s==='medium'?'med':s));
    if (btn) btn.classList.toggle('active', s === size);
  });
}

// ══════════════════════════════════════════════════════════════════
//  UI EFFECTS
// ══════════════════════════════════════════════════════════════════
function cameraShake(intensity) {
  var root = document.getElementById('shake-root');
  if (!root) return;
  root.classList.remove('shake');
  void root.offsetWidth;
  root.classList.add('shake');
  setTimeout(function(){ root.classList.remove('shake'); }, 450);
}

function showGiftNotify(user, country, flag, gsize) {
  var gp  = GIFT_POWER[gsize] || GIFT_POWER.small;
  var el  = document.getElementById('gnotify');
  var gna = document.getElementById('gn-avatar');
  if (!el) return;

  document.getElementById('gnu').textContent      = 'Dari: ' + user;
  document.getElementById('gng').innerHTML        = '<img src="' + flag + '" style="width:16px;vertical-align:middle;border-radius:2px;"> +1 untuk ' + country;
  document.getElementById('gn-power').textContent = gp.label;
  document.getElementById('gn-power').style.color = gp.color;
  if (gna) gna.textContent = gsize==='big'?'💎':gsize==='medium'?'🎁':'🎀';

  el.classList.toggle('big-gift', gsize==='big');
  el.classList.remove('hide','show');
  void el.offsetWidth;
  el.classList.add('show');

  clearTimeout(ntimer);
  ntimer = setTimeout(function() {
    el.classList.add('hide');
    setTimeout(function(){ el.classList.remove('show','hide'); }, 300);
  }, 2800);
}

function showOvertake(text) {
  var el = document.getElementById('overtake-display');
  if (!el) return;
  el.textContent = '🚀 ' + text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 1900);
}

function showEventBanner(text) {
  var el = document.getElementById('event-banner');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(function(){ el.classList.remove('show'); }, 3500);
}

function showScoreFloat(idx, steps) {
  var rw = document.getElementById('rw' + idx);
  if (!rw) return;
  var el = document.createElement('div');
  el.className = 'score-float';
  el.textContent = '+' + steps;
  el.style.color = '#00ff99';
  el.style.left  = (parseFloat(rw.style.left) || 0) + 8 + '%';
  el.style.top   = '50%';
  el.style.transform = 'translateY(-50%)';
  var lt = document.getElementById('lt' + idx);
  if (lt) lt.appendChild(el);
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 1300);
}

function mkConfetti() {
  var el = document.createElement('div');
  el.className = 'cf';
  el.style.left             = Math.random() * 100 + 'vw';
  el.style.background       = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  el.style.animationDuration = (2.5 + Math.random() * 2.5) + 's';
  el.style.borderRadius     = Math.random() > 0.5 ? '50%' : '2px';
  el.style.width = el.style.height = (6 + Math.random() * 8) + 'px';
  document.body.appendChild(el);
  setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 5500);
}

function trackSupporter(user) {
  if (!user || user === 'Demo') return;
  supporters[user] = (supporters[user] || 0) + 1;
  var top = null, topCount = 0;
  Object.keys(supporters).forEach(function(u){
    if (supporters[u] > topCount){ topCount = supporters[u]; top = u; }
  });
  if (top) {
    var n = document.getElementById('ts-name');
    var c = document.getElementById('ts-count');
    if (n) n.textContent = top;
    if (c) c.textContent = topCount + ' gifts';
  }
}

function setStatus(state, msg) {
  var d = document.getElementById('dot'), t = document.getElementById('stxt');
  if (!d || !t) return;
  d.className   = 'dot' + (state==='on'?' on':state==='err'?' err':'');
  t.textContent = msg;
  t.style.color = state==='on'?'#00ff99':state==='err'?'#ff4444':'#4a4a6a';
}

function toggleStreamerMode() {
  streamerMode = !streamerMode;
  document.body.classList.toggle('streamer-mode', streamerMode);
  var btn   = document.getElementById('streamer-toggle');
  var label = document.getElementById('toggle-label');
  if (btn)   btn.classList.toggle('active', streamerMode);
  if (label) label.textContent = streamerMode ? '✓ STREAMER ON' : 'STREAMER MODE';
}

// ══════════════════════════════════════════════════════════════════
//  FIRE PARTICLE SYSTEM
// ══════════════════════════════════════════════════════════════════
function initFireCanvases() {
  cfg.countries.forEach(function(c, i) {
    var canvas = document.getElementById('fc' + i);
    if (!canvas) return;
    fireCanvases[i] = canvas;
    fireContexts[i] = canvas.getContext('2d');
    fireParticles[i] = [];
  });
}

function variateFlameSpeeds() {
  cfg.countries.forEach(function(c, i) {
    var rw = document.getElementById('rw' + i);
    if (!rw) return;
    var outer = rw.querySelector('.flame-outer');
    var inner = rw.querySelector('.flame-inner');
    var glow  = rw.querySelector('.flame-glow');
    if (outer) outer.style.animationDuration = (0.4 + i * 0.07) + 's';
    if (inner) inner.style.animationDuration = (0.28 + i * 0.04) + 's';
    if (glow)  glow.style.animationDuration  = (0.6 + i * 0.08) + 's';
  });
}

function spawnFireBurst(idx, steps) {
  var count = 4 + steps * 2;
  for (var n = 0; n < count; n++) {
    fireParticles[idx].push({
      x:28, y:20,
      vx:-(1.5+Math.random()*2.5), vy:(Math.random()-0.5)*2,
      life:1, maxLife:0.4+Math.random()*0.5,
      color:['#ff6a00','#ff2060','#ffd700','#ff8c00'][Math.floor(Math.random()*4)],
      size:2+Math.random()*4
    });
  }
}

function spawnIdleFire(idx) {
  if (pos[idx] <= 0) return;
  fireParticles[idx].push({
    x:28, y:20,
    vx:-(0.5+Math.random()*1), vy:(Math.random()-0.5)*0.8,
    life:1, maxLife:0.3+Math.random()*0.3,
    color:['#ff6a00','#ff4400'][Math.floor(Math.random()*2)],
    size:1+Math.random()*2
  });
}

var fireLast = 0;
function startFireLoop() {
  function loop(ts) {
    var dt = Math.min((ts - fireLast) / 1000, 0.05);
    fireLast = ts;
    cfg.countries.forEach(function(c, i) {
      var ctx = fireContexts[i];
      if (!ctx) return;
      ctx.clearRect(0, 0, 60, 40);
      if (Math.random() < 0.6) spawnIdleFire(i);
      var alive = [];
      fireParticles[i].forEach(function(p) {
        p.life -= dt / p.maxLife;
        if (p.life <= 0) return;
        p.x += p.vx; p.y += p.vy; p.vy += 0.04;
        ctx.save();
        ctx.globalAlpha = p.life * 0.85;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        alive.push(p);
      });
      fireParticles[i] = alive;
    });
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}

// ══════════════════════════════════════════════════════════════════
//  PARALLAX BACKGROUND CANVAS
// ══════════════════════════════════════════════════════════════════
var bgCanvas, bgCtx, bgW, bgH, starLayers = [];

function initBgCanvas() {
  bgCanvas = document.getElementById('bg-canvas');
  if (!bgCanvas) return;
  bgCtx = bgCanvas.getContext('2d');
  function resize() {
    bgW = bgCanvas.width  = window.innerWidth;
    bgH = bgCanvas.height = window.innerHeight;
    buildStars();
  }
  window.addEventListener('resize', resize);
  resize();
  bgLoop();
}

function buildStars() {
  starLayers = [];
  [{count:80,size:0.8,speed:0.15,opacity:0.4},{count:50,size:1.2,speed:0.35,opacity:0.6},{count:25,size:2,speed:0.7,opacity:0.9}]
  .forEach(function(c) {
    var stars = [];
    for (var i = 0; i < c.count; i++) {
      stars.push({
        x:Math.random()*bgW, y:Math.random()*bgH,
        r:c.size*(0.7+Math.random()*0.6),
        speed:c.speed+Math.random()*0.2,
        opacity:c.opacity*(0.5+Math.random()*0.5),
        twinkle:Math.random()*Math.PI*2
      });
    }
    starLayers.push(stars);
  });
}

function bgLoop() {
  if (!bgCtx) return;
  bgCtx.clearRect(0,0,bgW,bgH);
  var grad = bgCtx.createRadialGradient(bgW*0.6,bgH*0.4,0,bgW*0.6,bgH*0.4,bgW*0.7);
  grad.addColorStop(0,'rgba(20,5,50,0.5)');
  grad.addColorStop(0.5,'rgba(5,5,25,0.3)');
  grad.addColorStop(1,'rgba(3,3,15,0)');
  bgCtx.fillStyle = grad;
  bgCtx.fillRect(0,0,bgW,bgH);
  starLayers.forEach(function(layer) {
    layer.forEach(function(s) {
      s.x -= s.speed; if (s.x < -5) s.x = bgW + 5;
      s.twinkle += 0.03;
      bgCtx.beginPath();
      bgCtx.arc(s.x,s.y,s.r,0,Math.PI*2);
      bgCtx.fillStyle = 'rgba(255,255,255,'+(s.opacity*(0.7+0.3*Math.sin(s.twinkle)))+')';
      bgCtx.fill();
    });
  });
  requestAnimationFrame(bgLoop);
}

// ══════════════════════════════════════════════════════════════════
//  WINNER FIREWORKS
// ══════════════════════════════════════════════════════════════════
var wCanvas, wCtx, wParticles = [], wRunning = false, wRaf;

function startWinnerFireworks() {
  wCanvas = document.getElementById('winner-canvas');
  if (!wCanvas) return;
  wCanvas.width = window.innerWidth; wCanvas.height = window.innerHeight;
  wCtx = wCanvas.getContext('2d'); wParticles = []; wRunning = true;
  (function loop() {
    if (!wRunning) return;
    wCtx.fillStyle = 'rgba(0,0,0,0.15)';
    wCtx.fillRect(0,0,wCanvas.width,wCanvas.height);
    if (Math.random() < 0.15) spawnWinnerBurst();
    var alive = [];
    wParticles.forEach(function(p) {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.life-=0.015;
      if (p.life <= 0) return;
      wCtx.save(); wCtx.globalAlpha=p.life; wCtx.fillStyle=p.color;
      wCtx.beginPath(); wCtx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); wCtx.fill();
      wCtx.restore(); alive.push(p);
    });
    wParticles = alive; wRaf = requestAnimationFrame(loop);
  })();
}

function spawnWinnerBurst() {
  var cx=Math.random()*wCanvas.width, cy=Math.random()*wCanvas.height*0.7;
  var col=CONFETTI_COLORS[Math.floor(Math.random()*CONFETTI_COLORS.length)];
  for (var i=0;i<30;i++) {
    var a=(i/30)*Math.PI*2, sp=1+Math.random()*4;
    wParticles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-2,r:2+Math.random()*3,life:0.8+Math.random()*0.2,color:col});
  }
}

function stopWinnerFireworks() {
  wRunning = false; cancelAnimationFrame(wRaf);
  if (wCtx) wCtx.clearRect(0,0,wCanvas.width,wCanvas.height);
}

// ══════════════════════════════════════════════════════════════════
//  SOUND CONTROLS
// ══════════════════════════════════════════════════════════════════
function handleMuteToggle() {
  SFX.init();
  var isOn  = SFX.toggleMute();
  var btn   = document.getElementById('mute-btn');
  var label = document.getElementById('mute-label');
  if (btn)   btn.classList.toggle('active', isOn);
  if (label) label.textContent = isOn ? 'SFX ON' : 'SFX OFF';
  if (btn)   btn.textContent   = (isOn ? '🔊 ' : '🔇 ') + (isOn ? 'SFX ON' : 'SFX OFF');
}

function handleVolChange(val) {
  SFX.init();
  SFX.setVolume(val / 100);
}