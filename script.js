// ══════════════════════════════════════════════════
//   ✏️  EDIT KONFIGURASI DI SINI
// ══════════════════════════════════════════════════
var CONFIG = {
  topic:     'rocket-fikridikaa2025',   // ← ganti dengan NTFY topic kamu
  finish:    20,                        // ← target poin menang
  countries: [
    'Indonesia',
    'Vietnam',
    'Thailand',
    'Singapore',
    'Malaysia'
  ]
};
// ══════════════════════════════════════════════════

var FLAGS = {
  indonesia:   'INA', vietnam:   'VIE', thailand: 'THA',
  singapore:   'SGP', malaysia:  'MAL', philippines: 'PHA',
  myanmar:     '🇲🇲', cambodia: '🇰🇭', laos:  '🇱🇦', brunei: 'BRN'
};

var COLORS = ['#ff2d78', '#ff8c00', '#00d4ff', '#7b2fff', '#00ff88'];

var cfg      = { topic: CONFIG.topic, finish: CONFIG.finish, countries: [] };
var pos      = [];
var finished = false;
var es       = null;
var ntimer   = null;

// Build countries array from config
CONFIG.countries.forEach(function (name, i) {
  var k = name.toLowerCase();
  cfg.countries.push({
    name:  name,
    flag:  FLAGS[k] || '🏳️',
    color: COLORS[i % COLORS.length],
    score: 0,
    wins:  0
  });
});

pos = new Array(cfg.countries.length).fill(0);

// ── INIT ──────────────────────────────────────────
window.addEventListener('load', function () {
  renderAll();
  connectNtfy();
});

// ── NTFY CONNECTION ───────────────────────────────
function connectNtfy() {
  if (es) es.close();
  setStatus('', 'Menghubungkan ke ntfy.sh...');

  es = new EventSource('https://ntfy.sh/' + cfg.topic + '/sse');

  es.onopen = function () {
    setStatus('on', 'Terhubung — ' + cfg.topic);
  };

  es.onmessage = function (e) {
    try {
      var d   = JSON.parse(e.data);
      if (d.event === 'keepalive') return;
      var msg = ((d.message || d.title || '')).toLowerCase().trim();

      for (var i = 0; i < cfg.countries.length; i++) {
        var cn = cfg.countries[i].name.toLowerCase();
        if (msg.indexOf(cn) !== -1 || cn.indexOf(msg) !== -1) {
          document.getElementById('lgift').textContent =
            '⚡ ' + (d.title || 'Viewer') + ' → ' + cfg.countries[i].name;
          showNotify(d.title || 'Viewer', cfg.countries[i].name, cfg.countries[i].flag);
          moveRocket(i);
          return;
        }
      }
    } catch (x) {}
  };

  es.onerror = function () {
    setStatus('err', 'Koneksi terputus, mencoba ulang...');
    setTimeout(function () { if (es) connectNtfy(); }, 4000);
  };
}

// ── RENDER ────────────────────────────────────────
function renderAll() {
  renderScore();
  renderTrack();
  renderDemo();
  makeSL();
}

function renderScore() {
  var sb = document.getElementById('scoreboard');
  var s  = cfg.countries.slice().sort(function (a, b) { return b.score - a.score; });
  var mx = s[0] ? s[0].score : 0;

  sb.innerHTML = s.map(function (c) {
    var lead = (c.score > 0 && c.score === mx) ? ' lead' : '';
    return '<div class="si' + lead + '">' +
      c.flag + ' <span>' + c.score + '</span>' +
      (c.wins > 0 ? '<span style="color:var(--yellow);font-size:9px">🏆' + c.wins + '</span>' : '') +
      '</div>';
  }).join('');
}

