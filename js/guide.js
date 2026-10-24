/* =========================================================================
 * guide.js — 操作指南：手柄图 / 键盘图 / 输入设备感知
 * -------------------------------------------------------------------------
 * 对外契约（只暴露 window.Guide 一个对象）：
 *   Guide.mount()                初始化：注入样式、启动设备轮询（幂等）
 *   Guide.renderInto(el[, kind]) 把当前设备的图 + 图例渲染进 el；kind 可强制 "kbd"/"pad"
 *   Guide.device                 "kbd" | "pad"，当前生效的输入设备
 *   Guide.onChange(fn)           设备切换时回调 fn(device)，返回取消函数
 *   Guide.setDevice(d)           手动切换（调试用）
 *   Guide.pads()                 已连接手柄数组（按连接顺序，最多 2 个）
 *   Guide.padCount()             已连接手柄数
 *   Guide.hintHtml()             底部提示条的 HTML（随设备变化）
 *
 * 为什么单独一个模块：
 *   改键位这件事原来散在四处 —— index.html 的两行提示、#pad 那行、ui-shell 的
 *   KEY_ROWS / PAD_ROWS、以及 readPad() 的映射。每次加键就漏三处。
 *   现在「按键叫什么、归哪一组、怎么画」只写在本文件的数据表里，
 *   行为判定仍然留在 index.html（模拟权威在那边），展示数据只有一份。
 *
 * 不变量：
 *   - 手柄图是内联 SVG，不加载任何图片 —— file:// 下零请求，也不破坏离线承诺。
 *   - 设备切换是「真按了什么就用什么」，不是「插上手柄就一直显示手柄」：
 *     键盘一敲就切回键盘图，手柄一动就切到手柄图，两者永不同时出现。
 *   - 任何 DOM 缺失都不抛异常，最坏情况是这条提示不显示。
 *   - 轮询只读 navigator.getGamepads()，不抢占游戏的手柄输入。
 * ========================================================================= */
