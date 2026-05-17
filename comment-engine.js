// ════════════════════════════════════════════════════════════════
//  ROCKET RACE LIVE — COMMENT ENGINE v1.0
//  comment-engine.js — dimuat SETELAH semua script lain
//
//  Alur:  TikTok comment → Indofinity webhook → ntfy (SSE)
//         → parseComment() → matchCountry() → moveRocket(idx)
//
//  ✅ TIDAK mengubah fungsi moveRocket(), resetRace(), atau ntfy
//     yang sudah ada — hanya menambahkan lapisan di atasnya.
//  ✅ Vanilla JS, tanpa framework/library tambahan.
// ════════════════════════════════════════════════════════════════


// ──────────────────────────────────────────────────────────────
//  [1] KEYWORD MAP — Daftarkan variasi kata per negara
//      Key harus SAMA PERSIS dengan nama di CONFIG.countries[]
// ──────────────────────────────────────────────────────────────

var COMMENT_KEYWORDS = {
  'Indonesia': [
    'indo', 'indonesia', 'garuda', 'merah putih', 'nusantara',
    'indon', 'id', '🇮🇩'
  ],
  'Vietnam': [
    'viet', 'vietnam', 'vn', 'vina', 'việt', '🇻🇳'
  ],
  'Thailand': [
    'thai', 'thailand', 'th', 'siam', 'ไทย', '🇹🇭'
  ],
  'Singapore': [
    'sing', 'singapore', 'sgp', 'sg', 'singapura', '🇸🇬'
  ],
  'Malaysia': [
    'malay', 'malaysia', 'msia', 'my', 'mys', 'boleh', '🇲🇾'
  ],
  // ── Tambah negara baru di sini (ikuti pola yang sama) ────────
  // 'Philippines': ['ph', 'phils', 'pinas', 'pinoy', '🇵🇭'],
  // 'Myanmar':     ['myan', 'myanmar', 'burma', '🇲🇲'],
};


// ──────────────────────────────────────────────────────────────
//  [2] ANTI-SPAM CONFIG
// ──────────────────────────────────────────────────────────────

var SPAM_CONFIG = {
  globalCooldownMs:   120,   // Minimum jeda antar komentar APAPUN (ms)
  perUserCooldownMs:  1500,  // 1 user yang sama max 1x per 1.5 detik
  maxQueueSize:       20,    // Batas antrian agar tidak numpuk saat spam
};


// ──────────────────────────────────────────────────────────────
//  [3] STATE INTERNAL
// ──────────────────────────────────────────────────────────────

