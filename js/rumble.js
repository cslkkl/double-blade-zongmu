/* =========================================================================
 * rumble.js — 手柄震动（Gamepad Haptics）
 *
 * 用途：开场短片开始播时轻震一下、跳过时短震、挨打时震一下。
 * 对外只挂一个对象：window.Rumble（契约冻结，勿改字段名 / 参数序）。
 *
 *   window.Rumble.supported(padIndex) -> boolean
 *     // 该手柄是否有振动能力；padIndex 省略 = 任一有则 true
 *
 *   window.Rumble.pulse(opts) -> boolean
 *     // opts = { strong: 0..1 (默认 0.6), weak: 0..1 (默认 0.3),
 *     //          ms: 毫秒 (默认 300), pad: number|"all"|undefined (默认 "all") }
 *     // 返回是否至少成功下发了一次。
 *     // 同一手柄已在震：强度「取较大值」、时长「取较大值」，不叠加，
 *     // 免得连击时越震越糊、越震越久。
 *
 *   window.Rumble.stop(pad) -> void        // pad 同上，省略 = 全部停
 *   window.Rumble.setEnabled(bool) -> void // 总开关，默认 true
 *   window.Rumble.isEnabled() -> boolean
 *
 * ---------------------------------------------------------------------------
 * 降级策略（任何一条不满足都静默退成空操作，本模块绝不抛异常）
 * ---------------------------------------------------------------------------
 *   1. navigator.getGamepads 不存在（老 Safari / 非浏览器环境）→ supported 恒 false。
 *   2. 页面还没有用户手势（Chrome / Safari 要求）→ playEffect 会 reject。
 *      捕获后当「没震」，并给该槽位加退避，绝不定时重试刷控制台。
 *   3. 手柄没有 vibrationActuator（Firefox 部分版本、Safari 全系）→ 只尝试
 *      pad.hapticActuators 那套老 API（pulse / reset），失败即放弃。
 *   4. 手柄根本没有振动马达（有线手柄、虚拟手柄、键盘模拟）→ pulse 返回 false。
 *   5. 振动接口同步抛错（参数不认识 / 实现有 bug）→ catch 掉，走老 API 或放弃。
 *
 * ---------------------------------------------------------------------------
 * 两条性能纪律（踩过的坑）
 * ---------------------------------------------------------------------------
 *   - 热路径不建对象：震动参数对象只在模块初始化时建一次，之后每次 pulse
 *     就地改字段。playEffect 的参数是 WebIDL 字典，调用当帧同步取值，
 *     复用同一个对象是安全的。
 *   - 不缓存 Gamepad：pulse / stop / supported 每次都现读 getGamepads()。
 *     切标签页、拔线、手柄换槽位都会让缓存变僵尸，留着就会「以为在震」，
 *     于是下一次 pulse 只延长不重发，玩家手里一点感觉都没有。
 *
 * 无外部依赖，无 import / export，file:// 双击可跑。
 * ========================================================================= */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------- 常量 */

  var DEF_STRONG = 0.6;
  var DEF_WEAK = 0.3;
  var DEF_MS = 300;

  var MAX_PADS = 8;          /* 浏览器 Gamepad 槽位上限（规范建议 4，留余量） */
  var MAX_MS = 60000;        /* 单次 duration 上限，防调用方把 ms 写成天文数字 */
  var BASE_BACKOFF = 250;    /* playEffect reject 后的最小退避（毫秒） */
  var MAX_BACKOFF = 30000;   /* 退避上限：再惨也每 30 秒才试一次 */

  /* 空回调：给 Promise 挂 then 时必须两端都接，否则 rejection 会漏成未捕获 */
  function NOOP() {}

  /* ---------------------------------------------------------------- 工具 */

  function clamp01(v) {
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  function num(v, dflt) {
    return (typeof v === "number" && isFinite(v)) ? v : dflt;
  }

  /* ------------------------------------------------------------ 内部状态

     每个槽位一份「当前这次震动还震到什么时候」。平行数组而不是对象数组：
     pulse 只写数字，不新建对象。
     注意这里记的只是「我们下发过的 effect」的账，浏览器抽屉里怎么执行不归我们管，
     所以 stop / 切标签页 / 拔线 都要能把账本清掉。 */

  var enabled = true;

  var endAt = [];        /* 绝对时间戳：这次震动结束的时刻 */
  var curStrong = [];    /* 当前下发过的低频强度 */
  var curWeak = [];      /* 当前下发过的高频强度 */
  var padId = [];        /* 槽位上的手柄 id，用来发现「换手柄了」 */
  var fails = [];        /* 连续 reject 次数，决定退避长度 */
  var backoffUntil = [];
  var onOkCb = [];       /* 每槽位预建的成功 / 失败回调（见下） */
  var onFailCb = [];

  (function initSlots() {
    for (var i = 0; i < MAX_PADS; i++) {
      endAt[i] = 0;
      curStrong[i] = 0;
      curWeak[i] = 0;
      padId[i] = "";
      fails[i] = 0;
      backoffUntil[i] = 0;
      /* 回调在初始化时就按槽位建好，pulse 热路径只取引用。
         否则每次 pulse 都要新建两个闭包 —— 那就是在热路径里建对象。 */
      onOkCb[i] = (function (k) {
        return function () { noteOk(k); };
      })(i);
      onFailCb[i] = (function (k) {
        return function () { noteFail(k); };
      })(i);
    }
  })();

  /* 复用同一个参数对象，pulse 热路径不产生垃圾 */
  var effArg = { duration: 0, startDelay: 0, strongMagnitude: 0, weakMagnitude: 0 };

  /* ------------------------------------------------------------ 读手柄

     现读，不缓存。拿不到就返回 null，上层一律当「没手柄」处理。 */

  function getPads() {
    var nav = global.navigator;
    if (!nav || typeof nav.getGamepads !== "function") return null;
    var pads;
    try {
      pads = nav.getGamepads();
    } catch (e) {
      return null;                 /* 某些实现会在无权限/无焦点时直接 throw */
    }
    return pads || null;
  }

  function getPad(idx) {
    var pads = getPads();
    if (!pads) return null;
    var pad = null;
    if (idx >= 0 && idx < pads.length) pad = pads[idx];
    if (!pad) {
      /* 槽位与 pad.index 对不上时按 index 兜底找一遍 */
      for (var i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].index === idx) { pad = pads[i]; break; }
      }
    }
    return pad || null;
  }

  function hasDual(pad) {
    return !!(pad && pad.vibrationActuator &&
              typeof pad.vibrationActuator.playEffect === "function");
  }

  function hasLegacy(pad) {
    var list = pad && pad.hapticActuators;
    return !!(list && typeof list.length === "number" && list.length > 0);
  }

  function canBuzz(pad) {
    return hasDual(pad) || hasLegacy(pad);
  }

  /* ------------------------------------------------------------ 账本操作 */

  function clearSlot(idx) {
    if (!(idx >= 0 && idx < MAX_PADS)) return;
    endAt[idx] = 0;
    curStrong[idx] = 0;
    curWeak[idx] = 0;
  }

  function clearAll() {
    for (var i = 0; i < MAX_PADS; i++) clearSlot(i);
  }

  function noteOk(idx) {
    if (!(idx >= 0 && idx < MAX_PADS)) return;
    fails[idx] = 0;
    backoffUntil[idx] = 0;
  }

  /* 下发失败：清账 + 退避。
     退避是为了「页面还没用户手势」时不要把控制台刷满，但也不能永久放弃 ——
     玩家点过一下之后 Chrome 就允许震了，所以退避到点会再试。 */
  function noteFail(idx) {
    if (!(idx >= 0 && idx < MAX_PADS)) return;
    var n = fails[idx] + 1;
    if (n > 20) n = 20;            /* 计数封顶，别让指数退避算爆 */
    fails[idx] = n;
    var wait = BASE_BACKOFF;
    for (var i = 1; i < n && wait < MAX_BACKOFF; i++) wait *= 2;
    if (wait > MAX_BACKOFF) wait = MAX_BACKOFF;
    backoffUntil[idx] = Date.now() + wait;
    clearSlot(idx);                /* 没震成，别记账说「在震」 */
  }

  /* 取预建回调。槽位超出 MAX_PADS（浏览器给了更多手柄）时退到共享空回调，
     依然不新建对象。 */
  function okCbOf(idx) {
    return (idx >= 0 && idx < MAX_PADS) ? onOkCb[idx] : NOOP;
  }

  function failCbOf(idx) {
    return (idx >= 0 && idx < MAX_PADS) ? onFailCb[idx] : NOOP;
  }

  /* ------------------------------------------------------------ 下发震动

    返回 boolean = 有没有真的把 effect 交给浏览器。
    注意 reject 是异步的，这里只能保证「同步没抛」，reject 由 noteFail 收尾。 */

  function fire(pad, idx, strong, weak, dur) {
    var act = pad.vibrationActuator;
    if (act && typeof act.playEffect === "function") {
      effArg.duration = dur;
      effArg.startDelay = 0;
      effArg.strongMagnitude = strong;
      effArg.weakMagnitude = weak;
      try {
        var ret = act.playEffect("dual-rumble", effArg);
        if (ret && typeof ret.then === "function") {
          /* 必须接 reject：Chrome 无用户手势时 reject，没人接就是
             unhandledrejection（控制台红字 + 调试器噪音）。
             回调用初始化时预建的，这里不新建闭包。 */
          ret.then(okCbOf(idx), failCbOf(idx));
        } else {
          noteOk(idx);
        }
        return true;
      } catch (e) {
        noteFail(idx);             /* 同步抛错：实现不认参数或接口已废 */
      }
    }
    /* 降级：hapticActuators 老 API。只在没有 vibrationActuator、
       或它当场失败时走，不当主路径。 */
    return fireLegacy(pad, idx, strong, weak, dur);
  }

  function fireLegacy(pad, idx, strong, weak, dur) {
    var list = pad.hapticActuators;
    if (!list || typeof list.length !== "number" || list.length === 0) return false;
    var amp = strong > weak ? strong : weak;   /* 老 API 只有一个强度，取大的 */
    var touched = false;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (!a || typeof a.pulse !== "function") continue;
      try {
        var ret = a.pulse(amp, dur);
        if (ret && typeof ret.then === "function") {
          ret.then(NOOP, failCbOf(idx));
        }
        touched = true;
      } catch (e) {
        /* 这个马达不支持就跳过，别连带整个手柄都不震 */
      }
    }
    if (touched) noteOk(idx);
    return touched;
  }

  /* 停：duration 0 + 强度 0，两条路都试一遍（有的实现只认其中一条） */
  function fireZero(pad) {
    var act = pad.vibrationActuator;
    if (act && typeof act.playEffect === "function") {
      effArg.duration = 0;
      effArg.startDelay = 0;
      effArg.strongMagnitude = 0;
      effArg.weakMagnitude = 0;
      try {
        var ret = act.playEffect("dual-rumble", effArg);
        if (ret && typeof ret.then === "function") ret.then(NOOP, NOOP);
      } catch (e) { /* 停不下来也只能算了，账本已经清了 */ }
    }
    var list = pad.hapticActuators;
    if (list && typeof list.length === "number") {
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a) continue;
        try {
          if (typeof a.reset === "function") {
            var r = a.reset();
            if (r && typeof r.then === "function") r.then(NOOP, NOOP);
          } else if (typeof a.pulse === "function") {
            var p = a.pulse(0, 0);
            if (p && typeof p.then === "function") p.then(NOOP, NOOP);
          }
        } catch (e) { /* 同上 */ }
      }
    }
  }

  /* ------------------------------------------------------------ 单手柄 pulse

     「取较大值 + 延长时长」的全部逻辑在这里：
       剩余 = 账本里的结束时刻 - 现在
       duration = max(请求 ms, 剩余)        ← 绝对毫秒数，所以要整条重发
       强度     = max(请求强度, 当前强度)   ← 大的一记不会被打断，小的也不叠加 */

  function pulseOne(pad, t, strong, weak, ms) {
    var idx = pad.index;
    if (typeof idx !== "number" || !isFinite(idx) || idx < 0) return false;
    idx = idx | 0;

    var tracked = idx < MAX_PADS;

    if (tracked) {
      /* 槽位换手柄（拔插 / 换人）：旧账本作废，退避也一并清掉 */
      var id = pad.id || "";
      if (padId[idx] !== id) {
        padId[idx] = id;
        clearSlot(idx);
        fails[idx] = 0;
        backoffUntil[idx] = 0;
      }
      if (t < backoffUntil[idx]) return false;   /* 刚 reject 过，退避中 */
    }

    if (!canBuzz(pad)) return false;

    /* 还在震 = 账本里的结束时刻还没到；已经震完就把强度基线归零，
       否则「上一次的残影」会一直把新的一记顶成高强度 */
    var remain = (tracked && endAt[idx] > t) ? (endAt[idx] - t) : 0;
    var baseS = 0, baseW = 0;
    if (remain > 0) {
      baseS = curStrong[idx] || 0;
      baseW = curWeak[idx] || 0;
    } else if (tracked) {
      curStrong[idx] = 0;
      curWeak[idx] = 0;
    }

    var dur = ms > remain ? ms : remain;
    if (!(dur > 0)) return false;      /* 时长 0 = 没有可下发的东西，别发空包 */
    var s = strong > baseS ? strong : baseS;
    var w = weak > baseW ? weak : baseW;

    if (!fire(pad, idx, s, w, dur)) return false;

    if (tracked) {
      curStrong[idx] = s;
      curWeak[idx] = w;
      endAt[idx] = t + dur;
    }
    return true;
  }

  /* ------------------------------------------------------------ 公开 API */

  function supported(padIndex) {
    if (typeof padIndex === "number" && isFinite(padIndex)) {
      var one = getPad(padIndex | 0);
      return !!one && canBuzz(one);
    }
    var pads = getPads();
    if (!pads) return false;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && canBuzz(pads[i])) return true;
    }
    return false;
  }

  function pulse(opts) {
    if (!enabled) return false;

    var strong = clamp01(num(opts ? opts.strong : undefined, DEF_STRONG));
    var weak = clamp01(num(opts ? opts.weak : undefined, DEF_WEAK));
    var ms = num(opts ? opts.ms : undefined, DEF_MS);
    if (!(ms > 0)) ms = 0;
    if (ms > MAX_MS) ms = MAX_MS;

    var target = opts ? opts.pad : undefined;
    var all = (target === undefined || target === null || target === "all");
    var want = -1;
    if (!all) {
      if (typeof target !== "number" || !isFinite(target)) return false;
      want = target | 0;
    }

    var pads = getPads();
    if (!pads) return false;

    var t = Date.now();
    var sent = false;
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad) continue;
      if (!all && pad.index !== want) continue;
      if (pulseOne(pad, t, strong, weak, ms)) sent = true;
    }
    return sent;
  }

  function stop(padArg) {
    var all = (padArg === undefined || padArg === null || padArg === "all");
    var want = -1;
    if (!all) {
      if (typeof padArg !== "number" || !isFinite(padArg)) return;
      want = padArg | 0;
    }

    /* 先清账：哪怕手柄已经掉了、getGamepads 里找不到，也不能留着
       「以为在震」的时间戳，否则回来后第一次 pulse 只会延长、不会重发 */
    if (all) clearAll(); else clearSlot(want);

    var pads = getPads();
    if (!pads) return;
    for (var i = 0; i < pads.length; i++) {
      var pad = pads[i];
      if (!pad) continue;
      if (!all && pad.index !== want) continue;
      fireZero(pad);
    }
  }

  function setEnabled(v) {
    var next = !!v;
    if (!next && enabled) stop();   /* 关总开关顺手把正在震的停掉，别留在半路 */
    enabled = next;
  }

  function isEnabled() {
    return enabled;
  }

  /* ------------------------------------------------------------ 生命周期挂钩

     切标签页 / 拔线都会让「我们以为在震」这件事变成假的，所以必须主动清账。
     这里不主动 stop：浏览器自己会停，主动下发反而可能在无焦点时 reject。 */

  (function hook() {
    if (!global.addEventListener) return;
    try {
      global.addEventListener("visibilitychange", function () {
        if (global.document && global.document.hidden) clearAll();
      });
      global.addEventListener("gamepaddisconnected", function (ev) {
        var pad = ev && ev.gamepad;
        if (pad && typeof pad.index === "number") clearSlot(pad.index | 0);
      });
      global.addEventListener("gamepadconnected", function (ev) {
        var pad = ev && ev.gamepad;
        if (!pad || typeof pad.index !== "number") return;
        var idx = pad.index | 0;
        if (idx >= 0 && idx < MAX_PADS) {
          fails[idx] = 0;            /* 新手柄可能真能震，退避清零重试一次 */
          backoffUntil[idx] = 0;
        }
      });
    } catch (e) {
      /* 没有事件模型的宿主（比如某些 WebView）就什么都不挂 */
    }
  })();

  /* ---------------------------------------------------------------- 导出 */

  global.Rumble = {
    supported: supported,
    pulse: pulse,
    stop: stop,
    setEnabled: setEnabled,
    isEnabled: isEnabled
  };

})(window);
