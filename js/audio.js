/* =========================================================================
 * audio.js — 总线 / 材质打击音 / 程序化 BGM
 *
 * 纯 Web Audio 实时合成，零素材文件：file:// 下不碰任何 fetch / XHR，
 * 因此没有 CORS 问题，也不引入任何版权素材（README 承诺项）。
 *
 * 三层结构：
 *   总线路由  sfx / music / amb → compressor → master → destination
 *   打击音    瞬态 + 材质主体 + 低频尾，按武器材质分流，全部带随机化
 *   BGM       drone / 节奏 / 氛围 三层，随波次升档，随血量与 BOSS 硬直动态压缩
 *
 * 降级：无 AudioContext 时所有导出函数都是安全空转，调用方不需要判空。
 * 无 AudioContext 但调用方仍要出声 → 由 index.html 内的旧合成器兜底。
 * ========================================================================= */
(function (global) {
  "use strict";

  var AC = null, master = null, comp = null;
  var bus = {};                       /* sfx / music / amb */
  var inited = false, muted = false;
  var VOL = { sfx: 0.85, music: 0.42, amb: 0.30 };

  /* ---------------------------------------------------------------- 基础 */

  function nowMs() {
    return (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function jit(v, p) {                /* 音高/时长抖动：打散重复感与相位干涉 */
    return v * (1 + (Math.random() * 2 - 1) * p);
  }

  /* ---------------------------------------------------------------- 总线 */

  function ctx() {
    if (inited) {
      if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
      return AC;
    }
    inited = true;
    try {
      var Ctor = global.AudioContext || global.webkitAudioContext;
      if (!Ctor) return null;
      AC = new Ctor();

      comp = AC.createDynamicsCompressor();
      comp.threshold.value = -14;     /* 多音同帧叠加时防削波，比什么都重要 */
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;

      master = AC.createGain();
      master.gain.value = muted ? 0 : 1;

      comp.connect(master);
      master.connect(AC.destination);

      ["sfx", "music", "amb"].forEach(function (k) {
        bus[k] = AC.createGain();
        bus[k].gain.value = VOL[k];
        bus[k].connect(comp);
      });

      /* music 总线挂一个低通，用于「血少闷下去 / BOSS 硬直抽掉高频」 */
      musicLP = AC.createBiquadFilter();
      musicLP.type = "lowpass";
      musicLP.frequency.value = 6200;
      musicLP.Q.value = 0.6;
      bus.music.disconnect();
      bus.music.connect(musicLP);
      musicLP.connect(comp);

      armFirstGesture();
    } catch (e) {
      AC = null;
    }
    return AC;
  }

  var musicLP = null;

  /* 首次手势解锁：file:// 下自动播放策略要求一次用户交互 */
  function armFirstGesture() {
    if (armFirstGesture.done) return;
    armFirstGesture.done = true;
    var kick = function () {
      if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
      global.removeEventListener("pointerdown", kick);
      global.removeEventListener("keydown", kick);
    };
    global.addEventListener("pointerdown", kick);
    global.addEventListener("keydown", kick);
  }

  /* ------------------------------------------------- 复音上限与节流 */
  /* 同类音效同帧最多 N 个、两次之间至少间隔 gap 毫秒。
     没有这一层，双人连打 + 十来个敌人同帧受击会削波成一团白噪。 */
  var lastAt = {}, live = {};

  function gate(kind, gap, poly) {
    var t = nowMs();
    if (lastAt[kind] && t - lastAt[kind] < gap) return false;
    if ((live[kind] || 0) >= poly) return false;
    lastAt[kind] = t;
    live[kind] = (live[kind] || 0) + 1;
    global.setTimeout(function () {
      live[kind] = Math.max(0, (live[kind] || 1) - 1);
    }, 260);
    return true;
  }

  /* ---------------------------------------------------------------- 发声 */
  /* spec: { f|noise, to, type, dur, gain, atk, hp, lp, bp, q, fs, pan, bus, delay } */
  function voice(spec) {
    var a = ctx();
    if (!a || !spec) return;

    var dur = Math.max(0.01, spec.dur || 0.1);
    var t0 = a.currentTime + (spec.delay || 0);
    var src, node;

    if (spec.noise) {
      var n = Math.max(2, Math.floor(a.sampleRate * dur));
      var buf = a.createBuffer(1, n, a.sampleRate);
      var d = buf.getChannelData(0);
      var curve = spec.curve || 2.2;
      for (var i = 0; i < n; i++) {
        var x = i / n;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, curve);
      }
      src = a.createBufferSource();
      src.buffer = buf;
    } else {
      src = a.createOscillator();
      src.type = spec.type || "sine";
      var f0 = spec.f || 440;
      src.frequency.setValueAtTime(f0, t0);
      if (spec.to) src.frequency.exponentialRampToValueAtTime(spec.to, t0 + dur);
    }
    node = src;

    /* 滤波器：静止截止 + 可选扫频（扫频才有刀刃划过的空间感） */
    var ft = spec.bp ? "bandpass" : (spec.hp ? "highpass" : (spec.lp ? "lowpass" : null));
    if (ft) {
      var f = a.createBiquadFilter();
      f.type = ft;
      f.frequency.setValueAtTime(spec.hp || spec.lp || spec.bp, t0);
      if (spec.fs) f.frequency.exponentialRampToValueAtTime(spec.fs, t0 + dur);
      f.Q.value = spec.q || 0.7;
      node.connect(f);
      node = f;
    }

    if (spec.pan && a.createStereoPanner) {
      var p = a.createStereoPanner();
      p.pan.value = clamp(spec.pan, -1, 1);
      node.connect(p);
      node = p;
    }

    var g = a.createGain();
    var peak = Math.max(0.0002, spec.gain || 0.05);
    var atk = Math.max(0.001, spec.atk || 0.004);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    node.connect(g);
    g.connect(bus[spec.bus || "sfx"] || bus.sfx);
    src.start(t0);
    src.stop(t0 + dur + 0.06);
  }

  /* ---------------------------------------------- 兼容旧调用：tone / noise */
  function tone(f, dur, type, gain, to) {
    voice({ f: f, dur: dur, type: type, gain: gain, to: to });
  }

  function noise(dur, gain, hp) {
    voice({ noise: 1, dur: dur, gain: gain, hp: hp || 1200 });
  }

  /* ---------------------------------------------------------------- 材质 */
  /* 武器 key → 材质。玉、骨不共振（钝而干）；青铜靠非整数泛音比才有金属感；
     锤是低频土腥（砸进夯土），不是敲铁。 */
  var MATERIAL = {
    fist: "flesh",
    short: "jade",    dagger: "jade",
    sword: "metal",   axe: "metal",   spear: "metal",
    hammer: "heavy",
    bow: "string",
    rock: "heavy",    blade: "jade",  jar: "clay",  bell: "bell"
  };

  var material = "jade";              /* 本次挥砍的材质，由 swing(key) 设置 */

  function matOf(key) {
    return MATERIAL[key] || "jade";
  }

  /* 打击音配方：一层瞬态 + 一层材质主体 + 低频尾。
     低频尾由调用方按 hitstop 拉长，让「顿帧多久、尾巴多久」对齐。 */
  function impact(mat, big, weak) {
    var g = 1, pitch = 1;
    if (weak) { g = 1.25; pitch = 1.06; }
    else if (big) { g = 1.35; pitch = 0.94; }

    if (!gate("hit", 22, 4)) return;

    if (mat === "metal") {
      var f0 = jit(660, 0.06) * pitch;
      voice({ noise: 1, dur: 0.011, hp: 5200, gain: 0.05 * g, curve: 3 });
      voice({ noise: 1, dur: 0.055, bp: 1800, q: 1.1, gain: 0.045 * g, curve: 2.6, fs: 900 });
      voice({ f: f0, dur: 0.13, type: "triangle", gain: 0.042 * g, to: f0 * 0.75 });
      voice({ f: f0 * 2.37, dur: 0.095, type: "triangle", gain: 0.026 * g, to: f0 * 1.7 });
      voice({ f: f0 * 3.71, dur: 0.06, type: "sine", gain: 0.014 * g, to: f0 * 2.6 });
      voice({ f: jit(62, 0.1), dur: 0.12, type: "sine", gain: 0.022 * g });

    } else if (mat === "jade") {
      voice({ noise: 1, dur: 0.008, hp: 3600, gain: 0.038 * g, curve: 3 });
      voice({ noise: 1, dur: 0.05, bp: 1150, q: 1.4, gain: 0.05 * g, curve: 2.6, fs: 620 });
      voice({ f: jit(300, 0.07) * pitch, dur: 0.055, type: "sine", gain: 0.042 * g, to: 172 });

    } else if (mat === "heavy") {
      voice({ noise: 1, dur: 0.016, hp: 2600, gain: 0.042 * g });
      voice({ noise: 1, dur: 0.13, lp: 420, gain: 0.065 * g, curve: 2, fs: 180 });
      voice({ f: jit(96, 0.08), dur: 0.17, type: "sine", gain: 0.07 * g, to: 45 });
      voice({ f: jit(150, 0.06), dur: 0.09, type: "triangle", gain: 0.03 * g, to: 88 });

    } else if (mat === "clay") {
      voice({ noise: 1, dur: 0.02, hp: 2000, gain: 0.04 * g });
      voice({ noise: 1, dur: 0.09, bp: 700, q: 1.8, gain: 0.055 * g, curve: 2.4 });
      voice({ f: jit(240, 0.1), dur: 0.07, type: "sine", gain: 0.035 * g, to: 140 });

    } else if (mat === "bell") {
      var b0 = jit(980, 0.04);
      voice({ f: b0, dur: 0.26, type: "sine", gain: 0.03 * g, to: b0 * 0.98 });
      voice({ f: b0 * 1.41, dur: 0.18, type: "sine", gain: 0.018 * g });
      voice({ noise: 1, dur: 0.008, hp: 5000, gain: 0.03 * g });

    } else if (mat === "flesh") {
      voice({ noise: 1, dur: 0.012, bp: 700, q: 0.9, gain: 0.045 * g });
      voice({ f: jit(210, 0.08) * pitch, dur: 0.08, type: "sine", gain: 0.042 * g, to: 105 });

    } else { /* string */
      voice({ noise: 1, dur: 0.006, hp: 4200, gain: 0.03 * g });
      voice({ f: jit(520, 0.05), dur: 0.05, type: "triangle", gain: 0.03 * g, to: 340 });
    }

    /* 低频尾：坑底三十米的驻波，顿帧越久尾巴越长 */
    var hs = (global.G && global.G.hitstop) || 0.04;
    voice({ f: 58, dur: 0.04 + hs * 2.5, type: "sine", gain: 0.026 * g, lp: 180 });

    /* 重击再压一层次低频：钺、锤、爆炸才有的「胸口被推一下」 */
    if (big) voice({ f: 44, dur: 0.26, type: "sine", gain: 0.055, bus: "sfx" });

    /* 命中确认针：固定音高、不随机。格斗游戏里最可靠的「打中了」信号 */
    if (!weak) voice({ f: 1660, dur: 0.014, type: "square", gain: 0.028, atk: 0.002 });
    if (weak) voice({ f: 1980, dur: 0.02, type: "square", gain: 0.03, atk: 0.002 });
  }

  /* ---------------------------------------------------------------- 音效 */

  /* 空挥：带扫频的「唰」，长兵器更宽更慢 */
  function swing(key) {
    if (key !== undefined) material = matOf(key);
    if (!gate("swing", 32, 3)) return;
    var heavy = (material === "heavy" || material === "metal");
    var dur = heavy ? 0.13 : 0.09;
    var pan = (global.G && global.G.p1)
      ? clamp((global.G.p1.x - (global.G.camX || 0) - 800) / 900, -0.7, 0.7) : 0;
    voice({ noise: 1, dur: dur, bp: heavy ? 2600 : 3200, q: 1.1,
            gain: heavy ? 0.062 : 0.05, curve: 2.4, fs: heavy ? 700 : 1000, pan: pan });
  }

  function hit(opts) {
    opts = opts || {};
    impact(opts.mat || material, !!opts.big, !!opts.weak);
  }

  function jump() {
    if (!gate("jump", 60, 2)) return;
    voice({ f: jit(430, 0.06), dur: 0.08, type: "sine", gain: 0.035, to: 640 });
    voice({ noise: 1, dur: 0.03, hp: 2600, gain: 0.016 });
  }

  function hurt() {
    if (!gate("hurt", 80, 2)) return;
    voice({ f: 150, dur: 0.24, type: "sawtooth", gain: 0.07, to: 68, lp: 900 });
    voice({ noise: 1, dur: 0.1, bp: 1300, q: 1.2, gain: 0.04 });
  }

  function die() {
    voice({ f: 200, dur: 0.3, type: "triangle", gain: 0.055, to: 58, lp: 700 });
    voice({ noise: 1, dur: 0.22, lp: 900, gain: 0.05, curve: 1.8 });
    voice({ f: 46, dur: 0.34, type: "sine", gain: 0.05 });
  }

  function pickup() {
    voice({ f: 660, dur: 0.12, type: "square", gain: 0.045, to: 880 });
  }

  function chest() {
    if (!gate("chest", 120, 2)) return;
    voice({ f: 120, dur: 0.3, type: "sawtooth", gain: 0.07, to: 55, lp: 800 });
    voice({ noise: 1, dur: 0.16, bp: 900, q: 1.4, gain: 0.06, curve: 2, fs: 400 });
    [523, 659, 784].forEach(function (f, i) {
      voice({ f: f, dur: 0.22, type: "triangle", gain: 0.03, delay: 0.04 + i * 0.055 });
    });
  }

  function breakWeapon() {
    voice({ noise: 1, dur: 0.05, hp: 4200, gain: 0.05, curve: 3 });
    voice({ noise: 1, dur: 0.16, bp: 2200, q: 1.6, gain: 0.055, curve: 2, fs: 800 });
    voice({ f: 240, dur: 0.18, type: "square", gain: 0.05, to: 110, lp: 1400 });
  }

  function explode(big) {
    if (!gate("boom", 70, 2)) return;
    voice({ noise: 1, dur: big ? 0.34 : 0.18, lp: big ? 600 : 1100,
            gain: big ? 0.11 : 0.07, curve: 1.7, fs: 140 });
    voice({ f: big ? 62 : 84, dur: big ? 0.4 : 0.22, type: "sine", gain: big ? 0.1 : 0.06, to: 34 });
  }

  function wave() {
    /* 每阵开场三音动机（徵—羽—宫），同时把 BGM 升到本阵档位 */
    [392, 523, 659].forEach(function (f, i) {
      voice({ noise: 0, f: f, dur: 0.4, type: "sine", gain: 0.045, delay: i * 0.11,
              lp: 2400 });
    });
    voice({ f: 196, dur: 0.6, type: "triangle", gain: 0.03, delay: 0.02, lp: 700 });
    bgmSetWave();
  }

  function win() {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) {
      voice({ f: f, dur: 0.6, type: "sine", gain: 0.05, delay: i * 0.15, lp: 3200 });
    });
    bgmStop(1.2);
  }

  function lose() {
    [330, 262, 208, 165].forEach(function (f, i) {
      voice({ f: f, dur: 0.5, type: "triangle", gain: 0.055, delay: i * 0.18, lp: 1200 });
    });
    bgmStop(1.0);
  }

  /* ================================================================ BGM */
  /* 三层：drone（低频床）/ pulse（心跳与铜鼓）/ color（稀疏五声）。
     全部程序生成，随波次升档；血量低抽高频、BOSS 硬直时把音乐压下去。 */

  var bgm = {
    on: false, timer: 0, nextT: 0, step: 0, tier: 0, bpm: 60,
    breathe: false, tierLock: false
  };
  var droneNodes = null;

  /* 徵调五声：D F G A C —— 用调式不用大小调，避开「西方史诗」味 */
  var SCALE = [293.66, 349.23, 392.0, 440.0, 523.25];

  function bgmTier() {
    var g = global.G;
    if (!g || !g.waves || !g.waves.length) return 0;
    var i = g.waveIdx || 0;
    if (i >= g.waves.length - 1) return 3;      /* BOSS */
    if (i >= 4) return 3;
    if (i >= 2) return 2;
    if (i >= 1) return 1;
    return 0;
  }

  function startDrone() {
    var a = ctx();
    if (!a || droneNodes) return;
    var g = a.createGain();
    g.gain.value = 0.0001;
    var lp = a.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 210;
    lp.Q.value = 0.9;

    var o1 = a.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 55;      /* A1 */
    var o2 = a.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 82.41;   /* E2 */
    var g2 = a.createGain(); g2.gain.value = 0.5;

    /* 呼吸：0.07Hz 的慢 LFO 调制截止频率 */
    var lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
    var lfoGain = a.createGain(); lfoGain.gain.value = 42;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);

    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(bus.music);
    o1.start(); o2.start(); lfo.start();
    g.gain.exponentialRampToValueAtTime(0.16, a.currentTime + 1.6);

    droneNodes = { o1: o1, o2: o2, lfo: lfo, gain: g, lp: lp };
  }

  function stopDrone(fade) {
    var a = AC;
    if (!a || !droneNodes) return;
    var d = droneNodes;
    droneNodes = null;
    try {
      d.gain.gain.cancelScheduledValues(a.currentTime);
      d.gain.gain.setValueAtTime(Math.max(0.0002, d.gain.gain.value), a.currentTime);
      d.gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + (fade || 0.8));
      global.setTimeout(function () {
        try { d.o1.stop(); d.o2.stop(); d.lfo.stop(); } catch (e) {}
      }, (fade || 0.8) * 1000 + 120);
    } catch (e) {}
  }

  function kick() {
    voice({ f: jit(62, 0.06), dur: 0.34, type: "sine", gain: 0.085, to: 38, bus: "music", lp: 220 });
  }

  function gong() {
    var b0 = jit(1080, 0.02);
    voice({ f: b0, dur: 1.5, type: "sine", gain: 0.028, to: b0 * 0.97, bus: "music", lp: 5200 });
    voice({ f: b0 * 1.414, dur: 1.0, type: "sine", gain: 0.014, bus: "music", lp: 4200 });
    voice({ f: b0 * 2.09, dur: 0.6, type: "sine", gain: 0.01, bus: "music", lp: 3800 });
  }

  function pluck() {
    var f = SCALE[(Math.random() * SCALE.length) | 0];
    voice({ f: f, dur: 0.5, type: "triangle", gain: 0.022, bus: "music",
            lp: 1800, atk: 0.008,
            pan: (Math.random() * 2 - 1) * 0.4 });
    voice({ f: f * 2, dur: 0.28, type: "sine", gain: 0.008, bus: "music", lp: 2600 });
  }

  function bgmTick() {
    var a = ctx();
    if (!a || !bgm.on) return;

    var tier = bgmTier();
    if (tier !== bgm.tier) {
      bgm.tier = tier;
      bgm.bpm = [60, 68, 76, 88][Math.min(3, tier)];
      /* BOSS 档：drone 上移，与小二度打对子制造压迫 */
      if (droneNodes) {
        try {
          droneNodes.o2.frequency.setTargetAtTime(
            tier >= 3 ? 116.54 : 82.41, a.currentTime, 1.2);
        } catch (e) {
          droneNodes.o2.frequency.value = tier >= 3 ? 116.54 : 82.41;
        }
      }
    }

    /* 喘息期：节奏层整个撤掉，只留 drone。下一阵鼓点回来才有力量。
       bpm 必须在这里一起算，否则 bgmBreathe 设的 44 会被上面的档位覆盖。 */
    var beat = 60 / (bgm.breathe ? 44 : bgm.bpm);
    var lookahead = a.currentTime + 0.25;

    while (bgm.nextT < lookahead) {
      var s = bgm.step;
      var delay = Math.max(0, bgm.nextT - a.currentTime);

      if (bgm.breathe) {
        /* 只留一层极稀疏的氛围音，把空间让给呼吸 */
        if (s % 8 === 0 && Math.random() < 0.6) schedulePluck(delay);
      } else if (tier <= 1) {
        if (s % 4 === 0) scheduleKick(delay);
      } else if (tier === 2) {
        if (s % 2 === 0) scheduleKick(delay);
        if (s % 8 === 4) scheduleGong(delay);
        if (s % 4 === 2 && Math.random() < 0.5) schedulePluck(delay);
      } else {
        if (s % 2 === 0) scheduleKick(delay);
        if (s % 4 === 2) scheduleGong(delay);
        if (s % 2 === 1 && Math.random() < 0.7) schedulePluck(delay);
      }

      bgm.step = (bgm.step + 1) % 32;
      bgm.nextT += beat / 2;
    }

    /* 动态：血量见底把音乐闷下去；BOSS 硬直窗口把音乐让出去；
       喘息期只留 drone（bgm.breathe）—— 这一档必须参与计算，
       否则下一帧 tick 会把 breathe 压下去的音量又改回满。 */
    var g = global.G;
    var duck = 1, cut = 6200;
    if (bgm.breathe) { duck = 0.45; cut = 1600; }
    if (g) {
      var lowHp = false;
      [g.p1, g.p2].forEach(function (p) { if (p && !p.dead && p.hp <= 2) lowHp = true; });
      var stagger = false;
      if (g.enemies) {
        for (var i = 0; i < g.enemies.length; i++) {
          var e = g.enemies[i];
          if (e.kind === "boss" && e.state === "recover") { stagger = true; break; }
        }
      }
      if (stagger) { duck = 0.32; cut = 900; }          /* 硬直窗口：把舞台让给打击音 */
      else if (lowHp) { duck = Math.min(duck, 0.72); cut = Math.min(cut, 620); }
    }
    try {
      bus.music.gain.setTargetAtTime(VOL.music * duck, a.currentTime, 0.18);
      if (musicLP) musicLP.frequency.setTargetAtTime(cut, a.currentTime, 0.22);
    } catch (e) {}
  }

  function scheduleKick(d) {
    voice({ f: jit(62, 0.05), dur: 0.34, type: "sine", gain: 0.08, to: 38,
            delay: d, bus: "music", lp: 220 });
  }
  function scheduleGong(d) {
    var b0 = jit(1080, 0.02);
    voice({ f: b0, dur: 1.4, type: "sine", gain: 0.026, to: b0 * 0.97,
            delay: d, bus: "music", lp: 5200 });
    voice({ f: b0 * 1.414, dur: 0.9, type: "sine", gain: 0.013, delay: d, bus: "music", lp: 4200 });
  }
  function schedulePluck(d) {
    var f = SCALE[(Math.random() * SCALE.length) | 0];
    voice({ f: f, dur: 0.5, type: "triangle", gain: 0.02, delay: d, bus: "music",
            lp: 1800, atk: 0.008, pan: (Math.random() * 2 - 1) * 0.4 });
  }

  function bgmStart() {
    var a = ctx();
    if (!a) return;
    if (bgm.on) return;
    bgm.on = true;
    bgm.step = 0;
    bgm.nextT = a.currentTime + 0.1;
    bgm.tier = -1;                  /* 强制下一次 tick 重读档位 */
    startDrone();
    if (!bgm.timer) {
      bgm.timer = global.setInterval(bgmTick, 60);
    }
    bgmTick();
  }

  function bgmStop(fade) {
    if (!bgm.on) { stopDrone(fade); return; }
    bgm.on = false;
    if (bgm.timer) { global.clearInterval(bgm.timer); bgm.timer = 0; }
    stopDrone(fade || 0.8);
  }

  /* 每阵开场：按新波次重启调度（档位在 tick 里自适应）。
     新阵开始意味着喘息结束，breathe 必须清掉，否则鼓点回不来。 */
  function bgmSetWave() {
    bgm.breathe = false;
    bgmStart();
    if (bgm.on) {
      bgm.tier = -1;
      bgm.step = 0;
      bgm.nextT = (AC ? AC.currentTime : 0) + 0.05;
    }
  }

  /* 喘息期：撤掉节奏层只留 drone —— 下一阵鼓点回来才有力量。
     只改 bgm.breathe 这个标志，音量与低通交给 bgmTick 统一结算，
     否则这里压下去、下一帧 tick 又改回满，等于没做。 */
  function bgmBreathe(on) {
    bgm.breathe = !!on;
    if (!AC) return;
    bgm.tier = -1;                  /* 让 tick 立刻按新 bpm 重排节拍 */
    bgm.step = 0;
    bgm.nextT = AC.currentTime + 0.05;
    if (!on) {
      try { bus.music.gain.setTargetAtTime(VOL.music, AC.currentTime, 0.3); } catch (e) {}
    }
  }

  /* ---------------------------------------------------------------- 导出 */

  var api = {
    ctx: ctx,
    ready: function () { return !!ctx(); },
    voice: voice,
    tone: tone,
    noise: noise,
    swing: swing,
    hit: hit,
    impact: impact,
    jump: jump,
    hurt: hurt,
    die: die,
    pickup: pickup,
    chest: chest,
    breakWeapon: breakWeapon,
    explode: explode,
    wave: wave,
    win: win,
    lose: lose,
    matOf: matOf,
    bgm: { start: bgmStart, stop: bgmStop, setWave: bgmSetWave, breathe: bgmBreathe,
           tier: bgmTier, isOn: function () { return bgm.on; },
           isBreathe: function () { return bgm.breathe; } },
    setMaterial: function (k) { material = matOf(k); return material; },
    material: function () { return material; },
    mute: function (m) {
      muted = (m === undefined) ? !muted : !!m;
      if (master) master.gain.value = muted ? 0 : 1;
      return muted;
    },
    isMuted: function () { return muted; },
    volume: function (k, v) {
      if (VOL[k] !== undefined && typeof v === "number") {
        VOL[k] = clamp(v, 0, 1);
        if (bus[k]) bus[k].gain.value = VOL[k];
      }
      return VOL[k];
    },
    suspend: function () { if (AC) { try { AC.suspend(); } catch (e) {} } },
    resume: function () { if (AC) { try { AC.resume(); } catch (e) {} } }
  };

  global.SND = api;

  /* 切后台就挂起，回来再恢复：避免切标签页期间音乐跑偏几十秒 */
  global.addEventListener("visibilitychange", function () {
    if (!AC) return;
    if (global.document && global.document.hidden) api.suspend();
    else api.resume();
  });

  /* M 静音：调试与录屏都要能一把关掉 */
  global.addEventListener("keydown", function (e) {
    if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey) api.mute();
  });

})(window);
