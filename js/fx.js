/* =========================================================================
 * fx.js — 刀光 / HUD 底板 / 受伤渐晕
 * 独立 Canvas 2D 绘制模块，只依赖 window.IMG 与调用方传入的 ctx。
 * 刀光的朝向见下方 ART_CONVEX：**面朝右镜像、面朝左原样**（与常规相反）。
 * 无外部库，无 console 输出。
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- 常量 */

  var GOLD_HI = "#fff6d8";
  var GOLD_MID = "#e8c87e";
  var GOLD_LO = "#b8903f";
  var INK = "#3a2a10";

  var TAU = Math.PI * 2;

  /* ------------------------------------------------------- 刀光朝向契约 */
  /* 源画的月牙**凸背朝左**、凹口朝右（「(」形），实测见
     .agents/notes/依据-半月斩素材左右不对称.md：
     三张通用素材的脊线弧心 cx/w 分别为 1.0272 / 0.8573 / 0.6553，
     全部 > 0.5 —— 圆心在右，凸背在左。12 张武器专属弧光同一口径。

     玩法要求是**凸背朝人面向的方向**（维护者 2026-10-25 定），于是：
       面朝右（facing > 0）→ 必须镜像，凸背才朝右；
       面朝左（facing < 0）→ 用原样，凸背本来就朝左。
     这与「素材朝右、朝左才镜像」的常规写法**正好相反**。

     旧的 `if (facing < 0) ctx.scale(-1,1)` 把凸背送进了人背后，
     这才是「面朝左时特效反了」的真正原因 —— 两个朝向都反，左挥只是更明显。
     改之前先量：把条件改回 facing < 0 会让朝向再次整体翻转。 */
  var ART_CONVEX = -1;                  // 源画凸背指向 -x

  function slashMirror(facing) {
    return (ART_CONVEX < 0) ? (facing > 0) : (facing < 0);
  }

  /* ------------------------------------------------- 刀光实测锚定表
     由 tools/measure_slash.py 生成，勿手改。
     cx / cy = 脊线弧心（按画布宽 / 高归一化），r = 脊线半径（按画布宽归一化）。
     用途只有一个：让刃口那线高光**落在月牙身上**。
     旧代码在原点画一个 r≈pick.r 的弧，而真实脊线圆心在 +0.65~1.03 宽处、
     半径 0.41~0.87 宽 —— 两者差 40px 以上，高光整根悬在月牙外。
     换素材（重跑生图）必须重跑 measure_slash.py 重新填表，否则高光会飘。 */
  var ARC = {
    slash1: { cx: 1.0272, cy: 0.4811, r: 0.8725 },
    slash2: { cx: 0.8573, cy: 0.4862, r: 0.6604 },
    slash3: { cx: 0.6553, cy: 0.4860, r: 0.4070 },
    short:  { cx: 0.7213, cy: 0.4915, r: 0.5124 },
    dagger: { cx: 0.8169, cy: 0.4940, r: 0.6128 },
    sword:  { cx: 1.0197, cy: 0.4948, r: 0.8622 },
    axe:    { cx: 0.8999, cy: 0.4853, r: 0.5706 },
    hammer: { cx: 0.5178, cy: 0.4998, r: 0.3270 },
    spear:  { cx: 0.6284, cy: 0.4983, r: 0.1502 }
  };

  /* ---------------------------------------------------------------- 工具 */

  function clamp(v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  }

  function num(v, dflt) {
    return (typeof v === "number" && isFinite(v)) ? v : dflt;
  }

  function imgOf(name) {
    var imgs = global.IMG;
    if (!imgs) return null;
    var img = imgs[name];
    if (!img) return null;
    if (img.complete === false) return null;
    if (typeof img.naturalWidth === "number" && img.naturalWidth <= 0) return null;
    return img;
  }

  /* ------------------------------------------------- 武器专属特效图缓存
     WEAPON_FX / HIT_MATERIAL 里的图不在 assets.js 的清单里（那张清单只管
     界面与世界道具），这里按 file 路径自建 Image：**只在首次用到时建一次**，
     draw 热路径只读缓存，绝不 new Image。
     返回 null = 还没就绪 / 已失败 → 调用方回落通用刀光或纯代码弧光。 */
  var fxCache = Object.create ? Object.create(null) : {};

  function fxImg(file) {
    if (!file) return null;
    var img = fxCache[file];
    if (!img) {
      if (typeof Image !== "function") return null;
      img = new Image();
      img.src = file;
      fxCache[file] = img;
      return null;                 // 刚建出来必然没就绪，这一帧走降级
    }
    if (img.complete === false) return null;
    if (typeof img.naturalWidth === "number" && img.naturalWidth <= 0) return null;
    return img;
  }

  function weaponFxOf(key) {
    var W = global.WEAPON_FX;
    if (!W || !key) return null;
    var d = W[key];
    if (!d || !d.file) return null;
    return d;
  }

  function matImage(mat) {
    var M = global.HIT_MATERIAL;
    if (!M || !mat) return null;
    var file = M[mat];
    if (!file) return null;
    return fxImg(file);
  }

  /* 武器专属刀光是否可用（index.html 用它决定要不要挂 wkey） */
  function weaponFxReady(key) {
    var d = weaponFxOf(key);
    if (!d) return false;
    return !!fxImg(d.file);
  }

  function matHitReady(mat) {
    return !!matImage(mat);
  }

  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) * 0.5, Math.abs(h) * 0.5);
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

  /* ------------------------------------------------ 刀光：图片 + 降级 */

  /* 武器专属刀光的色相：同一套弧光图，靠这层描边把「玉 / 青铜 / 钝击 /
     破空 / 投掷」区分开。图本身已经各画各的形状，这里再补一线彩色刃光，
     保证在暗背景上也一眼分得出拿的是哪把刀。 */
  var WPN_RIM = {
    short:  "rgba(216,242,228,.95)",
    dagger: "rgba(232,240,236,.95)",
    blade:  "rgba(205,233,214,.95)",
    sword:  "rgba(255,222,150,.95)",
    axe:    "rgba(255,196,120,.95)",
    spear:  "rgba(214,240,255,.95)",
    hammer: "rgba(238,196,132,.95)",
    bow:    "rgba(190,236,255,.95)",
    rock:   "rgba(216,206,190,.95)",
    jar:    "rgba(255,176,102,.95)",
    bell:   "rgba(159,208,168,.95)"
  };

  /* 投掷与弓箭没有「挥砍弧」，它们的手上动作不该出现金色月牙：
     这两种类型的特效走弹道（见 index.html 的 drawProjectileFx），
     这里直接不出图，避免手里凭空炸一道弧。 */
  var NO_ARC = { bow: 1, rock: 1, blade: 1, jar: 1, bell: 1 };

  function slashImageFor(s) {
    if (s.big) return { img: imgOf("slash3"), scale: 1.0, r: 126, key: "slash3" };
    // 第二段（或任意调用方标记的段数）用 slash2；其余用 slash1
    var seg = num(s.seg, num(s.stage, num(s.index, num(s.variant, num(s.combo, 1)))));
    if (seg >= 2) return { img: imgOf("slash2"), scale: 0.86, r: 112, key: "slash2" };
    return { img: imgOf("slash1"), scale: 0.72, r: 98, key: "slash1" };
  }

  /* 图片未就绪时的纯代码弧形光：外晕 + 亮芯 + 细描边 */
  function drawFallbackSlash(ctx, radius, t) {
    var spread = 1.16 + 0.22 * t;              // 弧张开角度（弧度）
    var a0 = -1.24 + t * 1.02;
    var a1 = a0 + spread;
    var rOut = radius * (1.0 + 0.28 * t);
    var rIn = rOut * 0.46;
    var fade = Math.pow(1 - t, 0.82);

    // 外晕
    ctx.globalAlpha = 0.62 * fade;
    var glow = ctx.createRadialGradient(0, 0, rIn * 0.7, 0, 0, rOut);
    glow.addColorStop(0, "rgba(255,246,216,0)");
    glow.addColorStop(0.55, "rgba(255,246,216,0.55)");
    glow.addColorStop(0.82, "rgba(232,200,126,0.85)");
    glow.addColorStop(1, "rgba(232,200,126,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, rOut, a0, a1);
    ctx.arc(0, 0, rIn, a1, a0, true);
    ctx.closePath();
    ctx.fill();

    // 亮芯
    var my = (rOut + rIn) * 0.5;
    ctx.globalAlpha = 0.9 * fade;
    ctx.lineCap = "round";
    ctx.strokeStyle = GOLD_HI;
    ctx.lineWidth = Math.max(2, (rOut - rIn) * 0.20);
    ctx.beginPath();
    ctx.arc(0, 0, my, a0 + 0.06, a1 - 0.06);
    ctx.stroke();

    // 黑描边压边
    ctx.globalAlpha = 0.34 * fade;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, (rOut - rIn) * 0.26);
    ctx.beginPath();
    ctx.arc(0, 0, my, a0 + 0.06, a1 - 0.06);
    ctx.stroke();
  }

  /* 暖光叠加层：图片路径与降级路径共用，制造过曝的高光边 */
  function drawWarmBloom(ctx, radius, t, big) {
    var fade = Math.pow(1 - t, 1.25);
    if (fade <= 0.004) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var r = radius * (1.05 + 0.5 * t);
    var g = ctx.createRadialGradient(0, 0, r * 0.18, 0, 0, r);
    var peak = big ? 0.40 : 0.30;
    g.addColorStop(0, "rgba(255,246,216," + (peak * 0.55 * fade).toFixed(3) + ")");
    g.addColorStop(0.42, "rgba(255,232,168," + (peak * fade).toFixed(3) + ")");
    g.addColorStop(0.78, "rgba(200,150,70," + (peak * 0.34 * fade).toFixed(3) + ")");
    g.addColorStop(1, "rgba(140,96,36,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, -1.42, 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ================================================================
   * drawSlash(ctx, s)
   * s: { x, y, facing, life, max, big, seg, wkey }
   *   wkey 可选：手上那把刀的 key。给了就走 WEAPON_FX 的专属刀光，
   *   没给 / 图没就绪 / 该武器压根不出弧（弓与投掷物）→ 走通用三档。
   * ================================================================ */
  function drawSlash(ctx, s) {
    if (!ctx || !s) return;
    var max = num(s.max, 0.19);
    if (max <= 0) max = 0.19;
    var life = clamp(num(s.life, 0), 0, max);
    var t = clamp(1 - life / max, 0, 1);       // 0 = 刚出现，1 = 消散
    var facing = (num(s.facing, 1) < 0) ? -1 : 1;

    var wkey = s.wkey ? String(s.wkey) : "";
    if (wkey && NO_ARC[wkey]) return;          // 弓 / 投掷：弧不归手上这一刀管

    var wfx = wkey ? weaponFxOf(wkey) : null;
    var wimg = wfx ? fxImg(wfx.file) : null;
    if (wimg) { drawWeaponSlash(ctx, s, t, facing, wkey, wfx, wimg); return; }

    var pick = slashImageFor(s);
    var scale = pick.scale * (0.7 + 0.45 * t);          // 0.7 → 1.15
    var alpha = Math.pow(1 - t, 0.85);                  // 1 → 0
    var angle = -0.42 + t * 0.88;                       // 约 50° 扫势

    ctx.save();
    ctx.translate(num(s.x, 0), num(s.y, 0));
    if (slashMirror(facing)) ctx.scale(-1, 1);
    ctx.rotate(angle);

    drawWarmBloom(ctx, pick.r * scale, t, !!s.big);

    if (pick.img) {
      var iw = pick.img.naturalWidth || pick.img.width || 160;
      var ih = pick.img.naturalHeight || pick.img.height || 260;
      var dw = iw * scale;
      var dh = ih * scale;
      /* 包围盒居中。真实弧心在 +0.65~1.03 宽处，比包围盒中心偏右，
         所以「亮肚」落在锚点略偏后 —— 这是刻意的：锚点在玩家身前 70px，
         月牙再往前推会离身体太远。刃口高光单独按真实弧心画（见下）。 */
      var ox = -dw * 0.42;
      var oy = -dh * 0.50;

      ctx.globalAlpha = alpha;
      try {
        ctx.drawImage(pick.img, ox, oy, dw, dh);
      } catch (e) {
        drawFallbackSlash(ctx, pick.r, t);
      }

      // 叠一层 lighter 的暖光，把金边提亮
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.38;
      ctx.drawImage(pick.img, ox - dw * 0.02, oy - dh * 0.02, dw * 1.04, dh * 1.04);
      ctx.restore();

      /* 刃口的一线高光：圆心必须落在实测弧心上，半径取脊线半径。
         旧代码在原点画 r≈pick.r 的弧，那两个数都跟实测差得远，
         高光整根悬在月牙外（实测偏移 40px 以上）。 */
      var arc = ARC[pick.key];
      if (arc) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = alpha * 0.5;
        ctx.strokeStyle = GOLD_HI;
        ctx.lineWidth = Math.max(1.2, 5.5 * scale);
        ctx.lineCap = "round";
        var acx = ox + dw * arc.cx;
        var acy = oy + dh * arc.cy;
        var hr = Math.max(2, dw * arc.r);
        /* 月牙在弧心左侧，所以区间取 π 附近；从 2.1 扫到 4.1 正好贴住亮肚 */
        var a0 = Math.PI - 1.04 + t * 0.30;
        ctx.beginPath();
        ctx.arc(acx, acy, hr, a0, a0 + 2.0);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      drawFallbackSlash(ctx, pick.r, t);
    }

    ctx.restore();
  }

  /* 武器专属刀光：形状随武器（图各画各的），色相随材质（WPN_RIM 补一线刃光）。
     r 是「弧的视觉半径」，按图高换算显示尺寸，所以同一把刀在 1x / 2x 屏上
     观感一致；swing 的扫势仍由 t 推导，和判定同步。 */
  function drawWeaponSlash(ctx, s, t, facing, wkey, def, img) {
    var r = num(def.r, 110);
    var base = num(def.scale, 1.0);
    var alpha = Math.pow(1 - t, 0.82);
    var grow = 0.78 + 0.34 * t;                 // 起手小、出刀最大

    var iw = img.naturalWidth || img.width || 200;
    var ih = img.naturalHeight || img.height || 200;
    var dh = r * 1.55 * base * grow;
    var dw = dh * (iw / (ih || 1));

    var angle = -0.34 + t * 0.72;               // 比通用档略收，避免压过角色
    var rim = WPN_RIM[wkey] || GOLD_HI;
    var big = !!s.big;

    ctx.save();
    ctx.translate(num(s.x, 0), num(s.y, 0));
    if (slashMirror(facing)) ctx.scale(-1, 1);
    ctx.rotate(angle);

    /* 底色光晕：按武器半径收放，重武器更亮 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(0, 0, r * 0.16, 0, 0, r * 1.22 * grow);
    var peak = (big ? 0.34 : 0.24) * alpha;
    g.addColorStop(0, "rgba(255,250,235,0)");
    g.addColorStop(0.46, rim.replace(/[\d.]+\)$/, (peak * 0.7).toFixed(3) + ")"));
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.22 * grow, -1.42, 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    var ox = -dw * 0.42;
    var oy = -dh * 0.50;

    ctx.globalAlpha = alpha;
    try {
      ctx.drawImage(img, ox, oy, dw, dh);
    } catch (e) {
      ctx.restore();
      drawFallbackSlash(ctx, r, t);
      return;
    }

    /* 提亮一层：素材自带描边，这一层只负责「发光」 */
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.34;
    try { ctx.drawImage(img, ox - dw * 0.02, oy - dh * 0.02, dw * 1.04, dh * 1.04); } catch (e) {}
    ctx.restore();

    /* 材质色刃光：沿实测脊线扫一条，把玉 / 青铜 / 钝击在暗底上分开。
       圆心与半径都取实测值（ARC），否则这线会飘在图外。 */
    var warc = ARC[wkey];
    var arcSpan = num(def.arc, 1.0);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.62;
    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1.4, r * 0.045 * grow);
    ctx.lineCap = "round";
    if (warc) {
      var wcx = ox + dw * warc.cx;
      var wcy = oy + dh * warc.cy;
      var wr = Math.max(2, dw * warc.r);
      var wa0 = Math.PI - 1.0 + t * 0.28;
      ctx.beginPath();
      ctx.arc(wcx, wcy, wr, wa0, wa0 + arcSpan * (big ? 1.02 : 0.92));
      ctx.stroke();
    } else {
      /* 没有实测数据（新增武器但没跑 measure_slash.py）→ 退回原点小弧，
         不画错位的线，也不留空白。 */
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86 * grow,
              -0.92 + t * 0.30,
              -0.92 + t * 0.30 + arcSpan * (big ? 1.02 : 0.92));
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  /* 打击火花的材质配色（RGB 三元组字符串，拼进 rgba() 用） */
  var HIT_CORE = {
    jade:   "226,246,236",
    bronze: "255,238,196",
    blunt:  "240,214,168",
    airy:   "214,242,255"
  };
  var HIT_MID = {
    jade:   "150,214,186",
    bronze: "232,186,86",
    blunt:  "186,148,92",
    airy:   "146,206,236"
  };

  /* ================================================================
   * 打击火花：命中瞬间在受击点炸开
   * s: { x, y, life, max, big, mid, mat }
   *   mat 可选（jade / bronze / blunt / airy）：给了且有图就走材质专属火花，
   *   否则沿用通用的三档（hit1/hit2/hit3）。
   * ================================================================ */
  function drawHit(ctx, s) {
    if (!ctx || !s) return;
    var max = num(s.max, 0.24);
    if (max <= 0) max = 0.24;
    var life = clamp(num(s.life, 0), 0, max);
    var t = clamp(1 - life / max, 0, 1);

    var matImg = matImage(s.mat);
    var idx = s.big ? 3 : (s.mid ? 2 : 1);
    var img = matImg || imgOf("hit" + idx);
    var scale = (s.big ? 1.15 : 0.85) * (0.6 + 0.75 * t);

    var x = num(s.x, 0), y = num(s.y, 0);

    /* 底层暖光：材质不同，芯色不同 —— 玉是冷白、青铜是金、钝击是土黄 */
    var core = HIT_CORE[s.mat] || "255,246,214";
    var mid = HIT_MID[s.mat] || "232,200,126";
    var alpha = Math.pow(1 - t, 0.7);

    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = "lighter";
    var r = (s.big ? 120 : 78) * (0.6 + 0.6 * t);
    var gr = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, "rgba(" + core + "," + (0.55 * alpha).toFixed(3) + ")");
    gr.addColorStop(0.5, "rgba(" + mid + "," + (0.22 * alpha).toFixed(3) + ")");
    gr.addColorStop(1, "rgba(" + mid + ",0)");
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    if (!img) return;

    var iw = img.naturalWidth || img.width || 180;
    var ih = img.naturalHeight || img.height || 360;
    var dw = iw * scale;
    var dh = ih * scale;

    ctx.save();
    ctx.translate(x, y);
    /* 火花带一点随机旋转，避免连续命中完全重样 */
    var spin = (num(s.seed, 0) % 7) * 0.11 - 0.33;
    ctx.rotate(spin * (s.flip ? -1 : 1));

    ctx.globalAlpha = alpha;
    try { ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); } catch (e) {}

    /* 提亮一层 */
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.45;
    try { ctx.drawImage(img, -dw * 0.51, -dh * 0.51, dw * 1.02, dh * 1.02); } catch (e) {}
    ctx.restore();
  }

  /* ================================================================
   * 弹道特效：箭矢 / 投掷物背后的专属速度痕
   * s: { x, y, vx, vy, kind, spin, alpha }
   *   kind 就是投掷物的 wkey（bow / rock / blade / jar / bell）。
   *   箭走「顺速度方向拉伸」，投掷物走「轻微旋转的残影」——
   *   手感差别一眼看得出，同时它也是 WEAPON_FX 那几张图的第二种用法。
   * ================================================================ */
  function drawProjFx(ctx, s) {
    if (!ctx || !s) return false;
    var kind = s.kind ? String(s.kind) : "";
    var def = weaponFxOf(kind);
    if (!def) return false;
    var img = fxImg(def.file);
    if (!img) return false;

    var iw = img.naturalWidth || img.width || 200;
    var ih = img.naturalHeight || img.height || 200;
    var alpha = clamp(num(s.alpha, 1), 0, 1);
    var vx = num(s.vx, 1), vy = num(s.vy, 0);
    var sp = Math.sqrt(vx * vx + vy * vy) || 1;

    ctx.save();
    ctx.translate(num(s.x, 0), num(s.y, 0));

    if (kind === "bow") {
      /* 箭：尾巴朝后，长向就是速度方向；按速度做水平拉伸 */
      var ang = Math.atan2(vy, vx);
      var len = num(def.r, 100) * (0.9 + Math.min(0.6, sp / 2400));
      var hh = len * (ih / (iw || 1)) * 0.55;
      ctx.rotate(ang);
      ctx.globalAlpha = alpha * 0.9;
      ctx.globalCompositeOperation = "lighter";
      try { ctx.drawImage(img, -len * 0.72, -hh * 0.5, len, hh); } catch (e) {}
    } else {
      /* 投掷物：图在物体后方拖出一段，越靠后越淡 */
      var dir = vx >= 0 ? 1 : -1;
      var size = num(def.r, 100) * 0.78;
      var dh = size * (ih / (iw || 1));
      ctx.scale(dir, 1);
      ctx.rotate(num(s.spin, 0) * 0.5);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.5;
      try { ctx.drawImage(img, -size * 0.86, -dh * 0.5, size, dh); } catch (e) {}
      ctx.globalAlpha = alpha * 0.28;
      try { ctx.drawImage(img, -size * 1.24, -dh * 0.62, size * 1.16, dh * 1.24); } catch (e) {}
    }

    ctx.restore();
    return true;
  }

  /* ================================================================
   * 旋风斩光环：跟随角色旋转
   * s: { x, y, life, max, r }
   * ================================================================ */
  function drawWhirl(ctx, s) {
    if (!ctx || !s) return;
    var img = imgOf("whirlRing");
    var x = num(s.x, 0), y = num(s.y, 0);
    var rot = num(s.rot, 0);
    var alpha = clamp(num(s.alpha, 1), 0, 1);

    if (!img) return;
    var iw = img.naturalWidth || img.width || 560;
    var ih = img.naturalHeight || img.height || 320;
    var target = num(s.r, 260) * 2;
    var sc = target / Math.max(iw, ih);
    var dw = iw * sc, dh = ih * sc;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = alpha * 0.92;
    try { ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh); } catch (e) {}
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * 0.4;
    try { ctx.drawImage(img, -dw * 0.52, -dh * 0.52, dw * 1.04, dh * 1.04); } catch (e) {}
    ctx.restore();
  }

  /* ================================================================
   * HUD 底板：纯代码青铜框（不拉伸任何图片）
   * kind: "health" | "energy" | "weapon"
   * ================================================================ */
  function kindAccent(kind) {
    if (kind === "health") return { line: "rgba(224,100,74,0.85)", tint: "rgba(96,26,20,0.16)" };
    if (kind === "energy") return { line: "rgba(255,236,176,0.9)", tint: "rgba(120,88,30,0.14)" };
    return { line: "rgba(232,200,126,0.92)", tint: "rgba(90,70,28,0.14)" };
  }

  /* 云雷纹小角标：阶梯回旋 */
  function drawLeiwen(ctx, size, color, lineWidth) {
    var s = size;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "square";
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(0, s);
    ctx.lineTo(0, 0);
    ctx.lineTo(s, 0);
    ctx.lineTo(s, s * 0.62);
    ctx.lineTo(s * 0.34, s * 0.62);
    ctx.lineTo(s * 0.34, s * 0.3);
    ctx.lineTo(s * 0.68, s * 0.3);
    ctx.stroke();
    // 中心一点点亮
    ctx.fillStyle = color;
    ctx.globalAlpha *= 0.9;
    ctx.fillRect(s * 0.44, s * 0.44, Math.max(1, s * 0.1), Math.max(1, s * 0.1));
    ctx.globalAlpha /= 0.9;
  }

  /* 左侧题材小徽记（纯线条，不用文字） */
  function drawEmblem(ctx, x, y, r, kind, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, r * 0.16);
    ctx.lineCap = "round";

    if (kind === "health") {
      // 纵目：杏仁眼 + 竖瞳
      ctx.beginPath();
      ctx.moveTo(-r * 0.72, 0);
      ctx.quadraticCurveTo(0, -r * 0.72, r * 0.72, 0);
      ctx.quadraticCurveTo(0, r * 0.72, -r * 0.72, 0);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse ? ctx.ellipse(0, 0, r * 0.15, r * 0.34, 0, 0, TAU)
        : ctx.arc(0, 0, r * 0.24, 0, TAU);
      ctx.fill();
    } else if (kind === "energy") {
      // 回旋风纹
      ctx.beginPath();
      for (var i = 0; i <= 46; i++) {
        var u = i / 46;
        var ang = u * TAU * 0.95 - Math.PI * 0.5;
        var rad = r * (0.18 + 0.68 * u);
        var px = Math.cos(ang) * rad;
        var py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    } else {
      // 短剑剪影
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.82);
      ctx.lineTo(r * 0.2, -r * 0.5);
      ctx.lineTo(r * 0.2, r * 0.28);
      ctx.lineTo(r * 0.52, r * 0.34);
      ctx.lineTo(r * 0.52, r * 0.46);
      ctx.lineTo(r * 0.09, r * 0.46);
      ctx.lineTo(r * 0.09, r * 0.78);
      ctx.lineTo(-r * 0.09, r * 0.78);
      ctx.lineTo(-r * 0.09, r * 0.46);
      ctx.lineTo(-r * 0.52, r * 0.46);
      ctx.lineTo(-r * 0.52, r * 0.34);
      ctx.lineTo(-r * 0.2, r * 0.28);
      ctx.lineTo(-r * 0.2, -r * 0.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHudPanel(ctx, x, y, w, h, kind) {
    if (!ctx) return;
    var W = num(w, 0);
    var H = num(h, 0);
    if (W <= 1 || H <= 1) return;
    var X = num(x, 0);
    var Y = num(y, 0);

    var accent = kindAccent(kind);
    var radius = Math.min(H * 0.24, 9);
    var edge = Math.max(1, Math.min(2, H / 24));

    ctx.save();

    /* 1. 深色半透明底 */
    var bg = ctx.createLinearGradient(X, Y, X, Y + H);
    bg.addColorStop(0, "rgba(10,11,14,0.80)");
    bg.addColorStop(0.52, "rgba(22,19,15,0.74)");
    bg.addColorStop(1, "rgba(8,8,10,0.86)");
    roundRect(ctx, X, Y, W, H, radius);
    ctx.fillStyle = bg;
    ctx.fill();

    // 内层淡淡暖调，避免死黑
    ctx.save();
    roundRect(ctx, X, Y, W, H, radius);
    ctx.clip();
    var warm = ctx.createLinearGradient(X, Y, X + W * 0.75, Y + H);
    warm.addColorStop(0, accent.tint);
    warm.addColorStop(0.6, "rgba(0,0,0,0)");
    ctx.fillStyle = warm;
    ctx.fillRect(X, Y, W, H);
    ctx.restore();

    /* 2. 双线青铜描边 */
    roundRect(ctx, X + 0.5, Y + 0.5, W - 1, H - 1, radius);
    ctx.strokeStyle = GOLD_LO;
    ctx.lineWidth = edge;
    ctx.stroke();

    var sheen = ctx.createLinearGradient(X, Y, X + W, Y + H);
    sheen.addColorStop(0, GOLD_MID);
    sheen.addColorStop(0.4, GOLD_HI);
    sheen.addColorStop(0.72, GOLD_LO);
    sheen.addColorStop(1, "rgba(120,90,40,0.9)");
    ctx.strokeStyle = sheen;
    ctx.lineWidth = Math.max(1, edge * 0.8);
    roundRect(ctx, X + edge + 1.2, Y + edge + 1.2, W - (edge + 1.2) * 2, H - (edge + 1.2) * 2, Math.max(1, radius - 2));
    ctx.stroke();

    /* 3. 内侧一圈极淡的暗描边，做出厚度 */
    ctx.globalAlpha = 0.5;
    roundRect(ctx, X + edge * 3, Y + edge * 3, W - edge * 6, H - edge * 6, Math.max(1, radius - 3));
    ctx.strokeStyle = "rgba(58,42,16,0.85)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* 4. 四角云雷纹 */
    var pad = Math.max(3, Math.min(7, H * 0.16));
    var cs = Math.max(5, Math.min(13, H * 0.3));
    var lw = Math.max(1, Math.min(1.6, H / 34));

    ctx.save();
    roundRect(ctx, X, Y, W, H, radius);
    ctx.clip();
    var corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (var i = 0; i < 4; i++) {
      var sx = corners[i][0];
      var sy = corners[i][1];
      ctx.save();
      ctx.translate(X + (sx > 0 ? pad : W - pad), Y + (sy > 0 ? pad : H - pad));
      ctx.scale(sx, sy);
      ctx.globalAlpha = 0.78;
      drawLeiwen(ctx, cs, GOLD_MID, lw);
      ctx.restore();
    }
    ctx.restore();

    /* 5. 顶部一束高光（金属反光） */
    ctx.save();
    roundRect(ctx, X, Y, W, H, radius);
    ctx.clip();
    var top = ctx.createLinearGradient(X, Y, X, Y + H * 0.42);
    top.addColorStop(0, "rgba(255,246,216,0.16)");
    top.addColorStop(1, "rgba(255,246,216,0)");
    ctx.fillStyle = top;
    ctx.fillRect(X, Y, W, H * 0.42);
    ctx.restore();

    /* 6. 左侧徽记 + 竖向强调线（预留文字区，不写任何字） */
    if (W > 64) {
      var er = Math.min(H * 0.26, 11);
      var ex = X + er + pad + 5;
      var ey = Y + H * 0.5;
      ctx.save();
      ctx.globalAlpha = 0.92;
      drawEmblem(ctx, ex, ey, er, kind, kind === "health" ? GOLD_HI : GOLD_MID);
      ctx.restore();

      // 竖线分隔
      var lx = ex + er + Math.max(5, pad);
      if (lx < X + W - 12) {
        var vg = ctx.createLinearGradient(lx, Y + pad, lx, Y + H - pad);
        vg.addColorStop(0, "rgba(232,200,126,0)");
        vg.addColorStop(0.5, "rgba(232,200,126,0.55)");
        vg.addColorStop(1, "rgba(232,200,126,0)");
        ctx.strokeStyle = vg;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx + 0.5, Y + pad + 2);
        ctx.lineTo(lx + 0.5, Y + H - pad - 2);
        ctx.stroke();
      }
    }

    /* 7. 玉璋轮廓做低调装饰（等比裁切，绝不拉伸变形） */
    var jade = imgOf("jadeTablet");
    if (jade && W > 120) {
      var jw = jade.naturalWidth || jade.width || 452;
      var jh = jade.naturalHeight || jade.height || 460;
      var side = Math.min(jw, jh);
      var jr = Math.min(H * 0.44, 26);          // 显示半径
      var jx = X + W - Math.max(10, pad + 4) - jr;
      var jy = Y + H * 0.5;
      if (jx - jr > X + W * 0.55) {
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.beginPath();
        ctx.arc(jx, jy, jr, 0, TAU);
        ctx.clip();
        var sx0 = (jw - side) * 0.5;
        var sy0 = (jh - side) * 0.5;
        try {
          ctx.drawImage(jade, sx0, sy0, side, side, jx - jr, jy - jr, jr * 2, jr * 2);
        } catch (e) { /* 图片不可用时静默跳过 */ }
        ctx.restore();
        // 徽记外环
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = accent.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(jx, jy, jr, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.restore();
  }

  /* ================================================================
   * drawHurtVignette(ctx, W, H, intensity)  intensity 0~1
   * ================================================================ */
  function drawHurtVignette(ctx, W, H, intensity) {
    if (!ctx) return;
    var i = clamp(num(intensity, 0), 0, 1);
    if (i <= 0.002) return;
    var w = num(W, 0);
    var h = num(H, 0);
    if (w <= 0 || h <= 0) return;

    var cx = w * 0.5;
    var cy = h * 0.5;
    var inner = Math.min(w, h) * 0.30;
    var outer = Math.hypot(w, h) * 0.54;

    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    g.addColorStop(0, "rgba(150,20,16,0)");
    g.addColorStop(0.52, "rgba(160,26,20," + (0.16 * i).toFixed(3) + ")");
    g.addColorStop(0.78, "rgba(178,30,22," + (0.42 * i).toFixed(3) + ")");
    g.addColorStop(1, "rgba(120,12,10," + (0.78 * i).toFixed(3) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 上下再压一层，强化“收缩感”
    var gv = ctx.createLinearGradient(0, 0, 0, h);
    gv.addColorStop(0, "rgba(120,10,8," + (0.34 * i).toFixed(3) + ")");
    gv.addColorStop(0.22, "rgba(120,10,8,0)");
    gv.addColorStop(0.78, "rgba(120,10,8,0)");
    gv.addColorStop(1, "rgba(120,10,8," + (0.34 * i).toFixed(3) + ")");
    ctx.fillStyle = gv;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /* ================================================================
   * ready() 所有素材是否就绪
   * ================================================================ */
  function ready() {
    var names = ["slash1", "slash2", "slash3", "jadeTablet"];
    var imgs = global.IMG;
    if (!imgs) return false;
    for (var i = 0; i < names.length; i++) {
      var img = imgs[names[i]];
      if (!img || img.complete === false) return false;
      if (typeof img.naturalWidth === "number" && img.naturalWidth <= 0) return false;
    }
    return true;
  }

  /* ================================================================ 导出 */

  global.FX = {
    drawSlash: drawSlash,
    drawHit: drawHit,
    drawWhirl: drawWhirl,
    drawProjFx: drawProjFx,
    drawHudPanel: drawHudPanel,
    drawHurtVignette: drawHurtVignette,
    weaponFxReady: weaponFxReady,
    matHitReady: matHitReady,
    /* 刀光朝向与实测锚定表：给自检读，只读不改。
       ART_CONVEX / ARC 都是契约数值，改它们等于改画面朝向与刃口位置。 */
    artConvex: function () { return ART_CONVEX; },
    mirrors: slashMirror,
    arcOf: function (key) {
      var a = ARC[key];
      return a ? { cx: a.cx, cy: a.cy, r: a.r } : null;
    },
    ready: ready
  };
})(window);