var CE = (function() {

  var lastGlobalTrigger = 0;       // Timestamp trigger terakhir (global)
  var userLastTrigger   = {};      // { username: timestamp } per user
  var processQueue      = [];      // Antrian komentar yang menunggu diproses
  var queueRunning      = false;   // Flag loop antrian sedang berjalan
  var debugMode         = true;    // Aktifkan console.log debug


  // ──────────────────────────────────────────────────────────
  //  UTIL: Normalisasi teks komentar
  //  → lowercase, trim, hapus karakter berulang (loooove → love)
  // ──────────────────────────────────────────────────────────

  function normalizeText(raw) {
    if (!raw) return '';
    return raw
      .toLowerCase()
      .trim()
      .replace(/(.)\1{2,}/g, '$1$1'); // 'looove' → 'loo'
  }


  // ──────────────────────────────────────────────────────────
  //  MATCH COUNTRY — Cek apakah teks mengandung keyword negara
  //  Return: { countryName, idx } atau null
  // ──────────────────────────────────────────────────────────

  function matchCountry(normalizedText) {
    // Cek setiap negara di COMMENT_KEYWORDS
    for (var countryName in COMMENT_KEYWORDS) {
      if (!COMMENT_KEYWORDS.hasOwnProperty(countryName)) continue;

      var keywords = COMMENT_KEYWORDS[countryName];

      for (var k = 0; k < keywords.length; k++) {
        var kw = keywords[k].toLowerCase();

        // Word-boundary check: keyword harus berdiri sendiri
        // (supaya "sing" tidak match "single", "th" tidak match "the")
        var shortKw = kw.length <= 3; // keyword pendek = strict boundary
        var found   = false;

        if (shortKw) {
          // Regex word boundary untuk keyword pendek
          var pattern = new RegExp('(^|\\s|[^a-z])' + escapeRegex(kw) + '($|\\s|[^a-z])', 'i');
          found = pattern.test(normalizedText);
        } else {
          // Keyword panjang: cukup includes()
          found = normalizedText.indexOf(kw) !== -1;
        }

        if (found) {
          // Cari index negara di cfg.countries[]
          var idx = findCountryIndex(countryName);
          if (idx !== -1) {
            return { countryName: countryName, idx: idx, keyword: kw };
          }
        }
      }
    }
    return null; // Tidak ada match
  }


  // Cari index negara di array cfg.countries (dari script.js)
  function findCountryIndex(countryName) {
    if (typeof cfg === 'undefined' || !cfg.countries) return -1;
    for (var i = 0; i < cfg.countries.length; i++) {
      if (cfg.countries[i].name.toLowerCase() === countryName.toLowerCase()) {
        return i;
      }
    }
    return -1;
  }


  // Escape karakter khusus untuk dipakai dalam RegExp
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }


  // ──────────────────────────────────────────────────────────
  //  ANTI-SPAM CHECK
  //  Return: true  → boleh lanjut
  //          false → kena spam filter
  // ──────────────────────────────────────────────────────────

  function passSpamFilter(username) {
    var now = Date.now();

    // Global cooldown: delay minimum antar trigger apapun
    if (now - lastGlobalTrigger < SPAM_CONFIG.globalCooldownMs) {
      if (debugMode) console.log('[CE] ⛔ Global cooldown aktif');
      return false;
    }

    // Per-user cooldown (jika username tersedia)
    if (username && username !== 'Viewer' && username !== 'Demo') {
      var lastUser = userLastTrigger[username] || 0;
      if (now - lastUser < SPAM_CONFIG.perUserCooldownMs) {
        if (debugMode) console.log('[CE] ⛔ User cooldown:', username);
        return false;
      }
    }

    return true;
  }


  // Update timestamp setelah trigger berhasil
  function recordTrigger(username) {
    var now = Date.now();
    lastGlobalTrigger = now;
    if (username && username !== 'Viewer' && username !== 'Demo') {
      userLastTrigger[username] = now;
    }
  }


  // ──────────────────────────────────────────────────────────
  //  PROCESS QUEUE — Antrian FIFO agar tidak tumpang tindih
  // ──────────────────────────────────────────────────────────

  function enqueue(commentData) {
    // Buang komentar jika antrian sudah penuh (flood protection)
    if (processQueue.length >= SPAM_CONFIG.maxQueueSize) {
      if (debugMode) console.warn('[CE] ⚠️ Queue penuh, komentar dibuang');
      return;
    }
    processQueue.push(commentData);
    if (!queueRunning) runQueue();
  }


  function runQueue() {
    if (processQueue.length === 0) {
      queueRunning = false;
      return;
    }
    queueRunning = true;

    var item = processQueue.shift(); // Ambil dari depan
    handleComment(item);

    // Jeda antar item di antrian = global cooldown
    setTimeout(runQueue, SPAM_CONFIG.globalCooldownMs);
  }


  // ──────────────────────────────────────────────────────────
  //  HANDLE COMMENT — Inti pemrosesan satu komentar
  // ──────────────────────────────────────────────────────────

  function handleComment(data) {
    /*
      data = {
        username : string,   // Nama penonton / username TikTok
        message  : string,   // Isi komentar
        raw      : object    // Payload ntfy asli (opsional)
      }
    */

    var text    = normalizeText(data.message);
    var user    = data.username || 'Viewer';
    var match   = matchCountry(text);

    if (!match) {
      // Tidak ada negara yang cocok → abaikan
      if (debugMode) console.log('[CE] ℹ️ No match:', user, '→', text);
      return;
    }

    if (!passSpamFilter(user)) return;

    // ── TRIGGER! ─────────────────────────────────────────────
    recordTrigger(user);

    if (debugMode) {
      console.log(
        '[CE] 🚀 TRIGGER!',
        'User:', user,
        '| Msg:', data.message,
        '| Country:', match.countryName,
        '| Keyword:', match.keyword,
        '| Idx:', match.idx
      );
    }

    // Panggil moveRocket() dari script.js (TIDAK diubah)
    if (typeof window.processGift === 'function') {
      // Gunakan processGift() agar semua efek (notify, audio, dll) ikut
      window.processGift(match.idx, 'small', user);
    } else if (typeof window.moveRocket === 'function') {
      // Fallback langsung ke moveRocket()
      window.moveRocket(match.idx, 1);
    }

    // Tampilkan nama negara yang ter-trigger di status bar
    updateStatusBar(user, match.countryName, data.message);
  }


  // ──────────────────────────────────────────────────────────
  //  UPDATE UI — Tampilkan info komentar yang ter-trigger
  //  (menggunakan elemen #lgift yang sudah ada di HTML)
  // ──────────────────────────────────────────────────────────

  function updateStatusBar(user, country, message) {
    var el = document.getElementById('lgift');
    if (!el) return;
    el.textContent = '💬 ' + user + ': "' + message + '" → ' + country;
    // Auto-clear setelah 3 detik
    clearTimeout(updateStatusBar._timer);
    updateStatusBar._timer = setTimeout(function() {
      if (el) el.textContent = '';
    }, 3000);
  }


  // ──────────────────────────────────────────────────────────
  //  NTFY MESSAGE HANDLER — Dipatch dari ntfy SSE
  //  Menggantikan / melengkapi handler di script.js
  // ──────────────────────────────────────────────────────────

  function handleNtfyMessage(rawEvent) {
    try {
      var d = JSON.parse(rawEvent.data);
      if (d.event === 'keepalive') return;

      // Ambil pesan dari field yang mungkin ada
      var message  = d.message || d.title || d.body || '';
      var username = d.title   || d.tags && d.tags[0] || 'Viewer';

      // Jika message dan title sama (ntfy default), ambil message saja
      if (username === message) username = 'Viewer';

      // Masukkan ke antrian
      enqueue({ username: username, message: message, raw: d });

    } catch (err) {
      if (debugMode) console.warn('[CE] ❌ Parse error:', err);
    }
  }


  // ──────────────────────────────────────────────────────────
  //  PUBLIC API
  // ──────────────────────────────────────────────────────────

  return {
    // Panggil ini dari handler SSE di script.js (atau inject otomatis)
    handleNtfyMessage: handleNtfyMessage,

    // Masukkan komentar manual (untuk testing/debug)
    injectComment: function(message, username) {
      enqueue({
        username: username || 'Debug',
        message:  message  || '',
        raw:      null
      });
    },

    // Aktifkan/nonaktifkan log debug
    setDebug: function(val) { debugMode = !!val; },

    // Lihat antrian saat ini (debug)
    getQueue: function() { return processQueue.slice(); },

    // Reset semua cooldown (berguna setelah race reset)
    resetCooldowns: function() {
      lastGlobalTrigger = 0;
      userLastTrigger   = {};
      processQueue      = [];
      queueRunning      = false;
    }
  };

})(); // End CE module


