/* =========================================================================
 * enemies-assets.js — 三星堆素材敌人
 * 对外：window.EnemyArt = { draw: draw, ready: ready }（对外契约不变）
 *
 * 数据来源（优先级从高到低）：
 *   window.ENEMY_ANIM = {
 *     walker | fast | brute | boss :
 *     { frames, fps, loop, w, h, anchorX, footY, files: [url, ...] }
 *   }
 *   → 逐帧动画
 *   数据缺失 / 帧图一张都没加载完 → 降级到本文件原有的纯代码绘制，
 *   不报错、不白屏（降级代码全部保留在下方）。
 *
 * 降级路径依赖：window.IMG（maskRelief / potteryJar / brazier /
 *              jadeTablet / bellCluster / ivoryTusk）
 * 调用方已经做过相机平移，本模块直接用 e.x / e.y 绘制，不再减 camX。
 * 默认朝右，e.facing < 0 时整体 scale(-1,1)。
 * ========================================================================= */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;

  /* 调色：青铜青绿 / 金盏黄 / 陶土棕 / 深墨描边 */
  var C = {
    bronze:   "#5c7a6a",
    bronzeDk: "#374f45",
    bronzeLt: "#7d9a86",
    patina:   "#41705c",
    gold:     "#d9b45e",
    goldHi:   "#f6e0a4",
    goldDk:   "#9c7528",
    clay:     "#8a6a4a",
    clayDk:   "#553d29",
    ink:      "#201a12",
    warn:     "#e0644a",
    bone:     "#e9e1c9"
  };

  var ASSET_KEYS = [
    "maskRelief", "potteryJar", "brazier",
    "jadeTablet", "bellCluster", "ivoryTusk"
  ];

  /* ------------------------------------------------------------------ 基础 */

  function imgOf(name) {
    var bag = global.IMG;
    if (!bag) return null;
    var im = bag[name];
    if (!im || !im.complete) return null;
    if (im.naturalWidth === 0) return null;
    return im;
  }

  /* 帧图或降级素材，任一就绪即可画。两者都没有才返回 false。 */
  function ready() {
    if (animReady()) return true;
    var bag = global.IMG;
    if (!bag) return false;
    for (var i = 0; i < ASSET_KEYS.length; i++) {
      var im = bag[ASSET_KEYS[i]];
      if (!im || !im.complete) return false;
    }
    return true;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* 数值消毒：外部字段可能缺失或类型不对 */
  function num(v, dflt) {
    return (typeof v === "number" && isFinite(v)) ? v : dflt;
  }

  function heightOf(e) {
    var h = num(e && e.h, 0);
    return h > 0 ? h : 160;
  }

  /* 确定性伪随机，避免每帧抖动 */
  function hsh(n) {
    var x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(Math.abs(r), Math.abs(w) * 0.5, Math.abs(h) * 0.5);
    if (rr < 0) rr = 0;
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  /* 粗墨描边的肢体：先画宽墨线，再压一道本色 */
  function limb(ctx, x0, y0, cx, cy, x1, y1, w, fill) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, cy, x1, y1);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = w + Math.max(2.6, w * 0.36);
    ctx.stroke();
    ctx.strokeStyle = fill || C.bronze;
    ctx.lineWidth = w;
    ctx.stroke();
    ctx.restore();
  }

  /* 两节手臂：肩 → 肘 → 手 */
  function armTo(ctx, x0, y0, x1, y1, bend, w, fill) {
    limb(ctx, x0, y0, (x0 + x1) * 0.5, (y0 + y1) * 0.5 + bend, x1, y1, w, fill);
  }

  /* 云雷纹小纹样（方形回旋） */
  function leiWen(ctx, cx, cy, s, lw, col) {
    if (s <= 0.5) return;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s);
    ctx.lineTo(cx - s, cy - s);
    ctx.lineTo(cx + s, cy - s);
    ctx.lineTo(cx + s, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.3, cy + s * 0.45);
    ctx.lineTo(cx - s * 0.3, cy - s * 0.35);
    ctx.lineTo(cx + s * 0.35, cy - s * 0.35);
    ctx.strokeStyle = col || C.gold;
    ctx.lineWidth = lw || 1.6;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.stroke();
    ctx.restore();
  }

  function drawShadow(ctx, e, H, mul) {
    var rw = Math.max(16, num(e.w, 60) * 0.62);
    var rh = Math.max(4.5, rw * 0.24);
    ctx.save();
    ctx.globalAlpha = 0.34 * (mul == null ? 1 : mul);
    ctx.fillStyle = "#1d150c";
    ctx.beginPath();
    ctx.ellipse(0, 2, rw, rh, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /* ---------------------------------------------------------- 位图预处理 */

  /* 一次性生成：抠掉洋红底的图 + 纯白剪影（受击闪白）+ 内容包围盒 */
  var silCache = {};

  function alphaBBox(data, w, h) {
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) return { x: 0, y: 0, w: w, h: h };
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function silhouette(name, keyMagenta) {
    var src = imgOf(name);
    if (!src) return null;
    var rec = silCache[name];
    if (rec && rec.src === src) return rec;

    var w = src.naturalWidth, h = src.naturalHeight;
    if (!w || !h) return null;

    var cut = document.createElement("canvas");
    cut.width = w;
    cut.height = h;
    var c = cut.getContext("2d", { willReadFrequently: true });
    c.drawImage(src, 0, 0);

    var bb = { x: 0, y: 0, w: w, h: h };

    if (keyMagenta) {
      var keyed = false;
      try {
        var data = c.getImageData(0, 0, w, h);
        var d = data.data;
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2];
          /* 素材底色：约 (200,30,152)、alpha≈13% */
          if (r > 140 && b > 100 && g < 112 && (r - g) > 60 && (b - g) > 45) d[i + 3] = 0;
        }
        c.putImageData(data, 0, 0);
        bb = alphaBBox(d, w, h);
        keyed = true;
      } catch (err) {
        keyed = false;
      }
      if (!keyed) {
        /* file:// 下画布被污染读不到像素：alpha 自乘，13% 残底压到 2% */
        c.globalCompositeOperation = "destination-in";
        c.drawImage(src, 0, 0);
        c.globalCompositeOperation = "source-over";
      }
    } else {
      try {
        bb = alphaBBox(c.getImageData(0, 0, w, h).data, w, h);
      } catch (err2) {
        bb = { x: 0, y: 0, w: w, h: h };
      }
    }

    /* 暗描边光晕在缓存阶段烘焙，省掉每帧 shadowBlur */
    var pad = Math.max(4, Math.round(Math.min(w, h) * 0.045));
    var composed = document.createElement("canvas");
    composed.width = w + pad * 2;
    composed.height = h + pad * 2;
    var cc = composed.getContext("2d");
    cc.shadowColor = "rgba(24,17,10,0.92)";
    cc.shadowBlur = pad * 1.5;
    cc.drawImage(cut, pad, pad);
    cc.shadowColor = "transparent";
    cc.shadowBlur = 0;
    cc.drawImage(cut, pad, pad);

    /* 纯白剪影：只用抠好的图，不带光晕，否则闪白会糊成光团 */
    var white = document.createElement("canvas");
    white.width = composed.width;
    white.height = composed.height;
    var wc = white.getContext("2d");
    wc.drawImage(cut, pad, pad);
    wc.globalCompositeOperation = "source-in";
    wc.fillStyle = "#fff8e2";
    wc.fillRect(0, 0, white.width, white.height);

    var bbPad = { x: bb.x + pad, y: bb.y + pad, w: bb.w, h: bb.h };

    rec = {
      src: src, cut: composed, white: white,
      bb: bbPad,
      w: composed.width, h: composed.height
    };
    silCache[name] = rec;
    return rec;
  }

  /* 按可见内容缩放：hgt = 内容高度，bottomY = 内容底边，水平居中于 cx */
  function spriteRect(rec, cx, bottomY, hgt) {
    var bb = rec.bb;
    var s = hgt / bb.h;
    return {
      s: s,
      w: bb.w * s,
      h: hgt,
      x: cx - (bb.x + bb.w * 0.5) * s,
      y: bottomY - (bb.y + bb.h) * s,
      dw: rec.w * s,
      dh: rec.h * s
    };
  }

  function blit(ctx, canvas, r, alpha, additive) {
    if (!canvas) return;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (additive) ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(canvas, r.x, r.y, r.dw, r.dh);
    ctx.restore();
  }

  /* 贴图：cx 中心、bottomY 内容底边、hgt 内容高度；flash = 受击闪白 */
  function drawSprite(ctx, rec, cx, bottomY, hgt, flash) {
    if (!rec) return;
    var r = spriteRect(rec, cx, bottomY, hgt);
    ctx.save();
    ctx.drawImage(rec.cut, r.x, r.y, r.dw, r.dh);
    if (flash > 0) {
      blit(ctx, rec.white, r, 0.24 * flash);
      blit(ctx, rec.white, r, 0.10 * flash, true);
    }
    ctx.restore();
  }

  function drawMask(ctx, cx, bottomY, hgt, flash) {
    var rec = silhouette("maskRelief", true);
    if (!rec) {
      ctx.save();
      var w = hgt * 1.5032;
      ctx.fillStyle = C.bronze;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(2, hgt * 0.03);
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.42, bottomY);
      ctx.lineTo(cx - w * 0.5, bottomY - hgt * 0.55);
      ctx.lineTo(cx, bottomY - hgt);
      ctx.lineTo(cx + w * 0.5, bottomY - hgt * 0.55);
      ctx.lineTo(cx + w * 0.42, bottomY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    drawSprite(ctx, rec, cx, bottomY, hgt, flash);
  }

  /* ------------------------------------------------------------ 状态特效 */

  /* 蓄力预警：身前红色扇弧，随时间脉动 */
  function drawWarn(ctx, now, cx, cy, r) {
    var pulse = 0.5 + 0.5 * Math.sin(now * 13);
    var grow = 0.9 + 0.12 * pulse;
    var R = r * grow;
    var a0 = -1.32, a1 = 0.58;

    ctx.save();
    ctx.translate(cx, cy);

    var g = ctx.createRadialGradient(0, 0, R * 0.44, 0, 0, R);
    g.addColorStop(0, "rgba(224,100,74,0)");
    g.addColorStop(0.5, "rgba(226,96,68,0.30)");
    g.addColorStop(0.9, "rgba(255,148,104,0.62)");
    g.addColorStop(1, "rgba(255,148,104,0)");
    ctx.globalAlpha = 0.55 + 0.35 * pulse;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.arc(0, 0, R * 0.44, a1, a0, true);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.7 + 0.3 * pulse;
    ctx.strokeStyle = "#ffc7a6";
    ctx.lineWidth = Math.max(2, r * 0.05);
    ctx.setLineDash([r * 0.16, r * 0.11]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.97, a0, a1);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.globalAlpha = 0.3 + 0.35 * pulse;
    ctx.strokeStyle = "#ffe0c8";
    ctx.lineWidth = Math.max(1.2, r * 0.022);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.47, a0 + 0.34, a1 - 0.34);
    ctx.stroke();
    ctx.restore();
  }

  /* 挥击：一道收尖的金色月牙光 */
  function drawSwing(ctx, now, cx, cy, r) {
    var k = 0.95 + 0.05 * Math.sin(now * 42);
    var R = r * k;
    var a0 = -1.30, a1 = 0.62;
    var tip = 0.20;                       /* 两端收尖 */

    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = "lighter";

    var g = ctx.createRadialGradient(0, 0, R * 0.60, 0, 0, R);
    g.addColorStop(0, "rgba(255,240,190,0)");
    g.addColorStop(0.55, "rgba(255,224,150,0.16)");
    g.addColorStop(0.88, "rgba(255,246,214,0.52)");
    g.addColorStop(1, "rgba(255,255,240,0)");
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, R, a0, a1);
    ctx.arc(0, 0, R * 0.82, a1 - tip, a0 + tip, true);
    ctx.closePath();
    ctx.fill();

    /* 锋线 */
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "#fffdf0";
    ctx.lineWidth = Math.max(1.4, r * 0.024);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.97, a0 + 0.22, a1 - 0.10);
    ctx.stroke();

    /* 前方速度线 */
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = "rgba(255,246,208,0.9)";
    ctx.lineWidth = Math.max(1.1, r * 0.016);
    for (var i = 0; i < 3; i++) {
      var a = 0.02 + i * 0.19;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
      ctx.lineTo(Math.cos(a) * R * 1.16, Math.sin(a) * R * 1.16);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 死亡碎片 */
  function drawDebris(ctx, e, k, H) {
    var n = e.kind === "boss" ? 26 : (e.kind === "brute" ? 16 : 11);
    var fade = Math.pow(1 - k, 1.1);
    if (fade <= 0.01) return;
    var cols = [C.bronze, C.bronzeDk, C.gold, C.clay, C.bronzeLt];
    var origin = -(e.kind === "boss" ? H * 0.55 : H * 0.5);

    ctx.save();
    for (var i = 0; i < n; i++) {
      var a = hsh(i * 3.13 + 1.7) * TAU;
      var spd = H * (0.35 + hsh(i * 7.71 + 2.1) * 0.85);
      var px = Math.cos(a) * k * spd * (0.55 + 0.7 * hsh(i * 2.37));
      var py = origin + Math.sin(a) * k * spd * 0.4 + H * 1.45 * k * k;
      var sz = H * (0.015 + 0.028 * hsh(i * 5.19));
      ctx.save();
      ctx.globalAlpha = fade * (0.55 + 0.45 * hsh(i * 9.4));
      ctx.translate(px, py);
      ctx.rotate(a + k * 5.5);
      ctx.fillStyle = cols[i % cols.length];
      ctx.fillRect(-sz * 0.5, -sz * 0.5, sz, sz * (0.6 + 0.8 * hsh(i * 4.4)));
      ctx.restore();
    }
    ctx.restore();
  }

  /* 血条。artTop 为本地坐标里的图形顶边（默认 -H，即 e.y - e.h）。
     BOSS 用帧图时图形高 1.6H，血条跟着抬到图形头顶，否则会压穿面具。 */
  function drawHpBar(ctx, e, artTop) {
    var maxHp = num(e.maxHp, 0);
    if (!(maxHp > 1)) return;
    var H = heightOf(e);
    var w = Math.max(28, num(e.w, 60) * 0.8);
    if (e.kind === "boss") w = Math.max(w, H * 0.52);
    var h = e.kind === "boss" ? 9 : 7;
    var x = -w * 0.5;
    var top = (typeof artTop === "number" && isFinite(artTop)) ? artTop : -H;
    var y = top - 22;
    var k = clamp(num(e.hp, 0) / maxHp, 0, 1);

    ctx.save();
    roundRect(ctx, x - 2.5, y - 2.5, w + 5, h + 5, 4);
    ctx.fillStyle = "rgba(32,23,13,0.8)";
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = C.ink;
    ctx.stroke();

    if (k > 0) {
      var g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, C.goldHi);
      g.addColorStop(0.5, C.gold);
      g.addColorStop(1, C.goldDk);
      roundRect(ctx, x, y, w * k, h, 2.6);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "#fff8dc";
      roundRect(ctx, x + 1, y + 1.2, Math.max(0, w * k - 2), h * 0.28, 1);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- 通用躯干形 */

  function torsoPath(ctx, shoulderW, waistW, topY, botY) {
    var hh = botY - topY;
    ctx.beginPath();
    ctx.moveTo(-shoulderW * 0.5, topY);
    ctx.quadraticCurveTo(-shoulderW * 0.68, topY + hh * 0.48, -waistW * 0.5, botY);
    ctx.lineTo(waistW * 0.5, botY);
    ctx.quadraticCurveTo(shoulderW * 0.68, topY + hh * 0.48, shoulderW * 0.5, topY);
    ctx.closePath();
  }

  /* 青铜戈：柲 + 横出的刃 */
  function drawGe(ctx, x, y, ang, L, H) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    var back = -L * 0.18;
    var tip = L * 0.66;

    ctx.lineCap = "round";
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(3, H * 0.022);
    ctx.beginPath();
    ctx.moveTo(back, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
    ctx.strokeStyle = C.clay;
    ctx.lineWidth = Math.max(1.5, H * 0.011);
    ctx.beginPath();
    ctx.moveTo(back, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();

    /* 柲末的缨 */
    ctx.strokeStyle = C.warn;
    ctx.lineWidth = Math.max(1.2, H * 0.009);
    for (var i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(back, 0);
      ctx.lineTo(back - L * 0.09, (i - 1) * L * 0.045 + L * 0.015);
      ctx.stroke();
    }

    /* 刃：横出上扬的戈头 */
    ctx.beginPath();
    ctx.moveTo(tip - L * 0.30, 0);
    ctx.lineTo(tip - L * 0.23, -H * 0.090);
    ctx.lineTo(tip + L * 0.07, -H * 0.150);
    ctx.lineTo(tip + L * 0.05, -H * 0.035);
    ctx.lineTo(tip - L * 0.12, H * 0.005);
    ctx.closePath();
    ctx.fillStyle = C.bronzeDk;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2, H * 0.013);
    ctx.lineJoin = "round";
    ctx.stroke();

    /* 刃上金线 */
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = Math.max(1.2, H * 0.008);
    ctx.beginPath();
    ctx.moveTo(tip - L * 0.22, -H * 0.026);
    ctx.lineTo(tip + L * 0.02, -H * 0.076);
    ctx.stroke();
    ctx.restore();
  }

  /* 青铜钺：柲 + 扇形斧刃 */
  function drawYue(ctx, x, y, ang, L, H) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    var back = -H * 0.20;
    var tip = H * 0.34;

    ctx.lineCap = "round";
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(3, H * 0.024);
    ctx.beginPath();
    ctx.moveTo(back, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();
    ctx.strokeStyle = C.clay;
    ctx.lineWidth = Math.max(1.8, H * 0.013);
    ctx.beginPath();
    ctx.moveTo(back, 0);
    ctx.lineTo(tip, 0);
    ctx.stroke();

    /* 扇形刃：直刃口朝前 */
    ctx.beginPath();
    ctx.moveTo(H * 0.06, -H * 0.045);
    ctx.quadraticCurveTo(H * 0.22, -H * 0.185, H * 0.36, -H * 0.150);
    ctx.lineTo(H * 0.36, H * 0.150);
    ctx.quadraticCurveTo(H * 0.22, H * 0.185, H * 0.06, H * 0.045);
    ctx.closePath();
    ctx.fillStyle = C.bronze;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2.4, H * 0.016);
    ctx.lineJoin = "round";
    ctx.stroke();

    /* 刃口高光 */
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = Math.max(1.4, H * 0.010);
    ctx.beginPath();
    ctx.moveTo(H * 0.345, -H * 0.132);
    ctx.lineTo(H * 0.345, H * 0.132);
    ctx.stroke();

    /* 兽面纹 */
    ctx.save();
    ctx.globalAlpha = 0.8;
    leiWen(ctx, H * 0.20, 0, H * 0.042, Math.max(1.2, H * 0.007), C.gold);
    ctx.restore();
    ctx.restore();
  }

  /* ------------------------------------------------------------- 铜锈俑 */

  function drawWalker(ctx, e, now, hurtK, slim) {
    var H = heightOf(e);
    var ph = num(e.walk, 0);
    var mv = e.state === "walk" ? 1 : 0.32;

    var headH = H * (slim ? 0.40 : 0.44);
    var headBottom = -H + headH;
    var shoulderY = headBottom + H * 0.015;
    var chestBot = -H * 0.330;
    var skirtBot = -H * 0.195;
    var hipY = -H * 0.31;
    var shoulderW = H * (slim ? 0.38 : 0.52);
    var waistW = H * (slim ? 0.25 : 0.35);
    var legW = H * (slim ? 0.056 : 0.080);
    var lean = slim ? 0.22 : 0.05;

    var bob = Math.sin(ph * 2) * H * 0.014 * mv + Math.sin(now * 2.1 + H * 0.01) * H * 0.005;
    var sway = Math.sin(ph) * H * 0.030 * mv;

    /* 疾行的残影尾迹 */
    if (slim && e.state === "walk") {
      ctx.save();
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = C.patina;
      ctx.lineCap = "round";
      for (var s = 0; s < 3; s++) {
        var ty = -H * (0.28 + s * 0.16);
        ctx.lineWidth = H * (0.014 - s * 0.003);
        ctx.beginPath();
        ctx.moveTo(-H * 0.28, ty + Math.sin(now * 9 + s) * H * 0.012);
        ctx.lineTo(-H * (0.74 + s * 0.16), ty);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* 腿 */
    var swing = Math.sin(ph * 2) * H * 0.095 * mv;
    var liftF = Math.max(0, Math.sin(ph * 2)) * H * 0.045 * mv;
    var liftB = Math.max(0, -Math.sin(ph * 2)) * H * 0.045 * mv;
    var footW = legW * 1.7;
    var legX = waistW * (slim ? 0.34 : 0.40);

    limb(ctx, -legX, hipY + bob, -legX * 1.35, hipY * 0.52 + bob,
      -legX * 1.05 - swing, -liftB, legW, C.bronzeDk);
    limb(ctx, legX, hipY + bob, legX * 1.35, hipY * 0.52 + bob,
      legX * 1.05 + swing, -liftF, legW, C.bronze);

    /* 绑腿金环 */
    ctx.save();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = Math.max(1.4, H * 0.009);
    ctx.lineCap = "round";
    for (var b = 0; b < 2; b++) {
      var by = -H * (0.055 + b * 0.045);
      ctx.beginPath();
      ctx.moveTo(-legX * 1.05 - swing * 0.7 - legW * 0.5, by);
      ctx.lineTo(-legX * 1.05 - swing * 0.7 + legW * 0.5, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(legX * 1.05 + swing * 0.7 - legW * 0.5, by);
      ctx.lineTo(legX * 1.05 + swing * 0.7 + legW * 0.5, by);
      ctx.stroke();
    }
    ctx.restore();

    /* 脚掌 */
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1.6, H * 0.010);
    ctx.fillStyle = C.bronzeDk;
    roundRect(ctx, -legX * 1.05 - swing - footW * 0.5, -liftB - H * 0.018, footW, H * 0.026, H * 0.009);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.bronze;
    roundRect(ctx, legX * 1.05 + swing - footW * 0.5, -liftF - H * 0.018, footW, H * 0.026, H * 0.009);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* 上身（含前倾） */
    ctx.save();
    ctx.translate(sway, bob);
    ctx.translate(0, hipY);
    ctx.rotate(lean * mv);
    ctx.translate(0, -hipY);

    /* 战裙 */
    ctx.beginPath();
    ctx.moveTo(-waistW * 0.52, chestBot - H * 0.005);
    ctx.lineTo(waistW * 0.52, chestBot - H * 0.005);
    ctx.lineTo(waistW * 0.62, skirtBot);
    ctx.lineTo(-waistW * 0.62, skirtBot);
    ctx.closePath();
    var sg = ctx.createLinearGradient(0, chestBot, 0, skirtBot);
    sg.addColorStop(0, C.bronzeDk);
    sg.addColorStop(1, "#293c34");
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2.4, H * 0.015);
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = "rgba(217,180,94,0.45)";
    ctx.lineWidth = Math.max(1, H * 0.006);
    for (var kI = -1; kI <= 1; kI++) {
      ctx.beginPath();
      ctx.moveTo(waistW * 0.19 * kI, chestBot + H * 0.005);
      ctx.lineTo(waistW * 0.23 * kI, skirtBot + H * 0.004);
      ctx.stroke();
    }
    ctx.restore();

    /* 躯干 */
    var tTop = shoulderY;
    var tBot = chestBot + H * 0.01;
    torsoPath(ctx, shoulderW, waistW * 1.02, tTop, tBot);
    var g = ctx.createLinearGradient(-shoulderW * 0.4, tTop, shoulderW * 0.45, tBot);
    g.addColorStop(0, C.bronzeLt);
    g.addColorStop(0.45, C.bronze);
    g.addColorStop(1, C.bronzeDk);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2.6, H * 0.017);
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.95;
    leiWen(ctx, 0, (tTop + tBot) * 0.52, shoulderW * 0.16, Math.max(1.3, H * 0.009), C.gold);
    ctx.restore();

    /* 受击闪白 */
    if (hurtK > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 * hurtK;
      ctx.fillStyle = "#fff3cc";
      torsoPath(ctx, shoulderW, waistW * 1.02, tTop, tBot);
      ctx.fill();
      ctx.globalAlpha = 0.72 * hurtK;
      ctx.strokeStyle = "#fffdf2";
      ctx.lineWidth = Math.max(2, H * 0.024);
      ctx.stroke();
      ctx.restore();
    }

    /* 腰带 */
    ctx.save();
    ctx.fillStyle = C.gold;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1.6, H * 0.011);
    roundRect(ctx, -waistW * 0.56, tBot - H * 0.038, waistW * 1.12, H * 0.034, H * 0.011);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* 肩甲：压在肩头的大片护肩 */
    ctx.save();
    for (var q = -1; q <= 1; q += 2) {
      var px = q * shoulderW * 0.46;
      var py = tTop + H * 0.030;
      ctx.beginPath();
      ctx.moveTo(px - q * H * 0.085, py - H * 0.045);
      ctx.quadraticCurveTo(px + q * H * 0.055, py - H * 0.075, px + q * H * 0.062, py + H * 0.020);
      ctx.quadraticCurveTo(px + q * H * 0.030, py + H * 0.098, px - q * H * 0.055, py + H * 0.075);
      ctx.quadraticCurveTo(px - q * H * 0.098, py + H * 0.020, px - q * H * 0.085, py - H * 0.045);
      ctx.closePath();
      ctx.fillStyle = C.bronzeDk;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(2, H * 0.014);
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(px - q * H * 0.060, py - H * 0.030);
      ctx.quadraticCurveTo(px + q * H * 0.030, py - H * 0.048, px + q * H * 0.040, py + H * 0.018);
      ctx.strokeStyle = "rgba(217,180,94,0.8)";
      ctx.lineWidth = Math.max(1.2, H * 0.008);
      ctx.stroke();
    }
    ctx.restore();

    /* 手臂 + 兵器 */
    var armW = H * (slim ? 0.042 : 0.058);
    var shX = shoulderW * 0.38;
    var shY = tTop + headH * 0.24;

    armTo(ctx, -shX, shY, -shX * 1.15 + Math.sin(ph) * H * 0.015, shY + H * 0.24, H * 0.03, armW, C.bronzeDk);

    var handX, handY, wepAng, bend;
    if (e.state === "windup") { handX = shX * 0.72 - H * 0.02; handY = shY + H * 0.11; wepAng = -1.02; bend = H * 0.05; }
    else if (e.state === "strike") { handX = shX + H * 0.34; handY = shY + H * 0.09; wepAng = 0.02; bend = H * 0.03; }
    else if (e.state === "recover") { handX = shX + H * 0.20; handY = shY + H * 0.19; wepAng = -0.20; bend = H * 0.04; }
    else if (e.state === "hurt") { handX = shX - H * 0.03; handY = shY + H * 0.21; wepAng = -0.52; bend = H * 0.05; }
    else { handX = shX + H * 0.13; handY = shY + H * 0.21; wepAng = -0.34; bend = H * 0.045; }

    armTo(ctx, shX, shY, handX, handY, bend, armW, C.bronze);
    drawGe(ctx, handX, handY, wepAng, H * (slim ? 0.52 : 0.62), H);

    /* 短颈 */
    ctx.save();
    ctx.fillStyle = C.bronzeDk;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1.6, H * 0.010);
    roundRect(ctx, -waistW * 0.22, headBottom - H * 0.035, waistW * 0.44, H * 0.095, H * 0.014);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = C.gold;
    roundRect(ctx, -waistW * 0.24, headBottom + H * 0.010, waistW * 0.48, H * 0.020, H * 0.007);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    /* 头 */
    drawMask(ctx, 0, headBottom, headH, hurtK);

    var fxY = shoulderY + headH * 0.18;
    if (e.state === "windup") drawWarn(ctx, now, 0, fxY, H * 0.58);
    else if (e.state === "strike") drawSwing(ctx, now, handX, handY, H * 0.60);

    ctx.restore();
  }

  /* ------------------------------------------------------------- 厚甲俑 */

  function drawBrute(ctx, e, now, hurtK) {
    var H = heightOf(e);
    var ph = num(e.walk, 0);
    var mv = e.state === "walk" ? 1 : 0.35;

    var jar = silhouette("potteryJar", false);
    var jarAspect = jar ? (jar.bb.w / jar.bb.h) : 0.896;
    var jarH = H * 0.62;
    var jarW = jarH * jarAspect;
    var jarBottom = -H * 0.10;
    var jarTop = jarBottom - jarH;
    var headH = H * 0.28;

    var bob = Math.abs(Math.sin(ph * 2)) * -H * 0.016 * mv;
    var tilt = Math.sin(ph) * 0.045 * mv;

    var legW = H * 0.088;
    var stance = jarW * 0.26;
    limb(ctx, -stance, jarBottom + H * 0.01 + bob, -stance * 1.15, -H * 0.055,
      -stance * 1.0, 0, legW, C.clayDk);
    limb(ctx, stance, jarBottom + H * 0.01 + bob, stance * 1.15, -H * 0.055,
      stance * 1.0, 0, legW, C.clay);

    ctx.save();
    ctx.fillStyle = C.clayDk;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(2, H * 0.012);
    for (var f = -1; f <= 1; f += 2) {
      roundRect(ctx, f * stance - legW * 0.9, -H * 0.03, legW * 1.8, H * 0.034, H * 0.009);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.translate(0, bob);
    ctx.translate(0, jarBottom);
    ctx.rotate(tilt);
    ctx.translate(0, -jarBottom);

    /* 躯干：陶罐 */
    if (jar) {
      drawSprite(ctx, jar, 0, jarBottom, jarH, hurtK * 0.85);
    } else {
      ctx.save();
      ctx.fillStyle = C.patina;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(2.4, H * 0.016);
      ctx.beginPath();
      ctx.ellipse(0, (jarTop + jarBottom) * 0.5, jarW * 0.5, jarH * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    /* 肩甲 */
    ctx.save();
    for (var q = -1; q <= 1; q += 2) {
      ctx.beginPath();
      ctx.ellipse(q * jarW * 0.42, jarTop + jarH * 0.20, H * 0.082, H * 0.062, q * 0.3, 0, TAU);
      ctx.fillStyle = C.bronzeDk;
      ctx.fill();
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(2.2, H * 0.015);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(q * jarW * 0.42, jarTop + jarH * 0.20, H * 0.052, H * 0.038, q * 0.3, 0, TAU);
      ctx.strokeStyle = "rgba(217,180,94,0.85)";
      ctx.lineWidth = Math.max(1.2, H * 0.008);
      ctx.stroke();
    }
    ctx.restore();

    /* 手臂 + 巨钺 */
    var armW = H * 0.078;
    var shX = jarW * 0.44;
    var shY = jarTop + jarH * 0.26;

    var handX, handY, wepAng;
    if (e.state === "windup") { handX = shX * 0.55; handY = shY + H * 0.10; wepAng = -1.0; }
    else if (e.state === "strike") { handX = shX + H * 0.30; handY = shY + H * 0.16; wepAng = 0.1; }
    else if (e.state === "recover") { handX = shX + H * 0.16; handY = shY + H * 0.26; wepAng = -0.25; }
    else if (e.state === "hurt") { handX = shX - H * 0.04; handY = shY + H * 0.24; wepAng = -0.6; }
    else { handX = shX + H * 0.10; handY = shY + H * 0.28; wepAng = -0.35; }

    armTo(ctx, -shX, shY + H * 0.02, -shX * 1.05, shY + H * 0.30, H * 0.05, armW, C.bronzeDk);
    armTo(ctx, shX, shY, handX, handY, H * 0.07, armW, C.bronze);
    drawYue(ctx, handX, handY, wepAng, H * 0.55, H);

    /* 小面具头盔 */
    drawMask(ctx, 0, jarTop + headH * 0.12, headH, hurtK);

    /* 罐口金箍 */
    ctx.save();
    ctx.strokeStyle = "rgba(217,180,94,0.7)";
    ctx.lineWidth = Math.max(1.4, H * 0.009);
    ctx.beginPath();
    ctx.ellipse(0, jarTop + jarH * 0.055, jarW * 0.34, jarH * 0.038, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    var fxY = jarTop + headH * 0.2;
    if (e.state === "windup") drawWarn(ctx, now, 0, fxY, H * 0.68);
    else if (e.state === "strike") drawSwing(ctx, now, handX, handY, H * 0.70);

    ctx.restore();
  }

  /* ---------------------------------------------------------- 纵目之主 */

  function drawBoss(ctx, e, now, hurtK) {
    var H = heightOf(e);
    var headH = H * 0.90;
    var headW = headH * 1.5032;
    var float = Math.sin(now * 1.5) * H * 0.02;
    var cy = -H * 0.55 + float;

    /* 下方灵光 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var low = ctx.createRadialGradient(0, -H * 0.16, 4, 0, -H * 0.16, H * 0.44);
    low.addColorStop(0, "rgba(255,226,150,0.32)");
    low.addColorStop(1, "rgba(255,226,150,0)");
    ctx.fillStyle = low;
    ctx.beginPath();
    ctx.arc(0, -H * 0.16, H * 0.44, 0, TAU);
    ctx.fill();
    ctx.restore();

    /* 光环：环半径要大于面具半宽，不能压在脸上 */
    ctx.save();
    ctx.translate(0, cy);
    var spin = now * 0.4;

    for (var ring = 0; ring < 2; ring++) {
      var R = H * (ring === 0 ? 0.80 : 0.99);
      var dir = ring === 0 ? 1 : -1;
      ctx.save();
      ctx.rotate(spin * dir);
      ctx.globalAlpha = ring === 0 ? 0.9 : 0.55;

      ctx.strokeStyle = "rgba(28,20,12,0.5)";
      ctx.lineWidth = H * (ring === 0 ? 0.026 : 0.020);
      ctx.setLineDash([H * 0.07, H * 0.05]);
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * 0.93, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = H * (ring === 0 ? 0.014 : 0.009);
      ctx.beginPath();
      ctx.ellipse(0, 0, R, R * 0.93, 0, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      var n = ring === 0 ? 8 : 12;
      for (var i = 0; i < n; i++) {
        var a = (i / n) * TAU;
        ctx.save();
        ctx.translate(Math.cos(a) * R, Math.sin(a) * R * 0.93);
        ctx.rotate(a);
        ctx.globalAlpha = ring === 0 ? 0.95 : 0.6;
        leiWen(ctx, 0, 0, H * (ring === 0 ? 0.036 : 0.026), Math.max(1.4, H * 0.008), ring === 0 ? C.goldHi : C.gold);
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(-spin * 0.6);
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = C.goldHi;
    ctx.lineWidth = H * 0.007;
    ctx.lineCap = "round";
    for (var k = 0; k < 4; k++) {
      var ak = (k / 4) * TAU + 0.4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ak) * H * 0.94, Math.sin(ak) * H * 0.88);
      ctx.lineTo(Math.cos(ak) * H * 1.16, Math.sin(ak) * H * 1.08);
      ctx.stroke();
    }
    ctx.restore();
    ctx.restore();

    /* 面具本体 */
    drawMask(ctx, 0, cy + headH * 0.5, headH, hurtK);

    /* 眼焰 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var glowA = 0.5 + 0.3 * Math.sin(now * 3.1);
    if (hurtK > 0) glowA = 1;
    for (var eye = -1; eye <= 1; eye += 2) {
      var ex = eye * headW * 0.125;
      var ey = cy + headH * 0.02;
      var eg = ctx.createRadialGradient(ex, ey, 1, ex, ey, headH * 0.14);
      eg.addColorStop(0, "rgba(255,246,206," + (0.9 * glowA) + ")");
      eg.addColorStop(0.45, "rgba(255,190,110," + (0.32 * glowA) + ")");
      eg.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.arc(ex, ey, headH * 0.14, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    var fxY = cy + headH * 0.1;
    if (e.state === "windup") drawWarn(ctx, now, 0, fxY, H * 0.80);
    else if (e.state === "strike") drawSwing(ctx, now, 0, fxY, H * 0.84);
  }

  /* ==================================================================
   *  逐帧动画（window.ENEMY_ANIM）
   * ================================================================== */

  var KINDS = ["walker", "fast", "brute", "boss"];

  var animCache = {};      /* kind -> [Image]，Image 只在 warmKind 里建一次 */
  var animWarmed = {};     /* kind -> true */
  var tintCache = {};      /* "kind#idx" -> 受击闪白的白剪影 canvas（按需生成） */
  var animAny = false;     /* ready() 快路径 */

  function enemyAnimData() {
    return global.ENEMY_ANIM || null;
  }

  function animDef(kind) {
    var A = enemyAnimData();
    if (!A) return null;
    var d = A[kind];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  function imageOk(im) {
    return !!(im && im.complete && im.naturalWidth > 0);
  }

  /* 建 Image 只做一次；draw 热路径里不 new Image */
  function warmKind(kind) {
    if (animWarmed[kind]) return;
    var d = animDef(kind);
    if (!d) return;
    if (typeof global.Image !== "function") return;
    animWarmed[kind] = true;
    var arr = new Array(d.files.length);
    for (var i = 0; i < d.files.length; i++) {
      var im = new global.Image();
      im.src = d.files[i];
      arr[i] = im;
    }
    animCache[kind] = arr;
  }

  function animReady() {
    if (animAny) return true;
    var A = enemyAnimData();
    if (!A) return false;
    for (var k = 0; k < KINDS.length; k++) {
      warmKind(KINDS[k]);
      var arr = animCache[KINDS[k]];
      if (!arr) continue;
      for (var f = 0; f < arr.length; f++) {
        if (imageOk(arr[f])) { animAny = true; return true; }
      }
    }
    return false;
  }

  /* 每只敌人一个极小的播放状态（只存"上一帧"，供 hurt/dead 定格） */
  function animState(e) {
    var st = e.__ea;
    if (!st) { st = { last: 0 }; e.__ea = st; }
    return st;
  }

  /* 状态 -> 帧号 */
  function pickFrame(e, d, now, st) {
    var n = d.files.length;
    if (n <= 1) return 0;
    var state = e.state;

    if (state === "windup" || state === "recover") { st.last = 0; return 0; }
    if (state === "strike") { st.last = n - 1; return n - 1; }
    /* hurt / dead：停在当前帧（用掉帧前记下的最后一帧） */
    if (state === "hurt" || state === "dead") {
      var pin = st.last | 0;
      if (pin < 0 || pin >= n) pin = 0;
      return pin;
    }

    /* walk 及未知状态：按「实际走的距离」推进，不跟真实时间跑。
       否则慢速小怪腿摆得飞快（走 110px/s 却每秒循环 3.5 次）。
       e.walk 在 index.html 里按 |vx|*dt*0.026 累加，乘 38.46 还原成像素位移。 */
    var STRIDE = { walker: 150, fast: 148, brute: 178, boss: 240 };
    var stride = STRIDE[e.kind] || 150;
    var distPx = num(e.walk, 0) * 38.46;
    /* 相位错开：让同屏多个同类敌人不同步（否则一排小兵齐步走，很假）。
       必须用「生成时就定死」的种子，不能用 e.x ——
       e.x 每帧都在变，用它算 off 等于每前进 1px 就把相位重新随机一次，
       腿会疯狂抽搐（实测 walker 每秒换帧 32 次，应 2.93 次，放大 11 倍）。
       __seed 在 spawn 时写一次，全程不变。 */
    var seed = (e.__seed != null) ? e.__seed : (e.__seed = Math.floor(num(e.x, 0) * 0.37) + 1);
    var off = hsh(seed) * n;
    var idx = Math.floor(distPx / stride * n + off) % n;
    if (idx < 0) idx += n;
    st.last = idx;
    return idx;
  }

  /* 该帧没加载完 → 回退到最近一张可用帧，不闪 */
  function usableFrame(kind, idx, st) {
    var arr = animCache[kind];
    if (!arr || !arr.length) return null;
    if (idx >= 0 && idx < arr.length && imageOk(arr[idx])) {
      st.good = idx;
      return { img: arr[idx], idx: idx };
    }
    var g = st.good;
    if (g != null && g >= 0 && g < arr.length && imageOk(arr[g])) {
      return { img: arr[g], idx: g };
    }
    for (var i = 0; i < arr.length; i++) {
      if (imageOk(arr[i])) { st.good = i; return { img: arr[i], idx: i }; }
    }
    return null;
  }

  /* 受击闪白用的纯白剪影，按 kind#idx 缓存（首次用到才建） */
  function whiteOf(kind, idx, im) {
    var key = kind + "#" + idx;
    var rec = tintCache[key];
    if (rec && rec.src === im) return rec.canvas;
    if (typeof document === "undefined" || !document.createElement) return null;
    var w = im.naturalWidth, h = im.naturalHeight;
    if (!w || !h) return null;
    var cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    var c = cv.getContext("2d");
    c.drawImage(im, 0, 0);
    c.globalCompositeOperation = "source-in";
    c.fillStyle = "#fff8e2";
    c.fillRect(0, 0, w, h);
    tintCache[key] = { src: im, canvas: cv };
    return cv;
  }

  /* BOSS 眼焰：叠在帧图上，lighter 发光 */
  function drawBossEyes(ctx, now, dx, dy, dw, dh, hurtK) {
    var cx = dx + dw * 0.5;
    var ey = dy + dh * 0.52;
    var exD = dw * 0.115;
    var R = Math.max(2, dh * 0.13);
    var a = 0.42 + 0.30 * Math.sin(now * 3.1);
    if (hurtK > 0) a = 0.95;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = -1; i <= 1; i += 2) {
      var ex = cx + i * exD;
      var g = ctx.createRadialGradient(ex, ey, 1, ex, ey, R);
      g.addColorStop(0, "rgba(255,246,206," + (0.85 * a) + ")");
      g.addColorStop(0.45, "rgba(255,190,110," + (0.30 * a) + ")");
      g.addColorStop(1, "rgba(255,170,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(ex, ey, R, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* 帧图绘制。返回 false 表示一张可用帧都没有 → 交给降级路径。 */
  function drawFrameEnemy(ctx, e, now, H, face, dead, dk, hurtK, kind, d, st) {
    var idx = pickFrame(e, d, now, st);
    var got = usableFrame(kind, idx, st);
    if (!got) return false;

    var boss = kind === "boss";
    var targetH = boss ? H * 1.6 : H;
    var dh0 = (typeof d.h === "number" && d.h > 0) ? d.h : 400;
    var dw0 = (typeof d.w === "number" && d.w > 0) ? d.w : dh0;
    var s = targetH / dh0;
    var dw = dw0 * s;
    var dh = targetH;

    var ax = (typeof d.anchorX === "number" && isFinite(d.anchorX)) ? d.anchorX : 0.5;
    var fy = (typeof d.footY === "number" && isFinite(d.footY)) ? d.footY : 1.0;

    /* 悬浮待机的 BOSS 轻轻上下浮，普通敌人脚底严格贴 e.y */
    var bottom = boss ? Math.sin(now * 1.5) * H * 0.02 : 0;
    var dx = -ax * dw;
    var dy = bottom - fy * dh;

    var pivotY = boss ? -H * 0.55 : -H * 0.28;

    ctx.save();
    if (dead) {
      ctx.globalAlpha = 1 - dk * 0.9;
      var ang = (typeof e.deathAngle === "number") ? e.deathAngle : (dk * dk * 1.35 * face);
      ctx.translate(0, pivotY);
      ctx.rotate(ang);
      ctx.translate(0, -pivotY);
      ctx.translate(0, H * 0.05 * dk);
    } else if (hurtK > 0) {
      ctx.translate(-H * 0.035 * hurtK, 0);
    }
    ctx.scale(face, 1);

    ctx.drawImage(got.img, dx, dy, dw, dh);

    /* 受击闪白：白剪影普通叠 + lighter 叠 */
    if (hurtK > 0 && !dead) {
      var wc = whiteOf(kind, got.idx, got.img);
      if (wc) {
        ctx.save();
        ctx.globalAlpha = 0.50 * hurtK;
        ctx.drawImage(wc, dx, dy, dw, dh);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.34 * hurtK;
        ctx.drawImage(wc, dx, dy, dw, dh);
        ctx.restore();
      }
    }

    if (boss) drawBossEyes(ctx, now, dx, dy, dw, dh, hurtK);

    /* 状态特效：蓄力红弧 / 挥击白弧 */
    if (!dead) {
      var arcY = boss ? (dy + dh * 0.52) : (-H * 0.58);
      if (e.state === "windup") {
        drawWarn(ctx, now, 0, arcY, H * (boss ? 0.78 : 0.56));
      } else if (e.state === "strike") {
        drawSwing(ctx, now, dw * 0.26, arcY + H * 0.10, H * (boss ? 0.82 : 0.58));
      }
    }

    ctx.restore();
    return true;
  }

  /* ------------------------------------------------------------- 入口 */

  function draw(ctx, e, t) {
    if (!ctx || !e) return;

    var now = num(t, 0);
    var H = heightOf(e);
    var face = (num(e.facing, 1) < 0) ? -1 : 1;
    var dead = e.state === "dead";
    var dk = dead ? clamp(num(e.deadT, 0) / 0.9, 0, 1) : 0;
    var hurtK = (!dead && num(e.hurtT, 0) > 0) ? clamp(num(e.hurtT, 0) / 0.22, 0, 1) : 0;

    var kind = e.kind;
    var def = animDef(kind);
    var useFrames = false;

    ctx.save();
    ctx.translate(num(e.x, 0), num(e.y, 0));

    drawShadow(ctx, e, H, dead ? (1 - dk * 0.7) : 1);

    /* ---------- 优先：逐帧动画 ---------- */
    if (def) {
      warmKind(kind);
      useFrames = drawFrameEnemy(ctx, e, now, H, face, dead, dk, hurtK,
        kind, def, animState(e));
    }

    /* ---------- 降级：原有纯代码绘制（数据缺失或帧图全没加载完） ---------- */
    if (!useFrames) {
      var pivotY = e.kind === "boss" ? -H * 0.55 : -H * 0.28;

      ctx.save();
      if (dead) {
        ctx.globalAlpha = 1 - dk * 0.9;
        var ang = (typeof e.deathAngle === "number") ? e.deathAngle : (dk * dk * 1.35 * face);
        ctx.translate(0, pivotY);
        ctx.rotate(ang);
        ctx.translate(0, -pivotY);
        ctx.translate(0, H * 0.05 * dk);
      } else if (hurtK > 0) {
        ctx.translate(-H * 0.035 * hurtK, 0);
      }
      ctx.scale(face, 1);

      if (e.kind === "boss") drawBoss(ctx, e, now, hurtK);
      else if (e.kind === "brute") drawBrute(ctx, e, now, hurtK);
      else drawWalker(ctx, e, now, hurtK, e.kind === "fast");

      ctx.restore();
    }

    if (dead) drawDebris(ctx, e, dk, H);
    else drawHpBar(ctx, e, (useFrames && kind === "boss") ? (-H * 1.6) : (-H));

    ctx.restore();
  }

  /* 帧图就绪进度：给标题页的载入条用（与 char-rig.progress 同口径）。
     不新增 Image，只数 animCache 里已有的，零内存代价。 */
  function progress() {
    var total = 0, ok = 0;
    for (var k = 0; k < KINDS.length; k++) {
      var arr = animCache[KINDS[k]];
      if (!arr) continue;
      for (var f = 0; f < arr.length; f++) {
        total++;
        if (imageOk(arr[f])) ok++;
      }
    }
    return { done: ok, total: total };
  }

  window.EnemyArt = { draw: draw, ready: ready, progress: progress };
})(window);
