/* =====================================================================
   角色渲染 · 逐帧动画播放
   ---------------------------------------------------------------------
   对外契约（保持不变）：
     window.CharArt = { draw: draw, ready: ready, HEIGHT: 252 };

   数据来源：
     window.ANIM = {
       idle | walk | attack | jump | hurt | whirl | throw | bow | dead :
       { frames, fps, loop, w, h, anchorX, footY, files: [url, ...] }
     }
     window.IMG.pose0  ← window.ANIM 缺失（或帧图全部不可用）时的降级素材

   降级：ANIM 不存在 / 该 clip 不存在 / 帧图全没加载完 → 回落到旧的
        「单张精灵 + 变换动画」，不报错、不白屏。

   可选字段：p.__alphaMul（数值，缺省 1）—— 调用方用它做前景遮挡淡出，
        本模块把该因子乘进自身的 alpha（外层的 ctx.globalAlpha 会被覆盖，
        所以必须在这里乘）。

   可选字段（均缺省 0 / null，不影响老调用方）：
     p.pickupT     > 0 时播 pickup（拾取动作，调用方置 0.3 秒后自己倒数）
     p.__forceClip 攻击态里的替代 clip 名（attack-heavy / attack-thrust），
                   只认 ANIM 里真实存在的 clip，不存在则回落 attack；
                   调用方收招时清空，本模块只在 swingT > 0 时读它。
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 对外常量 ---------- */
  var TARGET_H = 252;              // 屏幕上角色高度

  /* ---------- 降级素材（旧逻辑）---------- */
  var SRC_W = 445, SRC_H = 861;
  var PIVOT_X = 300 / SRC_W;       // 身体中线（不含斜出的刀）

  /* ---------- 动画 clip 清单（预热用）---------- */
  var CLIPS = ["dead", "whirl", "bow", "throw", "hurt", "jump",
               "attack", "attack-heavy", "attack-thrust", "pickup", "walk", "idle"];

  /* ---------- 帧图缓存：clip -> [Image] ---------- */
  var frameCache = {};             // 只在 warm() 里建 Image，draw 热路径只读
  var warmed = false;
  var pollTimer = 0;
  var pollTries = 0;

  /* ---------- 上色缓存：clip#frame|color|尺寸 -> canvas ---------- */
  var tintCache = {};

  /* ---------- 降级路径的上色缓存（旧 key 规则，独立存放）---------- */
  var legacyTint = {};

  var anyReady = false;            // 是否已有可用帧图（ready() 快路径）

  /* ================================================================== */
  /*  数据取用                                                          */
  /* ================================================================== */

  function animData() {
    return window.ANIM || null;
  }

  function imageOk(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  /* 某个 clip 的配置；不存在或没有帧图则返回 null */
  function clipDef(name) {
    var A = animData();
    if (!A) return null;
    var d = A[name];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  /* 建立所有帧的 Image（只执行一次；不放在 draw 热路径里） */
  function warm() {
    if (warmed) return;
    var A = animData();
    if (!A) return;
    warmed = true;
    for (var i = 0; i < CLIPS.length; i++) {
      var name = CLIPS[i];
      var d = A[name];
      if (!d || !d.files || !d.files.length) continue;
      if (frameCache[name]) continue;
      var arr = new Array(d.files.length);
      for (var f = 0; f < d.files.length; f++) {
        var im = new Image();
        im.src = d.files[f];
        arr[f] = im;
      }
      frameCache[name] = arr;
    }
  }

  /* anim-data.js 可能后于本文件就位：轻量轮询补一次预热 */
  function armPoll() {
    if (warmed || pollTimer) return;
    if (typeof setTimeout !== "function") return;   // 非浏览器宿主：只做同步预热
    pollTries = 0;
    pollTimer = setTimeout(pollTick, 0);
  }

  function pollTick() {
    pollTimer = 0;
    if (animData()) { warm(); return; }
    if (pollTries++ < 120) pollTimer = setTimeout(pollTick, 60);
  }

  /* ================================================================== */
  /*  状态 → clip 映射（优先级从高到低）                                */
  /* ================================================================== */

  function pickClip(p) {
    var wt = p.weapon && p.weapon.type;
    if (p.dead) return "dead";
    if (p.whirlT > 0) return "whirl";
    if (p.throwT > 0 && wt === "bow") return "bow";
    if (p.throwT > 0 && wt === "throw") return "throw";
    if (p.hurtT > 0) return "hurt";
    /* 可选字段 p.pickupT（缺省 0）：拾取动作，调用方置 0.3 秒 */
    if (p.pickupT > 0) return "pickup";
    if (!p.onGround) return "jump";
    if (p.swingT > 0) {
      /* 可选字段 p.__forceClip（缺省 null）：重武器劈砍 / 快武器突刺，
         只认数据里真实存在的 clip，否则沿用 attack */
      var f = p.__forceClip;
      return (f && clipDef(f)) ? f : "attack";
    }
    if (Math.abs(p.vx) > 60) return "walk";
    return "idle";
  }

  /* 目标 clip 缺失时退回 idle；连 idle 都没有 → 走降级 */
  function resolveClip(p) {
    var want = pickClip(p);
    if (clipDef(want)) return want;
    if (clipDef("idle")) return "idle";
    return null;
  }

  /* ================================================================== */
  /*  播放状态                                                          */
  /* ================================================================== */

  function stateOf(p) {
    var s = p.__rig;
    if (!s) {
      s = { clip: "", t: 0, last: 0, good: {} };
      p.__rig = s;
    }
    return s;
  }

  /* attack 的进度跟 p.swingT 挂钩：swingT/swingDur 从 1 → 0。
     重击 / 突刺同属攻击族，帧号一样由判定推导，不按 fps 自由播放。 */
  function isAttackClip(name) {
    return name === "attack" || name === "attack-heavy" || name === "attack-thrust";
  }

  function attackFrame(p, n) {
    if (!(p.swingT > 0) || !(p.swingDur > 0)) return -1;
    var prog = 1 - p.swingT / p.swingDur;
    if (prog < 0) prog = 0;
    if (prog > 1) prog = 1;
    var f = Math.floor(prog * n);
    if (f < 0) f = 0;
    if (f > n - 1) f = n - 1;
    return f;
  }

  function chooseFrame(p, s, name, def, dt) {
    var n = def.files.length;
    if (n <= 1) return 0;

    if (isAttackClip(name)) {
      var af = attackFrame(p, n);
      if (af >= 0) return af;            // 与判定同步
    }

    var fps = def.fps > 0 ? def.fps : 8;
    s.t += dt;
    var total = s.t * fps;
    if (def.loop === false) {
      var last = n - 1;
      if (total >= n) { s.t = n / fps; total = n; }   // 停在最后一帧，别让 t 无限涨
      var idx = Math.floor(total);
      return idx > last ? last : idx;
    }
    var loopIdx = Math.floor(total) % n;
    if (loopIdx < 0) loopIdx = 0;
    return loopIdx;
  }

  /* 该帧图没加载完 → 用本 clip 上一张可用帧，不闪 */
  function usableFrame(s, name, idx) {
    var arr = frameCache[name];
    if (!arr || !arr.length) return -1;
    if (idx >= 0 && idx < arr.length && imageOk(arr[idx])) {
      s.good[name] = idx;
      return idx;
    }
    var g = s.good[name];
    if (g != null && g < arr.length && imageOk(arr[g])) return g;
    for (var i = 0; i < arr.length; i++) {
      if (imageOk(arr[i])) { s.good[name] = i; return i; }
    }
    return -1;
  }

  /* ================================================================== */
  /*  通用特效                                                          */
  /* ================================================================== */

  /* 地面影子 */
  function drawShadow(ctx, p) {
    ctx.save();
    ctx.globalAlpha = p.dead ? 0.18 : 0.34;
    var sg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
    sg.addColorStop(0, "rgba(40,26,10,.85)");
    sg.addColorStop(1, "rgba(40,26,10,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 旋风斩光环（金色径向渐变环） */
  function drawWhirlRing(ctx, p, h) {
    var r = h * 0.62;
    ctx.save();
    ctx.translate(p.x, p.y - h * 0.5);
    var rg = ctx.createRadialGradient(0, 0, h * 0.18, 0, 0, r);
    rg.addColorStop(0, "rgba(255,240,190,0)");
    rg.addColorStop(0.6, "rgba(255,236,170,.22)");
    rg.addColorStop(0.85, "rgba(255,248,215,.42)");
    rg.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* P1 暖金 / P2 冷青：按 clip#frame + 绘制尺寸缓存，不每帧重建 canvas */
  function tintedFrame(img, name, idx, w, h, color, amt) {
    var tw = Math.max(1, Math.round(w));
    var th = Math.max(1, Math.round(h));
    var key = name + "#" + idx + "|" + color + "|" + tw + "x" + th;
    var cv = tintCache[key];
    if (cv) return cv;

    cv = document.createElement("canvas");
    cv.width = tw;
    cv.height = th;
    var c = cv.getContext("2d");
    if (!c) return null;
    c.drawImage(img, 0, 0, tw, th);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = color;
    c.globalAlpha = amt;
    c.fillRect(0, 0, tw, th);
    c.globalCompositeOperation = "source-over";
    tintCache[key] = cv;
    return cv;
  }

  /* ================================================================== */
  /*  透明因子（前景遮挡淡出）                                          */
  /* ================================================================== */

  /* 调用方（index.html 的 drawPlayer）在角色被前景遮挡时设置 p.__alphaMul
     = 0.35，本模块把这个因子乘进自身 alpha —— 不能只靠外层的
     ctx.globalAlpha，因为下面的绘制会把它绝对覆盖掉。
     缺省 / 非法值一律当 1，不影响其它淡出逻辑。 */
  function alphaMul(p) {
    var m = p && p.__alphaMul;
    if (typeof m !== "number" || !isFinite(m) || m < 0) return 1;
    return m > 1 ? 1 : m;
  }

  /* ================================================================== */
  /*  主绘制：逐帧动画                                                  */
  /* ================================================================== */

  /* 返回 false 表示「这一帧画不出来」，交给降级路径 */
  function drawFrames(ctx, p, t, name) {
    var def = clipDef(name);
    if (!def) return false;

    var s = stateOf(p);
    var dt = t - s.last;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;                 // 卡帧后不要跳一大段
    s.last = t;

    if (s.clip !== name) {                  // 换 clip：回到第 0 帧
      s.clip = name;
      s.t = 0;
    }

    var idx = chooseFrame(p, s, name, def, dt);
    var use = usableFrame(s, name, idx);
    if (use < 0) return false;              // 一张都没就绪

    var img = frameCache[name][use];
    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    /* scaleFix：把某些「画得偏小」的动作条带拉回统一身高 */
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = typeof def.anchorX === "number" ? def.anchorX : 0.5;
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    /* 透明度：无敌闪烁 / 死亡淡出 / 前景遮挡淡出（p.__alphaMul） */
    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) alpha = 0.55;
    alpha *= alphaMul(p);

    drawShadow(ctx, p);
    if (p.whirlT > 0) drawWhirlRing(ctx, p, h);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, name, use, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.drawImage(art, dx, dy, w, h);

    /* 受击闪白 */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 1) k = 1;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* ================================================================== */
  /*  降级路径：单张精灵 + 变换动画（原实现）                           */
  /* ================================================================== */

  function legacyTinted(img, color, amt) {
    var cacheKey = "p|" + color + "|" + amt;
    if (legacyTint[cacheKey]) return legacyTint[cacheKey];

    var cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    var c = cv.getContext("2d");
    if (!c) return img;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = color;
    c.globalAlpha = amt;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = "source-over";
    legacyTint[cacheKey] = cv;
    return cv;
  }

  function legacySprite(p) {
    var img = window.IMG && window.IMG.pose0;
    if (!imageOk(img)) return null;
    return (p.padTag || "") === "p1"
      ? legacyTinted(img, "#ffcf6a", 0.10)
      : legacyTinted(img, "#6fd8c0", 0.10);
  }

  function drawLegacy(ctx, p, t) {
    var img = legacySprite(p);
    if (!img) return false;

    var sc = TARGET_H / SRC_H;
    var bob = 0, tilt = 0, sx = 1, sy = 1, ox = 0, oy = 0;
    var alpha = 1;

    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0) alpha = 0.55;

    /* 旋风斩：高速自转 + 残影 */
    if (p.whirlT > 0) {
      drawLegacyGhost(ctx, img, p, sc);
      return true;
    }

    if (!p.onGround) {
      sy = 1.06; sx = 0.96;
    } else if (Math.abs(p.vx) > 60) {
      var ph = p.walk;
      bob = Math.abs(Math.sin(ph * 2)) * -5;
      tilt = Math.sin(ph * 2) * 0.035 * (p.vx > 0 ? 1 : -1);
      sx = 1 + Math.sin(ph * 4) * 0.022;
      sy = 1 - Math.sin(ph * 4) * 0.022;
    } else {
      bob = Math.sin(t * 2.2) * 1.6;
      sy = 1 + Math.sin(t * 2.2) * 0.012;
    }

    /* 挥砍 */
    if (p.swingT > 0 && p.swingDur > 0) {
      var prog = 1 - p.swingT / p.swingDur;
      var ease = prog < 0.45
        ? (prog / 0.45) * (prog / 0.45)
        : 1 - ((prog - 0.45) / 0.55) * 0.45;
      var dir = (p.swingIdx === 1) ? -1 : 1;
      tilt += dir * ease * (p.swingIdx === 2 ? 0.42 : 0.30);
      ox += p.facing * ease * (p.swingIdx === 2 ? 30 : 20);
      oy -= ease * 5;
      sy *= 1 + ease * 0.05;
    }

    /* 投掷 / 拉弓 */
    if (p.throwT > 0) {
      tilt += -0.14 * (p.throwT / 0.24);
      ox -= p.facing * 6;
    }

    /* 受击后仰 */
    if (p.hurtT > 0) {
      tilt += -0.22 * (p.hurtT / 0.28) * p.facing;
      ox -= p.facing * 12 * (p.hurtT / 0.28);
    }

    /* 死亡 */
    if (p.dead) {
      alpha = 0.5;
      tilt += 1.15 * p.facing;
    }

    alpha *= alphaMul(p);

    var px = p.x + ox;
    var py = p.y + bob + oy;

    drawShadow(ctx, p);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);

    var w = SRC_W * sc, h = SRC_H * sc;
    var dx = -PIVOT_X * w;
    var dy = -h;

    ctx.drawImage(img, dx, dy, w, h);

    /* 受击白光 */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    ctx.restore();
    return true;
  }

  /* 降级路径的旋风斩残影 */
  function drawLegacyGhost(ctx, img, p, sc) {
    var w = SRC_W * sc, h = SRC_H * sc;
    var dx = -PIVOT_X * w, dy = -h;
    var spin = p.whirlT * 22;
    var flip = p.facing < 0 ? -1 : 1;

    for (var i = 0; i < 4; i++) {
      var k = i / 4;
      ctx.save();
      ctx.globalAlpha = 0.34 * (1 - k);
      ctx.translate(p.x, p.y);
      ctx.scale(flip, 1);
      ctx.rotate(spin * 0.28 + k * 0.5);
      ctx.scale(1 + k * 0.09, 1 - k * 0.04);
      ctx.drawImage(img, dx, dy, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(flip, 1);
    ctx.rotate(Math.sin(spin) * 0.12);
    ctx.drawImage(img, dx, dy, w, h);
    ctx.restore();

    drawWhirlRing(ctx, p, h);
  }

  /* ================================================================== */
  /*  对外接口                                                          */
  /* ================================================================== */

  function draw(ctx, p, t) {
    if (!p || !ctx) return;
    if (typeof t !== "number" || !isFinite(t)) t = 0;

    var name = resolveClip(p);
    if (name && drawFrames(ctx, p, t, name)) return;

    drawLegacy(ctx, p, t);
  }

  function ready() {
    if (anyReady) return true;

    for (var k in frameCache) {
      if (!Object.prototype.hasOwnProperty.call(frameCache, k)) continue;
      var arr = frameCache[k];
      for (var i = 0; i < arr.length; i++) {
        if (imageOk(arr[i])) { anyReady = true; return true; }
      }
    }

    var leg = window.IMG && window.IMG.pose0;
    return imageOk(leg);
  }

  /* 预热：先同步试一次，再挂一次轻量轮询兜住后到的 ANIM */
  warm();
  armPoll();

  window.CharArt = { draw: draw, ready: ready, HEIGHT: TARGET_H };
})();
