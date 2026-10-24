/* =========================================================================
 * intro-video.js — 开场短片播放器（只管「播 + 收 + 暴露进度」）
 * -------------------------------------------------------------------------
 * 对外契约（只暴露 window.IntroVideo 一个对象，键名与签名已冻结）：
 *   IntroVideo.mount(videoEl, overlayEl) -> void           绑定 DOM，只注册监听，不播放，幂等
 *   IntroVideo.play(opts) -> Promise<{ended, skipped, failed, reason}>
 *        opts = { src?:string, maxSeconds?:number, fadeMs?:number }
 *   IntroVideo.skip(reason) -> boolean                     在播 → 收尾并 resolve {skipped:true}
 *   IntroVideo.isPlaying() -> boolean
 *   IntroVideo.progress() -> number                        0..1，没在播返回 0（长按进度环按需取）
 *   IntroVideo.duration() -> number                        秒，元数据未知返回 0
 *   IntroVideo.currentTime() -> number                     秒
 *   IntroVideo.setMuted(bool) -> void
 *   IntroVideo.setMaxSeconds(sec) -> void
 *
 * 分工：长按多久算跳过不归这里 —— index.html 自己读输入、自己画进度环，到点调 skip()。
 * 所以本文件没有键盘 / 手柄 / 指针监听，也没有 requestAnimationFrame 轮询：
 * 状态推进全靠 ended / error / timeupdate 事件，进度由外部按需调 progress() 现算。
 *
 * 降级策略（唯一目标：开场短片绝不许卡住游戏）：
 *   1. 每条失败路径都 resolve 成 {failed:true, reason:"<代码>"}，并且立刻摘掉覆盖层的 on 类，
 *      否则覆盖层会一直盖着，玩家点哪里都没反应。
 *   2. 元数据 3 秒还拿不到就按「已播完」收尾 —— 缺编解码 / file:// 下怪异的 Range 行为
 *      都会让 loadedmetadata 永远不来，等它等于把游戏锁死。
 *   3. play() 被拒（自动播放策略）只报 failed，不重试、不弹提示、不替玩家点任何东西。
 *   4. 所有 DOM / media 调用都包 try：老浏览器、桩对象、已被销毁的节点都不许抛。
 *
 * 不变量：
 *   - 一次播放 = 一个 session 对象 = 一个 Promise；finish() 有 done 闸，只可能 resolve 一次。
 *   - 监听在元素上只绑一次（与模块同生命周期），会话切换靠 active 判空。
 *     反复 add/remove 才是漏解绑、串台的主要来源：上一场的 ended 打在新一场上最致命。
 *   - 开播前一定先把上一场按 skipped 收掉，任何时刻最多只有一个挂着的 Promise。
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------------
     常量
     --------------------------------------------------------------------- */

  /* 覆盖层的显示类名，index.html 的 CSS 认这个；收尾时摘它等于「盖板收起」。 */
  var ON_CLASS = "on";

  /* 元数据兜底：等了这么久还不来就放弃。3 秒是「人已经觉得卡了」的临界点，
     再短会误伤慢机器上的大文件首帧解析。 */
  var META_GUARD_MS = 3000;

  /* 墙钟兜底比 maxSeconds 晚一点点：让 timeupdate 的媒体时间判定先赢，
     这样正常环境下剪点是准的，墙钟只在「卡住不动 / 缓冲死等」时接管。 */
  var MAX_SLACK_MS = 400;

  /* 比较 currentTime 与 maxSeconds 的容差，避开浮点抖动导致的差一帧不触发。 */
  var TIME_EPS = 0.02;

  /* ---------------------------------------------------------------------
     模块状态
     --------------------------------------------------------------------- */

  var videoEl = null;
  var overlayEl = null;

  /* 当前会话；null 就代表「没在播」。所有事件回调都以它为唯一真相。 */
  var active = null;

  /* 是否静音。默认 true：自动播放策略要求静音，项目自己的 Web Audio 音效不受影响。
     setMuted(false) 只对「后续 play()」和「当前元素」生效，不重试已失败的播放。 */
  var wantMuted = true;

  /* setMaxSeconds() 设的默认上限；play(opts.maxSeconds) 给了就按单场的算。 */
  var defaultMax = 0;

  /* 已经绑过监听的元素与它的回调集合，用来保证 mount() 幂等。 */
  var boundEl = null;
  var boundHandlers = null;

  /* ---------------------------------------------------------------------
     小工具
     --------------------------------------------------------------------- */

  /* 数字归一化：接受 number / 数字字符串，非法值、负数、NaN、Infinity 一律回落到默认值。 */
  function toNum(v, dflt) {
    var n;
    if (typeof v === "number") {
      n = v;
    } else if (typeof v === "string" && v) {
      n = parseFloat(v);
    } else {
      return dflt;
    }
    if (!isFinite(n) || n < 0) return dflt;
    return n;
  }

  /* 统一的结果对象。字段固定四个，index.html 直接读，不做真值判断的二次猜测。 */
  function result(ended, skipped, failed, reason) {
    return {
      ended: !!ended,
      skipped: !!skipped,
      failed: !!failed,
      reason: reason || ""
    };
  }

  /* 加 on 类。classList 缺席（老浏览器 / 桩对象）时退回 className 字符串拼接，
     因为「显示/收起覆盖层」这条路径不允许因为 DOM 实现差异而失效。 */
  function addOn() {
    if (!overlayEl) return;
    try {
      if (overlayEl.classList && overlayEl.classList.add) {
        overlayEl.classList.add(ON_CLASS);
        return;
      }
    } catch (e) {
      /* 落到下面的字符串兜底 */
    }
    try {
      var cur = String(overlayEl.className || "");
      var parts = cur.split(/\s+/);
      var i;
      for (i = 0; i < parts.length; i++) {
        if (parts[i] === ON_CLASS) return;
      }
      overlayEl.className = cur ? cur + " " + ON_CLASS : ON_CLASS;
    } catch (e2) {
      /* 连 className 都写不进去：当作覆盖层不存在，不影响播放与 resolve */
    }
  }

  /* 摘 on 类。收尾必调 —— 覆盖层留在屏上等于游戏被冻住。 */
  function removeOn() {
    if (!overlayEl) return;
    try {
      if (overlayEl.classList && overlayEl.classList.remove) {
        overlayEl.classList.remove(ON_CLASS);
        return;
      }
    } catch (e) {
      /* 落到下面的字符串兜底 */
    }
    try {
      var parts = String(overlayEl.className || "").split(/\s+/);
      var out = [];
      var i;
      for (i = 0; i < parts.length; i++) {
        if (parts[i] && parts[i] !== ON_CLASS) out.push(parts[i]);
      }
      overlayEl.className = out.join(" ");
    } catch (e2) {
      /* 同上：写不进去就算了 */
    }
  }

  /* fadeMs 只决定 CSS 过渡多长，不动逻辑时序：覆盖层在 resolve 前就已经摘了 on，
     淡出由 CSS transition 自己播完。这样游戏不会被淡出动画拖住（契约要求不阻塞）。 */
  function setFade(ms) {
    if (!overlayEl || !overlayEl.style) return;
    try {
      overlayEl.style.transitionDuration = ms + "ms";
    } catch (e) {
      /* 没有 style 的桩对象：忽略 */
    }
  }

  /* ---------------------------------------------------------------------
     媒体读数（全部容错：拿不到就是 0，绝不把 NaN 漏给外部）
     --------------------------------------------------------------------- */

  function duration() {
    if (!videoEl) return 0;
    var d = 0;
    try {
      d = videoEl.duration;
    } catch (e) {
      return 0;
    }
    /* NaN = 还没元数据；Infinity = 直播流；0 / 负 = 不可用 */
    if (typeof d !== "number" || !isFinite(d) || d <= 0) return 0;
    return d;
  }

  function currentTime() {
    if (!videoEl) return 0;
    var t = 0;
    try {
      t = videoEl.currentTime;
    } catch (e) {
      return 0;
    }
    if (typeof t !== "number" || !isFinite(t) || t < 0) return 0;
    return t;
  }

  /* 元素上到底有没有源。<source> 子节点也算 —— 那种情况下 src 属性是空的。 */
  function hasSource() {
    if (!videoEl) return false;
    try {
      if (videoEl.getAttribute && videoEl.getAttribute("src")) return true;
    } catch (e) {
      /* 忽略 */
    }
    try {
      if (typeof videoEl.currentSrc === "string" && videoEl.currentSrc) return true;
    } catch (e2) {
      /* 忽略 */
    }
    try {
      if (typeof videoEl.src === "string" && videoEl.src) return true;
    } catch (e3) {
      /* 忽略 */
    }
    try {
      if (videoEl.querySelector && videoEl.querySelector("source")) return true;
    } catch (e4) {
      /* 忽略 */
    }
    return false;
  }

  /* ---------------------------------------------------------------------
     会话收尾（幂等）
     --------------------------------------------------------------------- */

  function clearTimers(s) {
    if (!s) return;
    if (s.timerMax) {
      try { clearTimeout(s.timerMax); } catch (e) { /* 忽略 */ }
      s.timerMax = 0;
    }
    if (s.timerMeta) {
      try { clearTimeout(s.timerMeta); } catch (e2) { /* 忽略 */ }
      s.timerMeta = 0;
    }
  }

  /* 唯一的出口。done 闸保证 resolve 只落一次，也保证 pause / 摘类不会重复执行。 */
  function finish(s, res) {
    if (!s || s.done) return;
    s.done = true;
    if (active === s) active = null;
    clearTimers(s);

    /* 先 pause 再摘类：反过来的话覆盖层消失后画面可能还在动一下 */
    try {
      if (videoEl && typeof videoEl.pause === "function") videoEl.pause();
    } catch (e) {
      /* 元素已销毁 / 桩对象没有 pause：忽略，反正已经要收尾了 */
    }
    removeOn();

    try {
      s.resolve(res);
    } catch (e2) {
      /* resolve 本身不会抛；这里只是兜住被外部包了一层的情况 */
    }
  }

  /* ---------------------------------------------------------------------
     事件监听：每个 <video> 只绑一次
     --------------------------------------------------------------------- */

  function makeHandlers() {
    return {
      /* 自然播完 */
      ended: function () {
        if (active) finish(active, result(true, false, false, "ended"));
      },

      /* 解码失败 / 源 404 / 容器不支持：都从这里出来 */
      error: function () {
        if (active) finish(active, result(false, false, true, "media-error"));
      },

      /* 媒体时间剪点。不做定时器轮询，只在播放推进时比一次。
         比墙钟准：暂停 / 变速 / 卡缓冲时不会提前砍。 */
      timeupdate: function () {
        var s = active;
        if (!s || !(s.maxSeconds > 0)) return;
        if (currentTime() >= s.maxSeconds - TIME_EPS) {
          finish(s, result(true, false, false, "max-seconds"));
        }
      },

      /* 元数据到了就撤掉兜底闸，不必再等 */
      meta: function () {
        var s = active;
        if (!s || !s.timerMeta) return;
        try { clearTimeout(s.timerMeta); } catch (e) { /* 忽略 */ }
        s.timerMeta = 0;
      }
    };
  }

  function attach(el) {
    if (!el || typeof el.addEventListener !== "function") return null;
    var hs = makeHandlers();
    try {
      el.addEventListener("ended", hs.ended, false);
      el.addEventListener("error", hs.error, false);
      el.addEventListener("timeupdate", hs.timeupdate, false);
      el.addEventListener("loadedmetadata", hs.meta, false);
      el.addEventListener("durationchange", hs.meta, false);
    } catch (e) {
      return null;
    }
    return hs;
  }

  function detach(el, hs) {
    if (!el || !hs || typeof el.removeEventListener !== "function") return;
    try {
      el.removeEventListener("ended", hs.ended, false);
      el.removeEventListener("error", hs.error, false);
      el.removeEventListener("timeupdate", hs.timeupdate, false);
      el.removeEventListener("loadedmetadata", hs.meta, false);
      el.removeEventListener("durationchange", hs.meta, false);
    } catch (e) {
      /* 忽略 */
    }
  }

  /* ---------------------------------------------------------------------
     mount
     --------------------------------------------------------------------- */

  /* 移动端不设 playsinline 会被系统全屏劫持接管：覆盖层、进度环、长按全都没了。 */
  function prepare(v) {
    try { v.playsInline = true; } catch (e) { /* 老 Safari 只认属性名 */ }
    try {
      if (v.setAttribute) v.setAttribute("playsinline", "");
    } catch (e2) {
      /* 忽略 */
    }
    try {
      /* 只在页面没指定时补 preload：别覆盖作者想要的省流量策略。
         自动的话元数据来得快，3 秒兜底闸基本不会真触发。 */
      if (v.setAttribute && (!v.getAttribute || !v.getAttribute("preload"))) {
        v.setAttribute("preload", "auto");
      }
    } catch (e3) {
      /* 忽略 */
    }
    try { v.muted = wantMuted; } catch (e4) { /* 忽略 */ }
  }

  function mount(v, o) {
    try {
      if (o) overlayEl = o;

      if (v && v !== videoEl) {
        /* 换了一支 <video>：上一场如果还在播，先按 skipped 收掉，不留悬空 Promise */
        if (active) finish(active, result(false, true, false, "remount"));
        if (boundEl && boundHandlers) detach(boundEl, boundHandlers);
        videoEl = v;
        boundEl = v;
        boundHandlers = attach(v);
        prepare(v);
      } else if (v) {
        /* 同一支元素重复 mount：只重确认一遍 playsinline，监听不重复绑 */
        prepare(v);
      }
    } catch (e) {
      /* mount 失败等价于「这局没有片头」，play() 会立刻报 no-video 并摘类 */
    }
  }

  /* ---------------------------------------------------------------------
     play
     --------------------------------------------------------------------- */

  /* 元数据兜底闸：只有「还不知道时长」时才上，已知时长就没必要等。 */
  function armMetaGuard(s) {
    if (duration() > 0) return;
    if (s.timerMeta) return;
    s.timerMeta = setTimeout(function () {
      s.timerMeta = 0;
      if (active !== s) return;
      /* 元数据始终不来：当已播完。宁可少一段片头，也不能把玩家锁在覆盖层里。 */
      finish(s, result(true, false, false, "no-metadata"));
    }, META_GUARD_MS);
  }

  /* 墙钟兜底闸：只防「播放卡住、timeupdate 不再来」这种病态情况。 */
  function armMaxTimer(s) {
    if (!(s.maxSeconds > 0)) return;
    if (s.timerMax) {
      try { clearTimeout(s.timerMax); } catch (e) { /* 忽略 */ }
      s.timerMax = 0;
    }
    s.timerMax = setTimeout(function () {
      s.timerMax = 0;
      if (active !== s) return;
      finish(s, result(true, false, false, "max-seconds"));
    }, s.maxSeconds * 1000 + MAX_SLACK_MS);
  }

  function play(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var s = null;
      try {
        /* 上一场还在播：先收掉。这是契约要求的「不能两个 Promise 同时挂着」，
           也是最容易漏的一条 —— 重开游戏时上一场的 Promise 会永远 pending。 */
        if (active) finish(active, result(false, true, false, "restarted"));

        s = {
          resolve: resolve,
          done: false,
          maxSeconds: toNum(opts.maxSeconds, defaultMax),
          timerMax: 0,
          timerMeta: 0
        };
        active = s;

        /* 没有可播的元素：直接判失败，覆盖层连显示都不必（addOn 在下面，走不到这里） */
        if (!videoEl || typeof videoEl.play !== "function") {
          finish(s, result(false, false, true, "no-video"));
          return;
        }

        /* 换源。换源后 load() 一次是必须的：上一条源留下的 error / readyState
           会跟着新源一起被读，表现为「明明换了新片还是立刻 media-error」。 */
        if (typeof opts.src === "string" && opts.src) {
          try { videoEl.src = opts.src; } catch (e1) { /* 忽略 */ }
          if (typeof videoEl.load === "function") {
            try { videoEl.load(); } catch (e2) { /* 忽略 */ }
          }
        }

        /* 到这一步才发现没源（既没传 src，DOM 上也没有）：报 no-src 收场 */
        if (!hasSource()) {
          finish(s, result(false, false, true, "no-src"));
          return;
        }

        /* 1) 先让覆盖层显示出来，后面的失败路径负责摘掉它 */
        addOn();
        var fadeMs = toNum(opts.fadeMs, 0);
        if (fadeMs > 0) setFade(fadeMs);

        /* 2) 回到 0 并静音。顺序不能反：先静音再回到 0，某些实现会把 seek 当成重新起播 */
        try { videoEl.muted = wantMuted; } catch (e3) { /* 忽略 */ }
        try { videoEl.currentTime = 0; } catch (e4) { /* 忽略 */ }

        /* 元素上残留的 media error（上次 404 留下的）也要走失败路径，
           否则 play() 会返回一个永远不 resolve 的 Promise。 */
        try {
          if (videoEl.error) {
            finish(s, result(false, false, true, "media-error"));
            return;
          }
        } catch (e5) {
          /* 读不到 error 就当没有问题，继续播 */
        }

        /* 3) 起播。老浏览器 play() 返回 undefined 是正常起播，不能当失败；
           同步抛错才是真的拒绝（旧版 Safari 的 NotAllowedError 是同步抛的）。 */
        var p = null;
        var threw = false;
        try {
          p = videoEl.play();
        } catch (e6) {
          threw = true;
        }
        if (threw) {
          finish(s, result(false, false, true, "play-rejected"));
          return;
        }

        /* 两道兜底闸要在 play() 之后上：起播失败时下面立刻收尾，闸白开一次也没关系，
           finish() 会连同闸一起清掉。 */
        armMaxTimer(s);
        armMetaGuard(s);

        /* 4) 等起播结果。play() 返回 undefined 就不包 —— 没有 Promise 可等，
           收尾交给 ended / error / 两道闸。 */
        if (p && typeof p.then === "function") {
          p.then(
            function () {
              /* 起播成功，后续全由事件驱动，这里不留任何定时器 */
            },
            function () {
              /* 被自动播放策略拒了：只报 failed 并摘类，不弹框、不重试 */
              if (active === s) finish(s, result(false, false, true, "play-rejected"));
            }
          );
        }
      } catch (e7) {
        /* 兜到底：任何没预料到的实现差异都在这里变成一次失败收尾，绝不冒泡 */
        if (s) {
          finish(s, result(false, false, true, "exception"));
        } else {
          try {
            resolve(result(false, false, true, "exception"));
          } catch (e8) {
            /* 忽略 */
          }
        }
      }
    });
  }

  /* ---------------------------------------------------------------------
     skip（长按判定在 index.html，这里只负责收）
     --------------------------------------------------------------------- */

  function skip(reason) {
    if (!active) return false;
    finish(active, result(false, true, false,
      (typeof reason === "string" && reason) ? reason : "skipped"));
    return true;
  }

  function isPlaying() {
    return !!active;
  }

  /* 长按进度环用。现算不缓存：缓存就要定时器，等于在游戏循环旁边再挂一个循环。 */
  function progress() {
    if (!active) return 0;
    var cap = duration();
    var max = active.maxSeconds;
    if (max > 0 && (cap <= 0 || max < cap)) cap = max;
    if (!(cap > 0)) return 0;
    var p = currentTime() / cap;
    if (!isFinite(p)) return 0;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  /* ---------------------------------------------------------------------
     设置项
     --------------------------------------------------------------------- */

  /* 静音只影响这条片子的音频，不碰项目自己的 Web Audio 总线。 */
  function setMuted(bool) {
    wantMuted = !!bool;
    if (!videoEl) return;
    try {
      videoEl.muted = wantMuted;
    } catch (e) {
      /* 忽略 */
    }
  }

  /* 运行中改上限要重新装闸，否则旧闸还在按老时间倒计时。
     0 表示不设上限，等 ended 自然收尾。 */
  function setMaxSeconds(sec) {
    var n = toNum(sec, 0);
    defaultMax = n;
    if (!active) return;

    active.maxSeconds = n;
    if (active.timerMax) {
      try { clearTimeout(active.timerMax); } catch (e) { /* 忽略 */ }
      active.timerMax = 0;
    }
    if (n > 0 && currentTime() >= n - TIME_EPS) {
      finish(active, result(true, false, false, "max-seconds"));
      return;
    }
    armMaxTimer(active);
  }

  /* ---------------------------------------------------------------------
     导出
     --------------------------------------------------------------------- */

  /* 只挂这一份对象、只有这九个键。多了就等于改了契约，接线方会照旧实现读。 */
  global.IntroVideo = {
    mount: mount,
    play: play,
    skip: skip,
    isPlaying: isPlaying,
    progress: progress,
    duration: duration,
    currentTime: currentTime,
    setMuted: setMuted,
    setMaxSeconds: setMaxSeconds
  };
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this));
