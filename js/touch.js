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

  /* hasPointer 只回答「能不能用 PointerEvent API」，**不回答有没有触屏**。
     桌面 Chrome / Edge / Firefox 全都支持 PointerEvent ——
     拿它当「有触屏」的判据，鼠标点一下页面就会切进触屏档，
     桌面玩家会看到一堆手机虚拟键凭空冒出来。
     它只用来选事件 API：能用 PointerEvent 就用 pointer* 事件，
     否则退回老式 touch* 事件。 */
  var hasPointer = typeof global.PointerEvent === "function";

  /* hasTouchEv 才是「这台设备有触摸硬件」。
     - "ontouchstart" in window：主流移动浏览器都注入这个
     - DocumentTouch：老 IE / 老 Safari
     - navigator.maxTouchPoints > 0：Windows 触摸屏本、iPad、
       部分 ChromeOS —— 桌面 Chrome 默认是 0 */
  var hasTouchEv = ("ontouchstart" in global) ||
                   (global.DocumentTouch && doc instanceof global.DocumentTouch) ||
                   (global.navigator && global.navigator.maxTouchPoints > 0);

  /* URL 强制开关：
       ?touch=1  强制触屏版（手机版入口 mobile.html 跳过来时带这个）
       ?touch=0  强制桌面版（触摸屏笔记本上想用鼠标玩时用）
     写进 URL 是因为「这台机器到底算不算触屏」有时很模糊
     （外接触屏显示器、装了触屏驱动但从来不用手指的台式机），
     给一个显式开关比猜更可靠。 */
  var urlTouch = (function () {
    try {
      var m = /[?&]touch=([^&#]*)/.exec(global.location && global.location.search || "");
      if (!m) return null;
      var v = String(m[1]).toLowerCase();
      if (v === "1" || v === "true" || v === "on") return true;
      if (v === "0" || v === "false" || v === "off") return false;
    } catch (e) { /* 忽略 */ }
    return null;
  })();

  /* 有触屏硬件 = 能用手指。桌面上带触摸屏的笔记本也算 ——
     那不是误判，那些机器确实能点。
     真正决定「要不要显示虚拟键」的是 everTouched：
     必须真的来过一个 touch/pen 指针事件，鼠标点击不算。 */
  function available() {
    if (urlTouch !== null) return urlTouch;
    return !!hasTouchEv;
  }

  /* 指针事件是不是「手指或笔」。
     鼠标的 pointerType 恒为 "mouse" —— 桌面玩家用鼠标点页面时
     绝不能切进触屏档。笔（pen）算手指：拿笔在触屏上操作的人
     同样需要虚拟键。空字符串（部分老浏览器不填）按手指算。 */
  function isFingerEvent(e) {
    if (!e) return true;
    var t = e.pointerType;
    if (t === "mouse") return false;
    return true;
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
  /* 短片跳过区的两个节点：容器（挂 .holding）+ 文字（改文案）。
     存下来是为了让 tick() 能直接改，不用每帧 querySelector。 */
  var skipEl = null;
  var skipLabEl = null;

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
     美术贴图（模块自带缓存）
     ---------------------------------------------------------------------
     为什么不进 js/assets.js 的 MANIFEST：
     那是**启动期静态图预算**，40 条路径已经排满，而且它一旦多一条，
     桌面玩家也要为一张永远不显示的图多读一次盘（file:// 下没有缓存协商）。
     虚拟键的盘与纹样只有触屏档才用得上，所以由本模块自己 new Image()：
       · 只在 available() 为真时建（桌面一个字节都不读）
       · 失败静默 —— 不 console.warn，不缺图时报错，整层直接不出现
       · 只在初始化路径（init → warmArt）里建，tick() / 绘制热路径零新建

     素材契约（由 tools/prep_touch.py 产出，本模块只按契约算尺寸）：
       assets/touch/plate.webp      256×256 正圆青铜盘，盘体占 0.96
       assets/touch/plate-sq.webp   256×256 圆角方盘（方向键用）
       assets/touch/glyph-<field>.webp  256×256 金线纹样，长边占 0.70
     --------------------------------------------------------------------- */

  var ART_DIR = "assets/touch/";
  var ART_PLATE = ART_DIR + "plate.webp";
  var ART_PLATE_SQ = ART_DIR + "plate-sq.webp";

  /* 纹样文件名跟着 field 走 —— 键名与布局表、按钮文字三者同源，
     加一个新键只要在布局表里出现，这里的表补一行就能有纹样。 */
  var ART_GLYPH = {
    left:  "glyph-left.webp",
    right: "glyph-right.webp",
    jump:  "glyph-jump.webp",
    atk:   "glyph-atk.webp",
    skill: "glyph-skill.webp",
    act:   "glyph-act.webp",
    drop:  "glyph-drop.webp",
    give:  "glyph-give.webp"
  };

  /* 素材契约里的两个「占画布多少」常数。改素材规格时只改这两个数，
     下面所有百分比都是从它们算出来的，不存在第二份硬编码。 */
  var PLATE_FILL = 0.96;        /* 盘体长边占画布 */
  var GLYPH_FILL = 0.70;        /* 纹样长边占画布 */

  /* 每枚键的纹样「视觉长边 / 按钮直径」。
     这个档位是拿真实素材按 60px 按钮 2 倍渲染并排看过的（0.50 / 0.58 / 0.64 /
     0.72 / 0.80 / 0.88 六档）：0.72 往上纹样会跟文字撞在一起、读成一团；
     0.50~0.64 才像「暗刻在盘底的纹」而不是第二层字。
     小键（丢 / 递）压到 0.50，大键（刀）给到 0.62，其余 0.56。 */
  var GLYPH_ART = {
    left: 0.60, right: 0.60, jump: 0.60,
    atk: 0.62, skill: 0.56, act: 0.56, drop: 0.50, give: 0.50
  };

  /* 攻击键上武器图标的视觉长边（占按钮直径）。
     ⚠️ 0.72 → 0.62 是实测改下来的：盘的内面只有按钮的约 0.78，
     而「眼形石」这类**近方形**图标按长边 0.72 归一后几乎吃满内面、
     压住盘沿的金色云雷纹，读成一坨石头糊在钮上（844×390 截图对照过）。
     长条形的刀斧在 0.72 下没问题，但两者只能共用一个数 ——
     取小的那个，让方形图标留出边框，长条图标略小一点但不至于失焦。 */
  var ATK_ICON_FILL = 0.62;

  /* 图标**内容**长边占画布的比例 —— 这是素材各自的留白，与路径表无关。
     实测（alpha 包围盒，2026-10-26）：
       wp-* 六张统一 0.859；it-bell .583 / it-jade .615 / it-jar .490 / it-rock .411
     注意 MANIFEST 里 wpRock 指向的是 it-rock.webp（同一张图），
     所以 wpRock 要按 0.411 算，不能跟着 wp-* 一起填 0.86。
     直接同尺寸塞进去，玉器 / 陶罐 / 石片会比刀斧小一大圈（正是这个坑）。
     未登记的键按武器族 0.86 兜底；宁可略大也不消失。 */
  var ICON_ART = {
    wpShort: 0.859, wpDagger: 0.859, wpSword: 0.859, wpAxe: 0.859,
    wpHammer: 0.859, wpSpear: 0.859, wpBow: 0.859,
    wpRock: 0.411,
    itJade: 0.615, itBell: 0.583, itJar: 0.490
  };
  var ICON_ART_DEFAULT = 0.86;

  /* 贴图缓存：path -> Image；ok: path -> 已经 load 成功。
     nPlate / nGlyph 只用来给 debug() 报「加载了几张」，不参与绘制判定。 */
  var ART = { img: {}, ok: {}, nPlate: 0, nGlyph: 0 };

  /* 每个玩家「手上这把武器」的呈现状态。setWeapon 每帧被 syncHUD 调，
     值没变就直接 return —— 见 setWeapon 的幂等说明。 */
  var wstate = {
    p1: { icon: null, path: null, ready: false, armed: false },
    p2: { icon: null, path: null, ready: false, armed: false }
  };

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

/* ---- 美术层（贴图）-------------------------------------------------
   三层叠在同一枚键里，自下而上：

     .tch-plate   青铜盘（正圆 / 圆角方）—— 盖住上面的渐变底
     .tch-motif   暗刻金线纹样（低不透明度）
     .tch-lab     文字标签（◀ ▶ 跳 刀 技 拾 丢 递）—— 永远在最上面
     .tch-wp      只出现在攻击键上：持械时显示当前武器图标

   ⚠️ 这一段存在**唯一**理由是好看，所以降级必须逐级可退：
   每一层默认 display:none，只有 JS 确认那张图真的 load 成功、给它挂上
   .tch-art 之后才显示。缺图 / 慢图 / 404 / Assets 模块整份缺席时，
   玩家看到的就是今天那张环形渐变圆钮 + 金字 ——
   绝不会出现白方块、破图标、「按钮只剩一圈边」或文字消失。
   图片本身一律 pointer-events:none，判定永远在 .tch-b 上，一个像素都不动。

   尺寸口径（都写成「相对按钮自身宽高的百分比」，所以 big / sm / dir
   三种尺寸自动同比例，不用为每种尺寸再算一遍）：
     · 盘：素材把盘体画在画布的 PLATE_FILL（0.96）上 → 图要比按钮大
       1/0.96 ≈ 104.17% 才能让盘沿正好贴住按钮边。这个数由 PLATE_FILL
       在模板里算出来，改素材规格只改那一个常数。
     · 纹样：素材把纹样画在画布的 GLYPH_FILL（0.70）上 → 图宽 = 视觉比例 / 0.70。
       每枚键的视觉比例由 JS 写进 --art（见 GLYPH_ART），不写死一个百分比。
     · 武器图标：素材留白各家不同（wp-* 0.86、it-* 0.41~0.65），
       同理每把武器一个 --wpart（见 ICON_ART），否则同尺寸下玉器会显小。 */

#${LAYER_ID} .tch-plate{
  position:absolute;left:50%;top:50%;
  width:${(100 / PLATE_FILL).toFixed(2)}%;height:${(100 / PLATE_FILL).toFixed(2)}%;
  transform:translate(-50%,-50%);
  border-radius:50%;
  display:none;pointer-events:none;
  -webkit-user-drag:none;-webkit-user-select:none;user-select:none;
}
#${LAYER_ID} .tch-plate.tch-art{display:block}
/* 方向键配圆角方盘：形状跟按钮的 border-radius:26% 对齐 */
#${LAYER_ID} .tch-b.dir .tch-plate{border-radius:26%}

#${LAYER_ID} .tch-motif{
  position:absolute;left:50%;top:50%;
  width:var(--art,100%);height:var(--art,100%);
  transform:translate(-50%,-50%);
  display:none;pointer-events:none;
  /* 暗刻：压到半透明，让上面的金字仍然是第一层信息。
     这里刻意不加 filter:drop-shadow —— 低端机上 16 枚键各一层滤镜
     是实打实的合成开销，而纹样本来就有自己的金色描边。

     ⚠️ 0.44 是实测调出来的，不是拍的：在 844×390 真机视口截图上，
     0.44 在青绿盘面上几乎看不见（等于白做一层素材），1.0 又会跟文字抢读，
     0.52 是「看得出是铸造纹样、又读得清字」的那一档。 */
  opacity:.52;
  -webkit-user-drag:none;-webkit-user-select:none;user-select:none;
}
#${LAYER_ID} .tch-motif.tch-art{display:block}

/* 攻击键特例：持械时键面就是武器本身（满不透明），文字「刀」让位。
   armed 这个类只在「拿到了 iconKey + 路径 + 图真的就绪」三者同时成立时
   才由 JS 挂上 —— 所以空手 / 图标未就绪天然退回 bare（金线 atk 纹样 + 刀）。 */
#${LAYER_ID} .tch-wp{
  position:absolute;left:50%;top:50%;
  width:var(--wpart,84%);height:var(--wpart,84%);
  transform:translate(-50%,-50%);
  display:none;pointer-events:none;
  /* z-index:1 是必须的：按下态的反馈是 .on::after 的一层金雾，
     而 ::after 生成在所有子元素之后、会盖住武器图标 ——
     实测按下去那一下刀斧会被糊成一片金。抬到金雾之上就正常了。
     （文字 .tch-lab 是 z-index:2，仍在最上层。） */
  z-index:1;
  -webkit-user-drag:none;-webkit-user-select:none;user-select:none;
}
#${LAYER_ID} .tch-b.atk.armed .tch-wp.tch-art{display:block}
#${LAYER_ID} .tch-b.atk.armed .tch-motif{display:none}
#${LAYER_ID} .tch-b.atk.armed .tch-lab{display:none}