// ════════════════════════════════════════════════════════════════
//  [4] INJECT KE NTFY EventSource YANG SUDAH ADA
//  Kita patch es.onmessage SETELAH script.js memasang handler-nya.
//  Cara: tunggu sampai `es` tersedia, lalu wrap handler-nya.
// ════════════════════════════════════════════════════════════════

(function patchNtfySSE() {

  // Tunggu sampai variabel `es` dari script.js terbentuk
  var attempts = 0;
  var maxAttempts = 40; // Max 4 detik menunggu

  var interval = setInterval(function() {
    attempts++;

    if (typeof window.es !== 'undefined' && window.es !== null) {
      clearInterval(interval);
      wrapEsHandler();
      console.log('[CE] ✅ Berhasil patch ntfy EventSource');
      return;
    }

    if (attempts >= maxAttempts) {
      clearInterval(interval);
      console.warn('[CE] ⚠️ Tidak bisa patch EventSource — pastikan connectNtfy() sudah dipanggil');
    }
  }, 100);


  function wrapEsHandler() {
    // Simpan handler lama dari script.js (agar tetap jalan)
    var originalOnMessage = window.es.onmessage;

    window.es.onmessage = function(event) {
      // Jalankan handler ASLI dulu (skor, notif, dll tetap jalan)
      if (typeof originalOnMessage === 'function') {
        try { originalOnMessage.call(this, event); } catch(e) {}
      }

      // TAMBAHAN: Routing komentar ke Comment Engine
      CE.handleNtfyMessage(event);
    };

    // Jika ntfy reconnect (setelah error), patch ulang
    var origConnect = window.connectNtfy;
    if (typeof origConnect === 'function') {
      window.connectNtfy = function() {
        origConnect.apply(this, arguments);
        // Re-patch setelah koneksi baru terbentuk
        setTimeout(function() {
          if (window.es && window.es.onmessage !== arguments.callee) {
            wrapEsHandler();
          }
        }, 500);
      };
    }
  }

})();


