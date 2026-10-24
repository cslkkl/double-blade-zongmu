/* =========================================================================
 * js/touch.js — 触屏虚拟手柄（手机 / 平板专用，桌面完全不出现）
 * -------------------------------------------------------------------------
 * 对外契约（只暴露 window.Touch 一个对象）：
 *   Touch.available()        -> boolean   这台设备有没有触屏
 *   Touch.active()           -> boolean   现在该不该显示虚拟按键（有触屏 + 有手指动过 + 没插手柄）
 *   Touch.state(tag)         -> {left,right,jump,atk,skill,act,drop,give}
 *       与 readPad() 的返回同形，index.html 的 update() 直接并进 in1 / in2。
 *       语义也一致：left/right 是「现在按着」，其余七个是「这一帧刚按下」。
 *   Touch.setMode(mode)      -> void      "solo" / "duo"，决定按键怎么摆
 *   Touch.show() / hide()    -> void      强制显示 / 隐藏（过场、暂停页用）
 *   Touch.skipHeld()         -> boolean   开场短片期间「有没有手指按在跳过区上」
 *   Touch.buzz(ms)           -> void      安卓振动 API（iOS 无此 API，静默 no-op）
 *
 * -------------------------------------------------------------------------
 * 为什么是「独立输入通道」而不是模拟键盘事件
 * -------------------------------------------------------------------------
 * 合成 KeyboardEvent 能骗过 KEYS，但会顺手把 Guide 的设备判定切成 kbd ——
 * 手机玩家会看到「按 F 挥刀」的键盘文案，而屏幕上一个键盘都没有。
 * 走独立通道，Guide 那边加一档 dev-touch 就行，文案能对上真实手指。
 *
 * -------------------------------------------------------------------------
 * 为什么按键层挂在 #stage 外面（position:fixed 贴视口）
 * -------------------------------------------------------------------------
 * #stage 是 1600×900 逻辑坐标，手机上被 transform:scale(0.43) 缩过。
 * 按键如果放进 #stage，100px 的按钮到屏幕上只剩 43px，手指根本按不准，
 * 而 44px 是 Apple / Google 都写进规范的最小触摸目标。所以：
 *   · 游戏画面走 #stage 缩放
 *   · 按键层走视口 CSS 像素，尺寸用 vmin 算，永远保持 48px 以上
 *
 * -------------------------------------------------------------------------
 * 降级
 * -------------------------------------------------------------------------
 * · 没有 PointerEvent（极老浏览器）→ 退回 touch 事件；两者都没有 → 整层不挂，
 *   游戏照旧用键盘/手柄，绝不留一个按不动的假按键在屏幕上。
 * · 模块缺席时 index.html 那边 window.Touch 判定为假，所有合并都是 no-op。
 * ========================================================================= */
