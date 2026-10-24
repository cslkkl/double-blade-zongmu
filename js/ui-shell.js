/* =========================================================================
   ui-shell.js — 三星堆青铜风 UI 覆盖层
   三块：① 模式选择  ② 按键说明（右侧滑入抽屉）  ③ 拾取提示气泡
   纯 DOM + CSS，零依赖、零外部资源；只对外暴露 window.UIShell。

   坐标系说明：
   - 页面里存在 #stage（1600×900，靠 transform:scale 缩放）时，覆盖层挂进
     #stage 内部，宽度高度随游戏缩放，所以 showPickupHint(text, x, y) 的
     x、y 用 #stage 的设计像素（0~1600 / 0~900）即可，会和画面严丝合缝。
   - 没有 #stage 时退化为挂在 body 上、position:fixed，坐标视口像素。
   ========================================================================= */
(function (global, doc) {
  "use strict";

  var STYLE_ID = "uis-style";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var PART = "data-uis";           // 便于调试时定位节点
  var PICKUP_LIFE = 900;           // 拾取提示停留 0.9 秒
  var PICKUP_FADE = 240;           // 淡出时长（与 CSS 过渡对齐）

  /* ---------------- 内部状态 ---------------- */
  var S = {
    styleInstalled: false,
    hookInstalled: false,

    modeBuilt: false,
    modeOpen: false,
    modeHandler: null,
    modePick: "duo",        /* 手柄左右键高亮的那一项，Start 确认 */
    padHooked: false,

    helpBuilt: false,
    helpOpen: false,

    uiProbed: false,        /* 六张 UI 位图是否已探测过 */

    pickupBuilt: false,
    pickupTimer: 0,
    pickupKillTimer: 0
  };

  var D = {};   // DOM 引用：layer / mode / help / helpPanel / pickup / pickupBody

  /* =======================================================================
     样式：一次性注入，class 统一 uis- 前缀
     ======================================================================= */
  var CSS = `
/* ---------- 根容器 ---------- */
.uis-layer{
  --uis-ink:#0a0b0e;
  --uis-gold:#d9b45e;
  --uis-gold-hi:#f5d98e;
  --uis-jade:#5c7a6a;
  --uis-edge:#3a2a10;
  --uis-text:#c6b998;
  --uis-dim:#8b8071;
  position:absolute;inset:0;z-index:60;pointer-events:none;
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
  color:var(--uis-text);line-height:1.5;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
.uis-layer.uis-fixed{position:fixed}
.uis-layer *{box-sizing:border-box;margin:0;padding:0}
.uis-layer button{
  font-family:inherit;color:inherit;background:none;border:0;cursor:pointer;
  -webkit-appearance:none;appearance:none;
}

/* ===================== 一、模式选择 ===================== */
.uis-mode{
  position:absolute;inset:0;z-index:1;
  display:flex;align-items:center;justify-content:center;
  background:
    radial-gradient(ellipse 60% 54% at 50% 44%,
      rgba(217,180,94,.115) 0%,rgba(217,180,94,.038) 40%,rgba(217,180,94,0) 74%),
    rgba(8,9,11,.92);
  opacity:0;visibility:hidden;pointer-events:none;
  transition:opacity .32s ease,visibility 0s linear .32s;
}
/* 封面位图：探到才挂。图在渐变底之上，暗角压在图上保证文字可读。
   缺图时这一整块不生效，退回上面的纯渐变底。 */
.uis-ok-titleBg .uis-mode{
  background:
    radial-gradient(ellipse 46% 40% at 50% 40%,
      rgba(0,0,0,.52) 0%,rgba(0,0,0,.34) 55%,rgba(0,0,0,0) 100%),
    radial-gradient(ellipse 120% 90% at 50% 50%,
      rgba(0,0,0,0) 44%,rgba(0,0,0,.62) 100%),
    url("assets/ui/title-bg.webp") center/cover no-repeat,
    rgba(8,9,11,.94);
}
.uis-mode.uis-on{
  opacity:1;visibility:visible;pointer-events:auto;
  transition:opacity .36s ease,visibility 0s;
}

.uis-card{
  position:relative;width:min(760px,86%);padding:50px 56px 36px;text-align:center;
  background:linear-gradient(180deg,rgba(17,18,22,.95) 0%,rgba(11,12,15,.97) 100%);
  border:1px solid rgba(217,180,94,.26);border-radius:2px;
  box-shadow:0 34px 110px rgba(0,0,0,.82),inset 0 1px 0 rgba(245,217,142,.08);
  transform:translateY(12px);
  transition:transform .44s cubic-bezier(.2,.8,.25,1);
}
.uis-mode.uis-on .uis-card{transform:none}
/* 有面板图时：卡片读作一块青铜牌盖在封面上。
   fill 内腔是半透明的，让封面透上来 —— 纯黑底会把辛辛苦苦生的背景挡死。 */
.uis-ok-panel .uis-card{
  border:46px solid transparent;
  border-image:url("assets/ui/panel-frame.webp") 140 97 66 97 fill stretch;
  border-radius:0;
  background:rgba(9,10,13,.40);
  padding:10px 44px 18px;
  box-shadow:0 34px 110px rgba(0,0,0,.70);
}
.uis-ok-panel .uis-card::before,
.uis-ok-panel .uis-card::after{display:none}
.uis-card::before,.uis-card::after{
  content:"";position:absolute;left:13%;right:13%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(217,180,94,.55),transparent);
}
.uis-card::before{top:-1px}
.uis-card::after{bottom:-1px}

/* 纵目眼 */
.uis-eye{
  display:block;width:132px;height:48px;margin:0 auto 20px;
  color:rgba(217,180,94,.78);
  filter:drop-shadow(0 0 16px rgba(217,180,94,.28));
}

.uis-title{
  font-size:46px;font-weight:700;letter-spacing:.15em;text-indent:.15em;
  color:#f7eccd;
  text-shadow:0 0 62px rgba(217,180,94,.34),0 2px 0 rgba(0,0,0,.65);
}

/* 云雷纹分隔 */
.uis-rule{display:flex;align-items:center;justify-content:center;gap:11px;margin:17px 0 15px}
.uis-rule i{display:block;width:88px;height:1px;background:linear-gradient(90deg,transparent,rgba(217,180,94,.6))}
.uis-rule i:last-child{background:linear-gradient(90deg,rgba(217,180,94,.6),transparent)}
.uis-rule svg{display:block;width:26px;height:18px;color:rgba(217,180,94,.72)}

.uis-sub{
  font-size:12.5px;letter-spacing:.24em;text-indent:.24em;color:#8f8474;
}

/* 两个大按钮 */
.uis-modebtns{display:flex;gap:20px;justify-content:center;margin-top:32px}
.uis-layer .uis-modebtn{
  position:relative;flex:1 1 0;max-width:302px;padding:24px 16px 21px;
  border:1px solid rgba(217,180,94,.30);border-radius:2px;
  background:linear-gradient(180deg,rgba(217,180,94,.085),rgba(217,180,94,.015));
  transition:
    transform .24s cubic-bezier(.2,.8,.25,1),
    border-color .24s ease,
    box-shadow .3s ease,
    background .24s ease;
  will-change:transform;
}
.uis-layer .uis-modebtn:hover,
.uis-layer .uis-modebtn:focus-visible,
.uis-layer .uis-modebtn.uis-pick{
  transform:translateY(-4px);
  border-color:var(--uis-gold-hi);
  background:linear-gradient(180deg,rgba(245,217,142,.16),rgba(217,180,94,.05));
  box-shadow:
    0 0 0 1px rgba(245,217,142,.34),
    0 14px 38px rgba(0,0,0,.6),
    0 0 34px rgba(245,217,142,.24),
    inset 0 1px 0 rgba(255,246,220,.22);
  outline:none;
}
.uis-layer .uis-modebtn:active{transform:translateY(-1px)}
.uis-layer .uis-modebtn-key{
  position:absolute;top:9px;right:9px;min-width:19px;height:19px;line-height:17px;
  font-size:10.5px;color:#a8997a;text-align:center;
  border:1px solid rgba(217,180,94,.26);border-radius:3px;background:rgba(0,0,0,.4);
  transition:color .24s ease,border-color .24s ease;
}
.uis-layer .uis-modebtn:hover .uis-modebtn-key,
.uis-layer .uis-modebtn:focus-visible .uis-modebtn-key,
.uis-layer .uis-modebtn.uis-pick .uis-modebtn-key{
  color:var(--uis-gold-hi);border-color:rgba(245,217,142,.62);
}
.uis-mbtn-name{
  display:block;font-size:21px;letter-spacing:.13em;text-indent:.13em;
  color:#f0e3c2;text-shadow:0 0 20px rgba(245,217,142,.22);
}

/* 按钮位图：364×144 四态，等比撑满（2.53:1）。
   图自带青铜边框与内腔，所以把 CSS 的 border 与渐变底撤掉；
   文字仍压在图上，靠 text-shadow + 内腔安全区保证可读。
   安全区实测 x 70~298 / y 29~112，左右两侧 x30~62 与 x302~334 是方形铜钮，别放字。 */
.uis-layer.uis-ok-btnOn .uis-modebtn{
  border:0;border-radius:0;
  background:url("assets/ui/btn-normal.webp") center/100% 100% no-repeat;
  /* 图是 364×144（2.53:1），显式比例避免拉伸。
     padding 必须用 px —— 百分比 padding 按容器宽度解析，内容区会被压成负值、文字被挤成竖排。 */
  aspect-ratio:364/144;
  max-width:340px;
  padding:0 76px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  /* box-shadow 必须清掉：基础 hover 规则里有 0 0 0 1px 的金色环，
     它画在元素矩形边框上，不像 drop-shadow 那样跟随透明轮廓，
     有图时会露出一圈方框，把青铜牌的圆头压成方角。 */
  box-shadow:none;
  outline:none;
  filter:drop-shadow(0 10px 26px rgba(0,0,0,.58));
}
.uis-layer.uis-ok-btnOn .uis-modebtn:hover,
.uis-layer.uis-ok-btnOn .uis-modebtn:focus-visible,
.uis-layer.uis-ok-btnOn .uis-modebtn.uis-pick{
  background-image:url("assets/ui/btn-hover.webp");
  border:0;
  box-shadow:none;
  outline:none;
  filter:drop-shadow(0 14px 34px rgba(0,0,0,.66)) drop-shadow(0 0 22px rgba(245,217,142,.34));
}
.uis-layer.uis-ok-btnOn .uis-modebtn:active{
  background-image:url("assets/ui/btn-press.webp");
  box-shadow:none;
  outline:none;
  filter:drop-shadow(0 4px 12px rgba(0,0,0,.62));
}
.uis-layer.uis-ok-btnOn .uis-modebtn.uis-off,
.uis-layer.uis-ok-btnOn .uis-modebtn:disabled{
  background-image:url("assets/ui/btn-disabled.webp");
  box-shadow:none;
  filter:drop-shadow(0 6px 16px rgba(0,0,0,.45));
  cursor:default;
}
.uis-layer.uis-ok-btnOn .uis-modebtn .uis-mbtn-name,
.uis-layer.uis-ok-btnOn .uis-modebtn .uis-modebtn-key{
  text-shadow:0 1px 3px rgba(0,0,0,.92),0 0 12px rgba(0,0,0,.7);
}

.uis-modefoot{
  margin-top:26px;font-size:10.5px;letter-spacing:.24em;text-indent:.24em;
  color:#5f5749;
}

/* ===================== 二、按键说明（右侧抽屉） ===================== */
.uis-help{position:absolute;inset:0;z-index:2;pointer-events:none}
.uis-help-scrim{
  position:absolute;inset:0;background:rgba(5,6,8,.58);
  opacity:0;pointer-events:none;
  transition:opacity .3s ease;
}
.uis-help.uis-on .uis-help-scrim{opacity:1;pointer-events:auto}

.uis-help-panel{
  position:absolute;top:0;right:0;height:100%;width:min(566px,47%);
  display:flex;flex-direction:column;
  padding:42px 40px 30px;overflow-y:auto;overscroll-behavior:contain;
  background:linear-gradient(180deg,rgba(15,16,20,.975) 0%,rgba(9,10,13,.99) 100%);
  border-left:1px solid rgba(217,180,94,.26);
  box-shadow:-28px 0 80px rgba(0,0,0,.62),-1px 0 0 rgba(245,217,142,.08) inset;
  transform:translateX(102%);pointer-events:none;
  transition:transform .38s cubic-bezier(.22,.82,.24,1),opacity .3s ease;
}
.uis-help-panel::before{
  content:"";position:absolute;left:0;top:0;bottom:0;width:1px;
  background:linear-gradient(180deg,transparent 0%,rgba(245,217,142,.55) 22%,rgba(217,180,94,.18) 68%,transparent 100%);
}
.uis-help.uis-on .uis-help-panel{transform:none;pointer-events:auto}
.uis-help-panel::-webkit-scrollbar{width:6px}
.uis-help-panel::-webkit-scrollbar-thumb{background:rgba(217,180,94,.22);border-radius:3px}

/* 抽屉里的操作图：面板内宽只有 ~390px，图和图例必须竖排，不能并排硬挤。
   js/guide.js 的默认布局是横向（暂停页那种宽容器用），这里覆写为纵向。 */
.uis-help-body{margin:0 -4px 18px}
.uis-help-body .gd-host{flex-direction:column;align-items:stretch;gap:16px}
.uis-help-body .gd-fig{display:flex;justify-content:center}
.uis-help-body .gd-pad{width:232px}
.uis-help-body .gd-kbd{flex-direction:column;gap:14px}
.uis-help-body .gd-legend{width:100%}

/* 说明抽屉的青铜边框：面板图 1448×466 很适合当「竖向长条」的边饰。
   这里只取它的左右云雷纹与上下边框做 border-image，内腔用 fill 保深色底。
   slice 取 140 / 97 / 66 / 97 —— 上 140 是为了把顶中央纵目纹整块留在角片里，
   顶边中段走 stretch 只会拉伸云纹之间的平直铜条，不会把纵目纹拉变形。 */
.uis-ok-panel .uis-help-panel{
  background:
    linear-gradient(180deg,rgba(15,16,20,.93) 0%,rgba(9,10,13,.96) 100%);
  border:0;border-left:0;
  border-image:url("assets/ui/panel-frame.webp") 140 97 66 97 fill stretch;
  border-image-outset:0;
  padding:56px 46px 40px;
  box-shadow:-28px 0 80px rgba(0,0,0,.62);
}
.uis-ok-panel .uis-help-panel::before{display:none}

.uis-help-head{
  display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  padding-bottom:16px;margin-bottom:22px;
  border-bottom:1px solid rgba(217,180,94,.18);
}
.uis-help-eyebrow{
  font-size:9.5px;letter-spacing:.34em;text-indent:.34em;color:#7a6f5c;margin-bottom:9px;
}
.uis-help-title{
  font-size:26px;font-weight:700;letter-spacing:.11em;text-indent:.11em;color:#f2e4c0;
  text-shadow:0 0 28px rgba(217,180,94,.3);
}
.uis-help-close{
  flex:0 0 auto;width:30px;height:30px;line-height:28px;text-align:center;
  font-size:13px;color:#a2947a;
  border:1px solid rgba(217,180,94,.3);border-radius:3px;background:rgba(0,0,0,.3);
  transition:color .2s ease,border-color .2s ease,background .2s ease,transform .2s ease;
}
.uis-help-close:hover{
  color:var(--uis-gold-hi);border-color:rgba(245,217,142,.7);
  background:rgba(217,180,94,.14);transform:rotate(90deg);
}

/* --- 键帽（只剩说明抽屉底部那一行在用） --- */
.uis-kbd{
  display:inline-block;min-width:26px;padding:3px 8px;
  font-size:12px;line-height:1.45;letter-spacing:.06em;text-align:center;
  color:#f0dfb2;
  background:linear-gradient(180deg,#171510,#0c0b09);
  border:1px solid rgba(217,180,94,.55);border-radius:4px;
  box-shadow:
    inset 0 1px 0 rgba(255,240,200,.14),
    0 2px 0 #191308,
    0 3px 7px rgba(0,0,0,.5);
}
.uis-kbd--mini{font-size:10.5px;padding:2px 6px;letter-spacing:.02em}
.uis-txt{font-size:11.5px;letter-spacing:.05em;color:#a99e8a}

/* --- 玩法要点 --- */
.uis-tips{list-style:none;padding-top:14px;border-top:1px solid rgba(217,180,94,.14)}
.uis-tips li{
  position:relative;padding-left:15px;margin-top:9px;
  font-size:11.5px;line-height:1.75;letter-spacing:.045em;color:#948a77;
}
.uis-tips li::before{
  content:"";position:absolute;left:2px;top:8.5px;width:4.5px;height:4.5px;
  transform:rotate(45deg);background:rgba(217,180,94,.62);
}

.uis-help-foot{
  margin-top:auto;padding-top:20px;
  display:flex;align-items:center;justify-content:flex-end;gap:4px;
  font-size:10.5px;letter-spacing:.08em;color:#5d564a;
}

/* ===================== 三、拾取提示 ===================== */
.uis-pickup{
  position:absolute;z-index:3;display:none;pointer-events:none;
  transform:translate(-50%,-100%) translateY(6px);opacity:0;
  transition:opacity .18s ease,transform .2s cubic-bezier(.2,.8,.25,1);
  will-change:transform,opacity;
}
.uis-pickup.uis-on{opacity:1;transform:translate(-50%,-100%) translateY(-4px)}
.uis-pickup::after{
  content:"";position:absolute;left:50%;bottom:-5px;width:9px;height:9px;
  transform:translateX(-50%) rotate(45deg);
  background:#0b0a08;
  border-right:1px solid rgba(217,180,94,.72);
  border-bottom:1px solid rgba(217,180,94,.72);
}
.uis-pickup-body{
  max-width:330px;padding:7px 14px 8px;
  font-size:12.5px;letter-spacing:.06em;line-height:1.5;white-space:normal;
  text-align:center;color:#f5e6bd;
  background:linear-gradient(180deg,rgba(21,18,13,.97),rgba(9,9,7,.98));
  border:1px solid rgba(217,180,94,.72);border-radius:3px;
  box-shadow:
    0 0 0 1px rgba(0,0,0,.55),
    0 6px 18px rgba(0,0,0,.62),
    0 0 22px rgba(217,180,94,.22),
    inset 0 1px 0 rgba(255,240,200,.14);
}

/* 拾取气泡不套 panel-frame。
   那张面板图是 1448×466，四角云雷纹本身占 97px 宽；气泡只有约 166×51，
   硬套 border-image 会把角片压成几个绿疙瘩、纹理全糊，比不用更丑。
   小控件用回自己的金边深底 —— 和铜牌同色系，不突兀，也不会出黑框。 */

/* ---------- 少动效偏好 ---------- */
@media (prefers-reduced-motion: reduce){
  .uis-mode,.uis-card,.uis-modebtn,.uis-help-panel,.uis-help-scrim,.uis-pickup{
    transition-duration:.01ms !important;
  }
  .uis-modebtn:hover,.uis-modebtn:focus-visible,.uis-modebtn.uis-pick{transform:none}
  .uis-help-close:hover{transform:none}
}
`;

  /* =======================================================================
     工具
     ======================================================================= */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  function toNum(v) {
    v = typeof v === "number" ? v : parseFloat(v);
    return isFinite(v) ? v : 0;
  }

  function txt(s, cls) {
    var e = doc.createElement("span");
    e.className = cls || "uis-txt";
    e.textContent = s;
    return e;
  }

  function kbd(label, extra) {
    var e = doc.createElement("kbd");
    e.className = "uis-kbd" + (extra ? " " + extra : "");
    e.textContent = label;
    return e;
  }

  function svgEl(tag, attrs) {
    var e = doc.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  /* ---------------- 样式 / 容器 / 全局键盘 ---------------- */
  function ensureStyle() {
    if (S.styleInstalled) return;
    if (doc.getElementById(STYLE_ID)) { S.styleInstalled = true; return; }
    var st = doc.createElement("style");
    st.id = STYLE_ID;
    st.type = "text/css";
    st.appendChild(doc.createTextNode(CSS));
    (doc.head || doc.documentElement).appendChild(st);
    S.styleInstalled = true;
  }

  function ensureLayer() {
    ensureStyle();

    var stage = doc.getElementById("stage");

    // 已经有层：若当初退化成 body 定位、而 #stage 后来才出现，则迁移进去
    if (D.layer && D.layer.parentNode) {
      if (stage && D.layer.parentNode !== stage) {
        stage.appendChild(D.layer);
        D.layer.classList.remove("uis-fixed");
      }
      return D.layer;
    }

    var host = stage || doc.body;
    if (!host) return null;                       // 极早期调用时兜底

    var layer = doc.createElement("div");
    layer.className = "uis-layer" + (stage ? "" : " uis-fixed");
    layer.setAttribute(PART, "layer");
    host.appendChild(layer);

    D.layer = layer;
    probeUI(layer);
    return layer;
  }

  /* =======================================================================
     UI 位图：封面 / 面板 / 按钮四态
     六张图各自 new Image() 探一次，成功才给根节点挂 .uis-img-ok，
     CSS 里所有位图规则都写在 .uis-img-ok 下 —— 缺图就只剩渐变底，不白屏。
     不 await、不阻塞首帧：探测是异步的，图到了下一帧样式自动生效。
     ======================================================================= */
  var UI_IMG = {
    titleBg: "assets/ui/title-bg.webp",
    panel:   "assets/ui/panel-frame.webp",
    btnOn:   "assets/ui/btn-normal.webp",
    btnHover:"assets/ui/btn-hover.webp",
    btnPress:"assets/ui/btn-press.webp",
    btnOff:  "assets/ui/btn-disabled.webp"
  };

  function probeUI(layer) {
    if (!layer || S.uiProbed) return;
    S.uiProbed = true;

    var keys = [];
    for (var k in UI_IMG) { if (UI_IMG.hasOwnProperty(k)) keys.push(k); }

    if (typeof global.Image !== "function") return;   /* 无 Image 构造器：保持纯渐变 */

    var ok = {};
    var done = 0;

    function settle() {
      done++;
      if (done < keys.length) return;
      /* 逐项挂 class：某张失败不影响其它张 */
      for (var i = 0; i < keys.length; i++) {
        if (ok[keys[i]]) layer.classList.add("uis-ok-" + keys[i]);
      }
      /* 组合开关：样式段按「哪一组图可用」生效，单张失败只影响自己那一处 */
      if (ok.panel) layer.classList.add("uis-ok-panel");
      if (ok.btnOn) layer.classList.add("uis-ok-btnOn");
    }

    for (var i = 0; i < keys.length; i++) {
      (function (key) {
        var im = new global.Image();
        im.onload = function () {
          if (im.naturalWidth > 0) ok[key] = true;
          settle();
        };
        im.onerror = function () { settle(); };
        im.src = UI_IMG[key];
        /* 已经在缓存里（第二次进模式页）也不会漏：complete 且宽高有效就直接判成功 */
        if (im.complete && im.naturalWidth > 0) { ok[key] = true; }
      })(keys[i]);
    }
  }

  /* 把焦点从覆盖层按钮上摘掉，避免空格/回车误触按钮 */
  function blurInside() {
    var a = doc.activeElement;
    if (!a || !a.blur) return;
    if (D.layer && D.layer.contains(a) && a !== doc.body) { try { a.blur(); } catch (e) {} }
  }

  function layerSize() {
    var l = D.layer;
    return {
      w: (l && l.offsetWidth) || 1600,
      h: (l && l.offsetHeight) || 900
    };
  }

  /* 全局键盘：只读监听，不 preventDefault / 不 stopPropagation / 不抢焦点 */
  function onKeyDown(e) {
    if (!e || e.repeat) return;

    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;

    var k = e.key || "";
    var code = e.code || "";

    /* 模式选择优先：1 / 2 */
    if (S.modeOpen) {
      if (k === "1" || code === "Digit1" || code === "Numpad1") { chooseMode("solo"); return; }
      if (k === "2" || code === "Digit2" || code === "Numpad2") { chooseMode("duo"); return; }
      return;   // 选择页开着时，其它键原样交给游戏
    }

    /* 按键说明：H / Esc 开关 */
    if (S.helpBuilt) {
      if (k === "h" || k === "H" || code === "KeyH") { toggleKeyHelp(); return; }
      if (k === "Escape" || k === "Esc" || code === "Escape") { toggleKeyHelp(); return; }
    }
  }

  function installKeyHook() {
    if (S.hookInstalled) return;
    global.addEventListener("keydown", onKeyDown, false);
    installPadHook();
    /* 输入设备一变，抽屉里的图跟着换 —— 手柄和键盘永不同时出现 */
    if (global.Guide && global.Guide.onChange) {
      global.Guide.onChange(function () { refreshHelpBody(); });
    }
    S.hookInstalled = true;
  }

  /* =======================================================================
     手柄：模式选择页必须能用面键选，否则插着手柄的人卡在第一屏。
     A（0）选单人，B（1）选双人，X（2）/ Y（3）也能选（单人 / 双人各一个），
     左摇杆左右或十字键左右切换高亮，Start（9）确认高亮项。
     只在模式页 / 按键抽屉打开时轮询，其余时间不占帧。
     ======================================================================= */
  var padPrev = {};

  function padBtn(gp, i) {
    var b = gp.buttons && gp.buttons[i];
    return !!(b && (b.pressed || b.value > 0.5));
  }

  function padEdge(key, on) {
    if (on && !padPrev[key]) { padPrev[key] = true; return true; }
    if (!on) padPrev[key] = false;
    return false;
  }

  function padFrame() {
    var wantPad = S.modeOpen || S.helpOpen;
    if (!wantPad) {
      /* 不打开时只清标记，避免残留状态让下一次变成「已按下」 */
      padPrev = {};
      return;
    }

    var nav = global.navigator;
    if (!nav || typeof nav.getGamepads !== "function") return;
    var list = nav.getGamepads() || [];
    var gp = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].connected) { gp = list[i]; break; }
    }
    if (!gp) {
      if (!gp && !list.length) { /* 没有手柄 */ }
      var any = null;
      for (var j = 0; j < list.length; j++) { if (list[j]) { any = list[j]; break; } }
      gp = any;
      if (!gp) return;
    }

    var ax = (gp.axes && gp.axes[0]) || 0;
    var leftOn = ax < -0.5 || padBtn(gp, 14);
    var rightOn = ax > 0.5 || padBtn(gp, 15);

    if (S.modeOpen) {
      if (padEdge("m_a", padBtn(gp, 0)) || padEdge("m_x", padBtn(gp, 2))) { chooseMode("solo"); return; }
      if (padEdge("m_b", padBtn(gp, 1)) || padEdge("m_y", padBtn(gp, 3))) { chooseMode("duo"); return; }
      if (padEdge("m_start", padBtn(gp, 9))) { chooseMode(S.modePick || "duo"); return; }
      if (padEdge("m_left", leftOn)) { setModePick("solo"); }
      if (padEdge("m_right", rightOn)) { setModePick("duo"); }
      return;
    }

    if (S.helpOpen) {
      if (padEdge("h_b", padBtn(gp, 1)) || padEdge("h_start", padBtn(gp, 9)) || padEdge("h_y", padBtn(gp, 3))) {
        toggleKeyHelp();
      }
    }
  }

  function installPadHook() {
    if (S.padHooked) return;
    var tick = function () {
      /* 手柄异常不能拖垮游戏，但也不能吞掉 —— 首次报错打到控制台，便于定位 */
      try {
        padFrame();
      } catch (e) {
        if (!S.padErrShown) { S.padErrShown = true; if (global.console) global.console.warn("padFrame:", e && e.message); }
      }
      global.requestAnimationFrame(tick);
    };
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(tick);
      S.padHooked = true;
    }
  }

  /* =======================================================================
     一、模式选择
     ======================================================================= */
  function eyeSvg() {
    var svg = svgEl("svg", {
      viewBox: "0 0 132 48", class: "uis-eye",
      "aria-hidden": "true", focusable: "false"
    });
    // 纵目：外眼角上挑 + 突出的圆目
    svg.appendChild(svgEl("path", {
      d: "M6 24C22 10 44 4 66 4S110 10 126 24C110 38 88 44 66 44S22 38 6 24Z",
      fill: "none", stroke: "currentColor", "stroke-width": "1.1", "stroke-linejoin": "round"
    }));
    svg.appendChild(svgEl("circle", {
      cx: "66", cy: "24", r: "10.5",
      fill: "none", stroke: "currentColor", "stroke-width": "1.1"
    }));
    svg.appendChild(svgEl("circle", {
      cx: "66", cy: "24", r: "3.6", fill: "currentColor"
    }));
    // 两道小刺，暗示纵目外突
    svg.appendChild(svgEl("path", {
      d: "M66 13.5V8M66 34.5V40", stroke: "currentColor",
      "stroke-width": "1", opacity: ".5"
    }));
    return svg;
  }

  function ruleSvg() {
    var wrap = doc.createElement("div");
    wrap.className = "uis-rule";
    var left = doc.createElement("i");
    var right = doc.createElement("i");
    var svg = svgEl("svg", { viewBox: "0 0 26 18", "aria-hidden": "true", focusable: "false" });
    // 云雷纹（方折回旋）
    svg.appendChild(svgEl("path", {
      d: "M3 15V3H23V15H7V7H17",
      fill: "none", stroke: "currentColor",
      "stroke-width": "1.2", "stroke-linejoin": "miter"
    }));
    wrap.appendChild(left);
    wrap.appendChild(svg);
    wrap.appendChild(right);
    return wrap;
  }

  function modeButton(mode, keyLabel, name) {
    var b = doc.createElement("button");
    b.type = "button";
    b.className = "uis-modebtn";
    b.setAttribute("data-mode", mode);

    var badge = doc.createElement("span");
    badge.className = "uis-modebtn-key";
    badge.textContent = keyLabel;

    var n = doc.createElement("span");
    n.className = "uis-mbtn-name";
    n.textContent = name;

    b.appendChild(badge);
    b.appendChild(n);
    /* 按钮里只留主标题。副标题（「一个人守」这类）在青铜牌上挤在
       内腔下沿、字号又小，读不清还抢视线，直接不生成。 */

    b.addEventListener("click", function () {
      if (b.blur) b.blur();      // 不把焦点留在按钮上
      chooseMode(mode);
    }, false);

    return b;
  }

  function buildMode() {
    if (S.modeBuilt) return D.mode;
    var layer = ensureLayer();
    if (!layer) return null;

    var root = doc.createElement("div");
    root.className = "uis-mode";
    root.setAttribute(PART, "mode");
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "选择模式");
    root.setAttribute("aria-hidden", "true");

    var card = doc.createElement("div");
    card.className = "uis-card";

    card.appendChild(eyeSvg());

    var title = doc.createElement("h1");
    title.className = "uis-title";
    title.textContent = "双刃战士 · 纵目";
    card.appendChild(title);

    card.appendChild(ruleSvg());

    var sub = doc.createElement("p");
    sub.className = "uis-sub";
    sub.textContent = "古蜀纵目祭司，守祭祀坑";
    card.appendChild(sub);

    var btns = doc.createElement("div");
    btns.className = "uis-modebtns";
    btns.appendChild(modeButton("solo", "1", "单人 · 独守"));
    btns.appendChild(modeButton("duo", "2", "双人 · 同屏"));
    card.appendChild(btns);

    var foot = doc.createElement("div");
    foot.className = "uis-modefoot";
    foot.textContent = "按 1 选单人 · 按 2 选双人";
    card.appendChild(foot);

    root.appendChild(card);
    layer.appendChild(root);

    D.mode = root;
    S.modeBuilt = true;
    return root;
  }

  function openMode() {
    var root = buildMode();
    if (!root) return;
    if (S.helpOpen) closeHelp();            // 选择页优先，先收起抽屉
    S.modeOpen = true;
    root.classList.add("uis-on");
    root.setAttribute("aria-hidden", "false");
  }

  function closeMode() {
    S.modeOpen = false;
    if (D.mode) {
      D.mode.classList.remove("uis-on");
      D.mode.setAttribute("aria-hidden", "true");
    }
    blurInside();
  }

  /* 手柄左右键切换高亮项：给按钮挂 .uis-pick，样式复用 hover */
  function setModePick(mode) {
    S.modePick = mode;
    if (!doc) return;
    var nodes = doc.querySelectorAll(".uis-modebtn");
    for (var i = 0; i < nodes.length; i++) {
      var on = nodes[i].getAttribute("data-mode") === mode;
      nodes[i].classList.toggle("uis-pick", on);
    }
  }

  function chooseMode(mode) {
    if (!S.modeOpen) return;
    var fn = S.modeHandler;
    closeMode();
    if (typeof fn === "function") fn(mode);
  }

  /* =======================================================================
     二、按键说明
     -----------------------------------------------------------------------
     键位数据表搬到 js/guide.js（全项目唯一一份），本模块只负责容器与开合。
     这里的 TIPS 是玩法要点，与键位无关，留在本地。
     ======================================================================= */
  var TIPS = [
    "打怪掉武器，走近按攻击键捡起来；手上一把、背包四格",
    "武器有耐久，挥久了会碎，碎了只能空手打",
    "旋风斩：HUD 上那根能量条满了才能放",
    "宝箱与太阳轮机关都用攻击键开启：海贝回血、玉器充能、机关回满或提前放下一阵"
  ];

  function refreshHelpBody() {
    if (!D.helpBody) return false;
    var g = global.Guide;
    if (g && g.renderInto) return g.renderInto(D.helpBody);
    return false;
  }

  function buildHelp() {
    if (S.helpBuilt) return D.help;
    var layer = ensureLayer();
    if (!layer) return null;

    var root = doc.createElement("div");
    root.className = "uis-help";
    root.setAttribute(PART, "help");
    root.setAttribute("aria-hidden", "true");

    var scrim = doc.createElement("div");
    scrim.className = "uis-help-scrim";
    scrim.addEventListener("click", function () { closeHelp(); }, false);

    var panel = doc.createElement("aside");
    panel.className = "uis-help-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "按键说明");

    /* 头部 */
    var head = doc.createElement("div");
    head.className = "uis-help-head";

    var headText = doc.createElement("div");
    var eyebrow = doc.createElement("div");
    eyebrow.className = "uis-help-eyebrow";
    eyebrow.textContent = "INPUT · 操作";
    var h2 = doc.createElement("h2");
    h2.className = "uis-help-title";
    h2.textContent = "按键说明";
    headText.appendChild(eyebrow);
    headText.appendChild(h2);

    var closeBtn = doc.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "uis-help-close";
    closeBtn.setAttribute("aria-label", "关闭按键说明");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", function () {
      if (closeBtn.blur) closeBtn.blur();
      closeHelp();
    }, false);

    head.appendChild(headText);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    /* 操作图：手柄图 / 键盘图由 js/guide.js 按当前输入设备渲染。
       这里只放一个容器 —— 按键叫什么、归哪一组只有 guide.js 那一份数据，
       本模块不再维护 KEY_ROWS / PAD_ROWS 两张表（历史上前者漏过三次新键位）。 */
    var bodyWrap = doc.createElement("div");
    bodyWrap.className = "uis-help-body";
    panel.appendChild(bodyWrap);
    D.helpBody = bodyWrap;
    refreshHelpBody();

    /* 玩法要点 */
    var tips = doc.createElement("ul");
    tips.className = "uis-tips";
    for (var i = 0; i < TIPS.length; i++) {
      var li = doc.createElement("li");
      li.textContent = TIPS[i];
      tips.appendChild(li);
    }
    panel.appendChild(tips);

    /* 底部：关闭提示 */
    var foot = doc.createElement("div");
    foot.className = "uis-help-foot";
    foot.appendChild(txt("按 "));
    foot.appendChild(kbd("H", "uis-kbd--mini"));
    foot.appendChild(txt(" 或 "));
    foot.appendChild(kbd("Esc", "uis-kbd--mini"));
    foot.appendChild(txt(" 关闭"));
    panel.appendChild(foot);

    root.appendChild(scrim);
    root.appendChild(panel);
    layer.appendChild(root);

    D.help = root;
    D.helpPanel = panel;
    S.helpBuilt = true;
    return root;
  }

  function openHelp() {
    var root = buildHelp();
    if (!root) return false;
    S.helpOpen = true;
    root.classList.add("uis-on");
    root.setAttribute("aria-hidden", "false");
    return true;
  }

  function closeHelp() {
    S.helpOpen = false;
    if (D.help) {
      D.help.classList.remove("uis-on");
      D.help.setAttribute("aria-hidden", "true");
    }
    blurInside();
    return false;
  }

  function toggleKeyHelp() {
    if (S.modeOpen) return false;     // 先选模式，别叠两层
    if (S.helpOpen) return closeHelp();
    return openHelp();
  }

  /* =======================================================================
     三、拾取提示
     ======================================================================= */
  function buildPickup() {
    if (S.pickupBuilt) return D.pickup;
    var layer = ensureLayer();
    if (!layer) return null;

    var el = doc.createElement("div");
    el.className = "uis-pickup";
    el.setAttribute(PART, "pickup");
    el.setAttribute("aria-hidden", "true");

    var body = doc.createElement("div");
    body.className = "uis-pickup-body";

    el.appendChild(body);
    layer.appendChild(el);

    D.pickup = el;
    D.pickupBody = body;
    S.pickupBuilt = true;
    return el;
  }

  function killPickupTimers() {
    if (S.pickupTimer) { clearTimeout(S.pickupTimer); S.pickupTimer = 0; }
    if (S.pickupKillTimer) { clearTimeout(S.pickupKillTimer); S.pickupKillTimer = 0; }
  }

  function fadeOutPickup() {
    var el = D.pickup;
    if (!el) return;
    el.classList.remove("uis-on");

    if (S.pickupKillTimer) clearTimeout(S.pickupKillTimer);
    S.pickupKillTimer = setTimeout(function () {
      S.pickupKillTimer = 0;
      if (!D.pickup || D.pickup.classList.contains("uis-on")) return;   // 期间又被点亮
      D.pickup.style.display = "none";
      D.pickup.setAttribute("aria-hidden", "true");
    }, PICKUP_FADE);
  }

  function showPickupHint(text, x, y) {
    if (!buildPickup()) return;

    var el = D.pickup;
    D.pickupBody.textContent = (text === null || text === undefined) ? "" : String(text);

    // 夹到画面内，别飘出边界
    var size = layerSize();
    var px = clamp(toNum(x), 120, Math.max(120, size.w - 120));
    var py = clamp(toNum(y), 58, Math.max(58, size.h - 6));

    el.style.left = Math.round(px) + "px";
    el.style.top = Math.round(py) + "px";

    killPickupTimers();
    el.style.display = "block";
    el.setAttribute("aria-hidden", "false");

    /* 强制重排：连续两次提示也能重放入场动画 */
    void el.offsetWidth;
    el.classList.add("uis-on");

    S.pickupTimer = setTimeout(function () {
      S.pickupTimer = 0;
      fadeOutPickup();
    }, PICKUP_LIFE);
  }

  function clearPickupHint() {
    killPickupTimers();
    var el = D.pickup;
    if (!el) return;
    el.classList.remove("uis-on");
    el.style.display = "none";
    el.setAttribute("aria-hidden", "true");
  }

  /* =======================================================================
     对外接口
     ======================================================================= */
  global.UIShell = {
    /* 模式选择 */
    mountModeSelect: function (onChoose) {
      installKeyHook();
      if (arguments.length > 0) {
        S.modeHandler = typeof onChoose === "function" ? onChoose : null;
      }
      openMode();
    },
    showModeSelect: function () {
      installKeyHook();
      openMode();
    },
    hideModeSelect: function () {
      closeMode();
    },

    /* 按键说明 */
    mountKeyHelp: function () {
      installKeyHook();
      buildHelp();
    },
    toggleKeyHelp: function () {
      installKeyHook();
      return toggleKeyHelp();
    },
    isKeyHelpOpen: function () {
      return !!S.helpOpen;
    },

    /* 拾取提示 */
    showPickupHint: function (text, x, y) {
      showPickupHint(text, x, y);
    },
    clearPickupHint: function () {
      clearPickupHint();
    }
  };

  /* 手柄轮询与游戏循环无关：模块一加载就挂上，否则插着手柄的人
     在模式页还没被任何 UIShell 方法触发时按面键毫无反应。
     padFrame 内部用 S.modeOpen / S.helpOpen 判断要不要真正处理。 */
  installKeyHook();
  installPadHook();
})(window, document);
