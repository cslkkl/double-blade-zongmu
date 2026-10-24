/* =====================================================================
   三星堆 · 多层视差背景模块（独立文件，只画背景）
   ---------------------------------------------------------------------
   对外契约：
     window.Background.draw(ctx, camX, W, H, groundY, worldW)   -> bool
     window.Background.ready()  ->  bool

   draw() 画「角色之前」的层（由远及近，系数越大移动越快）：
     1. 远景 bgFar    视差 0.20   横向平铺，交替镜像
     2. 天空光晕      （叠在远景之上，lighter）
     3. 土黄雾        （远景 -> 中景之间，从地面向上淡出）
     4. 中景 bgMid    视差 0.50   底部贴 groundY，横向平铺，交替镜像
     5. 静物道具 × 11 视差 1.00   底部贴 groundY，散在世界坐标上
     6. 地面 ground   视差 1.00   顶部对齐 groundY，横向平铺，交替镜像
     7. 地面线        （深色描边 + 极淡暖金）
     8. 暗角          （四周压暗，中间透明）

   没有「角色之后」的前景层了：原来 3 座高大遮挡物（纵目面具浮雕 / 铜鼎 /
   神树）画在角色之上，角色走过去就被完全盖住，只好给角色加一条「被遮挡时
   压到 52% alpha」的淡出。那条淡出是硬切换、判定只看 x 不看高度，走过道具
   旁边就闪一下半透明，读起来像 bug。整套已删除：遮挡物退回中景 PROPS，
   角色任何时候都是满不透明。

   坐标约定：本模块只在屏幕坐标系里用 camX 计算偏移，不做 translate 到
   世界坐标。所有绘制 ctx.save() / ctx.restore() 成对，颜色/合成模式不泄漏到外部。
   ===================================================================== */
(function (global) {
  "use strict";

  /* ------------------------------------------------------------------
     视差系数
     ------------------------------------------------------------------ */
  var P_FAR      = 0.20;   // 远景
  var P_MID      = 0.50;   // 中景
  var P_GROUND   = 1.00;   // 地面（与世界同速）

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
     静物道具（中景之后、地面之前）
     ------------------------------------------------------------------
     不再画落地阴影：素材是平涂厚描边，底下一坨黑色椭圆会读成「贴纸浮空」，
     和角色自带的 drawShadow 也打架。道具只靠底部与地面线的咬合定位。
     ------------------------------------------------------------------ */
  function drawProps(ctx) {
    var I = global.IMG;
    if (!I) return;

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
     参数归一
     ================================================================== */

  /* 调用方传错也不炸 */
  function normParams(camX, W, H, groundY, worldW) {
    _camX    = (typeof camX === "number" && isFinite(camX)) ? camX : 0;
    _W       = (typeof W === "number" && W > 0) ? W : DEF_W;
    _H       = (typeof H === "number" && H > 0) ? H : DEF_H;
    _groundY = (typeof groundY === "number" && isFinite(groundY)) ? groundY : DEF_GROUND;
    _worldW  = (typeof worldW === "number" && worldW > 0) ? worldW : DEF_WORLD;
    if (_groundY < 0) _groundY = 0;
    if (_groundY > _H) _groundY = _H;
  }

  /* ==================================================================
     主绘制
     ================================================================== */
  /* 返回值：true = 已完整绘制素材背景；false = 一张都没画，调用方必须回落到 drawBG()。
     返回 false 时不会留下任何像素（判定在绘制之前），所以调用方可以直接补画。 */
  function draw(ctx, camX, W, H, groundY, worldW) {
    if (!ctx) return false;

    /* ---- 参数归一（后面的辅助函数从模块缓存里读当帧参数） ---- */
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
    ready: ready
  };

})(window);
