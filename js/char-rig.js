/* =====================================================================
   角色渲染 · 逐帧动画播放
   ---------------------------------------------------------------------
   对外契约（保持不变）：
     window.CharArt = { draw: draw, ready: ready, HEIGHT: 252 };

   数据来源：
     window.ANIM = {
       idle | walk | attack | jump | hurt | whirl | throw | bow | dead :
       { frames, fps, loop, w, h, anchorX, footY, files: [url, ...] }
     }
     window.IMG.pose0  ← window.ANIM 缺失（或帧图全部不可用）时的降级素材
     window.ANIM_HOLD  ← 手持不同武器的单帧站立图（可选，缺省不影响老行为）：
       { short | dagger | sword | axe | hammer | spear | bow | rock | blade | jar | bell :
         { w, h, anchorX, footY, scaleFix, file } }
       只在「站定」这一档替换 idle；走/跳/受伤/旋风/死亡一律沿用动画。
       键靠 p.weapon.key 实时查表、不缓存 —— 换手后下一帧就换图；
       该武器没有持械帧 / 图还没就绪 → 落回 idle 动画，不白屏。

     window.WEAPON_ATTACK ← 每把武器专属的出招姿态（可选，缺省不影响老行为）：
       { short | dagger | sword | axe | hammer | spear | bow | rock | blade | jar :
         { w, h, anchorX, footY, scaleFix, file } }
       字段语义与 ANIM_HOLD 完全一致，是同一条流水线切出来的单帧。
       只在「挥砍中」这一档替换 attack / attack-heavy / attack-thrust：
       attack 族那三套帧不管手上拿什么都长同一副样子，这正是「换了武器、
       手上还是老模型」的根因。有专属姿态就画专属姿态，没有才回落动画 clip。
       挥动感由 swingT / swingDur 推导（前冲 + 轻微拉伸与旋转），不走帧序列。

     window.WEAPON_ATTACK_CLIP ← 同一件事的多帧版本（可选，优先于单帧）：
       { short | ... :
         { frames, w, h, anchorX, footY, scaleFix, files: [url, ...] } }
       与 ANIM 的 clip 同形，但 anchorX 是**数组**：挥砍时身体会前后移，
       逐帧取中点才不会左右漂。scaleFix 是**一个数**（四帧共用同一画布），
       逐帧各算会让角色在连击里忽大忽小。
       帧号与 attack 族一样由 swingT / swingDur 推导，共用同一条时间轴，
       所以「有多少帧」不影响判定时机。

   降级：ANIM 不存在 / 该 clip 不存在 / 帧图全没加载完 → 回落到旧的
        「单张精灵 + 变换动画」，不报错、不白屏。

   可选字段：p.__alphaMul（数值，缺省 1）—— 通用 alpha 系数，调用方可以让
        某个角色整体变淡；本模块把该因子乘进自身的 alpha（外层的
        ctx.globalAlpha 会被覆盖，所以必须在这里乘）。
        当前没有调用方（原来的「前景遮挡淡出」已随遮挡层删除），
        保留为通用钩子，任何新需求直接设这个字段即可。

   可选字段（均缺省 0 / null，不影响老调用方）：
     p.pickupT     > 0 时播 pickup（拾取动作，调用方置 0.3 秒后自己倒数）
     p.__forceClip 攻击态里的替代 clip 名（attack-heavy / attack-thrust），
                   只认 ANIM 里真实存在的 clip，不存在则回落 attack；
                   调用方收招时清空，本模块只在 swingT > 0 时读它。
   ===================================================================== */