/* 文字标签：position:relative 是必须的 —— 上面三层都是绝对定位，
   不定位的在流元素反而会被画在它们下面，字会被盘吃掉。
   z-index:2 是为了压过按下时的金雾（.on::after 是 z-index:auto）——
   否则按下去那一下金字会被金雾糊掉，读不清。 */
#${LAYER_ID} .tch-lab{position:relative;z-index:2;pointer-events:none}
/* 有贴图时补一道暗描边：青铜盘比原来的黑底亮得多，同一个金字压在亮底上
   会明显发灰（并排渲染对比过）。没贴图时不加，保持今天的样子。
   只加 text-shadow，颜色与字号一个字都不动。 */
#${LAYER_ID} .tch-b.art .tch-lab{
  text-shadow:0 0 2px rgba(6,6,8,.92),0 1px 2px rgba(6,6,8,.85),1px 0 1px rgba(6,6,8,.6),-1px 0 1px rgba(6,6,8,.6);
}

/* 有贴图的键：按下反馈不能再靠「换底色」（盘会把底色盖死），
   改成在盘上盖一层金雾。没贴图的键不加这一层，保持今天的样子。 */
#${LAYER_ID} .tch-b.art.on::after{
  content:"";position:absolute;inset:0;pointer-events:none;
  border-radius:inherit;
  background:radial-gradient(circle at 50% 38%,rgba(245,217,142,.52),rgba(245,217,142,.08) 76%);
}
/* 同上：有贴图时底色没变，金字不该跟着 .on 变成深色 */
#${LAYER_ID} .tch-b.art.on{color:#f7e6b6}

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
/* 「横屏进入」按钮：只在自动锁屏没成功时才需要玩家点。
   尺寸按 44px 规范下限再放大一圈（这里是视口坐标，不跟 #stage 缩放）。 */