(function (global, doc) {
  "use strict";

  /* ---------------------------------------------------------------------
     常量
     --------------------------------------------------------------------- */

  var STYLE_ID = "tch-style";
  var LAYER_ID = "tch-layer";

  /* 触摸目标最小边长（视口 CSS px）。48 是 Apple HIG 与 Material 的公共下限。 */
  var MIN_TARGET = 48;

  /* 手指按下去到「算按下」的位移容差：超过这个距离就当作滑动，不是点按。
     有了它，从按钮上滑过去不会误触，贴着按钮边缘滑也不会丢按键。 */
  var SLIP_PX = 18;

  /* 长按跳过短片的判定时长 —— 必须与 index.html 的 INTRO_HOLD_SEC 一致。
     两处写死一个数是刻意的：这个模块不认识游戏流程，index.html 才是权威，
     这里只是把「手指按着」这件事如实转达。 */
  var SKIP_HOLD_SEC = 0.70;

  /* ---------------------------------------------------------------------
     能力探测
     --------------------------------------------------------------------- */

  var hasPointer = typeof global.PointerEvent === "function";
  var hasTouchEv = ("ontouchstart" in global) ||
                   (global.DocumentTouch && doc instanceof global.DocumentTouch) ||
                   (global.navigator && global.navigator.maxTouchPoints > 0);

  /* 有触屏 = 能用手指。桌面上带触摸屏的笔记本也算 —— 那不是误判，
     那些机器确实能点，而且 Touch 只在「真有人用手指」之后才显示。 */
  function available() {
    return !!(hasPointer || hasTouchEv);
  }

  /* ---------------------------------------------------------------------
     状态
     --------------------------------------------------------------------- */

  /* 每个玩家的按键状态。字段与 readPad() 一一对应。
     held  = 现在按着（连续量，left/right 用）
     edge  = 这一帧刚按下（一次性，取走即清）
     分开存是必须的：手指一直按着攻击键不该连击，但一直按着右移就该一直走。 */
  function newSlot() {
    return {
      held: { left: false, right: false, jump: false, atk: false,
              skill: false, act: false, drop: false, give: false },
      edge: { jump: false, atk: false, skill: false, act: false,
              drop: false, give: false }
    };
  }

  var slots = { p1: newSlot(), p2: newSlot() };

  /* 手指动过没有。没动过就不显示按键 —— 触屏笔记本的玩家用键盘玩，
     屏幕上不该突然长出一堆按钮。 */
  var everTouched = false;

  /* 强制显示 / 隐藏（过场、暂停页、通关页用）。null = 按默认规则判。 */
  var forced = null;

  /* 布局模式 */
  var mode = "solo";

  /* 元素引用 */
  var layer = null;
  var btnEls = {};          /* "p1:atk" -> element */
  var built = false;

  /* 正在按住的手指：pointerId -> {slot, field, at}。
     同一个 pointerId 只能属于一个按键，这样两个拇指同时按攻击和移动不会串。

     at = 按下时刻（毫秒）。它是防「指针卡死」的兜底：手机上 pointerup 会因为
     手指滑出屏幕、来电、系统通知、切 App 而丢失，一旦丢了那枚键就永远按着 ——
     玩家会遇到「角色自己一直往前跑，松手也不停」。tick 里按这个时间戳做超时回收。 */
  var pointers = {};

  /* 指针超时：按住超过这么久还没收到 up，就强制释放。
     8 秒是「正常人不会一直按着同一个键不动」的上限 —— 移动键除外，
     所以只对一次性键（跳 / 刀 / 技 / 拾 / 丢 / 递）做超时回收，
     方向键由 touchcancel / pagehide / 失焦 这三条路兜底。 */
  var POINTER_STALE_MS = 8000;

  /* 跳过区（短片期间用）：按下即记时间，抬起即清。 */
  var skipPointers = {};
  var skipHeldSince = 0;

  /* ---------------------------------------------------------------------
     样式
     --------------------------------------------------------------------- */

  var CSS = `
#${LAYER_ID}{
  position:fixed;inset:0;z-index:70;pointer-events:none;
  display:none;
  /* 按键层自己不许被滚动 / 缩放抢走手势 */
  touch-action:none;
  -webkit-user-select:none;user-select:none;
  -webkit-touch-callout:none;
  font-family:"Microsoft YaHei","PingFang SC",sans-serif;
}
#${LAYER_ID}.tch-on{display:block}
/* 竖屏遮罩是独立一层：它不看 tch-on。
   根容器默认 display:none 是为了「没手指动过就什么都不挂」，
   但竖屏提示恰恰要在玩家还没碰过屏幕时也出现（标题页竖着进来就得提示）。
   所以这一条把根容器在竖屏时强制打开 —— 只为了让遮罩显示，
   底下的圆钮由 .tch-portrait 那两条规则再藏回去。 */
#${LAYER_ID}.tch-portrait{display:block}

/* ---- 单枚按键 ---- */
#${LAYER_ID} .tch-b{
  position:absolute;
  display:flex;align-items:center;justify-content:center;
  width:var(--tch-d);height:var(--tch-d);
  border-radius:50%;
  background:radial-gradient(circle at 50% 38%,rgba(38,32,24,.62),rgba(10,9,7,.72) 78%);
  border:1.5px solid rgba(217,180,94,.34);
  box-shadow:0 6px 18px rgba(0,0,0,.55),inset 0 1px 0 rgba(245,217,142,.10);
  color:rgba(230,214,178,.88);
  font-size:calc(var(--tch-d) * .30);font-weight:600;line-height:1;
  letter-spacing:.02em;
  pointer-events:auto;
  touch-action:none;
  transition:background .09s ease,border-color .09s ease,transform .09s ease;
  /* 描边 + 阴影在低端安卓上很贵，这里限制在一个合成层里 */
  will-change:transform;
  transform:translateZ(0);
}
#${LAYER_ID} .tch-b.on{
  background:radial-gradient(circle at 50% 38%,rgba(245,217,142,.86),rgba(168,120,52,.82) 78%);
  border-color:rgba(245,217,142,.92);
  color:#1a140e;
  transform:translateZ(0) scale(.94);
}
/* 小键（丢弃 / 递给队友）：比主键小一号，塞在角上 */
#${LAYER_ID} .tch-b.sm{
  width:calc(var(--tch-d) * .74);height:calc(var(--tch-d) * .74);
  font-size:calc(var(--tch-d) * .22);
}
/* 主攻击键：比常规键大一号，拇指不用瞄准 */
#${LAYER_ID} .tch-b.big{
  width:calc(var(--tch-d) * 1.22);height:calc(var(--tch-d) * 1.22);
  font-size:calc(var(--tch-d) * .34);
  border-color:rgba(245,217,142,.52);
}
/* 方向键：方一点，视觉上跟圆形动作键分开，玩家一眼能分出「走」和「打」 */
#${LAYER_ID} .tch-b.dir{border-radius:26%}

/* ---- 每半屏的分组容器 ---- */
#${LAYER_ID} .tch-half{
  position:absolute;bottom:0;height:100%;
  width:50%;pointer-events:none;
}
#${LAYER_ID} .tch-half.l{left:0}
#${LAYER_ID} .tch-half.r{right:0}

/* ---- 顶栏（暂停 / 键位）---- */
#${LAYER_ID} .tch-top{
  position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);
  left:50%;transform:translateX(-50%);
  display:flex;gap:10px;pointer-events:none;
}
#${LAYER_ID} .tch-top .tch-b{
  position:relative;
  width:44px;height:44px;font-size:17px;
}

/* ---- 竖屏提示 ----
   这是独立于「按键层显不显示」的一层：竖屏时游戏画面被压成一条窄带，
   无论在对局、标题页还是结算页都不该让玩家这么玩，所以只要竖屏就盖上。
   它自己带 tch-portrait 类，不依赖 tch-on。 */
#${LAYER_ID} .tch-rotate{
  position:absolute;inset:0;display:none;
  align-items:center;justify-content:center;flex-direction:column;gap:20px;
  /* 不透明度拉满：竖屏提示必须把底下的一切盖死，否则玩家会盯着半透明的
     标题页找「开始」按钮，而那个按钮在窄带里根本按不准 */
  background:#05060a;pointer-events:auto;text-align:center;padding:32px;
  z-index:2;
}
#${LAYER_ID}.tch-portrait .tch-rotate{display:flex}
/* 竖屏遮罩亮着时，按键一律藏起来 —— 底下那堆圆钮在窄带里没有意义，还会误触 */
#${LAYER_ID}.tch-portrait .tch-b,
#${LAYER_ID}.tch-portrait .tch-top{display:none}

/* 图标：一台竖着的手机，自己转 90 度变成横的 —— 用图形演示比文字快 */
#${LAYER_ID} .tch-rotate .ico{
  position:relative;width:52px;height:88px;
  border:2px solid rgba(217,180,94,.62);border-radius:9px;
  animation:tch-rot 2.6s cubic-bezier(.5,0,.5,1) infinite;
  transform-origin:center center;
}
/* 听筒：一条短横线，让「这是手机」一眼可读 */
#${LAYER_ID} .tch-rotate .ico::before{
  content:"";position:absolute;left:50%;top:7px;transform:translateX(-50%);
  width:14px;height:2px;border-radius:1px;background:rgba(217,180,94,.55);
}
/* 屏幕：内缩一圈的暗色块，转动后就是横屏画面 */
#${LAYER_ID} .tch-rotate .ico::after{
  content:"";position:absolute;left:5px;right:5px;top:14px;bottom:14px;
  border-radius:3px;background:rgba(217,180,94,.16);
}
@keyframes tch-rot{
  0%,38%{transform:rotate(0deg)}
  62%,100%{transform:rotate(90deg)}
}
#${LAYER_ID} .tch-rotate .t1{font-size:17px;color:#e6d6b2;letter-spacing:.10em}
#${LAYER_ID} .tch-rotate .t2{font-size:13px;color:#8b8071;letter-spacing:.06em;line-height:1.9}

/* ---- 短片跳过区：盖住整屏下半，长按即可 ---- */
#${LAYER_ID} .tch-skip{
  position:absolute;left:0;right:0;bottom:0;height:46%;
  display:none;align-items:flex-end;justify-content:center;padding-bottom:24px;
  pointer-events:auto;touch-action:none;
}
#${LAYER_ID}.tch-intro .tch-skip{display:flex}
/* 短片期间只留跳过区：动作键与方向键此时按了没有任何作用
   （loop 走的是 introTick，不进 update），摆在屏幕上只会误触 */
#${LAYER_ID}.tch-intro .tch-b,
#${LAYER_ID}.tch-intro .tch-top{display:none}
#${LAYER_ID} .tch-skip .hint{
  font-size:13px;letter-spacing:.10em;color:rgba(230,214,178,.62);
  padding:8px 18px;border-radius:999px;
  background:rgba(6,7,10,.62);border:1px solid rgba(201,167,101,.28);
}
`;

  /* ---------------------------------------------------------------------
     按键布局表
     ---------------------------------------------------------------------
     两套坐标轴，故意不一样：
       x = 相对「本半屏宽度」的百分比。半屏是固定的一半视口，百分比很稳。
       y = 相对「按钮直径」的倍数（0.5 = 半个直径）。**不用 vmin 百分比** ——
           那会让纵向间距跟屏幕高度成比例，在 390px 高的横屏手机上
           一行键能飘到画面正中（实测过：跳键跑到左上角、拾键压在角色脸上）。
           用直径作单位，按钮多大、间距就多大，任何屏幕密度下都是同一套手感。

     摆法（右手拇指的舒适弧）：常按的贴底、少用的往外往上。
     --------------------------------------------------------------------- */

  /* 移动键簇：◀ ▶ 并排贴底，跳抬到它们上方中间（拇指上抬一格就到）。 */
  function moveCluster(mirror) {
    var raw = [
      { field: "left",  label: "◀", cls: "dir", x: 9,    y: 0.5 },
      { field: "right", label: "▶", cls: "dir", x: 30,   y: 0.5 },
      { field: "jump",  label: "跳", cls: "dir", x: 19.5, y: 1.95 }
    ];
    return mirror ? flip(raw) : raw;
  }

  /* 动作键簇（单人）：刀最大最常按、贴底；技在它右边同一行；
     拾在刀上方（够得着又不挡画面）；丢 / 递缩成小键贴右边缘往上排。

     ⚠️ 纵向间距按「最大那颗」算：刀是 big（1.22 倍直径），
     它与上方「拾」的 y 差必须 ≥ (1.22 + 1)/2 + 0.15 ≈ 1.26。
     实测坑：刀 0.55 / 拾 1.75 差 1.2，在 844×390 上勉强不撞，
     到 1365×1024（按钮跟着变大）就相交了 —— 间距必须用直径倍数留足余量，
     不能卡在临界值上。 */
  function actCluster(mirror) {
    var raw = [
      { field: "atk",   label: "刀", cls: "big", x: 57, y: 0.6 },
      { field: "skill", label: "技", cls: "",    x: 82, y: 0.5 },
      { field: "act",   label: "拾", cls: "",    x: 70, y: 2.05 },
      { field: "drop",  label: "丢", cls: "sm",  x: 93, y: 1.9 },
      { field: "give",  label: "递", cls: "sm",  x: 93, y: 3.1 }
    ];
    return mirror ? flip(raw) : raw;
  }

  /* 水平翻转：x → 100 - x。左右手互换，位置与间距都保持对称。 */
  function flip(items) {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      out.push({
        field: it.field, label: it.label, cls: it.cls,
        x: 100 - it.x, y: it.y
      });
    }
    return out;
  }

  /* 动作簇的镜像不是简单翻 x —— 那样会把「刀」翻到靠中线、「技」翻到靠外，
     与 p1 的手感相反。动作簇的 x 本来就是「相对本半屏」的坐标，
     所以 p2 那半屏直接用原表即可，手感天然镜像、功能顺序一致。 */

  /* 单人：移动在左半屏、动作在右半屏 —— 手机上的通用握法，两只拇指各管一块。
     双人：每人独占一半，两簇并排塞进同一个半屏。
       p1（左半屏）：移动贴屏幕左边缘，动作簇在右侧。
       p2（右半屏）：移动贴屏幕右边缘（镜像），动作簇在左侧。
     两个半屏各自独立，x 都按「本半屏宽度的百分比」算 —— 所以动作簇用同一张表
     就已经天然镜像了：p1 的「刀」在半屏 57% 处（靠中线），
     p2 的「刀」也在自己半屏 57% 处（也靠中线）。两个玩家的刀都在中线附近，
     这是对的 —— 拇指自然落在内侧。

     ⚠️ 双人时半屏只有 422px 宽（844 屏），要塞 8 枚键（最宽 70px），
     所以两簇的 x 必须错开：移动簇压到 3~22%，动作簇拉到 40~92%。
     实测过的坑：动作簇用 57% 时，它的「技」（82%）会压到 p2 移动簇镜像后的
     「◀」（82% 镜像 = 18% … 但因为镜像，实际落在 p2 半屏的 18% 处，
     而 p2 的 ◀ 在 91%）—— 两簇在边缘相撞。 */
  function layoutFor(tag, half) {
    if (mode === "solo") {
      return (half === "l") ? moveCluster(false) : actCluster(false);
    }
    /* duo：两簇都塞进本半屏。移动簇贴外缘、动作簇靠内缘，中间留出缝。 */
    if (tag === "p1") return moveDuo(false).concat(actDuo(false));
    return moveDuo(true).concat(actDuo(true));
  }

  /* 双人专用：移动簇压到本半屏的左 1/3，跳抬高一档 */
  function moveDuo(mirror) {
    var raw = [
      { field: "left",  label: "◀", cls: "dir", x: 5,  y: 0.5 },
      { field: "right", label: "▶", cls: "dir", x: 20, y: 0.5 },
      { field: "jump",  label: "跳", cls: "dir", x: 12.5, y: 1.95 }
    ];
    return mirror ? flip(raw) : raw;
  }

  /* 双人专用：动作簇压到本半屏的右 2/3 之内，最外那颗不超过 90%。
     ⚠️ 纵向间距要按「最大那颗」算：「刀」是 big（1.22 倍直径），
     所以它与上方「拾」的 y 差必须 ≥ (1.22 + 1)/2 + 0.15 ≈ 1.26，
     否则包围盒会相交（实测 0.55 vs 1.75 差 1.2 就撞了）。 */
  function actDuo(mirror) {
    var raw = [
      { field: "atk",   label: "刀", cls: "big", x: 46, y: 0.6 },
      { field: "skill", label: "技", cls: "",    x: 74, y: 0.5 },
      { field: "act",   label: "拾", cls: "",    x: 58, y: 2.05 },
      { field: "drop",  label: "丢", cls: "sm",  x: 87, y: 1.9 },
      { field: "give",  label: "递", cls: "sm",  x: 87, y: 3.1 }
    ];
    return mirror ? flip(raw) : raw;
  }

  /* ---------------------------------------------------------------------
     建 DOM
     --------------------------------------------------------------------- */

  function ensureStyle() {
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement("style");
    st.id = STYLE_ID;
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }

  function makeBtn(field, label, cls, tag) {
    var el = doc.createElement("div");
    el.className = "tch-b" + (cls ? " " + cls : "");
    el.textContent = label;
    el.setAttribute("data-tch", tag + ":" + field);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", tag + " " + field);
    bind(el, tag, field);
    btnEls[tag + ":" + field] = el;
    return el;
  }

  /* 尺寸基准：取视口短边的 11%，夹在 [48px, 84px]。
     横屏时短边是高度，竖屏时是宽度 —— 两种朝向都能得到合理大小。 */
  function computeSize() {
    var vw = global.innerWidth || 800;
    var vh = global.innerHeight || 600;
    var base = Math.min(vw, vh) * 0.11;
    var d = Math.max(MIN_TARGET, Math.min(84, base));
    return d;
  }

  function build() {
    if (built) return true;
    if (!available()) return false;

    ensureStyle();

    var root = doc.createElement("div");
    root.id = LAYER_ID;

    /* 半屏容器：单人也建两个（一个放移动、一个放动作），布局函数自己决定摆什么 */
    var halfL = doc.createElement("div");
    halfL.className = "tch-half l";
    var halfR = doc.createElement("div");
    halfR.className = "tch-half r";
    root.appendChild(halfL);
    root.appendChild(halfR);

    /* 顶栏：暂停 + 键位。手机上没有 Esc 与 H，这两个必须给出来。 */
    var top = doc.createElement("div");
    top.className = "tch-top";
    var bPause = doc.createElement("div");
    bPause.className = "tch-b";
    bPause.textContent = "❚❚";
    bPause.setAttribute("data-tch", "sys:pause");
    bindSys(bPause, "pause");
    var bHelp = doc.createElement("div");
    bHelp.className = "tch-b";
    bHelp.textContent = "?";
    bHelp.setAttribute("data-tch", "sys:help");
    bindSys(bHelp, "help");
    top.appendChild(bPause);
    top.appendChild(bHelp);
    root.appendChild(top);

    /* 短片跳过区 */
    var skip = doc.createElement("div");
    skip.className = "tch-skip";
    var hint = doc.createElement("div");
    hint.className = "hint";
    hint.textContent = "长按此处跳过";
    skip.appendChild(hint);
    bindSkip(skip);
    root.appendChild(skip);

    /* 竖屏提示 */
    var rot = doc.createElement("div");
    rot.className = "tch-rotate";
    rot.innerHTML = '<div class="ico"></div>' +
      '<div class="t1">请横过来玩</div>' +
      '<div class="t2">这是横版清版动作游戏<br>竖屏会把画面压成一条窄带</div>';
    root.appendChild(rot);

    var host = doc.body || doc.documentElement;
    if (!host) return false;
    host.appendChild(root);

    layer = root;
    built = true;
    rebuildButtons();
    onResize();
    return true;
  }

  /* 布局变了就重排：把两个半屏清空，按当前 mode 重新摆。 */
  function rebuildButtons() {
    if (!layer) return;
    var halfL = layer.querySelector(".tch-half.l");
    var halfR = layer.querySelector(".tch-half.r");
    if (!halfL || !halfR) return;

    halfL.innerHTML = "";
    halfR.innerHTML = "";
    btnEls = {};

    /* 单人：左半屏 = P1 的移动簇，右半屏 = P1 的动作簇（同一个玩家，两个拇指分家）。
       双人：左半屏 = P1 的移动+动作，右半屏 = P2 的移动+动作（各自镜像）。 */
    var plan;
    if (mode === "solo") {
      plan = [
        { host: halfL, tag: "p1", half: "l" },
        { host: halfR, tag: "p1", half: "r" }
      ];
    } else {
      plan = [
        { host: halfL, tag: "p1", half: "l" },
        { host: halfR, tag: "p2", half: "r" }
      ];
    }

    for (var p = 0; p < plan.length; p++) {
      var step = plan[p];
      var items = layoutFor(step.tag, step.half);
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var el = makeBtn(it.field, it.label, it.cls, step.tag);
        place(el, it);
        step.host.appendChild(el);
      }
    }

    /* 布局自检：任意两枚键的包围盒不许相交。
       这类 bug 靠人眼看截图极难发现（重合一两像素时只是「有点怪」），
       而玩家的拇指会实打实地按错。只在布局重建时跑一次，不进热路径。 */
    checkOverlap();
  }

  /* 两两求交。相交就 warn 并把重叠的那对键记下来 ——
     不自动改布局（那会让位置变得不可预测），只把问题暴露出来。
     长期价值：以后改布局表，控制台立刻告诉你撞了。 */
  function checkOverlap() {
    if (!layer || typeof layer.querySelectorAll !== "function") return [];
    var els = layer.querySelectorAll(".tch-b");
    var rects = [];
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (r.width <= 0) continue;                 /* 还没布局完（display:none）就跳过 */
      rects.push({ k: els[i].getAttribute("data-tch"), r: r });
    }
    var bad = [];
    for (var a = 0; a < rects.length; a++) {
      for (var b = a + 1; b < rects.length; b++) {
        var A = rects[a].r, B = rects[b].r;
        var ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
        var oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
        if (ox > 0 && oy > 0) bad.push(rects[a].k + " × " + rects[b].k);
      }
    }
    if (bad.length && global.console && console.warn) {
      console.warn("[Touch] 虚拟键重叠:", bad.join(", "));
    }
    return bad;
  }

  /* 把一枚键摆到位置。x = 半屏宽度的百分比（居中于该点），y = 距底的 vmin 偏移。 */
  /* 把一枚键摆到位置。
     x = 半屏宽度的百分比，left 是按钮中心（用 marginLeft 往回推半个身位）。
     y = 按钮直径的倍数，从「离底安全距」往上算 —— 这样间距永远跟按钮大小同步。 */
  function place(el, it) {
    el.style.left = it.x + "%";
    el.style.bottom = "calc(var(--tch-y) + var(--tch-d) * " + it.y + ")";
    /* 让「left / bottom 都是中心」：往回推半个身位 */
    el.style.marginLeft = "calc(var(--tch-d) * -0.5)";
    el.style.marginBottom = "calc(var(--tch-d) * -0.5)";
  }

  /* ---------------------------------------------------------------------
     尺寸 / 朝向
     --------------------------------------------------------------------- */

  function onResize() {
    if (!layer) return;
    var d = computeSize();
    var vh = global.innerHeight || 600;
    /* 按键离底边的距离：留出 iPhone 的 home indicator（34px）再往上一点 */
    var y = Math.max(10, Math.min(28, vh * 0.03));
    layer.style.setProperty("--tch-d", d.toFixed(1) + "px");
    layer.style.setProperty("--tch-y", y.toFixed(1) + "px");

    /* 竖屏：游戏画面会被压成一条窄带，直接给一个「请横过来」的整屏提示 */
    var portrait = vh > (global.innerWidth || 800);
    layer.classList.toggle("tch-portrait", portrait);
  }

  /* ---------------------------------------------------------------------
     输入绑定
     --------------------------------------------------------------------- */

  function slotOf(tag) {
    return slots[tag] === slots.p2 ? slots.p2 : slots.p1;
  }

  /* 按下一个键：置 held，置 edge（如果这个键是一次性的） */
  function press(tag, field) {
    var s = slotOf(tag);
    if (s.held[field]) return;
    s.held[field] = true;
    if (s.edge.hasOwnProperty(field)) s.edge[field] = true;

    var el = btnEls[tag + ":" + field];
    if (el) el.classList.add("on");

    everTouched = true;
    /* 触屏振动：安卓有，iOS 没有 —— 静默跳过就好，不要为它加分支判断 */
    buzz(8);
  }

  function release(tag, field) {
    var s = slotOf(tag);
    if (!s.held[field]) return;
    s.held[field] = false;
    var el = btnEls[tag + ":" + field];
    if (el) el.classList.remove("on");
  }

  function bind(el, tag, field) {
    if (hasPointer) {
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        pointers[e.pointerId] = { tag: tag, field: field, at: Date.now() };
        press(tag, field);
        unlockAudio();
      }, { passive: false });

      el.addEventListener("pointerup", function (e) {
        e.preventDefault();
        var rec = pointers[e.pointerId];
        if (rec) { release(rec.tag, rec.field); delete pointers[e.pointerId]; }
      }, { passive: false });

      /* 手指滑出按钮 / 系统打断：都必须松开，否则这个键会永远按着 */
      el.addEventListener("pointercancel", function (e) {
        var rec = pointers[e.pointerId];
        if (rec) { release(rec.tag, rec.field); delete pointers[e.pointerId]; }
      }, { passive: true });

      el.addEventListener("pointerleave", function (e) {
        /* 只有「已捕获但真的离开」才松手；捕获态下 leave 一般不触发，
           留着它是为了老实现里没有 setPointerCapture 的那条路。 */
        var rec = pointers[e.pointerId];
        if (rec && rec.field === field) { release(rec.tag, rec.field); delete pointers[e.pointerId]; }
      }, { passive: true });
    } else if (hasTouchEv) {
      /* 老浏览器兜底：touch 事件。changedTouches 可能有多根手指，
         这里按「每个 touch 归第一个碰到的键」简单处理，够用。 */
      el.addEventListener("touchstart", function (e) {
        e.preventDefault();
        e.stopPropagation();
        pointers[e.changedTouches[0].identifier] = { tag: tag, field: field, at: Date.now() };
        press(tag, field);
        unlockAudio();
      }, { passive: false });

      var end = function (e) {
        var t = e.changedTouches[0];
        var rec = t ? pointers[t.identifier] : null;
        if (rec) { release(rec.tag, rec.field); delete pointers[t.identifier]; }
      };
      el.addEventListener("touchend", end, { passive: true });
      el.addEventListener("touchcancel", end, { passive: true });
    }
  }

  /* 顶栏系统键：不是游戏动作，直接做副作用 */
  function bindSys(el, kind) {
    var fire = function (e) {
      e.preventDefault();
      e.stopPropagation();
      everTouched = true;
      unlockAudio();
      buzz(10);
      try {
        if (kind === "pause") {
          if (global.togglePause) global.togglePause();
        } else if (kind === "help") {
          if (global.UIShell && global.UIShell.toggleKeyHelp) global.UIShell.toggleKeyHelp();
        }
      } catch (err) { /* 静默：按钮不该把游戏搞崩 */ }
    };
    if (hasPointer) el.addEventListener("pointerdown", fire, { passive: false });
    else if (hasTouchEv) el.addEventListener("touchstart", fire, { passive: false });
    /* 桌面上点了也要能用（调试方便，且不占任何视觉空间） */
    el.addEventListener("click", function (e) { e.preventDefault(); fire(e); }, false);
  }

  /* 短片跳过区：按下即开始计时，抬起即归零。整块区域都算「按着」。 */
  function bindSkip(el) {
    var start = function (e) {
      e.preventDefault();
      e.stopPropagation();
      everTouched = true;
      unlockAudio();
      var id = hasPointer ? e.pointerId : (e.changedTouches ? e.changedTouches[0].identifier : 0);
      skipPointers[id] = true;
      if (!skipHeldSince) skipHeldSince = Date.now();
    };
    var end = function (e) {
      var id = hasPointer ? e.pointerId : (e.changedTouches ? e.changedTouches[0].identifier : 0);
      delete skipPointers[id];
      for (var k in skipPointers) { if (skipPointers.hasOwnProperty(k)) return; }
      skipHeldSince = 0;
    };

    if (hasPointer) {
      el.addEventListener("pointerdown", start, { passive: false });
      el.addEventListener("pointerup", end, { passive: true });
      el.addEventListener("pointercancel", end, { passive: true });
    } else if (hasTouchEv) {
      el.addEventListener("touchstart", start, { passive: false });
      el.addEventListener("touchend", end, { passive: true });
      el.addEventListener("touchcancel", end, { passive: true });
    }
  }

  /* 手机浏览器要求「用户手势」之后才允许出声。
     第一次碰到任何按键就顺手把音频解锁，玩家不会遇到「点了没声音」。 */
  var audioUnlocked = false;
  function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      if (typeof global.ac === "function") global.ac();
      else if (global.SND && global.SND.ctx) global.SND.ctx();
    } catch (e) { /* 静默 */ }
  }

  /* ---------------------------------------------------------------------
     对外读状态
     --------------------------------------------------------------------- */

  /* 空状态常量：每次返回新对象太浪费（每帧每人一次），这里复用一份。
     index.html 只读不写，所以共享安全。 */
  var EMPTY = {
    left: false, right: false, jump: false, atk: false,
    skill: false, act: false, drop: false, give: false
  };

  function state(tag) {
    if (!built || !layer || !layer.classList.contains("tch-on")) return EMPTY;
    var s = slotOf(tag);
    /* 一次性键取走即清 —— 与 padEdge 的语义对齐 */
    var out = {
      left: s.held.left,
      right: s.held.right,
      jump: s.edge.jump,
      atk: s.edge.atk,
      skill: s.edge.skill,
      act: s.edge.act,
      drop: s.edge.drop,
      give: s.edge.give
    };
    s.edge.jump = false; s.edge.atk = false; s.edge.skill = false;
    s.edge.act = false; s.edge.drop = false; s.edge.give = false;
    return out;
  }

  /* 全清：暂停 / 切后台 / 过场时调，避免「一直按着右移」的残留状态 */
  function clearAll() {
    for (var t in slots) {
      if (!slots.hasOwnProperty(t)) continue;
      var s = slots[t];
      for (var f in s.held) { if (s.held.hasOwnProperty(f)) s.held[f] = false; }
      for (var e in s.edge) { if (s.edge.hasOwnProperty(e)) s.edge[e] = false; }
    }
    pointers = {};
    skipPointers = {};
    skipHeldSince = 0;
    for (var k in btnEls) {
      if (btnEls.hasOwnProperty(k) && btnEls[k]) btnEls[k].classList.remove("on");
    }
  }

  /* 该不该显示。规则：
     ① 有触屏 ② 手指真的动过（或强制显示） ③ 没插手柄（插了手柄就用不着虚拟键了）
     ④ 只在真正对局里（`G.phase === "play"`），且没在暂停 / 短片中
     第三条很关键：手柄玩家的屏幕不该被一堆虚拟按钮挡掉三分之一。
     第四条是手机特有的：覆盖层上的按钮是 DOM，虚拟键盖在上面会抢掉点击
     （#tch-layer 的 z-index 比 ui-shell 高），而且模式选择页上那十个圆钮
     按了什么都不会发生 —— 因为 update() 只在 play 分支读 Touch.state。 */
  function active() {
    if (!available()) return false;
    if (forced === true) return true;
    if (forced === false) return false;
    if (!everTouched) return false;
    try {
      if (global.Guide && global.Guide.padCount && global.Guide.padCount() > 0) return false;
    } catch (e) { /* 忽略 */ }
    try {
      var g = global.G;
      if (!g) return false;
      if (g.phase !== "play") return false;    /* 标题 / 结算页由 DOM 按钮接管 */
      if (g.paused) return false;              /* 暂停页也是 DOM */
      /* 短片期间要显示，但只为了亮出「长按跳过」那块 —— 动作键本身没意义。
         由 .tch-intro 那条 CSS 把动作键藏起来，只留跳过区。 */
    } catch (e2) { /* 读不到就当在对局里 */ }
    return true;
  }

  /* 每帧由 index.html 调：把显示状态同步到 DOM。
     只在实际变化时改 class，避免每帧重排。 */
  var lastShown = null;
  var lastIntro = null;
  function tick() {
    if (!built) return;
    var want = active();
    if (want !== lastShown) {
      lastShown = want;
      layer.classList.toggle("tch-on", want);
      if (!want) clearAll();
    }
    /* 短片期间要额外亮出「长按跳过」那块 */
    var intro = false;
    try { intro = !!(global.G && global.G.intro); } catch (e) { intro = false; }
    if (intro !== lastIntro) {
      lastIntro = intro;
      layer.classList.toggle("tch-intro", intro);
    }
    /* 指针超时回收：一次性键按住超过 POINTER_STALE_MS 就强制松开。
       手机上 pointerup 会丢（手指滑出屏幕 / 来电 / 系统弹窗），
       不回收的话那枚键永远「按着」，玩家会看到角色自己一直挥刀或一直跳。 */
    reapStale();
  }

  /* 回收卡死的指针。只处理一次性键 —— 方向键一直按着是正常玩法，
     强行回收会让「按住往前跑」突然断掉。方向键靠 cancel / pagehide / blur 兜底。 */
  function reapStale() {
    var now = Date.now();
    var once = { jump: 1, atk: 1, skill: 1, act: 1, drop: 1, give: 1 };
    for (var id in pointers) {
      if (!pointers.hasOwnProperty(id)) continue;
      var rec = pointers[id];
      if (!rec) continue;
      if (!once[rec.field]) continue;                       /* 方向键不管 */
      if (now - (rec.at || now) < POINTER_STALE_MS) continue;
      release(rec.tag, rec.field);
      delete pointers[id];
    }
  }

  function skipHeld() {
    for (var k in skipPointers) { if (skipPointers.hasOwnProperty(k)) return true; }
    return false;
  }

  /* 「刚刚有没有手指落下」。给标题页 / 结算页的「按任意键」用 ——
     那些页面上虚拟键是收起的（覆盖层由 DOM 按钮接管），
     所以不能读 state()，只能读这个一次性标记。
     读一次即消费，避免同一根手指连触发两页。 */
  var tapPending = false;
  function takeTap() {
    if (!tapPending) return false;
    tapPending = false;
    return true;
  }

  /* 「现在有没有任何手指按在虚拟键上」。
     给结算页 / 暂停页的启用闸用：必须先见到一帧「没手指」才接受下一次点按，
     否则玩家最后那一刀还按着就会当场把页面顶掉。 */
  function anyHeld() {
    for (var id in pointers) {
      if (pointers.hasOwnProperty(id) && pointers[id]) return true;
    }
    for (var t in slots) {
      if (!slots.hasOwnProperty(t)) continue;
      var h = slots[t].held;
      for (var f in h) { if (h.hasOwnProperty(f) && h[f]) return true; }
    }
    return false;
  }

  /* ---------------------------------------------------------------------
     振动（安卓 Chrome 有，iOS 没有）
     --------------------------------------------------------------------- */

  function buzz(ms) {
    try {
      if (global.navigator && typeof global.navigator.vibrate === "function") {
        global.navigator.vibrate(ms || 10);
      }
    } catch (e) { /* 静默 */ }
  }

  /* ---------------------------------------------------------------------
     生命周期
     --------------------------------------------------------------------- */

  function setMode(m) {
    var next = (m === "duo") ? "duo" : "solo";
    if (next === mode && built) return;
    mode = next;
    if (built) rebuildButtons();
  }

  function show() { forced = true; lastShown = null; tick(); }
  function hide() { forced = false; lastShown = null; clearAll(); tick(); }

  /* 第一次真手指落下：从这一刻起才允许显示按键。
     捕获阶段监听，任何地方的手指都算，不限于按键区。 */
  function armFirstTouch() {
    if (!available()) return;
    var kick = function () {
      /* 不管是不是第一次，都记一个「刚有手指落下」的标记 ——
         标题页与结算页的「按任意键」靠它（见 takeTap）。 */
      tapPending = true;
      if (everTouched) return;
      everTouched = true;
      unlockAudio();
      lastShown = null;
      tick();
    };
    if (hasPointer) {
      global.addEventListener("pointerdown", kick, { capture: true, passive: true });
    } else if (hasTouchEv) {
      global.addEventListener("touchstart", kick, { capture: true, passive: true });
    }
  }

  /* 切后台：全清。手机上来电 / 切 App 时手指状态会卡在「按着」。 */
  function onHide() {
    clearAll();
  }

  function onVis() {
    if (doc.visibilityState === "hidden") clearAll();
  }

  /* ---------------------------------------------------------------------
     初始化
     --------------------------------------------------------------------- */

  function init() {
    if (!available()) return false;
    armFirstTouch();

    /* DOM 就绪后再建：这个脚本在 <head> 之后、<body> 尾部加载，
       但稳妥起见仍等一次 DOMContentLoaded（已经 ready 就直接建）。 */
    var go = function () {
      build();
      global.addEventListener("resize", onResize, false);
      global.addEventListener("orientationchange", function () {
        /* 朝向变化后 innerWidth/innerHeight 要等一帧才准 */
        setTimeout(onResize, 60);
      }, false);
      global.addEventListener("pagehide", onHide, false);
      /* 失焦 / 切标签 / 锁屏：手指状态全清。
         手机上这几种情况都会让 pointerup 收不到，不清就是「角色自己一直往前跑」。 */
      global.addEventListener("blur", onHide, false);
      doc.addEventListener("visibilitychange", onVis, false);
    };

    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", go, false);
    } else {
      go();
    }
    return true;
  }

  /* ---------------------------------------------------------------------
     导出
     --------------------------------------------------------------------- */

  global.Touch = {
    available: available,
    active: active,
    state: state,
    setMode: setMode,
    show: show,
    hide: hide,
    tick: tick,
    clearAll: clearAll,
    skipHeld: skipHeld,
    takeTap: takeTap,
    anyHeld: anyHeld,
    buzz: buzz,
    init: init,
    /* 调试用：看当前是按着什么；overlaps 供自动化验收调用 */
    debug: function () { return { mode: mode, shown: lastShown, pointers: pointers }; },
    overlaps: function () { return checkOverlap(); }
  };
})(window, document);