// ════════════════════════════════════════════════════════════════
//  [5] HOOK KE resetRace() — reset cooldown saat race ulang
// ════════════════════════════════════════════════════════════════

(function patchResetForCE() {
  var attempts = 0;
  var interval = setInterval(function() {
    attempts++;
    if (typeof window.resetRace === 'function') {
      clearInterval(interval);

      var origReset = window.resetRace;
      window.resetRace = function() {
        origReset.apply(this, arguments);
        CE.resetCooldowns();
        console.log('[CE] 🔄 Cooldown direset bersama race reset');
      };
    }
    if (attempts > 30) clearInterval(interval);
  }, 100);
})();


// ════════════════════════════════════════════════════════════════
//  [6] FUNGSI SIMULASI / DEBUG — pakai di browser console
//
//  Contoh penggunaan:
//    simulateComment("indo")              → Indonesia move
//    simulateComment("go team viet!", "BudiViewer")
//    simulateComment("thai")             → Thailand move
//    batchSimulate(["indo","viet","malay","thai"], 400)
// ════════════════════════════════════════════════════════════════

window.simulateComment = function(message, username) {
  CE.injectComment(message, username || 'SimUser');
  console.log('[CE] 🎮 Simulate:', message, '→', username || 'SimUser');
};

// Simulasi beberapa komentar berurutan dengan delay antar komentar
window.batchSimulate = function(messages, delayMs) {
  delayMs = delayMs || 400;
  messages.forEach(function(msg, i) {
    setTimeout(function() {
      simulateComment(msg, 'User' + (i + 1));
    }, i * delayMs);
  });
};

// Aktifkan/nonaktifkan log debug dari console
window.ceDebug = function(on) {
  CE.setDebug(on !== false);
  console.log('[CE] Debug mode:', on !== false ? 'ON' : 'OFF');
};

// Lihat antrian saat ini
window.ceQueue = function() {
  console.table(CE.getQueue());
};


// ════════════════════════════════════════════════════════════════
//  [7] KEYWORD HELPER — Tambah keyword baru saat runtime
//
//  Contoh:
//    addKeyword('Indonesia', 'nkri')
//    addKeyword('Vietnam',   'hanoi')
// ════════════════════════════════════════════════════════════════

window.addKeyword = function(countryName, keyword) {
  if (!COMMENT_KEYWORDS[countryName]) {
    COMMENT_KEYWORDS[countryName] = [];
  }
  var kw = keyword.toLowerCase().trim();
  if (COMMENT_KEYWORDS[countryName].indexOf(kw) === -1) {
    COMMENT_KEYWORDS[countryName].push(kw);
    console.log('[CE] ➕ Keyword ditambahkan:', countryName, '←', kw);
  } else {
    console.log('[CE] ℹ️ Keyword sudah ada:', kw);
  }
};

// Lihat semua keyword yang terdaftar
window.listKeywords = function() {
  console.table(COMMENT_KEYWORDS);
};


// ════════════════════════════════════════════════════════════════
//  INIT LOG
// ════════════════════════════════════════════════════════════════

console.log(
  '%c[CE] Comment Engine v1.0 loaded',
  'color:#00cfff;font-weight:bold;font-size:13px'
);
console.log(
  '[CE] Negara terdaftar:',
  Object.keys(COMMENT_KEYWORDS).join(', ')
);
console.log(
  '[CE] Debug commands: simulateComment(msg), batchSimulate([msgs]), addKeyword(country, kw), listKeywords()'
);