#${LAYER_ID} .tch-rotate .tch-rotbtn{
  margin-top:6px;padding:14px 34px;border-radius:999px;
  font-size:16px;letter-spacing:.10em;color:#f5d98e;
  background:rgba(58,47,24,.72);border:1px solid rgba(245,217,142,.72);
  box-shadow:0 2px 14px rgba(0,0,0,.5);
  -webkit-tap-highlight-color:transparent;
}

/* ---- 短片跳过区：整屏都能按 ----
   为什么盖满整屏、而不是只盖下半屏：手机横屏时玩家单手托机、
   拇指自然落在右下，但另一只手可能正拿着手机边上；「按哪都算」永远比
   「按对那一块才算」少一次失败。短片期间画面上没有任何别的可交互东西
   （动作键由 .tch-intro 藏起来了），所以盖满不抢任何东西。
   更关键的一条：这一层也顺手挡住了底下所有文字 —— 长按落在一个
   pointer-events:auto 的层上，浏览器就没机会把视频里的字幕、
   覆盖层的文案拎起来选中。 */
#${LAYER_ID} .tch-skip{
  position:absolute;inset:0;
  display:none;align-items:flex-end;justify-content:center;padding-bottom:24px;
  pointer-events:auto;touch-action:none;
  /* 这一块是「按住不放」的，长按必然触发浏览器的文字选中与
     长按菜单（安卓「复制/全选」、iOS 的 callout 气泡）。
     根容器上已经禁过一次，这里再落一遍：只在根上写，一旦某个后代
     自己把 user-select 改回来（比如将来加个可复制的版本号），
     症状会直接回到「按着按着跳出一个复制气泡，跳过还失败了」。 */
  -webkit-user-select:none;-moz-user-select:none;user-select:none;
  -webkit-touch-callout:none;-webkit-user-drag:none;
  /* 长按不要那圈灰色高亮（安卓 Chrome 的 tap highlight），
     它会在按住的 0.7 秒里一直亮着，看起来像「选中了」 */
  -webkit-tap-highlight-color:transparent;
}
#${LAYER_ID}.tch-intro .tch-skip{display:flex}
/* 短片期间只留跳过区：动作键与方向键此时按了没有任何作用
   （loop 走的是 introTick，不进 update），摆在屏幕上只会误触 */
