// ════════════════════════════════════════════════════════════════
//  ROCKET RACE LIVE — SOUND ENGINE
//  100% Web Audio API, tanpa library atau file audio eksternal
//  Semua suara di-generate secara programatik (synthesized)
// ════════════════════════════════════════════════════════════════

var SFX = (function() {

  var ctx = null;      // AudioContext
  var masterGain = null;
  var enabled = true;
  var volume = 0.55;   // master volume default (0.0 – 1.0)

  // Throttle agar suara rocket tidak terlalu sering
  var lastRocketSfx = 0;

  // ── INIT ───────────────────────────────────────────────────────
  // Web Audio harus diinisialisasi setelah user interaction
  function init() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
    } catch(e) {
      console.warn('Web Audio API tidak tersedia:', e);
      enabled = false;
    }
  }

  // Resume context jika suspended (autoplay policy browser)
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  // ── HELPER: Buat oscillator ────────────────────────────────────
  function makeOsc(type, freq, startTime, duration, gainAmt, destination) {
    var osc  = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type      = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(gainAmt, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(destination || masterGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
    return { osc: osc, gain: gain };
  }

  // ── HELPER: Buat noise (white noise burst) ──────────────────────
  function makeNoise(startTime, duration, gainAmt, destination) {
    var bufSize  = ctx.sampleRate * duration;
    var buffer   = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    var data     = buffer.getChannelData(0);
    for (var i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    var source   = ctx.createBufferSource();
    source.buffer = buffer;
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(gainAmt, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    source.connect(gain);
    gain.connect(destination || masterGain);
    source.start(startTime);
    return source;
  }

  // ── HELPER: Filter ─────────────────────────────────────────────
  function makeFilter(type, freq, destination) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.connect(destination || masterGain);
    return f;
  }

  // ══════════════════════════════════════════════════════════════
  //  SOUND DEFINITIONS
  // ══════════════════════════════════════════════════════════════

  /**
   * [1] ROCKET MOVE — Suara "whoosh" tiap roket bergerak
   * Throttled agar tidak spam
   */
  function rocketMove(intensity) {
    if (!enabled || !ctx) return;
    resume();
    var now = Date.now();
    if (now - lastRocketSfx < 80) return; // max ~12x per detik
    lastRocketSfx = now;

    var t    = ctx.currentTime;
    var gain = intensity >= 2 ? 0.18 : 0.10;

    // Whoosh: noise lewat high-pass filter
    var hpf = makeFilter('highpass', 800 + intensity * 200, masterGain);
    var src = makeNoise(t, 0.15, gain, hpf);

    // Pitch sweep naik
    var osc = ctx.createOscillator();
    var og  = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120 + intensity * 30, t);
    osc.frequency.exponentialRampToValueAtTime(280 + intensity * 60, t + 0.12);
    og.gain.setValueAtTime(0.06, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * [2] GIFT RECEIVED — "ding" koin kecil saat ada gift masuk
   */
  function giftReceived(gsize) {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    var freqMap = { small: 880, medium: 1100, big: 1320 };
    var freq    = freqMap[gsize] || 880;
    var volMap  = { small: 0.20, medium: 0.28, big: 0.35 };
    var vol     = volMap[gsize] || 0.20;

    // Ding utama
    makeOsc('sine', freq, t, 0.5, vol);
    // Overtone ringan
    makeOsc('sine', freq * 2, t, 0.3, vol * 0.3);
    // Attack transient (klik kecil)
    makeOsc('square', freq * 0.5, t, 0.04, vol * 0.15);

    // Untuk gift besar: tambah chord sukacita
    if (gsize === 'big') {
      makeOsc('sine', freq * 1.25, t + 0.04, 0.4, vol * 0.5);
      makeOsc('sine', freq * 1.5,  t + 0.08, 0.35, vol * 0.4);
    }
  }

  /**
   * [3] OVERTAKE — Fanfare pendek dramatis "dun dun DUN!"
   */
  function overtake() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // 3 nada naik cepat
    makeOsc('square', 220, t,        0.08, 0.25);
    makeOsc('square', 330, t + 0.09, 0.08, 0.25);
    makeOsc('square', 440, t + 0.18, 0.20, 0.30);

    // Sub bass impact
    makeOsc('sine', 55, t + 0.18, 0.25, 0.4);

    // Noise crack
    makeNoise(t + 0.18, 0.12, 0.15);
  }

  /**
   * [4] DRAMA MODE / FINAL SPRINT — Suara siren naik tegang
   */
  function dramaMode() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Siren sweep naik-turun 2x
    for (var i = 0; i < 2; i++) {
      var osc = ctx.createOscillator();
      var og  = ctx.createGain();
      var offset = i * 0.5;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t + offset);
      osc.frequency.linearRampToValueAtTime(800, t + offset + 0.4);
      og.gain.setValueAtTime(0.20, t + offset);
      og.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.45);
      osc.connect(og);
      og.connect(masterGain);
      osc.start(t + offset);
      osc.stop(t + offset + 0.5);
    }

    // Tambah low rumble
    makeOsc('sine', 40, t, 0.9, 0.3);
  }

  /**
   * [5] HYPE MODE — Suara crowd/rave stutter pendek
   */
  function hypeMode() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Rapid stutter: 6 pulse cepat
    for (var i = 0; i < 6; i++) {
      var freq = 200 + i * 80;
      makeOsc('square', freq, t + i * 0.05, 0.04, 0.18);
    }

    // Noise burst
    makeNoise(t, 0.08, 0.12);
    makeNoise(t + 0.25, 0.06, 0.10);

    // High synth hit
    makeOsc('sine', 1200, t + 0.28, 0.3, 0.22);
  }

  /**
   * [6] CLUTCH MOMENT — Suara "waktu melambat" (pitch drop + heartbeat)
   */
  function clutchMoment() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Pitch drop dramatis
    var osc = ctx.createOscillator();
    var og  = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.6);
    og.gain.setValueAtTime(0.3, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.65);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.7);

    // Heartbeat (dub-dub)
    makeOsc('sine', 60, t + 0.05, 0.12, 0.35);
    makeOsc('sine', 55, t + 0.18, 0.10, 0.30);
    makeOsc('sine', 60, t + 0.50, 0.12, 0.35);
    makeOsc('sine', 55, t + 0.63, 0.10, 0.30);

    // Speed-up sound setelah slow-mo
    var osc2 = ctx.createOscillator();
    var og2  = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(80, t + 0.65);
    osc2.frequency.exponentialRampToValueAtTime(500, t + 0.95);
    og2.gain.setValueAtTime(0.0001, t + 0.65);
    og2.gain.linearRampToValueAtTime(0.25, t + 0.70);
    og2.gain.exponentialRampToValueAtTime(0.0001, t + 0.96);
    osc2.connect(og2);
    og2.connect(masterGain);
    osc2.start(t + 0.65);
    osc2.stop(t + 1.0);
  }

  /**
   * [7] NEAR FINISH — Jantung berdegup makin cepat saat dekat finish
   * Dipanggil setiap kali rocket masuk 80%+ zone
   */
  function nearFinish() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Tick tegang
    makeOsc('square', 800, t,       0.03, 0.15);
    makeOsc('square', 700, t + 0.04, 0.03, 0.12);
  }

  /**
   * [8] MICRO EVENT / RANDOM EVENT — Suara "zap" listrik
   */
  function microEvent() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Electric zap
    var osc = ctx.createOscillator();
    var og  = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2000, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.2);
    og.gain.setValueAtTime(0.20, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(og);
    og.connect(masterGain);
    osc.start(t);
    osc.stop(t + 0.25);

    makeNoise(t, 0.1, 0.08);
  }

  /**
   * [9] WINNER — Fanfare kemenangan meriah (4 bar)
   */
  function winner() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Melodi fanfare: C E G C' E' G' C''
    var melody = [
      { freq: 523.25, time: 0.00, dur: 0.15 },  // C5
      { freq: 659.25, time: 0.15, dur: 0.15 },  // E5
      { freq: 783.99, time: 0.30, dur: 0.15 },  // G5
      { freq: 1046.5, time: 0.45, dur: 0.30 },  // C6
      { freq: 1318.5, time: 0.75, dur: 0.15 },  // E6
      { freq: 1567.9, time: 0.90, dur: 0.15 },  // G6
      { freq: 2093.0, time: 1.05, dur: 0.60 },  // C7
    ];
    melody.forEach(function(n) {
      makeOsc('square', n.freq, t + n.time, n.dur, 0.18);
      makeOsc('sine',   n.freq, t + n.time, n.dur + 0.1, 0.12);
    });

    // Bass boom di awal
    makeOsc('sine', 65, t, 0.8, 0.5);
    makeNoise(t, 0.15, 0.20);

    // Bell shimmer di akhir
    for (var i = 0; i < 8; i++) {
      makeOsc('sine',
        1200 + Math.random() * 800,
        t + 1.0 + i * 0.07,
        0.4,
        0.08
      );
    }
  }

  /**
   * [10] RESET / COUNTDOWN — Suara "ready, set, go!" beep
   */
  function raceReset() {
    if (!enabled || !ctx) return;
    resume();
    var t = ctx.currentTime;

    // Beep pendek × 2 lalu beep panjang
    makeOsc('sine', 440, t + 0.0, 0.12, 0.25);
    makeOsc('sine', 440, t + 0.2, 0.12, 0.25);
    makeOsc('sine', 880, t + 0.4, 0.35, 0.35);

    // Noise swoosh start
    makeNoise(t + 0.4, 0.2, 0.12);
  }

  /**
   * [11] CONFETTI burst — Suara "pop pop pop" kecil
   */
  var lastConfettiSfx = 0;
  function confettiPop() {
    if (!enabled || !ctx) return;
    resume();
    var now2 = Date.now();
    if (now2 - lastConfettiSfx < 120) return;
    lastConfettiSfx = now2;

    var t = ctx.currentTime;
    makeNoise(t, 0.06, 0.15);
    makeOsc('sine', 600 + Math.random() * 400, t, 0.08, 0.10);
  }

  // ══════════════════════════════════════════════════════════════
  //  VOLUME CONTROL
  // ══════════════════════════════════════════════════════════════

  function setVolume(val) {
    volume = Math.max(0, Math.min(1, val));
    if (masterGain) masterGain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }

  function toggleMute() {
    enabled = !enabled;
    if (masterGain) masterGain.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, 0.05);
    return enabled;
  }

  function isMuted() { return !enabled; }

  // ── PUBLIC API ────────────────────────────────────────────────
  return {
    init:        init,
    rocketMove:  rocketMove,
    giftReceived: giftReceived,
    overtake:    overtake,
    dramaMode:   dramaMode,
    hypeMode:    hypeMode,
    clutchMoment: clutchMoment,
    nearFinish:  nearFinish,
    microEvent:  microEvent,
    winner:      winner,
    raceReset:   raceReset,
    confettiPop: confettiPop,
    setVolume:   setVolume,
    toggleMute:  toggleMute,
    isMuted:     isMuted
  };

})();