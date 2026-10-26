/* =====================================================================
   showcase.js — 素材总览页的全部渲染逻辑
   ---------------------------------------------------------------------
   数据源（只读，不复制任何帧表）：
     js/anim-data.js →
       window.ANIM               角色 12 个动作
       window.ENEMY_ANIM         敌人 4 类
       window.ANIM_HOLD          持械站立单帧
       window.WEAPON_ATTACK      出招单帧（降级用）
       window.WEAPON_ATTACK_CLIP 出招四帧序列
       window.WEAPON_CLIP        每把武器的 walk / attack / jump / hurt / pickup
       window.WEAPON_FX          刀光映射（含半径与弧角）
       window.HIT_MATERIAL       打击火花的四种材质

   素材源：assets/ 目录，走本地 HTTP 服务（见 serve-showcase.mjs）。
   不改游戏、不改素材、不新增依赖。

   同步点：武器中文名抄自 index.html 的 WEAPONS 表，敌人中文名抄自 README。
           那两处改名了，下面的 WEAPONS / CHAR / ENEMIES 表要一起改。
   ===================================================================== */
(function () {
  "use strict";

  /* ================================================================ 数据 */

  var ANIM  = window.ANIM || {};
  var ENEMY = window.ENEMY_ANIM || {};
  var HOLD  = window.ANIM_HOLD || {};
  var ATK   = window.WEAPON_ATTACK || {};
  var ATC   = window.WEAPON_ATTACK_CLIP || {};
  var WC    = window.WEAPON_CLIP || {};
  var WFX   = window.WEAPON_FX || {};
  var HITM  = window.HIT_MATERIAL || {};

  var DPR = Math.min(window.devicePixelRatio || 1, 2);

  /* 数据里 fps: 0 表示帧号由判定 / 计时器推导，没有固定速率。
     展示页不需要判定，统一按这个速率演示，但标注如实写「判定驱动」。 */
  var DEMO_FPS = 10;
  var REST = 0.5;                 // 非循环动作播完停在末帧的时间（秒）

  var CHAR = [
    ["idle",          "站立",   "Standby"],
    ["walk",          "行走",   "Walk"],
    ["attack",        "挥砍",   "Swing"],
    ["attack-heavy",  "重劈",   "Heavy Strike"],
    ["attack-thrust", "突刺",   "Thrust"],
    ["jump",          "起跳",   "Leap"],
    ["hurt",          "受击",   "Hurt"],
    ["pickup",        "拾取",   "Pickup"],
    ["throw",         "投掷",   "Throw"],
    ["bow",           "拉弓",   "Draw"],
    ["whirl",         "旋风斩", "Whirl"],
    ["dead",          "倒地",   "Down"]
  ];

  /* 敌人之间的相对大小来自 index.html 的构造函数（walker 1.0 / fast 0.82 /
     brute 1.28 / boss 2.05）。这几个数不在 anim-data.js 里，所以是第二处同步点。 */
  var ENEMIES = [
    ["walker", "铜锈俑",   "Bronze Walker",          1.00],
    ["fast",   "疾行俑",   "Swift Runner",           0.82],
    ["brute",  "厚甲俑",   "Armored Brute",          1.28],
    ["boss",   "纵目之主", "The Vertical-Eyed Lord", 2.05]
  ];

  var WEAPONS = [
    ["short",  "玉璋刃", "Jade Zhang Blade"],
    ["dagger", "骨牙匕", "Bone Fang Dagger"],
    ["sword",  "青铜剑", "Bronze Sword"],
    ["axe",    "青铜钺", "Bronze Battle-Axe"],
    ["hammer", "神树锤", "Sacred Tree Hammer"],
    ["spear",  "三枝叉", "Three-Prong Spear"],
    ["bow",    "神鸟弓", "Sunbird Bow"],
    ["rock",   "眼形石", "Eye-Shaped Stone"],
    ["blade",  "玉璋镖", "Jade Zhang Dart"],
    ["jar",    "陶罐雷", "Pottery Jar Bomb"],
    ["bell",   "青铜铃", "Bronze Bell"]
  ];

  /* 武器 8 个状态列。序列在前，因为它在绘制链里优先级最高。
     ⚠️ 2026-10-25 起 `WEAPON_ATTACK` / `WEAPON_ATTACK_CLIP` 两张表已删（素材并入
     `WEAPON_CLIP.attack`，即下面的「挥砍」列），所以「出招序列 / 出招单帧」两列
     按数据表是否存在动态生成 —— 硬编进表里会变成 11×2 个「该武器无此序列」空位，
     读起来像素材缺了一大块，其实只是换了个地方。 */
  var WSTATES = [
    ["hold",   "持械站立", "HOLD"],
    ["seq",    "出招序列", "SEQ"],
    ["frame",  "出招单帧", "FRAME"],
    ["walk",   "行走",     "WALK"],
    ["attack", "挥砍",     "SWING"],
    ["jump",   "跳跃",     "JUMP"],
    ["hurt",   "受击",     "HURT"],
    ["pickup", "拾取",     "PICK"]
  ];

  WSTATES = WSTATES.filter(function (s) {
    if (s[0] === "seq") return Object.keys(ATC).length > 0;
    if (s[0] === "frame") return Object.keys(ATK).length > 0;
    return true;
  });

  /* 静态素材：浏览器不能列目录，只能手写清单 */
  var BG = [
    ["assets/bg-far.jpg",  "远景", "bg-far.jpg",  "视差 0.20 · 横向平铺交替镜像（共用兜底层）"],
    ["assets/bg-mid.webp", "中景", "bg-mid.webp", "视差 0.50 · 底部贴地面线（共用兜底层）"],
    ["assets/ground.webp", "地面", "ground.webp", "视差 1.00 · 顶部对齐地面线（共用兜底层）"],
    ["assets/bg/far-1.webp",    "第一阵远景", "bg/far-1.webp",    "每阵专属 · 缺图退回共用层"],
    ["assets/bg/mid-1.webp",    "第一阵中景", "bg/mid-1.webp",    "每阵专属 · 缺图退回共用层"],
    ["assets/bg/ground-1.webp", "第一阵地面", "bg/ground-1.webp", "每阵专属 · 缺图退回共用层"]
  ];

  var PROPS = [
    ["banner",       "旗幡"],
    ["sacred-tree",  "神树"],
    ["mask-relief",  "面具浮雕"],
    ["jade-tablet",  "玉璋"],
    ["bell-cluster", "铜铃架"],
    ["brazier",      "火盆"],
    ["ivory-tusk",   "象牙"],
    ["pottery-jar",  "陶罐"]
  ];

  var INTERACT = [
    ["chest-closed",  "宝箱",   "未开"],
    ["chest-open",    "宝箱",   "已开"],
    ["mechanism-off", "机关",   "未激活"],
    ["mechanism-on",  "机关",   "已激活"],
    ["pickup-cowrie", "拾取物", "贝币"],
    ["pickup-jade",   "拾取物", "玉"]
  ];

  /* 2026-10-25 删图后只剩这 10 张：it-cowrie / it-eye / icon-* 六张无消费方，
     连文件一起删了（省 33 KB 启动白加载）。这份清单是手写的，删素材时要同步删行，
     否则展示页会出现 404 空框。 */
  var ICONS = [
    ["wp-sword",    "武器图标", "剑"],
    ["wp-axe",      "武器图标", "钺"],
    ["wp-mace",     "武器图标", "锤"],
    ["wp-spear",    "武器图标", "叉"],
    ["wp-bow",      "武器图标", "弓"],
    ["wp-dagger",   "武器图标", "匕"],
    ["it-jade",     "物品图标", "玉"],
    ["it-jar",      "物品图标", "陶罐"],
    ["it-bell",     "物品图标", "铃"],
    ["it-rock",     "物品图标", "石"]
  ];

  var UIS = [
    ["title-scene",  "标题场景", ""],
    ["title-bg",     "标题背景", ""],
    ["win-scene",    "通关场景", ""],
    ["hud-card",     "HUD 卡片", ""],
    ["panel-frame",  "面板边框", ""],
    ["portrait-p1",  "玩家一头像", ""],
    ["btn-normal",   "按钮",     "常态"],
    ["btn-hover",    "按钮",     "悬停"],
    ["btn-press",    "按钮",     "按下"],
    ["btn-disabled", "按钮",     "禁用"]
  ];

  /* 手机虚拟键的三层美术：2 张青铜盘 + 8 张暗刻金线纹样（t = touch）。
     单独一张表而不是并进 UIS，是因为它不在 assets/ui/ 下 —— 并进去会拼出
     assets/ui/plate.webp 这种 404 路径。这 10 张也不进 js/assets.js 的 MANIFEST，
     由 js/touch.js 自建缓存、只在有触屏时加载，所以这一份清单是手写的。 */
  var TOUCH = [
    ["plate",           "按键底盘",     "正圆 · 动作键"],
    ["plate-sq",        "按键底盘 · 方", "圆角方盘 · 走键"],
    ["glyph-left",      "按键纹样 · 左", "青铜箭头"],
    ["glyph-right",     "按键纹样 · 右", "青铜箭头"],
    ["glyph-jump",      "按键纹样 · 跳", "太阳神鸟"],
    ["glyph-atk",       "按键纹样 · 刀", "青铜钺"],
    ["glyph-skill",     "按键纹样 · 技", "太阳轮"],
    ["glyph-act",       "按键纹样 · 拾", "玉璧"],
    ["glyph-drop",      "按键纹样 · 丢", "落箭 + 羽"],
    ["glyph-give",      "按键纹样 · 递", "双面具"]
  ];

  var APPS = [
    ["icon-16.png",         "16"],
    ["icon-32.png",         "32"],
    ["icon-48.png",         "48"],
    ["icon-64.png",         "64"],
    ["icon-128.png",        "128"],
    ["icon-180.png",        "180"],
    ["icon-192.png",        "192"],
    ["icon-512.png",        "512"],
    ["apple-touch-icon.png","180"],
    ["favicon.ico",         "ico"]
  ];

  /* 原画只有 pose-0：它是 ANIM 与帧图全不可用时的降级底图（`IMG.pose0`）。
     front / side / back / pose-1 四张无消费方，2026-10-25 已连文件删除（省 260 KB）。 */
  var CHARSHEET = [
    ["pose-0", "降级底图"]
  ];

  var GENERIC_FX = [
    ["slash-1",    "刀光 · 一档", "近身挥砍"],
    ["slash-2",    "刀光 · 二档", "第二段连击"],
    ["slash-3",    "刀光 · 三档", "重击 / 大招"],
    ["hit-1",      "打击火花 · 轻", ""],
    ["hit-2",      "打击火花 · 中", ""],
    ["hit-3",      "打击火花 · 重", ""],
    ["whirl-ring", "旋风环",       "旋风斩护身"],
    ["proj-rock",  "投掷物 · 石",  "眼形石弹道"]
  ];

  var MATNAME = { jade: "玉", bronze: "青铜", blunt: "钝击", airy: "气刃" };
  var WNAME = {};
  WEAPONS.forEach(function (w) { WNAME[w[0]] = w[1]; });

  /* ================================================================ 播放器 */

  var PLAYERS = [];
  var lastNow = 0;

  function aspectOf(spec) {
    if (spec.w > 0 && spec.h > 0) return spec.w / spec.h;
    return 1;
  }

  function baseName(p) {
    var a = String(p).split("/");
    return a[a.length - 1];
  }

  function fileText(spec) {
    var files = spec.files || [];
    var n = files.length;
    var b = baseName(files[0] || "");
    if (n <= 1) return b;
    var m = /^(.+?)(\d+)\.(webp|jpg|png)$/.exec(b);
    return m ? (m[1] + "0…" + (n - 1) + "." + m[3]) : (b + " +" + (n - 1));
  }

  function rateText(spec) {
    var n = (spec.files || []).length;
    if (n <= 1) return "单帧";
    if (spec.fps > 0) return n + " 帧 · " + spec.fps + " fps";
    return n + " 帧 · 判定驱动";
  }

  function makePlayer(cv, spec) {
    var p = {
      cv: cv,
      ctx: cv.getContext("2d"),
      spec: spec,
      n: 0,
      fps: DEMO_FPS,
      loop: true,
      t: Math.random() * 0.9,
      last: -1,
      on: false,
      dirty: false,
      imgs: []
    };
    bindPlayer(p, spec);
    PLAYERS.push(p);
    return p;
  }

  function bindPlayer(p, spec) {
    p.spec = spec;
    p.imgs = [];
    p.n = (spec.files || []).length;
    p.fps = spec.fps > 0 ? spec.fps : DEMO_FPS;
    p.loop = spec.loop !== false;
    p.last = -1;
    p.t = Math.random() * 0.9;
    p.dirty = false;
    (spec.files || []).forEach(function (f, i) {
      var im = new Image();
      im.onload = function () { p.dirty = true; };
      im.onerror = function () { p.dirty = true; };
      im.src = f;
      p.imgs[i] = im;
    });
  }

  function paint(p, idx) {
    var c = p.ctx;
    if (!c || !p.cv.width || !p.cv.height) return;
    c.clearRect(0, 0, p.cv.width, p.cv.height);
    var im = p.imgs[idx];
    if (!im || !im.complete || !im.naturalWidth) return;
    var r = p.rect;
    if (r) {
      c.drawImage(im, r.x, r.y, r.w, r.h, 0, 0, p.cv.width, p.cv.height);
    } else {
      c.drawImage(im, 0, 0, p.cv.width, p.cv.height);
    }
  }

  /* ---------------------------------------------------------------- 内容框
     为什么要扫像素：anim-data.js 的 scaleFix 是「让各 clip 在游戏里身高一致」
     的补偿系数 —— 源条带里 walk 的角色比 idle 小 33%，靠 scaleFix 1.49 拉回来。
     展示页若只把画布等比铺满格子，walk 就会明显比 idle 小一圈（实测一眼可见）。

     正确做法：算出「游戏里的实际绘制尺寸」= 源像素 × (252 × scaleFix ÷ 画布高)，
     再把内容裁到 alpha 包围盒。这样每格的 canvas 高度正好等于角色在游戏里的身高，
     蹲姿更矮、倒地最矮，既忠实又没有多余留白。

     包围盒取整段并集（不是逐帧）：逐帧裁会让走动时画面左右抖。
     file:// 下 canvas 被跨源污染读不了像素，所以本页走 HTTP —— 见 serve-showcase.mjs。 */

  var measCv = null, measCtx = null;

  function waitImgs(imgs) {
    return Promise.all(imgs.map(function (im) {
      if (im.complete) return Promise.resolve();
      return new Promise(function (res) {
        im.addEventListener("load", res, { once: true });
        im.addEventListener("error", res, { once: true });
      });
    }));
  }

  function contentBox(imgs) {
    if (!measCv) {
      measCv = document.createElement("canvas");
      measCtx = measCv.getContext("2d", { willReadFrequently: true });
    }
    var x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    var W = 0, H = 0;
    var STEP = 2, TH = 24;

    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (!im || !im.complete || !im.naturalWidth) continue;
      var w = im.naturalWidth, h = im.naturalHeight;
      if (w > W) W = w;
      if (h > H) H = h;

      measCv.width = w;
      measCv.height = h;
      measCtx.clearRect(0, 0, w, h);
      measCtx.drawImage(im, 0, 0);

      var d;
      try {
        d = measCtx.getImageData(0, 0, w, h).data;
      } catch (e) {
        return null;                       // 读不到像素就整段退回画布比例
      }
      for (var y = 0; y < h; y += STEP) {
        var row = y * w * 4;
        for (var x = 0; x < w; x += STEP) {
          if (d[row + x * 4 + 3] > TH) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
    }

    if (x1 < 0 || y1 < 0) return null;
    var pad = 3;
    x0 = Math.max(0, x0 - pad);
    y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad);
    y1 = Math.min(H - 1, y1 + pad);
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, sw: W, sh: H };
  }

  /* 三种尺寸口径，按素材族分别选：
       crop   角色。裁到 alpha 并集框，画布高 = 角色在游戏里的身高。
       canvas 武器。同一把武器 8 个状态共用一张画布与一个 scaleFix，
             所以只按 fix 归一、不裁内容 —— 裁了会让「举锤」那格因为
             尖端高过头顶而整体缩小，与相邻格对不上。
       scale  敌人。游戏里就是把整张画布拉到 160 × scale 高，
             相对大小只由构造函数里的 scale 决定。 */
  /* 尺寸口径统一成一条：裁到内容框，画布高 = 内容在游戏里的高度 × k。
     内容框裁掉的是素材里的透明边距 —— 不裁的话 560px 画布配 40% 留白，
     格子里的主体就被压成一半，还容易被 overflow 裁到头脚。

     三族只差一个权重：
       角色 / 武器  252 × scaleFix（游戏里统一到 252px 身高）
       敌人         scale（index.html 构造函数里的 1.0 / 0.82 / 1.28 / 2.05） */
  function sizeCell(p, spec, cbox, gh, k, bh) {
    var cvH, cvW, rect = null;

    if (cbox && cbox.h > 0) {
      cvH = Math.round(gh * k);
      cvW = Math.round(cvH * (cbox.w / cbox.h));
      rect = { x: cbox.x, y: cbox.y, w: cbox.w, h: cbox.h };
    } else {
      cvH = Math.round(Math.min(bh, gh * k));      // 量不到像素时的保守兜底
      cvW = Math.round(cvH * aspectOf(spec));
    }

    cvH = Math.max(18, cvH);
    cvW = Math.max(18, cvW);

    p.cv.width = Math.round(cvW * DPR);
    p.cv.height = Math.round(cvH * DPR);
    /* 只给宽度：高度交给 CSS 的 height:auto，按属性比例算 ——
       这样窄格子把 max-width 压下来时仍然等比，不会变形。 */
    p.cv.style.width = cvW + "px";
    p.rect = rect;
    p.last = -1;
    p.dirty = true;
    return cvH;
  }

  /* 归一化的分子 = 「内容在游戏里的身高」，三族共用同一把尺子，网格里才可比。 */
  function weightOf(spec) {
    if (spec.mode === "scale") return spec.mul || 1;
    var fix = typeof spec.scaleFix === "number" ? spec.scaleFix : 1;
    return 252 * fix;
  }

  function gameHeight(spec, cbox) {
    var w = weightOf(spec);
    if (!cbox) return w * 0.72;              // 量不到时的保守估计
    var srcH = cbox.sh || spec.h || 1;
    return cbox.h * (w / srcH);
  }

  /* 一组播放器统一校准：等图就绪 → 量内容框 → 按参考身高归一 → 各自落尺寸。
     ref = "max"：用最大值，给角色用（各 clip 的姿态差异是真实的，不该裁）。
     ref = "p90"：用 90 分位，给武器用 —— 举钺 / 举锤那一帧的尖端高过头顶，
     按最大值归一会把整行压小一圈，按分位归一只让少数高举帧略微溢出。 */
  function calibrate(queue, bh, ref) {
    Promise.all(queue.map(function (q) {
      return waitImgs(q.cell._player.imgs).then(function () {
        q.cbox = contentBox(q.cell._player.imgs);
      });
    })).then(function () {
      var vals = [];
      queue.forEach(function (q) {
        q.gh = gameHeight(q.spec, q.cbox);
        if (q.gh > 0) vals.push(q.gh);
      });
      if (!vals.length) return;
      vals.sort(function (a, b) { return a - b; });

      var base = vals[vals.length - 1];
      if (ref === "p90" && vals.length > 3) {
        base = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.9))];
      }
      if (!(base > 0)) return;

      var k = bh / base;
      queue.forEach(function (q) {
        sizeCell(q.cell._player, q.spec, q.cbox, q.gh, k, bh);
      });
    });
  }

  function step(p, dt) {
    if (p.dirty) { p.dirty = false; p.last = -1; }
    var n = p.n;
    if (n <= 0) return;
    if (n === 1) {
      if (p.last !== 0) { p.last = 0; paint(p, 0); }
      return;
    }
    p.t += dt;
    var fps = p.fps;
    var total = p.t * fps;
    var idx;
    if (p.loop) {
      idx = Math.floor(total) % n;
      if (idx < 0) idx = 0;
    } else {
      var span = n + REST * fps;
      if (total >= span) { p.t = 0; total = 0; }
      idx = Math.floor(total);
      if (idx > n - 1) idx = n - 1;
    }
    if (idx !== p.last) { p.last = idx; paint(p, idx); }
  }

  function tick(now) {
    var dt = (now - lastNow) / 1000;
    lastNow = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.12) dt = 0.12;
    for (var i = 0; i < PLAYERS.length; i++) {
      var p = PLAYERS[i];
      if (p.on) step(p, dt);
    }
    requestAnimationFrame(tick);
  }

  /* ================================================================ DOM 工具 */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function secHead(no, cn, en, sub) {
    var f = document.createDocumentFragment();
    var hd = el("div", "sec-hd");
    hd.appendChild(el("span", "no", no));
    hd.appendChild(el("h2", null, cn));
    hd.appendChild(el("span", "en", en));
    f.appendChild(hd);
    if (sub) f.appendChild(el("p", "sec-sub", sub));
    return f;
  }

  function groupHead(cn, en, note, count) {
    var g = el("div", "g-hd");
    g.appendChild(el("h3", null, cn));
    if (en) g.appendChild(el("span", null, en));
    if (note) g.appendChild(el("span", null, note));
    if (count != null) g.appendChild(el("em", null, count));
    return g;
  }

  /* 固定列数网格 —— 每一组都排成整齐的矩形，不留半行 */
  function gridOf(cols) {
    var g = el("div", "grid");
    g.style.setProperty("--cols", cols);
    return g;
  }

  function cellShell(bh, name) {
    var cell = el("div", "cell");
    cell.style.setProperty("--bh", bh + "px");
    var box = el("div", "box");
    cell.appendChild(box);
    cell.appendChild(el("div", "nm", name || ""));
    return cell;
  }

  function playerCell(spec, bh, name, extra) {
    var cell = cellShell(bh, name);
    var box = cell.querySelector(".box");

    var h = bh;
    var w = Math.round(h * aspectOf(spec));
    var cv = document.createElement("canvas");
    cv.width = Math.round(w * DPR);
    cv.height = Math.round(h * DPR);
    cv.style.width = w + "px";
    box.appendChild(cv);

    cell.appendChild(el("div", "mt", fileText(spec)));
    cell.appendChild(el("div", "kz", rateText(spec) + (extra ? " · " + extra : "")));

    cell._spec = spec;
    cell._name = name || "";
    cell._player = makePlayer(cv, spec);
    return cell;
  }

  function imageCell(src, name, note, bh) {
    var cell = cellShell(bh, name);
    var box = cell.querySelector(".box");
    var im = document.createElement("img");
    im.src = src;
    im.alt = name || "";
    im.loading = "lazy";
    box.appendChild(im);

    cell.appendChild(el("div", "mt", baseName(src)));
    cell.appendChild(el("div", "kz", note || "单帧"));

    cell._spec = { files: [src], w: 0, h: 0, fps: 0 };
    cell._name = name || "";
    cell._img = src;
    return cell;
  }

  function emptyCell(name, note, bh) {
    var cell = cellShell(bh, name);
    var box = cell.querySelector(".box");
    box.appendChild(el("span", "na", "—"));
    cell.appendChild(el("div", "mt", "无此素材"));
    cell.appendChild(el("div", "kz", note || ""));
    cell.style.cursor = "default";
    return cell;
  }

  /* ================================================================ 放大层 */

  var lb = null, lbCanvas = null, lbP = null, lbImg = null, lbOrigin = null;

  function ensureLB() {
    if (lb) return;
    lb = el("div", "lb");

    var hd = el("div", "lb-hd");
    var left = el("div");
    lb._t = el("div", "lb-t");
    lb._m = el("div", "lb-m");
    left.appendChild(lb._t);
    left.appendChild(lb._m);
    hd.appendChild(left);

    var x = el("button", "lb-x", "关闭 ESC");
    x.type = "button";
    x.addEventListener("click", closeLB);
    hd.appendChild(x);

    lb._body = el("div", "lb-body");
    lbCanvas = document.createElement("canvas");
    lbCanvas.style.display = "none";
    lbImg = document.createElement("img");
    lbImg.style.display = "none";
    lb._body.appendChild(lbCanvas);
    lb._body.appendChild(lbImg);

    lb.appendChild(hd);
    lb.appendChild(lb._body);
    document.body.appendChild(lb);

    lb.addEventListener("click", function (e) { if (e.target === lb) closeLB(); });
  }

  function openLB(cell) {
    ensureLB();
    var spec = cell._spec;
    if (!spec) return;

    lbOrigin = cell._player || null;
    if (lbOrigin) lbOrigin.on = false;

    var vh = Math.max(260, Math.round(window.innerHeight * 0.64));
    var vw, maxW = Math.round(window.innerWidth * 0.84);

    if (cell._img) {
      lbCanvas.style.display = "none";
      lbImg.style.display = "";
      lbImg.src = cell._img;
      if (lbP) { lbP.on = false; }
      lb._t.textContent = cell._name || "";
      lb._m.textContent = baseName(cell._img);
    } else {
      lbImg.style.display = "none";
      lbCanvas.style.display = "";

      vw = Math.round(vh * aspectOf(spec));
      if (vw > maxW) { vw = maxW; vh = Math.round(vw / aspectOf(spec)); }
      lbCanvas.width = Math.round(vw * DPR);
      lbCanvas.height = Math.round(vh * DPR);
      lbCanvas.style.width = vw + "px";
      lbCanvas.style.height = vh + "px";

      if (!lbP) {
        lbP = makePlayer(lbCanvas, spec);
      } else {
        bindPlayer(lbP, spec);
      }
      lbP.on = true;
      lbP.t = 0;
      lbP.last = -1;
      lbP.dirty = true;

      lb._t.textContent = cell._name || "";
      lb._m.textContent = fileText(spec) + " · " + rateText(spec);
    }

    lb.classList.add("on");
  }

  function closeLB() {
    if (!lb || !lb.classList.contains("on")) return;
    lb.classList.remove("on");
    if (lbP) lbP.on = false;
    if (lbOrigin) { lbOrigin.on = true; lbOrigin = null; }
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeLB(); return; }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= TABS.length) showTab(TABS[n - 1].id);
  });

  /* ================================================================ 内容构建 */

  function clipSpec(key, meta, name) {
    var d = meta[key];
    if (!d || !d.files) return null;
    return {
      id: key,
      files: d.files,
      fps: d.fps || 0,
      w: d.w || 0,
      h: d.h || 0,
      scaleFix: typeof d.scaleFix === "number" ? d.scaleFix : 1,
      loop: d.loop !== false
    };
  }

  /* 武器也用 crop 口径：画布收到内容框，格子高就等于图里真有内容的高度。
     早先用「画布高」给尺寸，560px 画布配 40% 留白，整格内容被裁掉一截。 */
  function weaponSpec(key, st, files, fps, w, h, fix, loop) {
    return {
      id: key + "-" + st,
      files: files,
      fps: fps || 0,
      w: w || 0,
      h: h || 0,
      scaleFix: typeof fix === "number" ? fix : 1,
      loop: loop !== false
    };
  }

  function fixText(fix) {
    return "fix " + (typeof fix === "number" ? fix.toFixed(3) : "1.000");
  }

  /* ------------------------------------------------------------ 01 角色 */

  function buildChar() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("01", "角色", "Character", "12 个动作 · 每格独立循环"));

    frag.appendChild(groupHead("动作", "Action",
      "画布高 = 角色在游戏里的身高", "12 组 / 43 帧"));

    var g1 = gridOf(6);
    var frames = 0;
    var queue = [];

    CHAR.forEach(function (row) {
      var spec = clipSpec(row[0], ANIM, row[1]);
      if (!spec) { g1.appendChild(emptyCell(row[1], "无此 clip", 210)); return; }
      frames += spec.files.length;
      var cell = playerCell(spec, 210, row[1], row[2]);
      g1.appendChild(cell);
      queue.push({ cell: cell, spec: spec });
    });
    frag.appendChild(g1);

    /* 内容框校准：等图片就绪后统一量一次，再按「游戏身高」对齐 */
    calibrate(queue, 210);

    frag.appendChild(groupHead("原画", "Sheet", "降级路径用的单张精灵", CHARSHEET.length + " 张"));
    var g2 = gridOf(5);
    CHARSHEET.forEach(function (r) {
      g2.appendChild(imageCell("assets/char/" + r[0] + ".webp", r[1], "原画", 290));
    });
    frag.appendChild(g2);

    var f = el("p", "foot");
    f.innerHTML = "<b>" + frames + "</b> 帧 · 源条带里 walk 比 idle 小 33%，" +
      "靠 <b>scaleFix</b> 拉回 252px 统一身高；本页按「内容高 × fix」还原游戏里的真实大小。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 02 武器 */

  function buildWeapon() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("02", "武器", "Weapon",
      "11 把 × " + WSTATES.length + " 个状态 · 换手即换图"));

    var wrap = el("div", "wt-wrap");
    var t = el("div", "wt");
    /* 列数写进 CSS 变量：状态列会因为数据表增删而变（当前 6 列），
       写死在 showcase.css 里就会行行错位。见该文件的 `.wt` 注释。 */
    t.style.setProperty("--wcols", String(WSTATES.length));

    t.appendChild(el("div", "hh", "武器"));
    WSTATES.forEach(function (s) { t.appendChild(el("div", "hh", s[1] + " " + s[2])); });

    var total = 0;
    var queue = [];

    WEAPONS.forEach(function (w) {
      var key = w[0];

      var nm = el("div", "wn");
      nm.appendChild(el("b", null, w[1]));
      nm.appendChild(el("i", null, w[2]));
      t.appendChild(nm);

      WSTATES.forEach(function (s) {
        var st = s[0];
        var cell = null;
        var spec = null;

        if (st === "hold") {
          var hd = HOLD[key];
          if (hd) {
            spec = weaponSpec(key, "hold", ["assets/anim/" + baseName(hd.file)],
              0, hd.w, hd.h, hd.scaleFix, false);
            cell = playerCell(spec, 132, "持械站立", fixText(hd.scaleFix));
          } else {
            cell = emptyCell("持械站立", "该武器无此素材", 132);
          }
        } else if (st === "seq") {
          var ac = ATC[key];
          if (ac) {
            spec = weaponSpec(key, "seq", ac.files, DEMO_FPS, ac.w, ac.h, ac.scaleFix, true);
            cell = playerCell(spec, 132, "出招序列", fixText(ac.scaleFix));
          } else {
            cell = emptyCell("出招序列", "该武器无此序列", 132);
          }
        } else if (st === "frame") {
          /* 兜底：ATK 整张表缺席时（2026-10-25 起就是这种情况）不能读 af.file，
             否则整页在 buildWeapon 里抛 TypeError。列本身已被 WSTATES 过滤掉，
             这里只是同形防御。 */
          var af = ATK[key] || ATK.jar;
          if (!af) {
            cell = emptyCell("出招单帧", "该通道已并入挥砍", 132);
          } else {
            var own = !!ATK[key];
            spec = weaponSpec(key, "frame", ["assets/anim/" + baseName(af.file)],
              0, af.w, af.h, af.scaleFix, false);
            cell = playerCell(spec, 132, "出招单帧",
              fixText(af.scaleFix) + (own ? "" : " · 复用陶罐"));
          }
        } else {
          var d = (WC[key] || {})[st];
          if (d && d.files && d.files.length) {
            spec = weaponSpec(key, st, d.files, d.fps || 0, d.w, d.h, d.scaleFix,
              d.loop !== false);
            cell = playerCell(spec, 132, s[1], fixText(d.scaleFix));
          } else {
            cell = emptyCell(s[1], "无此状态", 132);
          }
        }

        if (cell && cell._player) {
          total += cell._player.n;
          queue.push({ cell: cell, spec: cell._player.spec });
        } else {
          total += 1;
        }
        t.appendChild(cell);
      });
    });

    /* 90 分位归一：举钺 / 举锤那一帧尖端高过头顶，按最大值归一会把整行压小一圈。 */
    calibrate(queue, 132, "p90");

    wrap.appendChild(t);
    frag.appendChild(wrap);

    var f = el("p", "foot");
    f.innerHTML = "<b>" + total + "</b> 帧 · 出招只有一套：<b>挥砍</b>（`WEAPON_CLIP.attack`，每把 4 帧）；" +
      "旧的「出招序列 / 出招单帧」两档位图已于 2026-10-25 删除（1.78 MB 纯冗余），" +
      "两列因此不出现。斧的行走只有 3 帧。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 03 敌人 */

  function buildEnemy() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("03", "敌人", "Enemy", "四种锈蚀面具兵 · 比例取自构造函数"));

    var g = gridOf(4);
    var queue = [];
    ENEMIES.forEach(function (r) {
      var spec = clipSpec(r[0], ENEMY, r[1]);
      if (!spec) { g.appendChild(emptyCell(r[1], "无此素材", 300)); return; }
      spec.mode = "scale";
      spec.mul = r[3];
      var cell = playerCell(spec, 300, r[1], "scale " + r[3].toFixed(2));
      g.appendChild(cell);
      queue.push({ cell: cell, spec: spec });
    });
    frag.appendChild(g);

    /* 相对大小由 index.html 构造函数的 scale 决定（1.0 / 0.82 / 1.28 / 2.05）。
       内容框照裁 —— 边距不是信息，被压小才是问题。 */
    calibrate(queue, 300);

    var f = el("p", "foot");
    f.innerHTML = "帧号跟 <b>e.walk</b> 累计位移走：减速时步频自然降，按时间自由播会读成滑步。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 04 特效 */

  function buildFx() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("04", "特效", "Effect", "刀光 / 打击火花 / 旋风环 / 投掷物"));

    /* 刀光按文件去重：三把投掷物共用同一张 burst */
    var byFile = {};
    Object.keys(WFX).forEach(function (k) {
      var d = WFX[k];
      if (!d || !d.file) return;
      if (!byFile[d.file]) byFile[d.file] = { users: [], r: d.r, arc: d.arc };
      byFile[d.file].users.push(WNAME[k] || k);
    });
    var fileKeys = Object.keys(byFile);

    frag.appendChild(groupHead("武器刀光", "Slash", "半径与弧角取自 WEAPON_FX",
      fileKeys.length + " 张"));
    var g1 = gridOf(fileKeys.length);
    fileKeys.forEach(function (file) {
      var g = byFile[file];
      g1.appendChild(imageCell(file, g.users.join(" / "),
        "r " + g.r + " · 弧 " + Number(g.arc).toFixed(2), 158));
    });
    frag.appendChild(g1);

    frag.appendChild(groupHead("材质打击火花", "Hit Spark", "按武器材质分流",
      Object.keys(HITM).length + " 张"));
    var mKeys = Object.keys(HITM);
    var g2 = gridOf(mKeys.length);
    mKeys.forEach(function (k) {
      g2.appendChild(imageCell(HITM[k], MATNAME[k] || k, "材质 · " + k, 158));
    });
    frag.appendChild(g2);

    frag.appendChild(groupHead("通用特效", "Generic", "三档刀光 / 三档火花 / 旋风环 / 投掷物",
      GENERIC_FX.length + " 张"));
    var g3 = gridOf(GENERIC_FX.length);
    GENERIC_FX.forEach(function (r) {
      g3.appendChild(imageCell("assets/" + r[0] + ".webp", r[1], r[2] || "单帧", 158));
    });
    frag.appendChild(g3);

    var f = el("p", "foot");
    f.innerHTML = "刀光凸背朝面向侧 —— <b>面右镜像、面左原样</b>，与常规写法相反；" +
      "刃口高光取实测弧心 <b>ARC</b>，不能按包围盒居中。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 05 场景 */

  function buildScene() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("05", "场景", "Scene", "三层视差 + 8 静物 + 6 交互物"));

    frag.appendChild(groupHead("背景层", "Parallax", "远景 / 中景 / 地面，横向平铺交替镜像",
      BG.length + " 张"));
    var g1 = gridOf(3);
    BG.forEach(function (r) {
      g1.appendChild(imageCell(r[0], r[1], r[3], 280));
    });
    frag.appendChild(g1);

    frag.appendChild(groupHead("静物道具", "Prop", "全部贴地面线，视差 1.00",
      PROPS.length + " 张"));
    var g2 = gridOf(8);
    PROPS.forEach(function (r) {
      g2.appendChild(imageCell("assets/props/" + r[0] + ".webp", r[1], "道具", 210));
    });
    frag.appendChild(g2);

    frag.appendChild(groupHead("交互物", "Interactable", "宝箱 / 机关 / 地面拾取物",
      INTERACT.length + " 张"));
    var g3 = gridOf(6);
    INTERACT.forEach(function (r) {
      g3.appendChild(imageCell("assets/interact/" + r[0] + ".webp", r[1], r[2], 170));
    });
    frag.appendChild(g3);

    var f = el("p", "foot");
    f.innerHTML = "缺任一层即 <b>Background.ready()</b> 为 false，回落纯代码 <b>drawBG()</b> —— 不许白屏。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 06 界面 */

  function buildUi() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("06", "界面", "Interface",
      "图标 " + ICONS.length + " · 界面资源 " + UIS.length +
      " · 虚拟键 " + TOUCH.length + " · 应用图标 " + APPS.length));

    frag.appendChild(groupHead("图标", "Icon", "拾取 / HUD / 符号", ICONS.length + " 张"));
    var g1 = gridOf(8);
    ICONS.forEach(function (r) {
      g1.appendChild(imageCell("assets/icons/" + r[0] + ".webp", r[1] + " · " + r[2],
        "webp", 96));
    });
    frag.appendChild(g1);

    frag.appendChild(groupHead("界面资源", "UI", "标题 / 结算 / HUD / 按钮四态",
      UIS.length + " 张"));
    var g2 = gridOf(5);
    UIS.forEach(function (r) {
      g2.appendChild(imageCell("assets/ui/" + r[0] + ".webp", r[1], r[2] || "webp", 230));
    });
    frag.appendChild(g2);

    frag.appendChild(groupHead("手机虚拟键", "Touch Button",
      "盘 + 暗刻纹样 + 文字三层；不进 MANIFEST，触屏档才加载", TOUCH.length + " 张"));
    var g5 = gridOf(5);
    TOUCH.forEach(function (r) {
      g5.appendChild(imageCell("assets/touch/" + r[0] + ".webp", r[1], r[2], 150));
    });
    frag.appendChild(g5);

    frag.appendChild(groupHead("应用图标", "App Icon",
      "PWA / 桌面快捷方式，不属于游戏内素材", APPS.length + " 张"));
    var g3 = gridOf(10);
    APPS.forEach(function (r) {
      g3.appendChild(imageCell("assets/icon/" + r[0], r[1] + " px", r[0].split(".").pop(), 96));
    });
    frag.appendChild(g3);

    frag.appendChild(groupHead("展陈物料", "Exhibition", "线下展位用，不属于游戏内素材", "1 张"));
    var g4 = gridOf(2);
    var hand = imageCell("assets/exhibition/手柄键位.png", "手柄键位图",
      "1115 × 689 · png", 420);
    hand.classList.add("wide-cell");
    g4.appendChild(hand);
    frag.appendChild(g4);

    var f = el("p", "foot");
    f.innerHTML = "图标统一画布，长边占比目标 <b>0.84</b>；实测 0.41~0.65，相对大小会飘。";
    frag.appendChild(f);
    return frag;
  }

  /* ------------------------------------------------------------ 07 全集 */

  function buildWall() {
    var frag = document.createDocumentFragment();
    frag.appendChild(secHead("07", "全集", "All Frames", "assets/anim/ 全部逐帧图 · 点开看原图"));

    var groups = [];

    var charFiles = [];
    CHAR.forEach(function (r) {
      var d = ANIM[r[0]];
      if (d && d.files) charFiles = charFiles.concat(d.files);
    });
    groups.push(["角色动作", "Character", charFiles]);

    var seqFiles = [];
    Object.keys(ATC).forEach(function (k) {
      if (ATC[k] && ATC[k].files) seqFiles = seqFiles.concat(ATC[k].files);
    });
    /* 表缺席就整组不出现 —— 留一个 0 帧的空标题比不显示更像坏了 */
    if (seqFiles.length) groups.push(["武器出招序列", "Weapon Sequence", seqFiles]);

    var stateFiles = [];
    Object.keys(HOLD).forEach(function (k) { if (HOLD[k].file) stateFiles.push(HOLD[k].file); });
    Object.keys(ATK).forEach(function (k) { if (ATK[k].file) stateFiles.push(ATK[k].file); });
    Object.keys(WC).forEach(function (k) {
      ["walk", "attack", "jump", "hurt", "pickup"].forEach(function (st) {
        var d = WC[k] && WC[k][st];
        if (d && d.files) stateFiles = stateFiles.concat(d.files);
      });
    });
    groups.push(["武器状态", "Weapon State", stateFiles]);

    var enemyFiles = [];
    Object.keys(ENEMY).forEach(function (k) {
      if (ENEMY[k] && ENEMY[k].files) enemyFiles = enemyFiles.concat(ENEMY[k].files);
    });
    groups.push(["敌人", "Enemy", enemyFiles]);

    var all = 0;
    groups.forEach(function (g) {
      frag.appendChild(groupHead(g[0], g[1], null, g[2].length + " 帧"));
      var row = el("div", "wall-row");
      g[2].forEach(function (src) {
        var fig = document.createElement("figure");
        var im = document.createElement("img");
        im.src = src;
        im.loading = "lazy";
        im.title = baseName(src);
        im.alt = baseName(src);
        fig.appendChild(im);
        row.appendChild(fig);
        all++;
      });
      var wrap = el("div", "wall");
      wrap.appendChild(row);
      frag.appendChild(wrap);
    });

    /* 分项用实测长度拼，不写死：素材一增删，写死的算式立刻变成假账
       （原来写的是「角色 43 + 序列 40 + 武器状态 152 + 敌人 14 = 249」，
       删掉 atk-* 之后实际只剩 199，算式却还在报 249）。 */
    var f = el("p", "foot");
    f.innerHTML = "<b>" + all + "</b> 张 = " + groups.map(function (g) {
      return g[0] + " " + g[2].length;
    }).join(" + ");
    frag.appendChild(f);
    return frag;
  }

  /* ================================================================ Tabs */

  var TABS = [
    { id: "char",   no: "01", cn: "角色", en: "Character",  build: buildChar },
    { id: "weapon", no: "02", cn: "武器", en: "Weapon",     build: buildWeapon },
    { id: "enemy",  no: "03", cn: "敌人", en: "Enemy",      build: buildEnemy },
    { id: "fx",     no: "04", cn: "特效", en: "Effect",     build: buildFx },
    { id: "scene",  no: "05", cn: "场景", en: "Scene",      build: buildScene },
    { id: "ui",     no: "06", cn: "界面", en: "Interface",  build: buildUi },
    { id: "wall",   no: "07", cn: "全集", en: "All Frames", build: buildWall }
  ];

  var nav = document.getElementById("tabs");
  var main = document.getElementById("main");
  var panels = {};
  var current = null;

  TABS.forEach(function (t) {
    var b = el("button", "tab");
    b.type = "button";
    b.appendChild(el("i", null, t.no));
    b.appendChild(document.createTextNode(t.cn));
    b.setAttribute("aria-selected", "false");
    b.addEventListener("click", function () { showTab(t.id); });
    nav.appendChild(b);
    t._btn = b;
  });

  function showTab(id) {
    var t = TABS.filter(function (x) { return x.id === id; })[0] || TABS[0];
    if (current === t.id) return;
    current = t.id;

    TABS.forEach(function (x) {
      x._btn.setAttribute("aria-selected", x.id === t.id ? "true" : "false");
      if (panels[x.id]) panels[x.id].style.display = x.id === t.id ? "" : "none";
    });

    if (!panels[t.id]) {
      var sec = el("section", "sec");
      sec.appendChild(t.build());
      main.appendChild(sec);
      panels[t.id] = sec;
    }

    /* 只有当前 tab 的播放器跑帧；其余停表（不重置相位，切回来接着播） */
    PLAYERS.forEach(function (p) { p.on = false; });
    var sec = panels[t.id];
    PLAYERS.forEach(function (p) {
      if (sec.contains(p.cv)) { p.on = true; p.dirty = true; }
    });

    if (location.hash !== "#" + t.id) {
      history.replaceState(null, "", "#" + t.id);
    }
    window.scrollTo(0, 0);
  }

  /* ================================================================ 统计与启动 */

  function countAnimFrames() {
    var n = 0;
    CHAR.forEach(function (r) { var d = ANIM[r[0]]; if (d && d.files) n += d.files.length; });
    ENEMIES.forEach(function (r) { var d = ENEMY[r[0]]; if (d && d.files) n += d.files.length; });
    Object.keys(ATC).forEach(function (k) { if (ATC[k].files) n += ATC[k].files.length; });
    Object.keys(HOLD).forEach(function (k) { if (HOLD[k].file) n++; });
    Object.keys(ATK).forEach(function (k) { if (ATK[k].file) n++; });
    Object.keys(WC).forEach(function (k) {
      ["walk", "attack", "jump", "hurt", "pickup"].forEach(function (st) {
        var d = WC[k] && WC[k][st];
        if (d && d.files) n += d.files.length;
      });
    });
    return n;
  }

  function countAnimGroups() {
    var n = 0;
    CHAR.forEach(function (r) { var d = ANIM[r[0]]; if (d && d.files && d.files.length > 1) n++; });
    ENEMIES.forEach(function (r) { var d = ENEMY[r[0]]; if (d && d.files && d.files.length > 1) n++; });
    Object.keys(ATC).forEach(function (k) { if (ATC[k].files && ATC[k].files.length > 1) n++; });
    Object.keys(WC).forEach(function (k) {
      ["walk", "attack", "jump", "hurt", "pickup"].forEach(function (st) {
        var d = WC[k] && WC[k][st];
        if (d && d.files && d.files.length > 1) n++;
      });
    });
    return n;
  }

  function countStatic() {
    var n = 0, seen = {};
    Object.keys(WFX).forEach(function (k) {
      var f = WFX[k] && WFX[k].file;
      if (f && !seen[f]) { seen[f] = 1; n++; }
    });
    n += Object.keys(HITM).length;
    n += GENERIC_FX.length;
    n += BG.length + PROPS.length + INTERACT.length
       + ICONS.length + UIS.length + TOUCH.length + CHARSHEET.length + APPS.length;
    return n;
  }

  function boot() {
    var frames = countAnimFrames();
    var groups = countAnimGroups();
    var statics = countStatic();
    var total = frames + statics;

    var nums = document.querySelectorAll(".stat b");
    if (nums[0]) nums[0].textContent = frames;
    if (nums[1]) nums[1].textContent = total;
    if (nums[2]) nums[2].textContent = groups;
    if (nums[3]) nums[3].textContent = WEAPONS.length;

    var sub = document.querySelector(".brand .en");
    if (sub) {
      sub.textContent = "Asset Showcase · " + frames + " Animation Frames · " +
        total + " Files · " + groups + " Loops";
    }

    main.addEventListener("click", function (e) {
      var node = e.target;
      if (!node || !node.closest) return;

      var cell = node.closest(".cell");
      if (cell && cell._spec) { openLB(cell); return; }

      var fig = node.closest(".wall figure");
      if (fig) {
        var im = fig.querySelector("img");
        if (!im) return;
        ensureLB();
        lbCanvas.style.display = "none";
        lbImg.style.display = "";
        lbImg.src = im.src;
        if (lbP) lbP.on = false;
        lb._t.textContent = baseName(im.src);
        lb._m.textContent = "assets/anim · 原图";
        lb.classList.add("on");
      }
    });

    requestAnimationFrame(function (now) {
      lastNow = now;
      requestAnimationFrame(tick);
    });

    var want = (location.hash || "").replace("#", "");
    var valid = TABS.some(function (t) { return t.id === want; });
    showTab(valid ? want : "char");
  }

  boot();
})();