(function (global, doc) {
  "use strict";

  var STYLE_ID = "gd-style";
  var PAD_DEADZONE = 0.5;        /* 摇杆超过这个值才算「有人在动手柄」 */

  /* =======================================================================
     一、数据表：按键叫什么、归哪一组
     -----------------------------------------------------------------------
     这是全项目唯一一份「按键 → 动作」的展示数据。
     增删键位只改这里；index.html 只负责判定，不再各自维护一份文案。
     ======================================================================= */

  /* 手柄图例。pin 对应 SVG 里的 data-pin，用来做悬停高亮与实按高亮。 */
  var PAD_LEGEND = [
    { pin: "stick", k: "左摇杆",   act: "移动" },
    { pin: "A",     k: "A",        act: "挥刀 · 连按三连击" },
    { pin: "X",     k: "X",        act: "跳跃" },
    { pin: "B",     k: "B",        act: "旋风斩 · 能量满时" },
    { pin: "Y",     k: "Y",        act: "拾取 / 开箱" },
    { pin: "dup",   k: "十字 ↑",   act: "递给队友" },
    { pin: "down",  k: "十字 ↓",   act: "丢弃手上武器" },
    { pin: "start", k: "Start",    act: "暂停" }
  ];

  /* 键盘图列：玩家一 / 玩家二；p2 是同一动作在玩家二那边的键位。
     攻击与拾取是两个键，别把它们合回一行 —— 合过一次，结果就是挥刀顺手把东西捡了。 */
  var KBD_LEGEND = [
    { keys: ["A", "D"],    act: "移动", p2: ["←", "→"] },
    { keys: ["W", "空格"], act: "跳跃", p2: ["↑", "右Shift"] },
    { keys: ["F", "J"],    act: "挥刀 · 连按三连击", p2: ["/", "小键盘0"] },
    { keys: ["G"],         act: "拾取 / 开箱", p2: [";"] },
    { keys: ["E"],         act: "丢弃", p2: ["."] },
    { keys: ["R"],         act: "递给队友", p2: ["'"] },
    { keys: ["跳", "+", "攻"], act: "旋风斩 · 能量满时", p2: ["跳", "+", "攻"] },
    { keys: ["Esc"],       act: "暂停", p2: ["Esc"] },
    { keys: ["H"],         act: "键位说明", p2: ["H"] },
    { keys: ["M"],         act: "静音", p2: ["M"] }
  ];

  /* 箭头字形单独放大，否则在中文字体里会被压成一根竖线 */
  var ARROW = { "↑": 1, "↓": 1, "←": 1, "→": 1 };

  /* 底部提示条：随设备切换，永远只出现一套 */
  var HINT_KBD = [
    '<b>玩家一</b> A D 走 · W 跳 · F/J 挥刀 · <b>G</b> 拾取/开箱 · <b>E</b> 丢弃 · <b>R</b> 递队友',
    '<b>玩家二</b> ← → 走 · ↑ 跳 · / 或小键盘0 挥刀 · <b>;</b> 拾取/开箱 · <b>.</b> 丢弃 · <b>\'</b> 递队友',
    '<b>Esc</b> 暂停 · <b>H</b> 键位说明 · <b>M</b> 静音'
  ];
  var HINT_PAD = [
    '<b>左摇杆</b> 走 · <b>A</b> 挥刀 · <b>X</b> 跳 · <b>B</b> 旋风斩 · <b>Y</b> 拾取/开箱',
    '<b>十字 ↑ / ↓</b> 递队友 / 丢弃',
    '<b>Start</b> 暂停 · <b>H</b> 键位说明 · <b>M</b> 静音'
  ];

  /* 触屏图列：手机上屏幕就那几个圆钮，按键名直接写钮上的字。
     与 js/touch.js 的 label 逐字一致 —— 文案说「按 拾」，屏幕上就真有「拾」。
     触屏没有「双人同键」这回事（两人各占半屏，各自一套钮），所以不写 p2 列。 */
  var TOUCH_LEGEND = [
    { keys: ["◀", "▶"], act: "移动" },
    { keys: ["跳"],      act: "跳跃" },
    { keys: ["刀"],      act: "挥刀 · 连按三连击" },
    { keys: ["技"],      act: "旋风斩 · 能量满时" },
    { keys: ["拾"],      act: "拾取 / 开箱" },
    { keys: ["丢"],      act: "丢弃手上武器" },
    { keys: ["递"],      act: "递给队友" },
    { keys: ["❚❚"],     act: "暂停" },
    { keys: ["?"],       act: "键位说明" }
  ];

  var HINT_TOUCH = [
    '左半屏 <b>◀ ▶</b> 走 · <b>跳</b> 跳 · 右半屏 <b>刀</b> 挥刀 · <b>技</b> 旋风斩',
    '<b>拾</b> 拾取/开箱 · <b>丢</b> 丢弃 · <b>递</b> 递队友',
    '屏幕上方 <b>❚❚</b> 暂停 · <b>?</b> 键位说明'
  ];

  /* =======================================================================
     二、样式（一次性注入，类名统一 gd- 前缀）
     ======================================================================= */
  var CSS = `
.gd-host{display:flex;align-items:center;justify-content:center;gap:56px;text-align:left}
.gd-fig{flex:0 0 auto}
.gd-pad{display:block;width:380px;height:auto;filter:drop-shadow(0 10px 26px rgba(0,0,0,.62))}

/* ---- 手柄图形 ---- */
.gd-body{fill:url(#gd-body-grad);stroke:rgba(217,180,94,.42);stroke-width:1.4}
.gd-pill{fill:rgba(28,30,24,.95);stroke:rgba(217,180,94,.40);stroke-width:1.2}
.gd-pill-t{fill:#c9bb98;font-size:12.5px;font-weight:700;letter-spacing:.04em}
.gd-bar{fill:#c9bb98;opacity:.95}
.gd-ring{fill:rgba(10,11,8,.9);stroke:rgba(217,180,94,.42);stroke-width:1.4}
.gd-dot{fill:#4a4d40;stroke:rgba(217,180,94,.30);stroke-width:1}
.gd-cross{fill:rgba(28,30,24,.95);stroke:rgba(217,180,94,.34);stroke-width:1.1}
.gd-face{fill:rgba(22,24,19,.96);stroke:rgba(217,180,94,.48);stroke-width:1.3;
  transition:fill .14s ease,stroke .14s ease}
.gd-face-t{fill:#f2e6c8;font-size:15px;font-weight:700;
  paint-order:stroke;stroke:rgba(0,0,0,.55);stroke-width:2.4px}

/* 面键用色区分，和底部提示里的粗体同色系，读图就能对上 */
.gd-pin[data-pin="A"] .gd-face{fill:rgba(64,42,20,.95);stroke:rgba(245,190,110,.72)}
.gd-pin[data-pin="B"] .gd-face{fill:rgba(52,26,26,.95);stroke:rgba(232,140,130,.68)}
.gd-pin[data-pin="X"] .gd-face{fill:rgba(24,38,58,.95);stroke:rgba(140,190,232,.68)}
.gd-pin[data-pin="Y"] .gd-face{fill:rgba(26,44,32,.95);stroke:rgba(158,222,132,.68)}

/* 高亮：悬停图例、或真的按下这个键 */
.gd-pin.gd-on .gd-face{fill:rgba(245,217,142,.92);stroke:#fff6dc}
.gd-pin.gd-on .gd-face-t{fill:#1a140e}
.gd-pin.gd-on .gd-ring{stroke:#f5d98e}
.gd-pin.gd-on .gd-dot{fill:#f5d98e;stroke:#fff6dc}
.gd-pin.gd-on .gd-pill{fill:rgba(245,217,142,.9);stroke:#fff6dc}
.gd-pin.gd-on .gd-pill-t{fill:#1a140e}
.gd-pin.gd-on .gd-cross{fill:rgba(245,217,142,.85);stroke:#fff6dc}

/* ---- 图例 ---- */
.gd-legend{flex:1 1 auto;min-width:0}
.gd-row{display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:4px;
  border:1px solid transparent;transition:background .14s ease,border-color .14s ease}
.gd-row.gd-on{background:rgba(245,217,142,.10);border-color:rgba(245,217,142,.28)}
.gd-row em{font-style:normal;font-size:15px;letter-spacing:.05em;color:#b8ab8c}
.gd-row.gd-on em{color:#f2e2b6}
.gd-k{display:inline-flex;align-items:center;justify-content:center;
  min-width:38px;height:32px;padding:0 10px;flex:0 0 auto;
  font-size:13.5px;letter-spacing:.04em;color:#e8dab4;
  background:rgba(0,0,0,.5);border:1px solid rgba(180,150,96,.42);border-radius:4px;
  box-shadow:inset 0 1px 0 rgba(255,240,200,.10)}
/* 箭头字形在中文字体里比字母窄得多，按小号会缩成一根竖线，单独放大一档 */
.gd-k--arrow{font-size:17px;min-width:38px;color:#f2e4bc}
.gd-k--wide{min-width:54px}
.gd-k--mini{min-width:32px;height:29px;padding:0 7px;font-size:12.5px;color:#c9bb98}
.gd-plus{color:#6c6354;font-size:13.5px;flex:0 0 auto}

/* 键盘图：两列键位卡 */
.gd-kbd{display:flex;gap:56px;align-items:flex-start;text-align:left}
.gd-col{flex:1 1 0;min-width:0}
.gd-col-h{font-size:12px;letter-spacing:.3em;color:#8a7a5c;margin-bottom:12px}
.gd-col .gd-row{padding:6px 9px;gap:10px}
.gd-col .gd-row em{font-size:14px}
`;

  function ensureStyle() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  /* =======================================================================
     三、手柄图形（内联 SVG）
     -----------------------------------------------------------------------
     标准布局，Xbox 与 PS 编号一致、刻字不同，这里统一按字母标注。
     每个可交互部件都挂 data-pin，和图例的 pin 一一对应。
     ======================================================================= */
  function facePin(pin, cx, cy, letter) {
    return '<g class="gd-pin" data-pin="' + pin + '">' +
      '<circle class="gd-face" cx="' + cx + '" cy="' + cy + '" r="17"/>' +
      '<text class="gd-face-t" x="' + cx + '" y="' + cy + '" dy=".35em" ' +
      'text-anchor="middle">' + letter + '</text>' +
      '</g>';
  }

  function padSvg() {
    return '' +
      '<svg class="gd-pad" viewBox="0 0 360 240" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="手柄按键分布">' +
      '<defs><linearGradient id="gd-body-grad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#24271f"/><stop offset="1" stop-color="#101208"/>' +
      '</linearGradient></defs>' +

      /* 肩键 */
      '<g class="gd-pin" data-pin="LB">' +
      '<rect class="gd-pill" x="82" y="38" width="70" height="22" rx="11"/>' +
      '<text class="gd-pill-t" x="117" y="54" text-anchor="middle">LB</text></g>' +
      '<g class="gd-pin" data-pin="RB">' +
      '<rect class="gd-pill" x="208" y="38" width="70" height="22" rx="11"/>' +
      '<text class="gd-pill-t" x="243" y="54" text-anchor="middle">RB</text></g>' +

      /* 机身 */
      '<rect class="gd-body" x="40" y="62" width="280" height="150" rx="62"/>' +

      /* 左摇杆 */
      '<g class="gd-pin" data-pin="stick">' +
      '<circle class="gd-ring" cx="104" cy="138" r="27"/>' +
      '<circle class="gd-dot" cx="104" cy="138" r="15"/></g>' +

      /* 十字键：两臂合成一个十字，上 / 下两臂各自可高亮 */
      '<g class="gd-pin" data-pin="dup">' +
      '<rect class="gd-cross" x="159" y="143" width="17" height="18" rx="3"/></g>' +
      '<g class="gd-pin" data-pin="down">' +
      '<rect class="gd-cross" x="159" y="175" width="17" height="18" rx="3"/></g>' +
      '<rect class="gd-cross" x="159" y="157" width="17" height="22" rx="3" opacity=".85"/>' +
      '<rect class="gd-cross" x="143" y="163" width="49" height="16" rx="3" opacity=".85"/>' +

      /* Start：机身中线偏上的暂停条，避开左摇杆与面键菱阵 */
      '<g class="gd-pin" data-pin="start">' +
      '<rect class="gd-pill" x="174" y="86" width="40" height="18" rx="9"/>' +
      '<rect class="gd-bar" x="190" y="92" width="2.8" height="6.5" rx="1"/>' +
      '<rect class="gd-bar" x="196" y="92" width="2.8" height="6.5" rx="1"/>' +
      '</g>' +

      /* 面键菱阵：上 Y / 左 X / 右 B / 下 A */
      facePin("Y", 264, 104, "Y") +
      facePin("X", 231, 137, "X") +
      facePin("B", 297, 137, "B") +
      facePin("A", 264, 170, "A") +

      '</svg>';
  }

  /* 手机示意图：横置的手机外框，把屏幕上的按键位置照实摆一遍。
     画它是为了让「触屏键位说明」有图可看 —— 只有一张文字表的话，
     玩家读完还是不知道哪个钮在哪。坐标按 js/touch.js 的实际布局取近似值：
     左半屏 ◀ ▶ 贴底、跳在中间抬起，右半屏刀在内、技在外。 */
  function phoneSvg() {
    var btn = function (cx, cy, r, label, big) {
      return '<circle class="gd-ring" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>' +
        '<text class="gd-face-t" x="' + cx + '" y="' + (cy + r * 0.34) + '" ' +
        'text-anchor="middle" font-size="' + (big ? r * 0.86 : r * 0.78) + '">' + label + '</text>';
    };
    return '' +
      '<svg class="gd-pad" viewBox="0 0 420 240" xmlns="http://www.w3.org/2000/svg" ' +
      'role="img" aria-label="手机横屏按键分布">' +
      /* 机身：横屏，宽高比接近 16:9 */
      '<rect class="gd-body" x="14" y="42" width="392" height="164" rx="16"/>' +
      /* 屏幕：比机身内缩一圈，示意「游戏画面在这里」 */
      '<rect x="26" y="54" width="368" height="140" rx="6" ' +
      'fill="rgba(0,0,0,.34)" stroke="rgba(217,180,94,.22)" stroke-width="1"/>' +

      /* 左半屏：◀ ▶ 贴底，跳在两者中间抬起 */
      btn(58, 168, 17, "◀") +
      btn(104, 168, 17, "▶") +
      btn(81, 128, 17, "跳") +

      /* 右半屏：刀最大在内侧、技在外、拾在刀上方、丢 / 递缩成小钮 */
      btn(306, 170, 22, "刀", true) +
      btn(356, 146, 17, "技") +
      btn(256, 146, 17, "拾") +
      btn(330, 110, 13, "丢") +
      btn(374, 96, 13, "递") +

      /* 顶部系统键 */
      '<rect class="gd-pill" x="186" y="62" width="26" height="14" rx="7"/>' +
      '<text class="gd-pill-t" x="199" y="72.5" text-anchor="middle" font-size="9">❚❚</text>' +
      '<rect class="gd-pill" x="218" y="62" width="26" height="14" rx="7"/>' +
      '<text class="gd-pill-t" x="231" y="72.5" text-anchor="middle" font-size="9">?</text>' +

      '</svg>';
  }

  /* =======================================================================
     四、渲染
     ======================================================================= */

  /* 已挂载的实例，用于实按闪烁与设备切换后重绘 */
  var mounted = [];

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function legendPad() {
    var html = '<div class="gd-legend">';
    for (var i = 0; i < PAD_LEGEND.length; i++) {
      var r = PAD_LEGEND[i];
      html += '<div class="gd-row" data-pin="' + r.pin + '">' +
        '<span class="gd-k' + (r.k.length > 3 ? " gd-k--wide" : "") + '">' + esc(r.k) + '</span>' +
        '<em>' + esc(r.act) + '</em></div>';
    }
    return html + '</div>';
  }

  function keyCaps(list, wrapWidth) {
    var out = "";
    for (var i = 0; i < list.length; i++) {
      var k = list[i];
      if (k === "+") { out += '<span class="gd-plus">+</span>'; continue; }
      var cls = "gd-k";
      if (ARROW[k]) cls += " gd-k--arrow";
      else if (k.length > 1) cls += " gd-k--mini";
      if (wrapWidth) cls += " gd-k--wide";
      out += '<span class="' + cls + '">' + esc(k) + '</span>';
    }
    return out;
  }

  function legendKbd() {
    var p1 = '<div class="gd-col"><div class="gd-col-h">玩家一</div>';
    var p2 = '<div class="gd-col"><div class="gd-col-h">玩家二</div>';
    for (var i = 0; i < KBD_LEGEND.length; i++) {
      var r = KBD_LEGEND[i];
      p1 += '<div class="gd-row">' + keyCaps(r.keys) + '<em>' + esc(r.act) + '</em></div>';
      p2 += '<div class="gd-row">' + keyCaps(r.p2) + '<em>' + esc(r.act) + '</em></div>';
    }
    return '<div class="gd-kbd">' + p1 + '</div>' + p2 + '</div>';
  }

  /* 图例行悬停 → 对应按键高亮；离开复位 */
  function bindHover(root) {
    var svg = root.querySelector(".gd-pad");
    if (!svg) return;
    var rows = root.querySelectorAll(".gd-row[data-pin]");
    for (var i = 0; i < rows.length; i++) {
      (function (row) {
        var pin = row.getAttribute("data-pin");
        var g = svg.querySelector('[data-pin="' + pin + '"]');
        row.addEventListener("mouseenter", function () {
          if (g) g.classList.add("gd-on");
          row.classList.add("gd-on");
        }, false);
        row.addEventListener("mouseleave", function () {
          if (g && !g.__pressed) g.classList.remove("gd-on");
          row.classList.remove("gd-on");
        }, false);
      })(rows[i]);
    }
  }

  /* 触屏图例：单列，按键就是屏幕上的圆钮字形 */
  function legendTouch() {
    var html = '<div class="gd-legend">';
    for (var i = 0; i < TOUCH_LEGEND.length; i++) {
      var r = TOUCH_LEGEND[i];
      html += '<div class="gd-row">' +
        '<span class="gd-k' + (r.keys.join("").length > 3 ? " gd-k--wide" : "") + '">' +
        esc(r.keys.join(" ")) + '</span>' +
        '<em>' + esc(r.act) + '</em></div>';
    }
    return html + '</div>';
  }

  /* 把当前设备的图渲染进 el。kind 省略时用当前设备。 */
  function renderInto(el, kind) {
    if (!el) return false;
    var k = (kind === "kbd" || kind === "pad" || kind === "touch") ? kind : device;
    var body;
    if (k === "pad") {
      body = '<div class="gd-fig">' + padSvg() + '</div>' + legendPad();
    } else if (k === "touch") {
      /* 触屏没有「手柄示意图」可画 —— 画一张手机外框，把按键摆上去，
         比留白更像回事，也让玩家一眼知道这是手机版 */
      body = '<div class="gd-fig">' + phoneSvg() + '</div>' + legendTouch();
    } else {
      body = '<div class="gd-fig" style="display:none"></div>' + legendKbd();
    }
    el.innerHTML = '<div class="gd-host">' + body + '</div>';
    /* 去掉空的占位，避免 flex 里多一个零宽元素 */
    if (k === "kbd") {
      var ph = el.querySelector(".gd-fig");
      if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
    }
    bindHover(el);

    /* 注册到实例表，供实按闪烁使用 */
    for (var i = 0; i < mounted.length; i++) {
      if (mounted[i].el === el) { mounted.splice(i, 1); break; }
    }
    mounted.push({ el: el, kind: k, svg: el.querySelector(".gd-pad") });
    return true;
  }

  /* =======================================================================
     五、输入设备感知
     -----------------------------------------------------------------------
     规则：谁在动就用谁。键盘敲一下就切键盘图，手柄按一下就切手柄图。
     两者永不同时出现；切换只在真正变化时触发一次 DOM 变更。
     ======================================================================= */
  var device = "kbd";
  var listeners = [];
  var PADS = [];
  var padPrev = {};

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](device); } catch (e) { /* 单个回调出错不影响其它 */ }
    }
  }

  function applyBodyClass() {
    if (!doc || !doc.body) return;
    var cl = doc.body.classList;
    if (!cl) return;
    cl.toggle("dev-pad", device === "pad");
    cl.toggle("dev-kbd", device === "kbd");
    cl.toggle("dev-touch", device === "touch");
  }

  function hintEls() {
    return {
      keys: doc && doc.getElementById ? doc.getElementById("keys") : null,
      pad: doc && doc.getElementById ? doc.getElementById("pad") : null
    };
  }

  function paintHints() {
    var els = hintEls();
    if (els.keys) {
      var lines = (device === "pad") ? HINT_PAD
                : (device === "touch") ? HINT_TOUCH
                : HINT_KBD;
      els.keys.innerHTML = lines.join("<br>");
      els.keys.style.color = (device === "pad") ? "#a8c49a"
                           : (device === "touch") ? "#c9a765"
                           : "";
    }
    if (els.pad) {
      var n = PADS.length;
      els.pad.innerHTML = (device === "pad")
        ? (n > 0 ? ("手柄已连接 ×" + n + " · <b>H</b> 看完整键位")
                 : ("手柄 · <b>H</b> 看完整键位"))
        : (device === "touch")
          ? ("触屏 · <b>?</b> 看完整键位")
          : ("键盘 · <b>H</b> 看完整键位");
      els.pad.style.color = (device === "pad") ? "#7fa86f"
                          : (device === "touch") ? "#c9a765"
                          : "";
    }
  }

  function setDevice(d) {
    if (d !== "kbd" && d !== "pad" && d !== "touch") return device;
    if (d === device) return device;
    device = d;
    applyBodyClass();
    paintHints();
    for (var i = 0; i < mounted.length; i++) renderInto(mounted[i].el, device);
    mounted = mounted.filter(function (m) { return !!m.el.isConnected || m.el.parentNode; });
    emit();
    return device;
  }

  function onChange(fn) {
    if (typeof fn !== "function") return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* 键盘：任何一次按键都算「正在用键盘」 */
  function onKeyDown() {
    if (device !== "kbd") setDevice("kbd");
  }

  /* 触屏：手指真的落下才算「正在用手指」。
     判据取自 js/touch.js 的 active() —— 它已经处理了「触屏笔记本用键盘玩」
     与「插了手柄就用不着虚拟键」这两种情况，这里不重复造一套规则。
     模块缺席时永远 false，桌面玩家的行为一点没变。 */
  function touchActive() {
    try {
      return !!(global.Touch && global.Touch.active && global.Touch.active());
    } catch (e) {
      return false;
    }
  }

  /* 手柄：任何按钮按下或摇杆推离死区都算「正在用手柄」 */
  function scanPads() {
    var nav = global.navigator;
    var list = (nav && typeof nav.getGamepads === "function") ? (nav.getGamepads() || []) : [];
    var found = [];
    for (var i = 0; i < list.length; i++) {
      var gp = list[i];
      if (gp && gp.connected) found.push(gp);
      if (found.length >= 2) break;
    }
    PADS = found;
    return found;
  }

  function padActive(gp) {
    if (!gp) return false;
    var b = gp.buttons || [];
    for (var i = 0; i < b.length; i++) {
      if (b[i] && (b[i].pressed || b[i].value > 0.5)) return true;
    }
    var a = gp.axes || [];
    if (Math.abs(a[0] || 0) > PAD_DEADZONE) return true;
    if (Math.abs(a[1] || 0) > PAD_DEADZONE) return true;
    return false;
  }

  /* 面键编号 → 图上的 pin。用来让图跟着手指亮。 */
  var BTN_PIN = {
    0: "A", 1: "B", 2: "X", 3: "Y",
    4: "LB", 5: "RB",
    9: "start",
    12: "dup", 13: "down"
  };

  /* Start 那枚在图上画了，但说明表里由暂停功能登记（见 feat/pause）。
     这里保留绘图与按下高亮，不在 PR-A 里写「暂停」两个字。 */

  function paintPress(gp) {
    if (!mounted.length) return;
    var down = {};
    if (gp) {
      var b = gp.buttons || [];
      for (var i = 0; i < b.length; i++) {
        var pin = BTN_PIN[i];
        if (pin && b[i] && (b[i].pressed || b[i].value > 0.5)) down[pin] = true;
      }
      var ax = (gp.axes && gp.axes[0]) || 0;
      var ay = (gp.axes && gp.axes[1]) || 0;
      if (Math.abs(ax) > 0.42 || Math.abs(ay) > 0.42) down.stick = true;
      if (ay < -0.5) down.dup = true;
      if (ay > 0.5) down.down = true;
    }
    for (var m = 0; m < mounted.length; m++) {
      var svg = mounted[m].svg;
      if (!svg) continue;
      var groups = svg.querySelectorAll(".gd-pin");
      for (var g = 0; g < groups.length; g++) {
        var el = groups[g];
        var p = el.getAttribute("data-pin");
        var isOn = !!down[p];
        el.__pressed = isOn;
        if (isOn) el.classList.add("gd-on");
        else el.classList.remove("gd-on");
      }
    }
  }

  /* 主轮询：读手柄 + 判断设备 + 让图跟着按键亮。
     与游戏主循环分开，暂停时也照常工作（暂停菜单要能用手柄操作）。 */
  var polling = false;
  var lastPadCount = -1;         /* 上一次写进 DOM 的手柄数：这一圈每帧都走，
                                   innerHTML 不能每帧重解析，只有连接数变了才重写 */
  function tick() {
    var pads = scanPads();
    var first = pads[0] || null;

    /* 优先级：手柄 > 触屏 > 键盘。
       手柄在前是因为插着手柄的人多半在用摇杆；触屏在键盘前是因为手机上
       根本不会有键盘事件，而桌面有触屏的机器手指落下就是明确信号。 */
    if (first && padActive(first)) {
      if (device !== "pad") setDevice("pad");
    } else if (touchActive()) {
      if (device !== "touch") setDevice("touch");
    }

    /* 连接数变化时才刷新右侧那行提示（热插拔时立刻反映，平时零开销） */
    if (device === "pad" && pads.length !== lastPadCount) {
      lastPadCount = pads.length;
      paintHints();
    }

    paintPress(device === "pad" ? first : null);

    global.requestAnimationFrame(tick);
  }

  function startPoll() {
    if (polling) return;
    if (typeof global.requestAnimationFrame !== "function") return;
    polling = true;
    global.requestAnimationFrame(tick);
  }

  /* =======================================================================
     六、导出
     ======================================================================= */
  var mountedOnce = false;

  global.Guide = {
    mount: function () {
      if (mountedOnce) return;
      mountedOnce = true;
      ensureStyle();
      applyBodyClass();
      paintHints();
      global.addEventListener("keydown", onKeyDown, false);
      /* 手柄热插拔：connect / disconnect 事件不可靠，仍以轮询为准，
         但连接事件能让人插上手柄那一刻就切过去 */
      global.addEventListener("gamepadconnected", function () {
        if (device !== "pad") setDevice("pad");
      }, false);
      startPoll();
    },
    renderInto: renderInto,
    onChange: onChange,
    setDevice: setDevice,
    device: function () { return device; },
    pads: function () { return PADS; },
    padCount: function () { return PADS.length; },
    hintHtml: function () { return ((device === "pad") ? HINT_PAD : HINT_KBD).join("<br>"); },
    refreshHints: paintHints,
    PAD_LEGEND: PAD_LEGEND,
    KBD_LEGEND: KBD_LEGEND,
    TOUCH_LEGEND: TOUCH_LEGEND
  };
})(window, document);
