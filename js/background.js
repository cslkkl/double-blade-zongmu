/* =====================================================================
   三星堆 · 多层视差背景模块（独立文件，只画背景）
   ---------------------------------------------------------------------
   对外契约：
     window.Background.draw(ctx, camX, W, H, groundY, worldW)   -> bool
     window.Background.drawFront(ctx, camX, W, H, groundY, worldW) -> bool
     window.Background.ready()  ->  bool
     window.Background.occluders() -> [{ x, w, top }]

   draw() 画「角色之前」的层（由远及近，系数越大移动越快）：
     1. 远景 bgFar    视差 0.20   横向平铺，交替镜像
     2. 天空光晕      （叠在远景之上，lighter）
     3. 土黄雾        （远景 -> 中景之间，从地面向上淡出）
     4. 中景 bgMid    视差 0.50   底部贴 groundY，横向平铺，交替镜像
     5. 静物道具 × 11 视差 1.00   底部贴 groundY，散在世界坐标上
     6. 地面 ground   视差 1.00   顶部对齐 groundY，横向平铺，交替镜像
     7. 地面线        （深色描边 + 极淡暖金）
     8. 暗角          （四周压暗，中间透明）

   drawFront() 画「角色之后」的真正前景遮挡层，必须等角色、刀光、粒子
   全部落屏后再调用，否则起不到遮挡作用：
     · 5 座高大遮挡物（祭旗 / 编钟 / 玉璋碑 / 铜鼎 / 神树），视差 1.00
     · 底部贴 groundY，高度 320~366px（角色 252px，全部高于角色）
     · 素材缺失时逐个回落到纯代码石柱，不白屏、不抛错

   坐标约定：本模块只在屏幕坐标系里用 camX 计算偏移，不做 translate 到
   世界坐标。occluders() 的 x 是世界坐标（方便和实体 p.x 直接比），
   top 是遮挡物顶部的屏幕 y。
   所有绘制 ctx.save() / ctx.restore() 成对，颜色/合成模式不泄漏到外部。
   ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------
     视差系数
     ------------------------------------------------------------------ */
  var P_FAR      = 0.20;   // 远景
  var P_MID      = 0.50;   // 中景
  var P_GROUND   = 1.00;   // 地面（与世界同速）
  var P_OCCLUDER = 1.00;   // 前景遮挡物：与世界同速，遮挡关系才对得上 x

  /* ------------------------------------------------------------------
     常量 / 默认值
     ------------------------------------------------------------------ */
  var DEF_W = 1600, DEF_H = 900, DEF_GROUND = 706, DEF_WORLD = 3400;

  /* 远景图（1599×900）里太阳的像素位置；光晕跟着远景视差一起漂移 */
  var SUN_X = 760, SUN_Y = 300;

  /* 当前帧参数，模块内部缓存，避免辅助函数层层传参 */
  var _camX = 0, _W = DEF_W, _H = DEF_H, _groundY = DEF_GROUND, _worldW = DEF_WORLD;

  /* ------------------------------------------------------------------
     静物道具：世界坐标（x 为中心），底部一律贴 groundY
     h 是绘制高度（像素），宽度按素材原始比例换算 —— 素材尺寸未知也稳。
     高低错落、间距不均，避免排成一条直线。
     ------------------------------------------------------------------ */
  var PROPS = [
    { k: "sacredTree",  x:  200, h: 246, flip: false },
    { k: "banner",      x:  550, h: 196, flip: true  },
    { k: "potteryJar",  x:  880, h:  76, flip: false },
    { k: "bellCluster", x: 1190, h: 144, flip: false },
    { k: "brazier",     x: 1500, h: 106, flip: false },
    { k: "maskRelief",  x: 1830, h: 164, flip: true  },
    { k: "jadeTablet",  x: 2110, h:  50, flip: false },
    { k: "sacredTree",  x: 2400, h: 262, flip: true  },
    { k: "banner",      x: 2740, h: 188, flip: false },
    { k: "bellCluster", x: 3030, h: 136, flip: true  },
    { k: "potteryJar",  x: 3290, h:  68, flip: true  }
  ];

  /* 需要参与 ready() 判定的图 */
  var CORE_KEYS = ["bgFar", "bgMid", "ground"];
  var PROP_KEYS = ["sacredTree", "maskRelief", "brazier", "potteryJar",
                   "banner", "bellCluster", "jadeTablet"];

  /* ------------------------------------------------------------------
     前景遮挡物（drawFront 专用，画在角色之后）
     ------------------------------------------------------------------
     x   ：世界坐标中心（视差 1.00，所以屏幕 x = x - camX）
     w   ：遮挡判定宽度；w * 0.42 是「角色算被挡住」的半宽
     h   ：绘制高度，全部 >= 320px，高于角色 252px
     w / h 按素材真实像素比例配准，所以按比例 contain 进 w × h 的框后，
     实际绘制高度就是 h，不会被压矮：
       banner      246×460 → 0.535
       bellCluster 305×460 → 0.663
       jadeTablet  452×460 → 0.983
       brazier     460×440 → 1.045
       sacredTree  460×364 → 1.264
     分布刻意避开出生点 560 / 700（玩家一 560、玩家二 700）。
     ------------------------------------------------------------------ */
  var OCCLUDERS = [
    { k: "banner",      x:   400, h: 350, w: 187, flip: true  },  // 祭旗
    { k: "bellCluster", x:  1050, h: 320, w: 212, flip: false },  // 编钟
    { k: "jadeTablet",  x:  1750, h: 366, w: 360, flip: false },  // 玉璋碑
    { k: "brazier",     x:  2450, h: 330, w: 345, flip: true  },  // 铜鼎
    { k: "sacredTree",  x:  3050, h: 364, w: 460, flip: false }   // 神树
  ];

  /* ------------------------------------------------------------------
     图片工具
     ------------------------------------------------------------------ */
  function img(key) {
    var I = global.IMG;
    return (I && I[key]) ? I[key] : null;
  }

  function imgW(im) { return im.naturalWidth || im.width || 0; }
  function imgH(im) { return im.naturalHeight || im.height || 0; }

  /* 可绘制：加载中/失败/尺寸为 0 都判掉 */
  function okImg(im) {
    if (!im) return false;
    if (im.complete === false) return false;
    return imgW(im) > 0 && imgH(im) > 0;
  }

  /* 就绪（核心图）：加载中、加载失败、尺寸为 0 都不算就绪。
     失败图的 complete 也是 true，所以必须再看 naturalWidth：
     bg-far 挂了要能被 ready() 判掉，让调用方回落纯代码 drawBG()。 */
  function usable(im) {
    if (!im) return false;
    if (im.complete !== true) return false;
    return imgW(im) > 0 && imgH(im) > 0;
  }

  /* 落定：只区分"还在加载"与"已落定"。
     道具是可选层，加载失败由 drawProps 的 okImg 逐张剔除，不阻塞背景整体。 */
  function settled(im) {
    if (!im) return false;
    return im.complete === true;
  }

  /* CORE_KEYS 全部可绘制才算素材背景成立（核心清单见顶部 CORE_KEYS） */
  function coreUsable() {
    var I = global.IMG;
    if (!I) return false;
    for (var i = 0; i < CORE_KEYS.length; i++) {
      if (!usable(I[CORE_KEYS[i]])) return false;
    }
    return true;
  }

  /* ------------------------------------------------------------------
     平铺：只画屏幕范围内的副本
     ------------------------------------------------------------------ */
  function drawTile(ctx, im, x, y, w, h, mirror) {
    if (mirror) {
      ctx.save();
      ctx.translate(x + w, y);
      ctx.scale(-1, 1);
      ctx.drawImage(im, 0, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(im, x, y, w, h);
    }
  }

  /**
   * 把 im 以 tileW × tileH 的大小横向平铺，垂直固定在 destY。
   * 屏幕内副本才画；mirrorAlt 为真时奇偶副本水平镜像，接缝不重复。
   */
  function drawLayer(ctx, im, parallax, tileW, tileH, destY, mirrorAlt, alpha) {
    if (!im || !(tileW > 0) || !(tileH > 0)) return;

    var off = _camX * parallax;                       // 该层的滚动量
    var i0 = Math.floor(off / tileW) - 1;
    var i1 = Math.floor((off + _W) / tileW) + 1;
    if (i1 - i0 > 64) i1 = i0 + 64;                   // 极端参数保护

    ctx.save();
    if (typeof alpha === "number" && alpha < 1) ctx.globalAlpha = alpha;

    for (var i = i0; i <= i1; i++) {
      var x = i * tileW - off;
      if (x >= _W || x + tileW <= 0) continue;        // 屏幕外，跳过
      drawTile(ctx, im, x, destY, tileW, tileH, mirrorAlt && (i & 1) === 1);
    }

    ctx.restore();
  }

  /* ------------------------------------------------------------------
     天空光晕：从太阳位置发散的暖金光（lighter，很淡）
     ------------------------------------------------------------------ */
  function drawSunGlow(ctx) {
    var baseX = SUN_X - _camX * P_FAR;                // 跟着远景一起漂
    var R = 620;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var k = -1; k <= 1; k++) {
      var sx = baseX + k * _W;                        // 环绕副本，避免边缘突现
      if (sx < -R || sx > _W + R) continue;

      var halo = ctx.createRadialGradient(sx, SUN_Y, 0, sx, SUN_Y, R);
      halo.addColorStop(0,    "rgba(255,226,158,0.17)");
      halo.addColorStop(0.32, "rgba(255,198,106,0.085)");
      halo.addColorStop(0.68, "rgba(240,158,64,0.028)");
      halo.addColorStop(1,    "rgba(255,150,50,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(sx - R, SUN_Y - R, R * 2, R * 2);

      var core = ctx.createRadialGradient(sx, SUN_Y, 0, sx, SUN_Y, 190);
      core.addColorStop(0,   "rgba(255,242,206,0.20)");
      core.addColorStop(0.5, "rgba(255,208,124,0.07)");
      core.addColorStop(1,   "rgba(255,180,80,0)");
      ctx.fillStyle = core;
      ctx.fillRect(sx - 190, SUN_Y - 190, 380, 380);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     远景 -> 中景之间的土黄雾，让远景退远
     ------------------------------------------------------------------ */
  function drawFog(ctx) {
    var top = Math.max(0, _groundY - 560);
    if (top >= _groundY) return;

    var g = ctx.createLinearGradient(0, _groundY, 0, top);
    g.addColorStop(0,    "rgba(210,170,90,0.18)");
    g.addColorStop(0.45, "rgba(208,168,88,0.10)");
    g.addColorStop(1,    "rgba(206,166,86,0)");

    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, top, _W, _groundY - top);
    ctx.restore();
  }

  /* ------------------------------------------------------------------
     道具落地阴影（离屏 sprite 缓存，避免每帧建渐变）
     ------------------------------------------------------------------ */
  var _shadow = null;

  function shadowSprite() {
    if (_shadow !== null) return _shadow;
    if (typeof document === "undefined") { _shadow = false; return false; }

    var c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    var g2 = c.getContext("2d");
    if (!g2) { _shadow = false; return false; }

    g2.save();
    g2.translate(64, 32);
    g2.scale(1, 0.5);
    var gd = g2.createRadialGradient(0, 0, 0, 0, 0, 64);
    gd.addColorStop(0, "rgba(0,0,0,0.52)");
    gd.addColorStop(0.55, "rgba(0,0,0,0.22)");
    gd.addColorStop(1, "rgba(0,0,0,0)");
    g2.fillStyle = gd;
    g2.beginPath();
    g2.arc(0, 0, 64, 0, Math.PI * 2);
    g2.fill();
    g2.restore();

    _shadow = c;
    return c;
  }

  /* ------------------------------------------------------------------
     静物道具（中景之后、地面之前）
     ------------------------------------------------------------------ */
  function drawProps(ctx) {
    var I = global.IMG;
    if (!I) return;
    var sp = shadowSprite();

    for (var i = 0; i < PROPS.length; i++) {
      var p = PROPS[i];
      if (p.x < -200 || p.x > _worldW + 200) continue;

      var im = I[p.k];
      if (!okImg(im)) continue;

      var iw = imgW(im), ih = imgH(im);
      if (!(iw > 0) || !(ih > 0)) continue;

      var w = p.h * (iw / ih);                        // 保持素材比例
      var sx = p.x - _camX;                           // 视差 1.0
      var left = sx - w * 0.5;

      if (left + w < -80 || left > _W + 80) continue; // 视口剔除

      var top = _groundY - p.h;

      /* 落地阴影：只露地面线以上的半截，像压在土面上 */
      if (sp) {
        var rw = Math.max(24, w * 0.46);
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(sp, sx - rw, _groundY - rw * 0.26, rw * 2, rw * 0.52);
        ctx.restore();
      }

      /* 本体 */
      if (p.flip) {
        ctx.save();
        ctx.translate(left + w, top);
        ctx.scale(-1, 1);
        ctx.drawImage(im, 0, 0, w, p.h);
        ctx.restore();
      } else {
        ctx.drawImage(im, left, top, w, p.h);
      }
    }
  }

  /* ------------------------------------------------------------------
     地面线：深色描边，让角色脚底有依托
     ------------------------------------------------------------------ */
  function drawGroundLine(ctx) {
    ctx.save();

    ctx.strokeStyle = "rgba(5,4,3,0.74)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, _groundY);
    ctx.lineTo(_W, _groundY);
    ctx.stroke();

    ctx.strokeStyle = "rgba(212,170,96,0.16)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, _groundY + 2.6);
    ctx.lineTo(_W, _groundY + 2.6);
    ctx.stroke();

    ctx.restore();
  }

  /* ------------------------------------------------------------------
     暗角：四周压暗，中间透明
     ------------------------------------------------------------------ */
  function drawVignette(ctx) {
    var cx = _W * 0.5, cy = _H * 0.54;
    var inner = Math.min(_W, _H) * 0.28;
    var outer = Math.sqrt(cx * cx + cy * cy) * 1.02;

    ctx.save();

    var vg = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    vg.addColorStop(0,    "rgba(0,0,0,0)");
    vg.addColorStop(0.56, "rgba(0,0,0,0.14)");
    vg.addColorStop(1,    "rgba(0,0,0,0.64)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, _W, _H);

    var topH = 190;
    var gt = ctx.createLinearGradient(0, 0, 0, topH);
    gt.addColorStop(0, "rgba(0,0,0,0.34)");
    gt.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gt;
    ctx.fillRect(0, 0, _W, topH);

    var botH = 150;
    var gb = ctx.createLinearGradient(0, _H - botH, 0, _H);
    gb.addColorStop(0, "rgba(0,0,0,0)");
    gb.addColorStop(1, "rgba(0,0,0,0.46)");
    ctx.fillStyle = gb;
    ctx.fillRect(0, _H - botH, _W, botH);

    ctx.restore();
  }

  /* ==================================================================
     前景遮挡层（drawFront 专用：画在角色、刀光、粒子之后）
     ================================================================== */

  /* 参数归一：draw 与 drawFront 共用，调用方传错也不炸 */
  function normParams(camX, W, H, groundY, worldW) {
    _camX    = (typeof camX === "number" && isFinite(camX)) ? camX : 0;
    _W       = (typeof W === "number" && W > 0) ? W : DEF_W;
    _H       = (typeof H === "number" && H > 0) ? H : DEF_H;
    _groundY = (typeof groundY === "number" && isFinite(groundY)) ? groundY : DEF_GROUND;
    _worldW  = (typeof worldW === "number" && worldW > 0) ? worldW : DEF_WORLD;
    if (_groundY < 0) _groundY = 0;
    if (_groundY > _H) _groundY = _H;
  }

  /* 纯代码兜底石柱：素材缺失时也不留空洞。
     seed 只用来做确定性微差异，不依赖随机数，同一帧重绘结果一致。 */
  function drawStonePillar(ctx, cx, top, w, h, seed) {
    var half = w * 0.5;
    var wob = (seed % 3) * 3;                          // 柱身收分微差

    /* 柱身：中间受光，两侧压暗 */
    var pg = ctx.createLinearGradient(cx - half, 0, cx + half, 0);
    pg.addColorStop(0,    "#150f09");
    pg.addColorStop(0.34, "#3b2e1e");
    pg.addColorStop(0.58, "#4a3a26");
    pg.addColorStop(0.82, "#2a2015");
    pg.addColorStop(1,    "#120d08");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(cx - half + wob * 0.5, top + 16);
    ctx.lineTo(cx + half - wob * 0.5, top + 10);
    ctx.lineTo(cx + half + wob, _groundY);
    ctx.lineTo(cx - half - wob, _groundY);
    ctx.closePath();
    ctx.fill();

    /* 柱头 */
    ctx.fillStyle = "#241b12";
    ctx.fillRect(cx - w * 0.62, top - 4, w * 1.24, 22);

    /* 纵目刻纹：一对凸起的大眼，三星堆符号 */
    var ey = top + h * 0.24;
    var ew = Math.min(34, w * 0.26);
    ctx.fillStyle = "#6b5731";
    ctx.beginPath();
    ctx.ellipse(cx, ey, ew, ew * 0.52, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a130b";
    ctx.beginPath();
    ctx.ellipse(cx, ey, ew * 0.5, ew * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();

    /* 横向凿痕，给柱身一点层次 */
    ctx.strokeStyle = "rgba(10,7,4,0.55)";
    ctx.lineWidth = 2;
    for (var i = 1; i <= 4; i++) {
      var ly = top + h * (0.36 + i * 0.12);
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.7, ly);
      ctx.lineTo(cx + half * 0.7, ly);
      ctx.stroke();
    }
  }

  /* 单个遮挡物：落地阴影 + 基座 + 素材（缺失则石柱） */
  function drawOccluder(ctx, o, seed) {
    var boxW = o.w, boxH = o.h;
    var sx = o.x - _camX * P_OCCLUDER;                 // 世界坐标 -> 屏幕坐标
    var halfW = Math.min(boxW, o.w) * 0.5;

    /* 视口剔除：连带着一点余量，避免边缘闪现 */
    if (sx + halfW < -120 || sx - halfW > _W + 120) return;

    var top = _groundY - boxH;

    /* 落地阴影 */
    var sp = shadowSprite();
    if (sp) {
      var rw = Math.max(46, boxW * 0.52);
      ctx.save();
      ctx.globalAlpha = 0.62;
      ctx.drawImage(sp, sx - rw, _groundY - rw * 0.28, rw * 2, rw * 0.56);
      ctx.restore();
    }

    /* 基座：横在角色脚前，读作「近处的东西」 */
    var pw = boxW * 1.18;
    var pg = ctx.createLinearGradient(0, _groundY - 20, 0, _groundY + 10);
    pg.addColorStop(0, "rgba(58,44,28,0.92)");
    pg.addColorStop(0.62, "rgba(30,22,14,0.95)");
    pg.addColorStop(1, "rgba(12,9,6,0.9)");
    ctx.save();
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.moveTo(sx - pw * 0.5, _groundY - 16);
    ctx.lineTo(sx + pw * 0.5, _groundY - 16);
    ctx.lineTo(sx + pw * 0.42, _groundY + 10);
    ctx.lineTo(sx - pw * 0.42, _groundY + 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* 本体：素材按比例 contain 进 w × h 的框，底部贴 groundY */
    var im = img(o.k);
    var drawn = false;
    if (okImg(im)) {
      var iw = imgW(im), ih = imgH(im);
      if (iw > 0 && ih > 0) {
        var sc = Math.min(boxW / iw, boxH / ih);
        var dw = iw * sc, dh = ih * sc;
        var left = sx - dw * 0.5;
        var dy = _groundY - dh;
        if (o.flip) {
          ctx.save();
          ctx.translate(left + dw, dy);
          ctx.scale(-1, 1);
          ctx.drawImage(im, 0, 0, dw, dh);
          ctx.restore();
        } else {
          ctx.drawImage(im, left, dy, dw, dh);
        }
        drawn = true;
      }
    }
    if (!drawn) drawStonePillar(ctx, sx, top, boxW, boxH, seed);

    /* 底部压暗：让遮挡物和地面咬合，避免「贴纸浮空」 */
    ctx.save();
    var gb = ctx.createLinearGradient(0, _groundY - 84, 0, _groundY + 6);
    gb.addColorStop(0, "rgba(6,5,4,0)");
    gb.addColorStop(1, "rgba(6,5,4,0.44)");
    ctx.fillStyle = gb;
    ctx.fillRect(sx - pw * 0.55, _groundY - 84, pw * 1.1, 90);
    ctx.restore();
  }

  /* 只画前景遮挡。调用方必须在角色之后调用。 */
  function drawFront(ctx, camX, W, H, groundY, worldW) {
    if (!ctx) return false;
    normParams(camX, W, H, groundY, worldW);

    /* 背景素材没就绪时整层不画：不留半成品，也不抛错 */
    if (!ready()) return false;

    for (var i = 0; i < OCCLUDERS.length; i++) {
      drawOccluder(ctx, OCCLUDERS[i], i);
    }
    return true;
  }

  /* 查询接口：给 index.html 判断「这个 x 的角色是否被挡」
     返回 [{ x, w, top }]，x 是世界坐标中心，top 是遮挡物顶部的屏幕 y。
     遮挡层画不出来（ready() 为假 → drawFront 直接返回）时返回空数组：
     否则角色会在没有任何遮挡物的情况下变半透明，变成幽灵。 */
  function occluders() {
    var out = [];
    if (!ready()) return out;
    for (var i = 0; i < OCCLUDERS.length; i++) {
      var o = OCCLUDERS[i];
      out.push({ x: o.x, w: o.w, top: _groundY - o.h });
    }
    return out;
  }

  /* ==================================================================
     主绘制
     ================================================================== */
  /* 返回值：true = 已完整绘制素材背景；false = 一张都没画，调用方必须回落到 drawBG()。
     返回 false 时不会留下任何像素（判定在绘制之前），所以调用方可以直接补画。 */
  function draw(ctx, camX, W, H, groundY, worldW) {
    if (!ctx) return false;

    /* ---- 参数归一（先归一，occluders() 才能拿到当帧的 camX / groundY） ---- */
    normParams(camX, W, H, groundY, worldW);

    /* ---- 兜底闸门：三张核心图任一不可用就整个放弃，交给纯代码背景 ---- */
    if (!coreUsable()) return false;


    /* ---- 0. 兜底底色（图没到位时不至于整屏黑） ---- */
    ctx.save();
    var sky = ctx.createLinearGradient(0, 0, 0, _groundY);
    sky.addColorStop(0,   "#231808");
    sky.addColorStop(0.55, "#3b2712");
    sky.addColorStop(1,   "#4e3419");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, _W, _H);
    ctx.restore();

    /* ---- 1. 远景（视差 0.20）：拉伸铺满整屏，横向平铺 ---- */
    var far = img("bgFar");
    if (!okImg(far)) return false;                    // 没图就一张都不画，交给调用方回落
    drawLayer(ctx, far, P_FAR, _W, _H, 0, true, 1);

    /* ---- 2. 天空光晕（远景之上） ---- */
    drawSunGlow(ctx);

    /* ---- 3. 远景 -> 中景的土黄雾 ---- */
    drawFog(ctx);

    /* ---- 4. 中景（视差 0.50）：底部贴地面线，横向平铺 + 交替镜像 ---- */
    var mid = img("bgMid");
    if (okImg(mid)) {
      var mh = _W * (imgH(mid) / imgW(mid));
      var mw = _W;
      if (mh > _groundY && _groundY > 0) {            // 不允许中景越过画面顶部
        mh = _groundY;
        mw = mh * (imgW(mid) / imgH(mid));
      }
      if (mh > 0 && mw > 0) {
        drawLayer(ctx, mid, P_MID, mw, mh, _groundY - mh, true, 1);
      }
    }

    /* ---- 5. 静物道具（视差 1.0，中景之后 / 地面之前） ---- */
    drawProps(ctx);

    /* ---- 6. 地面（视差 1.0）：顶部对齐 groundY ---- */
    var gh = _H - _groundY;

    ctx.save();                                       // 深色托底，避免露空白
    var ggrad = ctx.createLinearGradient(0, _groundY, 0, _H);
    ggrad.addColorStop(0,    "#251c11");
    ggrad.addColorStop(0.45, "#18130c");
    ggrad.addColorStop(1,    "#08070a");
    ctx.fillStyle = ggrad;
    ctx.fillRect(0, _groundY, _W, gh);
    ctx.restore();

    var gimg = img("ground");
    if (okImg(gimg) && gh > 8) {
      var gw = gh * (imgW(gimg) / imgH(gimg));        // 垂直正好填满地面带
      if (gw > 0) drawLayer(ctx, gimg, P_GROUND, gw, gh, _groundY, true, 1);
    }

    /* ---- 7. 地面线 ---- */
    drawGroundLine(ctx);

    /* ---- 8. 暗角 ---- */
    drawVignette(ctx);

    /* 前景遮挡不在这里画：它必须盖在角色之上，由调用方在角色落屏后
       调 Background.drawFront() —— 见本文件顶部说明。 */

    return true;                                      // 素材背景已完整落屏
  }

  /* ==================================================================
     就绪
     ================================================================== */
  function ready() {
    var I = global.IMG;
    if (!I) return false;

    /* 核心图：加载失败也算没就绪 -> 调用方回落 drawBG() */
    if (!coreUsable()) return false;

    for (var j = 0; j < PROP_KEYS.length; j++) {
      var p = I[PROP_KEYS[j]];
      if (p && !settled(p)) return false;             // 提供了但还在加载
    }
    return true;
  }

  /* ==================================================================
     导出
     ================================================================== */
  global.Background = {
    draw: draw,
    drawFront: drawFront,
    occluders: occluders,
    ready: ready
  };

})(window);