function renderTrack() {
  var t = document.getElementById('track');
  t.innerHTML = cfg.countries.map(function (c, i) {
    return '<div class="lane">' +
      '<div class="lleft">' +
        '<span class="lflag">' + c.flag + '</span>' +
        '<span class="lname">' + c.name.toUpperCase() + '</span>' +
      '</div>' +
      '<div class="ltrack">' +
        '<div class="fline"></div>' +
        '<div class="rocket" id="r' + i + '" style="color:' + c.color + '">' +
          '🚀<div class="trail" style="color:' + c.color + '"></div>' +
        '</div>' +
        '<div class="rbadge" id="b' + i + '"></div>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderDemo() {
  var el = document.getElementById('dbtns');
  el.innerHTML = cfg.countries.map(function (c, i) {
    return '<button class="dbtn" onclick="moveRocket(' + i + ')">' + c.flag + '</button>';
  }).join('');
}

function makeSL() {
  var c = document.getElementById('splines');
  c.innerHTML = '';
  for (var i = 0; i < 12; i++) {
    var l = document.createElement('div');
    l.className = 'sl';
    l.style.top             = Math.random() * 100 + '%';
    l.style.width           = (40 + Math.random() * 120) + 'px';
    l.style.animationDuration = (0.6 + Math.random() * 1.8) + 's';
    l.style.animationDelay  = '-' + (Math.random() * 2) + 's';
    c.appendChild(l);
  }
}

// ── GAME LOGIC ────────────────────────────────────
function moveRocket(i) {
  if (finished) return;

  pos[i] = Math.min(pos[i] + 1, cfg.finish);
  var pct = (pos[i] / cfg.finish) * 84;
  var r   = document.getElementById('r' + i);
  if (!r) return;

  r.style.left = pct + '%';
  r.classList.add('burst');
  setTimeout(function () { r.classList.remove('burst'); }, 350);

  cfg.countries[i].score = pos[i];
  renderScore();
  updateRanks();

  if (pos[i] >= cfg.finish) finishRace(i);
}

function updateRanks() {
  var s = pos.map(function (p, i) { return { p: p, i: i }; })
             .sort(function (a, b) { return b.p - a.p; });

  s.forEach(function (item, rank) {
    var b = document.getElementById('b' + item.i);
    if (!b) return;
    if (rank < 3 && item.p > 0) {
      b.textContent  = rank + 1;
      b.style.background = rank === 0 ? 'gold' : rank === 1 ? '#c0c0c0' : '#cd7f32';
      b.classList.add('show');
    } else {
      b.classList.remove('show');
    }
  });
}

function finishRace(idx) {
  finished = true;
  var w = cfg.countries[idx];
  w.wins++;

  document.getElementById('wname').innerHTML = w.flag + ' ' + w.name.toUpperCase() + ' MENANG!';
  document.getElementById('wsub').textContent = 'Total ' + w.wins + ' kemenangan';
  document.getElementById('winner-bar').classList.add('show');

  renderScore();
  for (var i = 0; i < 60; i++) {
    (function (d) { setTimeout(mkConfetti, d); })(i * 45);
  }
  setTimeout(resetRace, 4500);
}

function mkConfetti() {
  var el = document.createElement('div');
  el.className = 'cf';
  el.style.left             = Math.random() * 100 + 'vw';
  el.style.background       = ['#ff2d78','#00d4ff','#ffd700','#00ff88','#7b2fff','#ff8c00'][Math.floor(Math.random() * 6)];
  el.style.animationDuration = (2 + Math.random() * 2) + 's';
  el.style.borderRadius     = Math.random() > 0.5 ? '50%' : '2px';
  document.body.appendChild(el);
  setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4500);
}

function resetRace() {
  finished = false;
  pos = new Array(cfg.countries.length).fill(0);
  cfg.countries.forEach(function (c) { c.score = 0; });

  document.getElementById('winner-bar').classList.remove('show');
  cfg.countries.forEach(function (c, i) {
    var r = document.getElementById('r' + i); if (r) r.style.left = '0%';
    var b = document.getElementById('b' + i); if (b) b.classList.remove('show');
  });
  renderScore();
}

// ── HELPERS ───────────────────────────────────────
function setStatus(state, msg) {
  var d = document.getElementById('dot');
  var t = document.getElementById('stxt');
  d.className    = 'dot' + (state === 'on' ? ' on' : state === 'err' ? ' err' : '');
  t.textContent  = msg;
  t.style.color  = state === 'on' ? '#00ff88' : state === 'err' ? '#ff4444' : '#555';
}

function showNotify(user, country, flag) {
  var el = document.getElementById('gnotify');
  document.getElementById('gnu').textContent  = 'Dari: ' + user;
  document.getElementById('gng').innerHTML    = flag + ' +1 untuk ' + country;
  el.classList.add('show');
  clearTimeout(ntimer);
  ntimer = setTimeout(function () { el.classList.remove('show'); }, 2500);
}