#${LAYER_ID}.tch-intro .tch-b,
#${LAYER_ID}.tch-intro .tch-top{display:none}
#${LAYER_ID} .tch-skip .hint{
  position:relative;overflow:hidden;
  font-size:13px;letter-spacing:.10em;color:rgba(230,214,178,.62);
  padding:8px 18px;border-radius:999px;
  background:rgba(6,7,10,.62);border:1px solid rgba(201,167,101,.28);
  transition:color .14s,border-color .14s;
}
/* 长按进度：一条从左侧长出来的暖金填充。
   触屏上右下角那块带进度环的 .iskip 是收起来的（见 index.html 的
   introSyncHint），所以这块提示是玩家唯一的进度反馈 —— 没有它，
   玩家按着 0.7 秒里画面毫无变化，会以为「长按没反应」，然后松手。 */
#${LAYER_ID} .tch-skip .hint::after{
  content:"";position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);
  background:linear-gradient(90deg,rgba(245,217,142,.34),rgba(245,217,142,.12));
  pointer-events:none;
}
#${LAYER_ID} .tch-skip .hint .lab{position:relative;z-index:1}
#${LAYER_ID} .tch-skip.holding .hint{color:#f5d98e;border-color:rgba(245,217,142,.72)}
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

  /* ---------------------------------------------------------------------
     美术层的建元素 / 装图
     ---------------------------------------------------------------------
     所有 <img> 都只在这里建一次（build / rebuildButtons 都属初始化路径），
     tick() 与绘制热路径一个都不建。图能不能显示只看 ART.ok，
     与「元素在不在」无关 —— 元素在、但没挂 .tch-art 就是 display:none，
     所以永远不会出现破图标。 */

  /* 做一个美术层 <img>：先挂 src 让它进浏览器缓存，但**默认不显示**，
     等 ART.ok[src] 为真（这张图真的解码成功）才由 applyArt() 挂 .tch-art。
     素材缺席时 ART.ok 永远是 undefined → 这一层永远不出现。 */
  function artImg(el, cls, src) {
    if (!src) return null;
    var im = doc.createElement("img");
    im.className = cls;
    im.setAttribute("alt", "");
    im.setAttribute("aria-hidden", "true");
    im.setAttribute("draggable", "false");
    /* src 同时记在元素上：applyArt() 判就绪时直接读这个字段，
       不去 getAttribute("src") 反查 —— 属性可能被内核规整成绝对 URL，
       一规整就对不上 ART.ok 的键名，那一层会永远不显示。 */
    im.__artSrc = src;
    im.setAttribute("src", src);
    el.appendChild(im);
    return im;
  }

  /* 给一枚键套上三层：盘 → 纹样 → 文字。
     顺序（DOM 顺序 = 绘制顺序）不能反：定位元素按 DOM 先后叠，
     文字必须在最后一层，否则会被盘盖掉。
     第四个 <img class="tch-wp"> 只给攻击键，且由 .armed 控制显隐。 */
  function decorate(el, field, cls, label) {
    var isDir = (" " + (cls || "") + " ").indexOf(" dir ") >= 0;

    /* ① 青铜盘：方向键用圆角方盘，其余用正圆盘 */
    var plateSrc = isDir ? ART_PLATE_SQ : ART_PLATE;
    var plate = artImg(el, "tch-plate", plateSrc);
    if (plate) el.__plate = plateSrc;

    /* ② 暗刻金线纹样：按 field 取图，并把「视觉大小」写进 --art。
          --art 是相对按钮宽高的百分比：视觉比例 / 纹样占画布比例。
          写成每键一个 CSS 变量而不是一条全局规则，是因为小键（丢/递）
          与大键（刀）需要的视觉比例不同，写死一个百分比必然有一边不合适。 */
    if (field && ART_GLYPH[field]) {
      var vis = GLYPH_ART[field] || 0.76;
      el.style.setProperty("--art", pct(vis / GLYPH_FILL));
      var motif = artImg(el, "tch-motif", ART_DIR + ART_GLYPH[field]);
      if (motif) el.__motif = ART_DIR + ART_GLYPH[field];
    }

    /* ③ 文字标签。文案一个字都不改（js/guide.js 的 TOUCH_LEGEND 逐字对应）；
         持械时由 CSS 让位隐藏，空手时照旧显示。 */
    var lab = doc.createElement("span");
    lab.className = "tch-lab";
    lab.textContent = label;
    el.appendChild(lab);

    /* ④ 攻击键专属：武器图标层。元素现在就建好，setWeapon 只改 src，
          绝不在每帧调用里新建元素。 */
    if (field === "atk") {
      var wp = doc.createElement("img");
      wp.className = "tch-wp";
      wp.setAttribute("alt", "");
      wp.setAttribute("aria-hidden", "true");
      wp.setAttribute("draggable", "false");
      el.appendChild(wp);
      el.__wp = wp;
    }
    return el;
  }

  function makeBtn(field, label, cls, tag) {
    var el = doc.createElement("div");
    /* 只把 atk 这一个 field 名写进 class：攻击键特例全靠它（.tch-b.atk）。
       其余 field 名不落成 class —— 那只是给全局 CSS 多留一堆可能撞名的钩子
       （index.html 里已经有 .wpn.right 这类规则）。 */
    el.className = "tch-b" + (cls ? " " + cls : "") + (field === "atk" ? " atk" : "");
    el.setAttribute("data-tch", tag + ":" + field);
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", tag + " " + field);
    decorate(el, field, cls, label);
    bind(el, tag, field);
    btnEls[tag + ":" + field] = el;
    return el;
  }

  /* 百分比串。保留一位小数就够 —— 差 0.05% 在 48~84px 的按钮上是 0.04px。 */
  function pct(v) {
    return (v * 100).toFixed(1) + "%";
  }

  /* ---------------------------------------------------------------------
     贴图缓存
     --------------------------------------------------------------------- */

  /* 只在 available() 为真时调（init 里），所以桌面一个字节都不读。
     全部失败都静默：缺图不是错误，是降级路径的入口。 */
  function warmArt() {
    if (!available()) return;
    loadArt(ART_PLATE, "plate");
    loadArt(ART_PLATE_SQ, "plate");
    for (var f in ART_GLYPH) {
      if (ART_GLYPH.hasOwnProperty(f)) loadArt(ART_DIR + ART_GLYPH[f], "glyph");
    }
  }

  function loadArt(src, kind) {
    if (ART.img[src]) return;                 /* 同一路径只建一个 Image */
    var im = new Image();
    ART.img[src] = im;
    im.onload = function () {
      /* 0 字节 / 解码失败的文件，部分内核仍然会走 onload（naturalWidth 为 0）。
         不在这里挡一道，就会把一个「破图标」当成就绪显示出来 —— 那正是硬约束
         里明令禁止的「白方块」。所以「load 了」之外还要「有像素」。 */
      if (!(im.naturalWidth > 0) || !(im.naturalHeight > 0)) {
        ART.ok[src] = false;
        return;
      }
      if (ART.ok[src]) return;                /* 只计一次 */
      ART.ok[src] = true;
      if (kind === "plate") ART.nPlate++; else ART.nGlyph++;
      /* 图是异步到的，而按键可能早就建好了 —— 补一次 .tch-art */
      applyArt();
    };
    /* 失败静默：不 warn、不重试、不留痕。ART.ok 保持 undefined，
       对应那层永远 display:none，外观逐级退回渐变 + 金字。 */
    im.onerror = function () { ART.ok[src] = false; };
    im.src = src;
  }

  /* 把「图好了没有」同步到已建好的键上。
     直接扫 DOM 而不是维护一份元素清单：布局重建会整块换掉元素，
     清单一旦没跟着清就是悬空引用（对着已移除的节点改 class，静默无效）。
     只在图落地 / 重建布局时跑，不进 tick —— 一次十几个节点，代价可忽略。 */
  function applyArt() {
    if (!layer || typeof layer.querySelectorAll !== "function") return;
    var els = layer.querySelectorAll("img.tch-plate, img.tch-motif");
    for (var i = 0; i < els.length; i++) {
      var im = els[i];
      im.classList.toggle("tch-art", !!ART.ok[im.__artSrc]);
    }
    refreshArtFlag();
  }

  /* 「这枚键身上有没有贴图在显示」。
     决定按下时用哪种反馈：有贴图 → 盘上盖金雾（::after）；
     没贴图 → 保持今天的「换底色 + 深色字」。
     逐键写一个 .art 类，而不是给整个层挂，
     这样一半图挂了一半没挂时两边各自退得干净。 */
  function refreshArtFlag() {
    if (!layer || typeof layer.querySelectorAll !== "function") return;
    var els = layer.querySelectorAll(".tch-b");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var on = !!(el.__plate && ART.ok[el.__plate]) ||
               !!(el.__motif && ART.ok[el.__motif]) ||
               el.classList.contains("armed");
      el.classList.toggle("art", on);
    }
  }

  /* ---------------------------------------------------------------------
     攻击键跟随手上武器
     ---------------------------------------------------------------------
     对外只暴露 setWeapon(tag, iconKey)，由 index.html 的 syncHUD 每帧调一次。
     两个必须守住的性质：
       ① 同帧幂等：值没变直接 return（syncHUD 是每帧跑的，不能每帧改 DOM）。
          但「图从没就绪变成就绪」也要能触发一次重画，所以缓存的是
          (icon, ready) 这一对，不是单独的 icon —— 否则第一帧图还没解码完
          就会永久卡在 bare。
       ② Assets 缺席 / 路径不在 MANIFEST / 图没就绪 → 一律退成 bare
          （金线 atk 纹样 + 文字「刀」），绝不显示空图标。

     路径来源只有一处：window.Assets.MANIFEST。本模块不抄第二份路径表 ——
     抄一份就会漂移（改素材时总有一份忘改），而 MANIFEST 本来就是权威。
     --------------------------------------------------------------------- */

  /* 与 index.html 的 imgReady() 同口径：加载中 / 加载失败都算没图。 */
  function iconReady(key) {
    var im = (global.IMG && global.IMG[key]) || null;
    if (!im) return false;
    if (im.complete === false) return false;
    if (typeof im.naturalWidth === "number" && im.naturalWidth <= 0) return false;
    return true;
  }

  function iconPath(key) {
    try {
      var m = global.Assets && global.Assets.MANIFEST;
      if (m && typeof m[key] === "string" && m[key]) return m[key];
    } catch (e) { /* 忽略 */ }
    return null;
  }

  /* 武器图标图宽（相对按钮宽高的百分比）：
     视觉比例 / 这张图的内容占比。留白大的（石片 0.41）图会放大到 175%，
     但它的透明画布本来就不吃像素，落地后内容正好跟刀斧一样大。 */
  function wpPct(key) {
    var r = ICON_ART[key] || ICON_ART_DEFAULT;
    return pct(ATK_ICON_FILL / r);
  }

  /* 把缓存里的武器状态刷到按钮上。rebuildButtons 之后也要调一次 ——
     布局重建会换掉元素，缓存还在，但新元素还是 bare。 */
  function applyWeapon(tag) {
    var st = wstate[tag] || wstate.p1;
    var armed = !!(st.ready && st.path);
    st.armed = armed;              /* 先记状态：debug() 读的是它 */
    var el = btnEls[tag + ":atk"];
    if (!el) return;               /* 单人模式没有 p2 的键，正常 */
    var wpEl = el.__wp;
    if (armed && wpEl) {
      /* 只在路径真的变了才写 src（写同一个值也会让浏览器重排一次） */
      if (wpEl.__artSrc !== st.path) {
        wpEl.__artSrc = st.path;
        wpEl.setAttribute("src", st.path);
      }
      wpEl.classList.add("tch-art");
      el.style.setProperty("--wpart", wpPct(st.icon));
      el.classList.add("armed");
    } else {
      el.classList.remove("armed");
      if (wpEl) wpEl.classList.remove("tch-art");
    }
    /* 供按下反馈用：armed 时图标就是键面，必须走「金雾」那条 */
    var on = !!(el.__plate && ART.ok[el.__plate]) ||
             !!(el.__motif && ART.ok[el.__motif]) || armed;
    el.classList.toggle("art", on);
  }

  function setWeapon(tag, iconKey) {
    var t = (tag === "p2") ? "p2" : "p1";
    var key = (typeof iconKey === "string" && iconKey) ? iconKey : null;
    var path = key ? iconPath(key) : null;
    var ready = !!(key && path && iconReady(key));
    var st = wstate[t];
    /* 同帧幂等：syncHUD 每帧都调，值没变必须立刻 return（不碰样式、不碰 DOM） */
    if (st.icon === key && st.path === path && st.ready === ready) return;
    st.icon = key;
    st.path = path;
    st.ready = ready;
    applyWeapon(t);
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

    /* 顶栏：暂停 + 键位。手机上没有 Esc 与 H，这两个必须给出来。
       这两枚也套青铜盘（同一套皮肤），但没有纹样：pause / help 不在
       ART_GLYPH 表里，decorate 会自动跳过纹样层，只留盘 + 文字。 */
    var top = doc.createElement("div");
    top.className = "tch-top";
    var bPause = doc.createElement("div");
    bPause.className = "tch-b";
    bPause.setAttribute("data-tch", "sys:pause");
    decorate(bPause, null, "", "❚❚");
    bindSys(bPause, "pause");
    var bHelp = doc.createElement("div");
    bHelp.className = "tch-b";
    bHelp.setAttribute("data-tch", "sys:help");
    decorate(bHelp, null, "", "?");
    bindSys(bHelp, "help");
    top.appendChild(bPause);
    top.appendChild(bHelp);
    root.appendChild(top);

    /* 短片跳过区 */
    var skip = doc.createElement("div");
    skip.className = "tch-skip";
    var hint = doc.createElement("div");
    hint.className = "hint";
    /* 文字套一层 .lab：进度填充是 .hint 的 ::after，套一层才能把文字压在填充上面 */
    var lab = doc.createElement("span");
    lab.className = "lab";
    lab.textContent = "长按此处跳过";
    hint.appendChild(lab);
    skip.appendChild(hint);
    bindSkip(skip);
    root.appendChild(skip);
    skipEl = skip;
    skipLabEl = lab;

    /* 竖屏提示 */
    var rot = doc.createElement("div");
    rot.className = "tch-rotate";
    rot.innerHTML = '<div class="ico"></div>' +
      '<div class="t1">请横过来玩</div>' +
      '<div class="t2">这是横版清版动作游戏<br>竖屏会把画面压成一条窄带</div>' +
      '<div class="tch-rotbtn">横屏进入</div>';
    /* 「横屏进入」按钮：全屏 + 锁定方向都需要**用户手势**，
       自动那一次（第一根手指落下）常被浏览器拒，所以给一个明确的入口。
       点了会进全屏并锁 landscape —— 之后系统就不会再转回竖屏。 */
    var rotBtn = rot.querySelector(".tch-rotbtn");
    if (rotBtn) {
      var fireLock = function (e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        unlockAudio();
        lockLandscape(true);
      };
      if (hasPointer) rotBtn.addEventListener("pointerdown", fireLock, { passive: false });
      else if (hasTouchEv) rotBtn.addEventListener("touchstart", fireLock, { passive: false });
      rotBtn.addEventListener("click", fireLock, false);
    }
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

    /* 新元素是全新的，贴图与武器状态都要重挂一遍：
       缓存（ART.ok / wstate）还在，但新元素一出生是 clean 的。 */
    applyArt();
    applyWeapon("p1");
    applyWeapon("p2");
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

  function isPortrait() {
    return (global.innerHeight || 0) > (global.innerWidth || 0);
  }

  /* 「手机端默认横屏」：全屏 + 锁 landscape。
     两个 API 都是尽力而为，任何一步失败都不影响游戏（竖屏遮罩仍在，
     玩家点「横屏进入」再来一次）：
       · requestFullscreen **必须在用户手势里同步调用**，而且返回 Promise，
         被拒只能 catch；
       · screen.orientation.lock 只有全屏状态下可用，且目前只有安卓 Chrome
         真支持 —— iOS Safari 完全没有这个 API。
     所以这里不保证成功，只保证「有机会就锁，失败就静默」。
     也绝不能在脚本加载时就调：那不是用户手势，100% 被拒还刷一屏红字。 */
  var lockTried = false;
  function lockLandscape(force) {
    if (lockTried && !force) return false;
    lockTried = true;
    var de = doc.documentElement;
    var fs = de.requestFullscreen || de.webkitRequestFullscreen ||
             de.mozRequestFullScreen || de.msRequestFullscreen;
    var so = global.screen && global.screen.orientation;
    var tryLock = function () {
      if (!so || typeof so.lock !== "function") return false;
      try {
        var p = so.lock("landscape");
        if (p && p.catch) p.catch(function () { /* 被拒 / 不支持：静默 */ });
        return true;
      } catch (e) { return false; }
    };
    if (fs) {
      try {
        var r = fs.call(de);
        if (r && typeof r.then === "function") {
          return r.then(function () { tryLock(); return true; })
                  .catch(function () { return tryLock(); });
        }
      } catch (e) { /* 落到下面纯 lock 的尝试 */ }
    }
    return tryLock();
  }

  function onResize() {
    if (!layer) return;
    var d = computeSize();
    var vh = global.innerHeight || 600;
    /* 按键离底边的距离：留出 iPhone 的 home indicator（34px）再往上一点 */
    var y = Math.max(10, Math.min(28, vh * 0.03));
    layer.style.setProperty("--tch-d", d.toFixed(1) + "px");
    layer.style.setProperty("--tch-y", y.toFixed(1) + "px");

    /* 竖屏：游戏画面会被压成一条窄带，直接给一个「请横过来」的整屏提示。
       遮罩里的「横屏进入」按钮负责把玩家送到横屏（全屏 + 锁方向）。 */
    layer.classList.toggle("tch-portrait", isPortrait());
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

  /* 长按进度的视觉反馈，由 index.html 的 introTick → introSetHoldUI 转达。
     为什么要由外部驱动：真值（已按住多少秒 / 阈值多少秒）只存在于
     index.html 的 introHoldT 与 INTRO_HOLD_SEC，这里再算一遍就成了两份真值，
     迟早对不上（手柄按住时这里也根本没有手指，算不出来）。
     pct 0..1；on = 这一帧是否处于按住状态。 */
  var lastSkipPct = -1;
  function skipProgress(pct, on) {
    if (!skipEl) return;
    var p = Math.max(0, Math.min(1, pct || 0));
    /* 只在真的变化时写样式：每帧写 CSS 变量会让整块重新合成一次 */
    if (p !== lastSkipPct) {
      lastSkipPct = p;
      var h = skipEl.querySelector(".hint");
      if (h) h.style.setProperty("--p", (p * 100).toFixed(1) + "%");
    }
    skipEl.classList.toggle("holding", !!on);
    if (skipLabEl) {
      var txt = (p >= 1) ? "已跳过" : (on ? "继续按住…" : "长按此处跳过");
      if (skipLabEl.textContent !== txt) skipLabEl.textContent = txt;
    }
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
     捕获阶段监听，任何地方的手指都算，不限于按键区。

     ⚠️ 鼠标点击必须排除（pointerType === "mouse"）。
     桌面玩家点一下「开始」就把 everTouched 置上，
     于是对局中凭空冒出一圈手机虚拟键 —— 那是「电脑端出现手机版界面」
     的直接原因。触摸笔记本上用鼠标玩也该保持桌面版。 */
  function armFirstTouch() {
    if (!available()) return;
    var kick = function (e) {
      if (!isFingerEvent(e)) return;
      /* 不管是不是第一次，都记一个「刚有手指落下」的标记 ——
         标题页与结算页的「按任意键」靠它（见 takeTap）。 */
      tapPending = true;
      /* 「手机端默认横屏」：第一根手指落下是全页最早的可靠用户手势，
         在这里顺手尝试全屏 + 锁 landscape。失败完全无副作用（竖屏遮罩
         还在，玩家点「横屏进入」再来一次）。只试一次，之后不再打扰。 */
      if (!everTouched && isPortrait()) lockLandscape(false);
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

    /* 贴图缓存只在这里建（available() 为真才有资格走到这行）：
       桌面玩家一个字节都不读，触屏玩家在标题页就把 10 张盘 / 纹样读进来，
       等真的进对局时不会出现「先看见渐变圆钮、过一会儿才变成青铜盘」。 */
    warmArt();

    /* 强制触屏档（?touch=1）：不等手指，直接当成「已经用手指玩过」。
       手机版入口 mobile.html 就是这样跳进来的 ——
       手机上用户会先点「添加主屏」再启动，没有第一次手指事件，
       虚拟键就永远不出现。 */
    if (urlTouch === true) {
      everTouched = true;
      tapPending = true;
    }

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
    skipProgress: skipProgress,
    takeTap: takeTap,
    anyHeld: anyHeld,
    buzz: buzz,
    init: init,
    /* 攻击键跟随手上武器。由 index.html 的 syncHUD 每帧调一次：
         Touch.setWeapon("p1", wpIconKey(p.weapon.key))
       tag = "p1" | "p2"；iconKey = "wpAxe" / "itJar" / null（空手）。
       同帧幂等（值没变立刻 return），所以每帧调是免费的。
       · 空手（null）或图标没就绪 → 退回「金线 atk 纹样 + 文字刀」
       · Tag 之外的任何值都归一到 p1；非字符串 iconKey 一律当空手
       · Touch 缺席时调用方用 `window.Touch && Touch.setWeapon` 守卫 */
    setWeapon: setWeapon,
    /* 强制触屏档（?touch=1）。给 js/guide.js 用：
       手机版入口 mobile.html 跳过来时，标题页就该显示触屏版图例，
       而不是等进了对局（active() 要求 phase === "play"）才切。 */
    forcedTouch: function () { return urlTouch === true; },
    /* 调试用：看当前是按着什么；overlaps 供自动化验收调用。
       device 字段给自动化断言用：'touch' = 触屏档，'off' = 桌面档。
       art 字段给自动化断言用（这一轮新增）：
         plate / glyph   已加载的盘 / 纹样张数（缺图时是 0，外观退回渐变 + 金字）
         atk            { p1, p2 } 各自当前攻击键是 "armed" 还是 "bare"
         icon           { p1, p2 } 各自当前挂在攻击键上的图标键名（空手为 null） */
    debug: function () {
      return {
        mode: mode, shown: lastShown, pointers: pointers,
        everTouched: everTouched, urlTouch: urlTouch,
        art: {
          plate: ART.nPlate, plateTotal: 2,
          glyph: ART.nGlyph, glyphTotal: 8,
          atk: { p1: wstate.p1.armed ? "armed" : "bare",
                 p2: wstate.p2.armed ? "armed" : "bare" },
          icon: { p1: wstate.p1.icon, p2: wstate.p2.icon }
        }
      };
    },
    overlaps: function () { return checkOverlap(); }
  };
})(window, document);
