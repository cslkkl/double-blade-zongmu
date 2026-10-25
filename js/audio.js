/* =========================================================================
 * audio.js — 总线 / 材质打击音 / 外部音轨 BGM（+ 程序化兜底）
 *
 * 打击音全是 Web Audio 实时合成，不碰 fetch / XHR。
 * BGM 读 assets/audio/bgm-main.mp3，用 <audio> 元素播放 —— 媒体元素属于
 * 文档子资源，file:// 直开能播；decodeAudioData 那条路在 file:// 下拿不到
 * 字节（fetch / XHR 被 CORS 拦），所以不走它。
 *
 * 三层结构：
 *   总线路由  sfx / music / amb → compressor → master → destination
 *   打击音    瞬态 + 材质主体 + 低频尾，按武器材质分流，全部带随机化
 *   BGM       外部音轨优先；音轨缺席 / 被拒播 / 文件缺失时整条退回
 *             drone / 节奏 / 氛围 三层程序化合成，随波次升档
 *
 * 降级：无 AudioContext 时所有导出函数都是安全空转，调用方不需要判空。
 * 无 AudioContext 但调用方仍要出声 → 由 index.html 内的旧合成器兜底。
 * 无 Audio 构造器 / 音轨加载失败 → 走程序化 BGM（bgm* 那套），不会静音。
 * ========================================================================= */