(function () {
  "use strict";

  /* ---------- 对外常量 ---------- */
  var TARGET_H = 252;              // 屏幕上角色高度

  /* ---------- 降级素材（旧逻辑）---------- */
  var SRC_W = 445, SRC_H = 861;
  var PIVOT_X = 300 / SRC_W;       // 身体中线（不含斜出的刀）

  /* ---------- 动画 clip 清单（预热用）---------- */
  var CLIPS = ["dead", "whirl", "bow", "throw", "hurt", "jump",
               "attack", "attack-heavy", "attack-thrust", "pickup", "walk", "idle"];

  /* ---------- 帧图缓存：clip -> [Image] ---------- */
  var frameCache = {};             // 只在 warm() 里建 Image，draw 热路径只读
  var warmed = false;

  /* ---------- 持械站立帧缓存：weapon.key -> Image ---------- */
  var holdCache = {};              // 只在 warmHold() 里建 Image，draw 热路径只读
  var holdWarmed = false;          // 持械帧独立就位标记（ANIM 缺席也照样试着建）

  /* ---------- 武器专属出招帧缓存：weapon.key -> Image ---------- */
  var atkCache = {};
  var atkWarmed = false;

  /* ---------- 武器出招序列缓存：weapon.key -> [Image] ---------- */
  var atkClipCache = {};
  var atkClipWarmed = false;

  /* ---------- 武器持械行走序列缓存：weapon.key -> [Image] ---------- */
  var walkClipCache = {};
  var walkClipWarmed = false;

  /* 步行一个完整循环覆盖多少「引导位移」。
     p.walk 在 index.html 里按 `+= |vx| * dt * 0.024` 累加，所以
       1 单位 walk ≈ 41.7px 位移。
     跑动时 vx ≈ 470 → walk 增长 ≈ 11.3 单位/秒。
     WALK_CYCLE = 3.6 → 3.1 循环/秒 × 4 帧 ≈ 12.6 帧/秒，是眼睛能看清的步频。
     早先取 1.44（≈31 帧/秒）时，4 帧在 1/8 秒内翻完 —— 看起来就是「没有
     动画、人在平移」，因为根本来不及看清任何一帧。改小这个数 = 步频变快，
     改大 = 步子变慢；它同时决定「一秒走多远算一个循环」。 */
  var WALK_CYCLE = 3.6;

  var pollTimer = 0;
  var pollTries = 0;

  /* ---------- 上色缓存：clip#frame|color|尺寸 -> canvas ---------- */
  var tintCache = {};

  /* ---------- 降级路径的上色缓存（旧 key 规则，独立存放）---------- */
  var legacyTint = {};

  var anyReady = false;            // 是否已有可用帧图（ready() 快路径）

  /* ================================================================== */
  /*  数据取用                                                          */
  /* ================================================================== */

  function animData() {
    return window.ANIM || null;
  }

  function imageOk(img) {
    return !!(img && img.complete && img.naturalWidth > 0);
  }

  /* 某个 clip 的配置；不存在或没有帧图则返回 null */
  function clipDef(name) {
    var A = animData();
    if (!A) return null;
    var d = A[name];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  /* 持械站立：某把武器的静帧配置；该武器没有持械帧则返回 null */
  function holdDef(key) {
    if (!key) return null;
    var H = window.ANIM_HOLD;
    if (!H) return null;
    var d = H[key];
    if (!d || !d.file) return null;
    return d;
  }

  /* 武器专属出招：某把武器的一张出招姿态；没有则返回 null */
  function atkDef(key) {
    if (!key) return null;
    var A = window.WEAPON_ATTACK;
    if (!A) return null;
    var d = A[key];
    if (!d || !d.file) return null;
    return d;
  }

  /* 武器出招序列：某把武器的多帧出招；没有则返回 null */
  function atkClipDef(key) {
    if (!key) return null;
    var C = window.WEAPON_ATTACK_CLIP;
    if (!C) return null;
    var d = C[key];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  /* 武器持械行走序列：某把武器的多帧行走；没有则返回 null */
  function walkClipDef(key) {
    if (!key) return null;
    var C = window.WEAPON_WALK_CLIP;
    if (!C) return null;
    var d = C[key];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  /* ============ 每把武器一套独立动作（统一入口） ============
     window.WEAPON_CLIP[key][state] = { frames, loop, w, h, scaleFix,
                                        anchorX[], files[], footY }
     state ∈ idle / walk / jump / attack / hurt / pickup

     这是「武器视觉」的最终形态：早先站定走 ANIM_HOLD、行走走 WEAPON_WALK_CLIP、
     出招走 WEAPON_ATTACK_CLIP，三条独立通道各自缺图就掉回公共 clip，导致
     「站着有武器、一走一空手、一跳更空手」。统一成一张表之后，缺哪个状态
     就只掉那一个状态，其余状态不受牵连。

     老通道继续保留作降级：WEAPON_CLIP 缺席时行为与改动前完全一致。 */
  var WEAPON_STATES = ["attack", "walk", "jump", "hurt", "pickup", "idle"];

  function weaponClipDef(key, state) {
    if (!key || !state) return null;
    var W = window.WEAPON_CLIP;
    if (!W) return null;
    var all = W[key];
    if (!all) return null;
    var d = all[state];
    if (!d || !d.files || !d.files.length) return null;
    return d;
  }

  /* 该武器有没有这套表（有才走新路径，没有就整段跳过，不改变老行为） */
  function hasWeaponClips(key) {
    var W = window.WEAPON_CLIP;
    return !!(W && key && W[key]);
  }

  /* 某 state 的 Image 缓存：state#key -> [Image] */
  var stateCache = {};
  var stateWarmed = false;

  function warmStateClips() {
    if (stateWarmed) return true;
    var W = window.WEAPON_CLIP;
    if (!W) return false;
    stateWarmed = true;
    if (typeof Image !== "function") return true;
    for (var k in W) {
      if (!Object.prototype.hasOwnProperty.call(W, k)) continue;
      var all = W[k];
      for (var st in all) {
        if (!Object.prototype.hasOwnProperty.call(all, st)) continue;
        var d = all[st];
        if (!d || !d.files || !d.files.length) continue;
        var ck = st + "#" + k;
        if (stateCache[ck]) continue;
        var arr = new Array(d.files.length);
        for (var f = 0; f < d.files.length; f++) {
          var im = new Image();
          im.src = d.files[f];
          arr[f] = im;
        }
        stateCache[ck] = arr;
      }
    }
    return true;
  }

  /* 该帧的 anchorX：序列里它是数组（逐帧），单帧里它是数字 */
  function anchorOf(def, idx) {
    var a = def && def.anchorX;
    if (typeof a === "number" && isFinite(a)) return a;
    if (a && typeof a.length === "number") {
      var v = a[idx];
      if (typeof v === "number" && isFinite(v)) return v;
      for (var i = 0; i < a.length; i++) {
        if (typeof a[i] === "number" && isFinite(a[i])) return a[i];
      }
    }
    return 0.5;
  }

  /* 建所有持械帧的 Image（只执行一次；不放在 draw 热路径里）。
     某个 key 缺失只跳过该 key，不影响其它 —— 逐张可用性由 imageOk 判。 */
  function warmHold() {
    if (holdWarmed) return true;
    var H = window.ANIM_HOLD;
    if (!H) return false;                       // 数据还没到：交给轮询，别标记已就位
    holdWarmed = true;
    if (typeof Image !== "function") return true;  // 非浏览器宿主：只留降级路径
    for (var k in H) {
      if (!Object.prototype.hasOwnProperty.call(H, k)) continue;
      var d = H[k];
      if (!d || !d.file) continue;
      if (holdCache[k]) continue;
      var im = new Image();
      im.src = d.file;
      holdCache[k] = im;
    }
    return true;
  }

  /* 武器专属出招帧的 Image（同 warmHold 的规矩：一次、不在热路径里建） */
  function warmAtk() {
    if (atkWarmed) return true;
    var A = window.WEAPON_ATTACK;
    if (!A) return false;
    atkWarmed = true;
    if (typeof Image !== "function") return true;
    for (var k in A) {
      if (!Object.prototype.hasOwnProperty.call(A, k)) continue;
      var d = A[k];
      if (!d || !d.file) continue;
      if (atkCache[k]) continue;
      var im = new Image();
      im.src = d.file;
      atkCache[k] = im;
    }
    return true;
  }

  /* 武器出招序列的 Image（同 warmHold 的规矩：一次、不在热路径里建） */
  function warmAtkClip() {
    if (atkClipWarmed) return true;
    var C = window.WEAPON_ATTACK_CLIP;
    if (!C) return false;
    atkClipWarmed = true;
    if (typeof Image !== "function") return true;
    for (var k in C) {
      if (!Object.prototype.hasOwnProperty.call(C, k)) continue;
      var d = C[k];
      if (!d || !d.files || !d.files.length) continue;
      if (atkClipCache[k]) continue;
      var arr = new Array(d.files.length);
      for (var f = 0; f < d.files.length; f++) {
        var im = new Image();
        im.src = d.files[f];
        arr[f] = im;
      }
      atkClipCache[k] = arr;
    }
    return true;
  }

  /* 武器持械行走序列的 Image（同 warmHold 的规矩：一次、不在热路径里建） */
  function warmWalkClip() {
    if (walkClipWarmed) return true;
    var C = window.WEAPON_WALK_CLIP;
    if (!C) return false;
    walkClipWarmed = true;
    if (typeof Image !== "function") return true;
    for (var k in C) {
      if (!Object.prototype.hasOwnProperty.call(C, k)) continue;
      var d = C[k];
      if (!d || !d.files || !d.files.length) continue;
      if (walkClipCache[k]) continue;
      var arr = new Array(d.files.length);
      for (var f = 0; f < d.files.length; f++) {
        var im = new Image();
        im.src = d.files[f];
        arr[f] = im;
      }
      walkClipCache[k] = arr;
    }
    return true;
  }

  /* 建立所有帧的 Image（只执行一次；不放在 draw 热路径里） */
  function warm() {
    warmHold();                       // 持械帧自带 flag，ANIM 缺席也照建
    warmAtk();                        // 出招帧同理
    warmAtkClip();                    // 出招序列同理
    warmWalkClip();                   // 行走序列同理
    warmStateClips();                 // 每把武器的独立动作（WEAPON_CLIP）
    if (warmed) return;
    var A = animData();
    if (!A) return;
    warmed = true;
    for (var i = 0; i < CLIPS.length; i++) {
      var name = CLIPS[i];
      var d = A[name];
      if (!d || !d.files || !d.files.length) continue;
      if (frameCache[name]) continue;
      var arr = new Array(d.files.length);
      for (var f = 0; f < d.files.length; f++) {
        var im = new Image();
        im.src = d.files[f];
        arr[f] = im;
      }
      frameCache[name] = arr;
    }
  }

  /* anim-data.js 可能后于本文件就位：轻量轮询补一次预热 */
  function armPoll() {
    if ((warmed && holdWarmed && atkWarmed && atkClipWarmed && walkClipWarmed && stateWarmed) || pollTimer) return;
    if (typeof setTimeout !== "function") return;   // 非浏览器宿主：只做同步预热
    pollTries = 0;
    pollTimer = setTimeout(pollTick, 0);
  }

  function pollTick() {
    pollTimer = 0;
    warm();                           // 内部含 hold / atk / atkClip / walkClip 四条预热
    if (warmed && holdWarmed && atkWarmed && atkClipWarmed && walkClipWarmed && stateWarmed) return;
    if (pollTries++ < 120) pollTimer = setTimeout(pollTick, 60);
  }

  /* ================================================================== */
  /*  状态 → clip 映射（优先级从高到低）                                */
  /* ================================================================== */

  function pickClip(p) {
    var wt = p.weapon && p.weapon.type;
    if (p.dead) return "dead";
    if (p.whirlT > 0) return "whirl";
    if (p.throwT > 0 && wt === "bow") return "bow";
    if (p.throwT > 0 && wt === "throw") return "throw";
    if (p.hurtT > 0) return "hurt";
    /* 可选字段 p.pickupT（缺省 0）：拾取动作，调用方置 0.3 秒 */
    if (p.pickupT > 0) return "pickup";
    if (!p.onGround) return "jump";
    if (p.swingT > 0) {
      /* 可选字段 p.__forceClip（缺省 null）：重武器劈砍 / 快武器突刺，
         只认数据里真实存在的 clip，否则沿用 attack */
      var f = p.__forceClip;
      return (f && clipDef(f)) ? f : "attack";
    }
    if (Math.abs(p.vx) > 60) return "walk";
    /* 「站定」是唯一允许被持械静帧替换的一档（见 drawHold）：
       它要求 dead / whirl / throw / hurt / pickup 全为 0、着地、没在挥砍，
       所以走路绝不会被替换成站姿 —— 那会变成滑步。 */
    return "idle";
  }

  /* 目标 clip 缺失时退回 idle；连 idle 都没有 → 走降级 */
  function resolveClip(p) {
    var want = pickClip(p);
    if (clipDef(want)) return want;
    if (clipDef("idle")) return "idle";
    return null;
  }

  /* ================================================================== */
  /*  播放状态                                                          */
  /* ================================================================== */

  function stateOf(p) {
    var s = p.__rig;
    if (!s) {
      s = { clip: "", t: 0, last: 0, good: {} };
      p.__rig = s;
    }
    return s;
  }

  /* attack 的进度跟 p.swingT 挂钩：swingT/swingDur 从 1 → 0。
     重击 / 突刺同属攻击族，帧号一样由判定推导，不按 fps 自由播放。 */
  function isAttackClip(name) {
    return name === "attack" || name === "attack-heavy" || name === "attack-thrust";
  }

  function attackFrame(p, n) {
    if (!(p.swingT > 0) || !(p.swingDur > 0)) return -1;
    var prog = 1 - p.swingT / p.swingDur;
    if (prog < 0) prog = 0;
    if (prog > 1) prog = 1;
    var f = Math.floor(prog * n);
    if (f < 0) f = 0;
    if (f > n - 1) f = n - 1;
    return f;
  }

  function chooseFrame(p, s, name, def, dt) {
    var n = def.files.length;
    if (n <= 1) return 0;

    if (isAttackClip(name)) {
      var af = attackFrame(p, n);
      if (af >= 0) return af;            // 与判定同步
    }

    var fps = def.fps > 0 ? def.fps : 8;
    s.t += dt;
    var total = s.t * fps;
    if (def.loop === false) {
      var last = n - 1;
      if (total >= n) { s.t = n / fps; total = n; }   // 停在最后一帧，别让 t 无限涨
      var idx = Math.floor(total);
      return idx > last ? last : idx;
    }
    var loopIdx = Math.floor(total) % n;
    if (loopIdx < 0) loopIdx = 0;
    return loopIdx;
  }

  /* 该帧图没加载完 → 用本 clip 上一张可用帧，不闪 */
  function usableFrame(s, name, idx) {
    var arr = frameCache[name];
    if (!arr || !arr.length) return -1;
    if (idx >= 0 && idx < arr.length && imageOk(arr[idx])) {
      s.good[name] = idx;
      return idx;
    }
    var g = s.good[name];
    if (g != null && g < arr.length && imageOk(arr[g])) return g;
    for (var i = 0; i < arr.length; i++) {
      if (imageOk(arr[i])) { s.good[name] = i; return i; }
    }
    return -1;
  }

  /* ================================================================== */
  /*  通用特效                                                          */
  /* ================================================================== */

  /* 地面影子 */
  function drawShadow(ctx, p) {
    ctx.save();
    ctx.globalAlpha = p.dead ? 0.18 : 0.34;
    var sg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 46);
    sg.addColorStop(0, "rgba(40,26,10,.85)");
    sg.addColorStop(1, "rgba(40,26,10,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 2, 46, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 旋风斩光环（金色径向渐变环） */
  function drawWhirlRing(ctx, p, h) {
    var r = h * 0.62;
    ctx.save();
    ctx.translate(p.x, p.y - h * 0.5);
    var rg = ctx.createRadialGradient(0, 0, h * 0.18, 0, 0, r);
    rg.addColorStop(0, "rgba(255,240,190,0)");
    rg.addColorStop(0.6, "rgba(255,236,170,.22)");
    rg.addColorStop(0.85, "rgba(255,248,215,.42)");
    rg.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* P1 暖金 / P2 冷青：按 clip#frame + 绘制尺寸缓存，不每帧重建 canvas */
  function tintedFrame(img, name, idx, w, h, color, amt) {
    var tw = Math.max(1, Math.round(w));
    var th = Math.max(1, Math.round(h));
    var key = name + "#" + idx + "|" + color + "|" + tw + "x" + th;
    var cv = tintCache[key];
    if (cv) return cv;

    cv = document.createElement("canvas");
    cv.width = tw;
    cv.height = th;
    var c = cv.getContext("2d");
    if (!c) return null;
    c.drawImage(img, 0, 0, tw, th);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = color;
    c.globalAlpha = amt;
    c.fillRect(0, 0, tw, th);
    c.globalCompositeOperation = "source-over";
    tintCache[key] = cv;
    return cv;
  }

  /* ================================================================== */
  /*  透明因子（前景遮挡淡出）                                          */
  /* ================================================================== */

  /* 通用 alpha 系数：调用方设 p.__alphaMul 就能让整个角色变淡，
     本模块把这个因子乘进自身 alpha —— 不能只靠外层的 ctx.globalAlpha，
     因为下面的绘制会把它绝对覆盖掉。
     当前无调用方（前景遮挡层已删除），保留为通用钩子。
     缺省 / 非法值一律当 1，不影响其它淡出逻辑。 */
  function alphaMul(p) {
    var m = p && p.__alphaMul;
    if (typeof m !== "number" || !isFinite(m) || m < 0) return 1;
    return m > 1 ? 1 : m;
  }

  /* 受伤无敌期间的半透明闪烁。
     ⚠️ 判据不能只看 p.inv —— 旋风斩也给了 1.5 秒无敌（与 whirlT 同寿），
     但旋风斩期间角色是「高速自转 + 残影」，不是受伤。
     只看 inv 会让玩家读到「我是不是掉血了」（实测：放完技能角色半透明闪 1.5 秒）。
     whirlT > 0 时跳过闪烁，与 pickClip 的优先级一致。 */
  function hurtFlicker(p) {
    if (!(p.inv > 0)) return false;
    if (p.whirlT > 0) return false;
    return Math.floor(p.inv * 20) % 2 === 0;
  }

  /* ================================================================== */
  /*  主绘制：逐帧动画                                                  */
  /* ================================================================== */

  /* 返回 false 表示「这一帧画不出来」，交给降级路径 */
  function drawFrames(ctx, p, t, name) {
    var def = clipDef(name);
    if (!def) return false;

    var s = stateOf(p);
    var dt = t - s.last;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;                 // 卡帧后不要跳一大段
    s.last = t;

    if (s.clip !== name) {                  // 换 clip：回到第 0 帧
      s.clip = name;
      s.t = 0;
    }

    var idx = chooseFrame(p, s, name, def, dt);
    var use = usableFrame(s, name, idx);
    if (use < 0) return false;              // 一张都没就绪

    var img = frameCache[name][use];
    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    /* scaleFix：把某些「画得偏小」的动作条带拉回统一身高 */
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = typeof def.anchorX === "number" ? def.anchorX : 0.5;
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    /* 透明度：无敌闪烁 / 死亡淡出 / 前景遮挡淡出（p.__alphaMul） */
    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    drawShadow(ctx, p);
    if (p.whirlT > 0) drawWhirlRing(ctx, p, h);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, name, use, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.drawImage(art, dx, dy, w, h);

    /* 受击闪白 */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 1) k = 1;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* ================================================================== */
  /*  持械站立：单帧静帧                                                 */
  /* ================================================================== */

  /* 单帧，没有帧计时器，也没有帧号推导 —— 一张图就是全部。
     其余（锚点 / 镜像 / 三种 alpha / 受击闪白）与 drawFrames 逐项对齐，
     否则换武器那一刻的站立姿态会跟 idle 差一个像素级的位移或亮度。
     返回 false = 「这张画不出来」，调用方落回 idle 动画。
     weapon.key 每次现读，不缓存 —— 换手（bagDrop / bagGive / tryPickup）后
     下一帧立刻换成新武器，不需要任何失效通知。

     walking = true 时（在地面上且真的在走、但该武器没有行走序列）额外加一层
     极轻的呼吸起伏。刻意做得很小（±2px 量级、无倾斜无压伸）——单帧图配大幅度
     上下晃会被读成「在抖」，比滑步更假。真正的步伐交给 WEAPON_WALK_CLIP。 */
  function drawHold(ctx, p, t, walking) {
    var def = holdDef(p.weapon && p.weapon.key);
    if (!def) return false;                 // 该武器没有持械帧（fist 空手）
    var img = holdCache[p.weapon.key];
    if (!imageOk(img)) return false;        // 图还在加载 / 已失败 → 落回 idle 动画

    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = typeof def.anchorX === "number" ? def.anchorX : 0.5;
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    /* 透明度：无敌闪烁 / 死亡淡出 / 前景遮挡淡出（p.__alphaMul） */
    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    /* 持械帧同样推进 idle 的时钟：换回动画时 dt 不会因为静帧期间
       一直没更新而突然变大（drawFrames 会把 >0.1 的 dt 截断，那会跳帧）。 */
    stateOf(p).last = t;

    drawShadow(ctx, p);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, "hold#" + p.weapon.key, 0, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);

    /* 呼吸起伏：位移驱动（p.walk 由 vx 累加），幅度刻意压到 ±2px。
       没有行走序列时才走这里；有序列的武器在 drawWalkFrames 就返回了。 */
    var bob = 0;
    if (walking) {
      bob = Math.sin((p.walk || 0) * 6.0) * 2.0;
    }

    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    if (bob) ctx.translate(0, bob);
    ctx.drawImage(art, dx, dy, w, h);

    /* 受击闪白（idle 态正常情况下 hurtT 已归零，留着与动画路径保持一致） */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 1) k = 1;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* ================================================================== */
  /*  武器专属出招：单帧姿态 + 由 swingT 推导的挥动变换                  */
  /* ================================================================== */

  /* 与 drawHold 同一套几何（锚点 / 镜像 / 三档 alpha / 受击闪白），
     区别只在于这里按挥砍进度做前冲、旋转与轻微拉伸 —— 攻击是一瞬间，
     不需要帧序列，需要的是「这一刀往哪儿去」的方向感。

     挥动曲线：前 35% 蓄力（略后仰），35%~100% 出刀（前冲 + 顺方向甩），
     第 2 段横甩多转一点，第 3 段重击冲得更远、压得更低，靠 swingIdx 分流。
     这些只是绘制变换，判定仍只认 index.html 里的数字框。 */
  function drawWeaponAtk(ctx, p, t) {
    var wkey = p.weapon && p.weapon.key;
    var def = atkDef(wkey);
    if (!def) return false;
    var img = atkCache[wkey];
    if (!imageOk(img)) return false;

    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = typeof def.anchorX === "number" ? def.anchorX : 0.5;
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    /* 挥砍进度 0→1；swingDur 为 0 时当作刚出手 */
    var prog = 0;
    if (p.swingT > 0 && p.swingDur > 0) {
      prog = 1 - p.swingT / p.swingDur;
      if (prog < 0) prog = 0;
      if (prog > 1) prog = 1;
    }
    var idx = p.swingIdx | 0;
    /* 蓄力段：轻微后仰；出刀段：快速前冲并顺向甩开 */
    var windup = prog < 0.35 ? (1 - prog / 0.35) : 0;          // 1→0
    var strike = prog < 0.35 ? 0 : (prog - 0.35) / 0.65;       // 0→1
    if (strike > 1) strike = 1;

    var reach = idx === 2 ? 34 : (idx === 1 ? 22 : 16);
    var ox = -windup * 7 + strike * reach;
    var oy = windup * 3 - strike * (idx === 2 ? 6 : 3);
    var rot = -windup * (idx === 2 ? 0.10 : 0.06)
            + strike * (idx === 1 ? -0.13 : (idx === 2 ? 0.16 : 0.09));
    var sx = 1 + strike * 0.05 - windup * 0.03;
    var sy = 1 - strike * 0.035 + windup * 0.02;

    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    /* 与动画路径共用时钟：切回 clip 时 dt 不会突然变大 */
    stateOf(p).last = t;

    drawShadow(ctx, p);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, "atk#" + wkey, 0, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.translate(ox, oy);
    ctx.rotate(rot);
    ctx.scale(sx, sy);
    ctx.drawImage(art, dx, dy, w, h);

    /* 受击闪白：与其它路径保持一致（出招时被反击也会闪） */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 1) k = 1;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* 武器出招序列：一帧一张图，帧号与 attack 族共用 swingT 时间轴。
     与单帧版本的区别只有两点，其余（锚点 / 镜像 / 三档 alpha / 受击闪白）逐项对齐：
       · 帧号由 attackFrame 推导，所以「有几帧」不影响判定时机
       · 挥动变换大幅收窄 —— 动作已经在图里了，再叠前冲会让位移翻倍。
         只留一点点前压，把连击的推进感补回来。 */
  function drawWeaponAtkFrames(ctx, p, t) {
    var wkey = p.weapon && p.weapon.key;
    var def = atkClipDef(wkey);
    if (!def) return false;

    var arr = atkClipCache[wkey];
    if (!arr || !arr.length) return false;

    var n = def.files.length;
    if (n <= 0) return false;

    /* 帧号：优先与判定同步；swingT 已归零（收招那一帧）时停在第 0 帧之后的
       常用做法是保留上一帧，这里直接走 attackFrame 的 -1 → 取第 0 帧。 */
    var idx = attackFrame(p, n);
    if (idx < 0) idx = 0;
    if (idx > n - 1) idx = n - 1;

    var s = stateOf(p);
    var img = arr[idx];
    if (!imageOk(img)) {
      /* 该帧还没就绪：用同序列里最近的可用帧，别闪 */
      var found = -1;
      for (var k = 0; k < n; k++) {
        var j = (idx - k + n) % n;
        if (imageOk(arr[j])) { found = j; break; }
      }
      if (found < 0) return false;
      idx = found;
      img = arr[idx];
    }

    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    /* scaleFix 是整条序列共用的一个数：逐帧各算会让连击里忽大忽小 */
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    /* anchorX 逐帧取（数组），身体前后移时不漂 */
    var ax = anchorOf(def, idx);
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    var prog = 0;
    if (p.swingT > 0 && p.swingDur > 0) {
      prog = 1 - p.swingT / p.swingDur;
      if (prog < 0) prog = 0;
      if (prog > 1) prog = 1;
    }
    var idx3 = p.swingIdx | 0;
    var ox = prog * (idx3 === 2 ? 12 : (idx3 === 1 ? 8 : 6));
    var oy = -prog * 2;

    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    stateOf(p).last = t;

    drawShadow(ctx, p);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, "atkclip#" + wkey, idx, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.translate(ox, oy);
    ctx.drawImage(art, dx, dy, w, h);

    if (p.hurtT > 0) {
      var k2 = p.hurtT / 0.28;
      if (k2 > 1) k2 = 1;
      if (k2 > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k2 * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* ================================================================== */
  /*  武器持械行走：逐帧序列                                            */
  /* ================================================================== */

  /* 走路原来落回通用 walk clip（所有角色共用、手上没武器），于是「站着有武器、
     一走就空手」—— 连续性断在最常发生的那一帧。这条路走 WEAPON_WALK_CLIP。

     帧号由 p.walk（累计位移，与 walk clip 同一相位源）推导，不按时间自由播放：
     原地踏步时不该有帧动画，减速时步频也要跟着降。这与出招序列相反 ——
     出招跟判定走（swingT），行走跟位移走（p.walk）。

     挥动变换一律不加：动作已经在 4 张图里，再叠浮沉会变成双倍抖动。 */
  function drawWalkFrames(ctx, p, t) {
    var wkey = p.weapon && p.weapon.key;
    var def = walkClipDef(wkey);
    if (!def) return false;

    var arr = walkClipCache[wkey];
    if (!arr || !arr.length) return false;

    var n = def.files.length;
    if (n <= 0) return false;

    /* 帧号由位移推导（见 WALK_CYCLE 的说明），不按时间自由播放。

       WALK_CYCLE 是按「4 帧一轮」校准的（3.6 单位位移 = 4 帧）。序列只有 3 帧时
       不能照搬：一循环的位移还是 3.6、但只翻 3 帧，步频会慢 25%（实测斧头从
       12.6 帧/秒掉到 9.4），看起来像在滑步。所以按帧数等比缩放周期：
       每帧固定覆盖 WALK_CYCLE/4 的位移，与帧数无关。 */
    var cycle = WALK_CYCLE * n / 4;
    var phase = (p.walk || 0) / cycle * n;
    var idx = Math.floor(phase) % n;
    if (idx < 0) idx = 0;

    var img = arr[idx];
    if (!imageOk(img)) {
      /* 该帧没就绪：找同序列里最近的可用帧，别闪 */
      var found = -1;
      for (var k = 0; k < n; k++) {
        var j = (idx - k + n) % n;
        if (imageOk(arr[j])) { found = j; break; }
      }
      if (found < 0) return false;
      idx = found;
      img = arr[idx];
    }

    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = anchorOf(def, idx);
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    stateOf(p).last = t;

    drawShadow(ctx, p);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, "walkclip#" + wkey, idx, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.drawImage(art, dx, dy, w, h);

    if (p.hurtT > 0) {
      var k2 = p.hurtT / 0.28;
      if (k2 > 1) k2 = 1;
      if (k2 > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k2 * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  /* ================================================================== */
  /*  每把武器的独立动作：统一绘制                                        */
  /* ================================================================== */

  /* 帧号来源按状态分流，这是本模块最容易被改坏的地方：
       walk   → p.walk（累计位移）。站着不动不换帧，减速步频自然降。
       attack → swingT（判定推着画面走）。有几帧不影响出手时机。
       jump / hurt / pickup → 这些是「一次性动作」，没有稳定的时间轴可跟，
                 所以按时长比例取帧（pickupT / hurtT 由调用方倒数）。
       其它（idle）→ 固定第 0 帧。
     帧号永远夹在 [0, n-1]，不信任调用方传进来的数值。 */
  function stateFrame(p, state, def, n) {
    if (n <= 1) return 0;
    var idx = 0;
    if (state === "walk") {
      /* 每帧固定覆盖 WALK_CYCLE/4 的位移，与帧数无关 —— 3 帧序列（斧头）
         照搬 4 帧的周期会让步频慢 25%，读起来像滑步。
         与 drawWalkFrames 用同一个口径。 */
      var cycle = WALK_CYCLE * n / 4;
      idx = Math.floor((p.walk || 0) / cycle * n);
    } else if (state === "attack") {
      idx = attackFrame(p, n);
      if (idx < 0) idx = 0;
    } else if (state === "hurt") {
      var hd = 0.28;                       /* 与 index.html 的 hurtT 初值一致 */
      var prog = 1 - ((p.hurtT || 0) / hd);
      if (prog < 0) prog = 0;
      if (prog > 1) prog = 1;
      idx = Math.floor(prog * n);
    } else if (state === "pickup") {
      var pd = 0.3;                        /* 与 index.html 的 pickupT 初值一致 */
      var pprog = 1 - ((p.pickupT || 0) / pd);
      if (pprog < 0) pprog = 0;
      if (pprog > 1) pprog = 1;
      idx = Math.floor(pprog * n);
    } else if (state === "jump") {
      /* 起跳看离地高度：顶点之前第 0 帧、之后第 1 帧。没有 vy 就走第 0 帧。 */
      idx = (p.vy > 0) ? 0 : 1;
    }
    if (idx < 0) idx = 0;
    if (idx > n - 1) idx = n - 1;
    return idx;
  }

  /* 返回 false = 这一帧画不出来（调用方继续走老通道或公共 clip） */
  function drawWeaponState(ctx, p, t, state) {
    var wkey = p.weapon && p.weapon.key;
    var def = weaponClipDef(wkey, state);
    if (!def) return false;

    var ck = state + "#" + wkey;
    var arr = stateCache[ck];
    if (!arr || !arr.length) return false;

    var n = def.files.length;
    if (n <= 0) return false;

    var idx = stateFrame(p, state, def, n);
    var img = arr[idx];
    if (!imageOk(img)) {
      /* 该帧没就绪：找同序列里最近的可用帧，别闪 */
      var found = -1;
      for (var k = 0; k < n; k++) {
        var j = (idx - k + n) % n;
        if (imageOk(arr[j])) { found = j; break; }
      }
      if (found < 0) return false;
      idx = found;
      img = arr[idx];
    }

    var srcW = def.w > 0 ? def.w : (img.naturalWidth || 1);
    var srcH = def.h > 0 ? def.h : (img.naturalHeight || 1);
    var fix = (typeof def.scaleFix === "number") ? def.scaleFix : 1;
    var sc = (TARGET_H / srcH) * fix;
    var w = srcW * sc;
    var h = srcH * sc;

    var ax = anchorOf(def, idx);
    var fy = typeof def.footY === "number" ? def.footY : 1.0;
    var dx = -ax * w;
    var dy = -fy * h;

    var alpha = 1;
    if (p.dead) alpha = 0.5;
    else if (hurtFlicker(p)) alpha = 0.55;
    alpha *= alphaMul(p);

    stateOf(p).last = t;

    drawShadow(ctx, p);

    var color = (p.padTag || "") === "p1" ? "#ffcf6a" : "#6fd8c0";
    var art = tintedFrame(img, "wstate#" + wkey + "#" + state, idx, w, h, color, 0.10) || img;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.drawImage(art, dx, dy, w, h);

    if (p.hurtT > 0) {
      var k2 = p.hurtT / 0.28;
      if (k2 > 1) k2 = 1;
      if (k2 > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k2 * alpha;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
    return true;
  }

  function legacyTinted(img, color, amt) {    var cacheKey = "p|" + color + "|" + amt;    if (legacyTint[cacheKey]) return legacyTint[cacheKey];

    var cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    var c = cv.getContext("2d");
    if (!c) return img;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = "source-atop";
    c.fillStyle = color;
    c.globalAlpha = amt;
    c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = "source-over";
    legacyTint[cacheKey] = cv;
    return cv;
  }

  function legacySprite(p) {
    var img = window.IMG && window.IMG.pose0;
    if (!imageOk(img)) return null;
    return (p.padTag || "") === "p1"
      ? legacyTinted(img, "#ffcf6a", 0.10)
      : legacyTinted(img, "#6fd8c0", 0.10);
  }

  function drawLegacy(ctx, p, t) {
    var img = legacySprite(p);
    if (!img) return false;

    var sc = TARGET_H / SRC_H;
    var bob = 0, tilt = 0, sx = 1, sy = 1, ox = 0, oy = 0;
    var alpha = 1;

    if (hurtFlicker(p)) alpha = 0.55;

    /* 旋风斩：高速自转 + 残影 */
    if (p.whirlT > 0) {
      drawLegacyGhost(ctx, img, p, sc);
      return true;
    }

    if (!p.onGround) {
      sy = 1.06; sx = 0.96;
    } else if (Math.abs(p.vx) > 60) {
      var ph = p.walk;
      bob = Math.abs(Math.sin(ph * 2)) * -5;
      tilt = Math.sin(ph * 2) * 0.035 * (p.vx > 0 ? 1 : -1);
      sx = 1 + Math.sin(ph * 4) * 0.022;
      sy = 1 - Math.sin(ph * 4) * 0.022;
    } else {
      bob = Math.sin(t * 2.2) * 1.6;
      sy = 1 + Math.sin(t * 2.2) * 0.012;
    }

    /* 挥砍 */
    if (p.swingT > 0 && p.swingDur > 0) {
      var prog = 1 - p.swingT / p.swingDur;
      var ease = prog < 0.45
        ? (prog / 0.45) * (prog / 0.45)
        : 1 - ((prog - 0.45) / 0.55) * 0.45;
      var dir = (p.swingIdx === 1) ? -1 : 1;
      tilt += dir * ease * (p.swingIdx === 2 ? 0.42 : 0.30);
      ox += p.facing * ease * (p.swingIdx === 2 ? 30 : 20);
      oy -= ease * 5;
      sy *= 1 + ease * 0.05;
    }

    /* 投掷 / 拉弓 */
    if (p.throwT > 0) {
      tilt += -0.14 * (p.throwT / 0.24);
      ox -= p.facing * 6;
    }

    /* 受击后仰 */
    if (p.hurtT > 0) {
      tilt += -0.22 * (p.hurtT / 0.28) * p.facing;
      ox -= p.facing * 12 * (p.hurtT / 0.28);
    }

    /* 死亡 */
    if (p.dead) {
      alpha = 0.5;
      tilt += 1.15 * p.facing;
    }

    alpha *= alphaMul(p);

    var px = p.x + ox;
    var py = p.y + bob + oy;

    drawShadow(ctx, p);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    ctx.scale(p.facing < 0 ? -1 : 1, 1);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);

    var w = SRC_W * sc, h = SRC_H * sc;
    var dx = -PIVOT_X * w;
    var dy = -h;

    ctx.drawImage(img, dx, dy, w, h);

    /* 受击白光 */
    if (p.hurtT > 0) {
      var k = p.hurtT / 0.28;
      if (k > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.45 * k;
        ctx.drawImage(img, dx, dy, w, h);
        ctx.globalCompositeOperation = "source-over";
      }
    }

    ctx.restore();
    return true;
  }

  /* 降级路径的旋风斩残影 */
  function drawLegacyGhost(ctx, img, p, sc) {
    var w = SRC_W * sc, h = SRC_H * sc;
    var dx = -PIVOT_X * w, dy = -h;
    var spin = p.whirlT * 22;
    var flip = p.facing < 0 ? -1 : 1;

    for (var i = 0; i < 4; i++) {
      var k = i / 4;
      ctx.save();
      ctx.globalAlpha = 0.34 * (1 - k);
      ctx.translate(p.x, p.y);
      ctx.scale(flip, 1);
      ctx.rotate(spin * 0.28 + k * 0.5);
      ctx.scale(1 + k * 0.09, 1 - k * 0.04);
      ctx.drawImage(img, dx, dy, w, h);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(flip, 1);
    ctx.rotate(Math.sin(spin) * 0.12);
    ctx.drawImage(img, dx, dy, w, h);
    ctx.restore();

    drawWhirlRing(ctx, p, h);
  }

  /* ================================================================== */
  /*  对外接口                                                          */
  /* ================================================================== */

  function draw(ctx, p, t) {
    if (!p || !ctx) return;
    if (typeof t !== "number" || !isFinite(t)) t = 0;

    var name = resolveClip(p);

    /* ===== 第一档：每把武器的独立动作（WEAPON_CLIP）=====
       状态名与 pickClip 的结果一一对应：attack 族统一当 attack 处理
       （重击 / 突刺的差异在武器自己的 4 帧里，不再靠 __forceClip 切 clip）。
       这一档有图就用，没图才往下掉 —— 掉了只影响这一个状态，其余不受牵连。
       顺序放在最前，是因为它比旧的三条通道更完整、也更符合原画风格。 */
    if (hasWeaponClips(p.weapon && p.weapon.key) && !p.dead) {
      var st = null;
      if (name === "idle") st = "idle";
      else if (name === "walk") st = "walk";
      else if (name === "jump") st = "jump";
      else if (name === "hurt") st = "hurt";
      else if (name === "pickup") st = "pickup";
      else if (name === "attack" || name === "attack-heavy" || name === "attack-thrust") st = "attack";
      if (st && stateCache[st + "#" + p.weapon.key] && drawWeaponState(ctx, p, t, st)) return;
    }

    /* 优先级：武器出招序列 → 武器出招单帧 → 持械站立 → 动画 clip → 降级精灵。
       出招那两档必须盖在动画族之前：attack / attack-heavy / attack-thrust
       不管手上拿什么都长同一副样子，正是「换武器还是老模型」的根因。
       判据只看状态字段（这些字段在这里都非 0 才算「在出招」），
       与 pickClip 的优先级一致：旋风 / 投掷 / 受击 / 拾取 时不出招。
       序列优先于单帧：多帧更顺，但单帧留着当降级（某把武器只出了单帧时照画）。 */
    if (p.swingT > 0 && !p.dead && !(p.whirlT > 0) && !(p.throwT > 0)
        && !(p.hurtT > 0) && !(p.pickupT > 0)) {
      if (drawWeaponAtkFrames(ctx, p, t)) return;
      if (drawWeaponAtk(ctx, p, t)) return;
    }

    /* 持械站立：优先级插在 idle 之前、其余动作之后。
       resolveClip 落到 "idle" 就等于「站定不动」（dead / whirl / throw / hurt /
       pickup / 离地 / 挥砍 / 走路 都不返回 "idle"），所以走、跳、受伤、
       旋风、死亡一律保持原动画，不会变成站姿滑步。
       idle 帧整个缺失（name === null）时，只要状态本身还是 idle，持械帧照样顶用
       —— 它不依赖 idle 的帧图。 */
    /* 持械：站定与走路都走持械图。
       优先序：行走序列（逐帧，手里有武器）→ 行走静帧 → 通用 walk clip。
       走路必须接管，是为了「连续性」—— 手里拿着锤子迈步时不该突然变回空手。
       跳跃不接管（离地时腿是收起来的，站姿会穿帮）；旋风 / 投掷 / 拾取 / 死亡
       不会落到 "walk" 这个名字上，所以也不会被这里截走。

       静帧这一级不叠浮沉：单帧上下晃会被读成「在抖」，比滑步更假。
       bob 只做极轻的呼吸式起伏（±1px 量级），真正的步伐交给行走序列。 */
    var standing = (name === "idle") || (name === null && pickClip(p) === "idle");
    var walkingNow = (name === "walk");
    if (walkingNow && drawWalkFrames(ctx, p, t)) return;
    if (holdDef(p.weapon && p.weapon.key)) {
      if (walkingNow && drawHold(ctx, p, t, false)) return;
      if (standing && drawHold(ctx, p, t, false)) return;
    }

    if (name && drawFrames(ctx, p, t, name)) return;

    drawLegacy(ctx, p, t);
  }

  function ready() {
    if (anyReady) return true;

    for (var k in frameCache) {
      if (!Object.prototype.hasOwnProperty.call(frameCache, k)) continue;
      var arr = frameCache[k];
      for (var i = 0; i < arr.length; i++) {
        if (imageOk(arr[i])) { anyReady = true; return true; }
      }
    }

    /* 持械帧也算「有图可画」：帧图整批失败时至少还能画出手里的那把武器 */
    for (var h in holdCache) {
      if (!Object.prototype.hasOwnProperty.call(holdCache, h)) continue;
      if (imageOk(holdCache[h])) { anyReady = true; return true; }
    }

    for (var w in atkCache) {
      if (!Object.prototype.hasOwnProperty.call(atkCache, w)) continue;
      if (imageOk(atkCache[w])) { anyReady = true; return true; }
    }

    for (var c in atkClipCache) {
      if (!Object.prototype.hasOwnProperty.call(atkClipCache, c)) continue;
      var seq = atkClipCache[c];
      for (var q = 0; q < seq.length; q++) {
        if (imageOk(seq[q])) { anyReady = true; return true; }
      }
    }

    var leg = window.IMG && window.IMG.pose0;
    return imageOk(leg);
  }

  /* 预热：先同步试一次，再挂一次轻量轮询兜住后到的 ANIM */
  warm();
  armPoll();

  window.CharArt = { draw: draw, ready: ready, HEIGHT: TARGET_H };
})();