(function (global) {
  "use strict";

  var AC = null, master = null, comp = null;
  var bus = {};                       /* sfx / music / amb */
  var inited = false, muted = false;
  /* 主增益：总线之后的最后一道。压缩器已经把峰值摁住了，
     这里可以放心往上推一点，把整体响度提上来而不削波。 */
  var MASTER = 1.25;
  /* 三条总线的默认音量。整场声音就靠这三个数定「响不响」，
     音色配方（gain 字段）只管单条声音的相对轻重。
     sfx 顶到 1.0：再高总线会先削波，压缩器也就没得救了；
     music 比 sfx 低一档是刻意的 —— 音乐垫在下面，打击声才浮得出来。 */
  var VOL = { sfx: 1.00, music: 0.58, amb: 0.40 };

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
      /* 阈值抬到 -12、比率提到 8：总线音量整体提高之后，
         峰值更容易顶到压缩区，靠这条曲线把过冲摁回去，
         比「小音量时不压缩、大音量时狂压缩」稳。 */
      comp.threshold.value = -12;     /* 多音同帧叠加时防削波，比什么都重要 */
      comp.knee.value = 10;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.14;

      master = AC.createGain();
      master.gain.value = muted ? 0 : MASTER;

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

      /* 混响替身：一根带回授的延时线挂在 music 支路上。
         祭祀坑是石头坑，声音该有回响；没有 Convolver 就用延时近似。
         老浏览器没有 createDelay 就整段跳过，音效与 BGM 不受影响。 */
      if (AC.createDelay) {
        try {
          musicDelay = AC.createDelay(2.0);
          musicDelay.delayTime.value = 0.37;      /* 附点八分 */
          musicWet = AC.createGain();
          musicWet.gain.value = 0.22;
          musicFb = AC.createGain();
          musicFb.gain.value = 0.26;
          musicLP.connect(musicDelay);
          musicDelay.connect(musicWet);
          musicWet.connect(comp);
          musicDelay.connect(musicFb);
          musicFb.connect(musicDelay);
        } catch (e) {
          musicDelay = null; musicWet = null; musicFb = null;
        }
      }

      armFirstGesture();
    } catch (e) {
      AC = null;
    }
    return AC;
  }

  var musicLP = null, musicDelay = null, musicWet = null, musicFb = null;

  /* 首次手势解锁：file:// 下自动播放策略要求一次用户交互 */
  function armFirstGesture() {
    if (armFirstGesture.done) return;
    armFirstGesture.done = true;
    var kick = function () {
      if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
      /* 音轨被自动播放策略拒过：手势来了再试一次，这一次一定在手势栈里 */
      if (media.want && media.el && media.el.paused) mediaTryPlay(media.el);
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

  /* ==================================================== 外部音轨（BGM 素材）*/
  /* 背景音乐读 assets/audio/bgm-main.mp3。为什么是 <audio> 而不是
     decodeAudioData：file:// 下 fetch / XHR 取本地音频会被 CORS 拦，
     decodeAudioData 连字节都拿不到；媒体元素是文档子资源，file:// 直开能播。

     代价：元素绕开了 WebAudio 总线，所以 VOL.music / MASTER / 静音闸 /
     喘息与低血压音都要在 mediaLevel() 里手动折进元素的 volume —— 别在别处
     直接写 el.volume，下一拍就会被看护定时器按媒体电平覆盖回去。

     降级：没有 Audio 构造器 / 元素 error / 文件缺失 → media.dead，
     bgmStart() 那一层退回程序化 BGM，BGM 一定有声这条仍然成立。 */
  var MEDIA_SRC = "assets/audio/bgm-main.mp3";
  var MEDIA_TRIM = 0.92;          /* 母带自己压过一遍，元素音量只做轻微让位 */
  var media = { el: null, on: false, want: false, dead: false, timer: 0 };

  function mediaEl() {
    if (media.dead) return null;
    if (media.el) return media.el;
    if (!global.Audio) { media.dead = true; return null; }
    try {
      var el = new global.Audio();
      el.src = MEDIA_SRC;
      el.loop = true;                 /* 22 秒循环素材够用，整段就是一首曲子 */
      el.preload = "auto";
      /* 404 / 解码失败 / file:// 被拦：整条音轨作废，交给程序化 BGM 接管 */
      el.addEventListener("error", function () {
        media.dead = true;
        media.on = false;
        media.want = false;
      });
      media.el = el;
    } catch (e) {
      media.dead = true;
      return null;
    }
    return media.el;
  }

  /* 元素最终音量：静音闸 → 喘息 / 低血 / BOSS 硬直压音 → VOL.music × MASTER。
     这一步与 bgmTick 里那套 duck 是同一套判据，不能各写一份不同口径的。 */
  function mediaLevel() {
    if (muted) return 0;
    var duck = 1;
    if (bgm.breathe) duck = 0.45;
    var g = global.G;
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
      if (stagger) duck = 0.32;               /* 硬直窗口把舞台让给打击音 */
      else if (lowHp) duck = Math.min(duck, 0.72);
    }
    return clamp(VOL.music * MASTER * MEDIA_TRIM * duck, 0, 1);
  }

  function mediaApply() {
    var el = media.el;
    if (!el) return;
    try { el.volume = mediaLevel(); } catch (e) {}
  }

  function mediaTryPlay(el) {
    var p = null;
    try { p = el.play(); } catch (e) { p = null; }
    /* 自动播放策略拒掉不算失败：want 留着，下一次手势与看护定时器都会再试 */
    if (p && p.catch) p.catch(function () { media.on = false; });
    return !!p;
  }

  /* 看护：① 压音跟随血量与 BOSS 硬直 ② 被拒播后重试 ③ want 撤掉后自停 */
  function mediaTick() {
    var el = media.el;
    if (!el) return;
    if (!media.want) {
      if (media.timer) { global.clearInterval(media.timer); media.timer = 0; }
      return;
    }
    if (media.on && el.paused) mediaTryPlay(el);
    if (media.on) mediaApply();
  }

  /* 起播：返回 true 表示这条链路接管了 BGM，程序化那三层就整条不跑。 */
  function mediaStart() {
    if (media.dead) return false;
    var el = mediaEl();
    if (!el) return false;
    media.want = true;
    media.on = true;
    mediaApply();
    mediaTryPlay(el);
    if (!media.timer) media.timer = global.setInterval(mediaTick, 140);
    return true;
  }

  /* 停播：先在 fade 秒里把元素音量收到 0，再 pause 并回到开头。
     收尾那一下另挂 setTimeout —— 淡出定时器在某些环境（后台标签页）会被
     节流，只有 setTimeout 这条腿能保证它一定会停。 */
  function mediaStop(fade) {
    var el = media.el;
    media.want = false;
    media.on = false;
    if (media.timer) { global.clearInterval(media.timer); media.timer = 0; }
    if (!el) return;
    var d = Math.max(0.05, fade || 0.8);
    var from = 1;
    try { from = el.volume; } catch (e) {}
    var t0 = nowMs();
    var id = global.setInterval(function () {
      var k = (nowMs() - t0) / (d * 1000);
      if (k >= 1) { global.clearInterval(id); return; }
      try { el.volume = clamp(from * (1 - k), 0, 1); } catch (e) {}
    }, 40);
    global.setTimeout(function () {
      global.clearInterval(id);
      try { el.pause(); el.currentTime = 0; el.volume = mediaLevel(); } catch (e) {}
    }, d * 1000 + 60);
  }

  /* ================================================================ BGM */
  /* 程序化兜底：drone（低频床）/ pulse（鼓与心跳）/ color（旋律层）。
     全部程序生成，随波次升档；血量低抽高频、BOSS 硬直时把音乐压下去。

     旋律层是**定好的动机**，不是随机拨弦 —— 随机音高听起来像素材铺底，
     不像音乐。每档一条五声动机，32 步（16 拍）一轮，
     档位越高动机越密、节奏层越重、动机本身越往上走。 */

  var bgm = {
    on: false, timer: 0, nextT: 0, step: 0, tier: 0, bpm: 60,
    breathe: false, tierLock: false
  };
  var droneNodes = null;

  /* 徵调五声：D F G A C —— 用调式不用大小调，避开「西方史诗」味 */
  var SCALE = [293.66, 349.23, 392.0, 440.0, 523.25];
  var ROOT = 146.83;                 /* D3，音阶基音 */
  var A2 = 110;                      /* A2，低声部换色的根音 */

  /* 音级 → 频率。音级 0~4 是本八度（D4 F4 G4 A4 C5），5 起进下一八度。 */
  function deg(d) {
    var i = d % 5;
    if (i < 0) i += 5;
    return SCALE[i] * Math.pow(2, Math.floor(d / 5));
  }

  /* 每档一条动机：[步, 音级, 时长(步)]。32 步一轮 = 16 拍。 */
  var PHRASE = [
    /* 档 0 空原：四个音一口气落下，D - G - F - A */
    [[0, 0, 6], [8, 2, 6], [16, 1, 6], [24, 3, 8]],
    /* 档 1 渐行：多两步回环，尾部甩一个 C */
    [[0, 0, 4], [6, 1, 4], [10, 2, 4], [16, 1, 4], [20, 3, 4], [26, 4, 6]],
    /* 档 2 铜鼓催：八度跳进，音型开始咬合 */
    [[0, 2, 2], [3, 3, 2], [6, 4, 4], [12, 3, 2], [15, 2, 2],
     [18, 1, 4], [24, 3, 2], [26, 4, 2], [28, 5, 4]],
    /* 档 3 坠：长音收在低音区，中段顶一个小二度 */
    [[0, 5, 3], [4, 4, 3], [8, 3, 4], [13, 4, 3],
     [16, 2, 3], [20, 1, 3], [24, 0, 8]]
  ];

  /* 动机查表：步 → {f, d}。建一次，之后每 tick 只做数组取。 */
  var MEL = [{}, {}, {}, {}];
  (function buildMelody() {
    for (var t = 0; t < PHRASE.length; t++) {
      var ph = PHRASE[t], map = MEL[t];
      for (var i = 0; i < ph.length; i++) {
        map[ph[i][0]] = { f: deg(ph[i][1]), d: ph[i][2] };
      }
    }
  })();

  /* 步长（秒）：一拍的一半。动机时长按它折算，所以改 bpm 不改节奏型。 */
  function stepDur() {
    return (60 / (bgm.breathe ? 44 : bgm.bpm)) / 2;
  }

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
    /* 第三层：主题低音 D3。档位升上去它才探头，跟旋律对上。 */
    var o3 = a.createOscillator(); o3.type = "sine"; o3.frequency.value = ROOT;
    var g3 = a.createGain(); g3.gain.value = 0.22;

    /* 呼吸：0.07Hz 的慢 LFO 调制截止频率 */
    var lfo = a.createOscillator(); lfo.type = "sine"; lfo.frequency.value = 0.07;
    var lfoGain = a.createGain(); lfoGain.gain.value = 42;
    lfo.connect(lfoGain); lfoGain.connect(lp.frequency);

    o1.connect(lp); o2.connect(g2); g2.connect(lp); o3.connect(g3); g3.connect(lp);
    lp.connect(g); g.connect(bus.music);
    o1.start(); o2.start(); o3.start(); lfo.start();
    g.gain.exponentialRampToValueAtTime(0.16, a.currentTime + 1.6);

    droneNodes = { o1: o1, o2: o2, o3: o3, g3: g3, lfo: lfo, gain: g, lp: lp };
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
        try { d.o1.stop(); d.o2.stop(); d.o3.stop(); d.lfo.stop(); } catch (e) {}
      }, (fade || 0.8) * 1000 + 120);
    } catch (e) {}
  }

  function bgmTick() {
    var a = ctx();
    if (!a || !bgm.on) return;

    var tier = bgmTier();
    if (tier !== bgm.tier) {
      var prev = bgm.tier;
      bgm.tier = tier;
      bgm.bpm = [60, 68, 76, 88][Math.min(3, tier)];
      /* BOSS 档：drone 上移，与小二度打对子制造压迫 */
      if (droneNodes) {
        try {
          droneNodes.o2.frequency.setTargetAtTime(
            tier >= 3 ? 116.54 : 82.41, a.currentTime, 1.2);
          /* 主题低音 D3 在 BOSS 档顶到 Eb3 —— 与旋律的小二度撞在一起 */
          droneNodes.o3.frequency.setTargetAtTime(
            tier >= 3 ? 155.56 : ROOT, a.currentTime, 1.2);
          droneNodes.g3.gain.setTargetAtTime(
            tier >= 2 ? 0.42 : 0.22, a.currentTime, 1.2);
        } catch (e) {
          droneNodes.o2.frequency.value = tier >= 3 ? 116.54 : 82.41;
          droneNodes.o3.frequency.value = tier >= 3 ? 155.56 : ROOT;
          droneNodes.g3.gain.value = tier >= 2 ? 0.42 : 0.22;
        }
      }
      /* 冲上 BOSS 档时给一记铜锣 + 一个下行提示音，
         告诉玩家「变了」，而不是让他自己发现节奏变了 */
      if (tier >= 3 && prev < 3) {
        scheduleGong(0, 0.05);
        [523.25, 440, 392].forEach(function (f, i) {
          voice({ f: f, dur: 0.5, type: "triangle", gain: 0.05,
                  delay: 0.32 + i * 0.14, bus: "music", lp: 2600 });
        });
      }
    }

    /* 喘息期：节奏层整个撤掉，只留 drone。下一阵鼓点回来才有力量。
       bpm 必须在这里一起算，否则 bgmBreathe 设的 44 会被上面的档位覆盖。 */
    var beat = 60 / (bgm.breathe ? 44 : bgm.bpm);
    var lookahead = a.currentTime + 0.25;
    var sd = beat / 2;

    while (bgm.nextT < lookahead) {
      var s = bgm.step;
      var delay = Math.max(0, bgm.nextT - a.currentTime);

      if (bgm.breathe) {
        /* 只留一层极稀疏的氛围音，把空间让给呼吸 */
        if (s % 8 === 0 && Math.random() < 0.6) schedulePluck(delay);
      } else if (tier <= 1) {
        /* 空原：鼓点稀疏，动机自己走 */
        if (s % 8 === 0) scheduleKick(delay);
        if (tier === 1 && s % 16 === 12) scheduleBell(delay);
        scheduleMotif(tier, s, delay, sd);
      } else if (tier === 2) {
        /* 铜鼓催：底鼓 + 桶鼓 + 木鱼颗粒，动机开始密 */
        if (s % 4 === 0) scheduleKick(delay);
        if (s % 8 === 6) scheduleTom(delay);
        if (s % 2 === 1 && Math.random() < 0.55) scheduleTick(delay);
        if (s % 16 === 8) scheduleBell(delay);
        scheduleBass(tier, s, delay, sd);
        scheduleMotif(tier, s, delay, sd);
      } else {
        /* 坠：底鼓落地，桶鼓打对子，动机上八度 */
        if (s % 4 === 0) scheduleKick(delay, 0.09);
        if (s % 8 === 6) scheduleKick(delay + beat / 4, 0.055);
        if (s % 4 === 2) scheduleTom(delay);
        if (s % 2 === 1 && Math.random() < 0.75) scheduleTick(delay);
        if (s % 16 === 4) scheduleBell(delay);
        scheduleBass(tier, s, delay, sd);
        scheduleMotif(tier, s, delay, sd);
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

  function scheduleKick(d, g) {
    voice({ f: jit(62, 0.05), dur: 0.34, type: "sine", gain: g || 0.085, to: 38,
            delay: d, bus: "music", lp: 220 });
  }
  function scheduleGong(d, g) {
    var b0 = jit(1080, 0.02);
    voice({ f: b0, dur: 1.4, type: "sine", gain: g || 0.026, to: b0 * 0.97,
            delay: d, bus: "music", lp: 5200 });
    voice({ f: b0 * 1.414, dur: 0.9, type: "sine", gain: (g || 0.026) * 0.5, delay: d, bus: "music", lp: 4200 });
  }
  /* 铜铃：比锣短、比木鱼亮，做段落标记用 */
  function scheduleBell(d) {
    var b0 = jit(880, 0.02);
    voice({ f: b0, dur: 1.0, type: "sine", gain: 0.018, to: b0 * 0.98, delay: d, bus: "music", lp: 4600 });
    voice({ f: b0 * 1.41, dur: 0.6, type: "sine", gain: 0.009, delay: d, bus: "music", lp: 3800 });
  }
  /* 桶鼓：击打面有一点噪声，音高比底鼓高 */
  function scheduleTom(d) {
    voice({ f: jit(150, 0.04), dur: 0.2, type: "sine", gain: 0.05, to: 76, delay: d, bus: "music", lp: 900 });
    voice({ noise: 1, dur: 0.05, bp: 900, q: 1.2, gain: 0.016, delay: d, bus: "music" });
  }
  /* 木鱼：极短的干脆点击，给节奏加颗粒 */
  function scheduleTick(d) {
    voice({ noise: 1, dur: 0.035, hp: 2600, gain: 0.014, curve: 3, delay: d, bus: "music" });
  }
  function schedulePluck(d) {
    var f = SCALE[(Math.random() * SCALE.length) | 0];
    voice({ f: f, dur: 0.5, type: "triangle", gain: 0.02, delay: d, bus: "music",
            lp: 1800, atk: 0.008,
            pan: (Math.random() * 2 - 1) * 0.4 });
    voice({ f: f * 2, dur: 0.28, type: "sine", gain: 0.008, delay: d, bus: "music", lp: 2600 });
  }

  /* 动机层：按档位查表，只在有音的那一步发声。
     音色是「石磬」：三角波 + 低通 + 一点八度泛音，尾巴长但不喧宾夺主。 */
  function scheduleMotif(tier, s, d, sd) {
    var n = MEL[tier] && MEL[tier][s];
    if (!n) return;
    var dur = Math.max(0.22, n.d * sd * 0.92);
    voice({ f: n.f, dur: dur, type: "triangle", gain: 0.026, delay: d, bus: "music",
            lp: 2400, atk: 0.012, pan: -0.2 });
    voice({ f: n.f * 2, dur: dur * 0.45, type: "sine", gain: 0.008, delay: d, bus: "music", lp: 3200 });
  }

  /* 低音线：档位 2 起进入，D3 / A2 交替，给动机一个底座。
     不写低音线的话动机就是浮在空中的点阵，听不出乐句。 */
  function scheduleBass(tier, s, d, sd) {
    var f = 0;
    if (s === 0) f = ROOT;
    else if (s === 16) f = A2;
    if (!f) return;
    voice({ f: f, dur: sd * 7, type: "sawtooth", gain: 0.030, delay: d, bus: "music", lp: 420 });
  }

  function bgmStart() {
    var a = ctx();
    if (!a) return;
    if (bgm.on || media.on) return;
    /* 外部音轨优先。它一接管，程序化那三层就整条不跑 ——
       两套同时响只会互相打架，玩家听到的是噪声。 */
    if (mediaStart()) return;
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
    mediaStop(fade);
    if (!bgm.on) { stopDrone(fade); return; }
    bgm.on = false;
    if (bgm.timer) { global.clearInterval(bgm.timer); bgm.timer = 0; }
    stopDrone(fade || 0.8);
  }

  /* 每阵开场：按新波次重启调度（档位在 tick 里自适应）。
     新阵开始意味着喘息结束，breathe 必须清掉，否则鼓点回不来。 */
  function bgmSetWave() {
    bgm.breathe = false;
    mediaApply();                   /* 喘息压音解除，音轨立刻回满 */
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
    /* 音轨那条路不归 bgmTick 管，压音要当场折进去 —— 等看护定时器下一拍
       会有 140ms 的「过场一开始音乐还没让开」，那一下最容易听出来。 */
    mediaApply();
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
           isBreathe: function () { return bgm.breathe; },
           /* 音轨侧的自检/调试口：src 为空 = 没有音轨（走程序化），
              isTrack 为真表示当前 BGM 由元素接管 */
           isTrack: function () { return !!media.on; },
           isTrackDead: function () { return !!media.dead; },
           track: function () { return media.el ? media.el.src : ""; } },
    setMaterial: function (k) { material = matOf(k); return material; },
    material: function () { return material; },
    mute: function (m) {
      muted = (m === undefined) ? !muted : !!m;
      if (master) master.gain.value = muted ? 0 : MASTER;
      mediaApply();                 /* 音轨在总线之外，必须单独关一次 */
      return muted;
    },
    isMuted: function () { return muted; },
    volume: function (k, v) {
      /* master 是总闸，压在总线之后；它允许超过 1，因为压缩器已经先把峰值摁住了 */
      if (k === "master") {
        if (typeof v === "number") {
          MASTER = clamp(v, 0, 2);
          if (master) master.gain.value = muted ? 0 : MASTER;
          mediaApply();
        }
        return MASTER;
      }
      if (VOL[k] !== undefined && typeof v === "number") {
        VOL[k] = clamp(v, 0, 1);
        if (bus[k]) bus[k].gain.value = VOL[k];
        mediaApply();
      }
      return VOL[k];
    },
    suspend: function () { if (AC) { try { AC.suspend(); } catch (e) {} } },
    resume: function () { if (AC) { try { AC.resume(); } catch (e) {} } }
  };

  global.SND = api;

  /* 切后台就挂起，回来再恢复：避免切标签页期间音乐跑偏几十秒。
     音轨走的是元素，不受 AudioContext 挂起影响，要单独 pause / play。 */
  global.addEventListener("visibilitychange", function () {
    if (!AC) return;
    var hidden = !!(global.document && global.document.hidden);
    if (hidden) {
      api.suspend();
      if (media.el && media.on) { try { media.el.pause(); } catch (e) {} }
    } else {
      api.resume();
      if (media.want && media.el && media.el.paused) mediaTryPlay(media.el);
    }
  });

  /* M 静音：调试与录屏都要能一把关掉 */
  global.addEventListener("keydown", function (e) {
    if (e.code === "KeyM" && !e.ctrlKey && !e.metaKey) api.mute();
  });

})(window);
