/* ================================================================
   js/rumble.js — 手柄震动总入口（零依赖，file:// 可跑，全部 no-op 降级）
   ================================================================
   职责与边界：
   · 所有震动调用点都在 index.html，那边只写一行 Rumble.player(...) /
     Rumble.play(...)；本模块管取手柄、管 actuator、管波形，不管时机。
   · 手柄列表每拍从 Guide.pads() 现读（与 index.html 的 readPad 同源），
     不自己持 rAF、不轮询 —— 震动是事件驱动的，跟着游戏事件走。
   · 缺 Guide、缺手柄、无 vibrationActuator、playEffect 抛异常：一律静默
     no-op。震动是锦上添花，任何一条路断了都不许把游戏搞崩。
   · 加载序：js/guide.js 之后、js/ui-shell.js 之前（index.html 已按此排）。
   ================================================================ */
(function(){
  "use strict";

  /* ---------------- 底层 ---------------- */

  /* 按序号取手柄：pads[0] / pads[1]，与 readPad 的 PADS[] 取源一致。
     Guide 缺席或没插够就返回 null，调用方静默跳过。 */
  function padAt(i){
    try{
      if(!window.Guide || !window.Guide.pads) return null;
      var list = window.Guide.pads() || [];
      return list[i] || null;
    }catch(e){ return null; }
  }

  /* 拿 GamepadHapticActuator；没有或没实现 playEffect 就当不支持 */
  function actuatorOf(p){
    try{
      var a = p && p.vibrationActuator;
      return (a && typeof a.playEffect === "function") ? a : null;
    }catch(e){ return null; }
  }

  /* 单段波形：{dur:ms, strong:0-1, weak:0-1}。
     dual-rumble 是 Chrome/Edge 的标准能力，Firefox/Safari 没有就 no-op。 */
  function raw(padIndex, opts){
    try{
      var a = actuatorOf(padAt(padIndex));
      if(!a) return;
      var dur = (opts && opts.dur) || 0;
      if(dur <= 0) return;
      a.playEffect("dual-rumble", {
        startDelay: 0,
        duration: dur,
        strongMagnitude: (opts && opts.strong) || 0,
        weakMagnitude: (opts && opts.weak) || 0
      });
    }catch(e){ /* 静默：断线 / 不支持 / 任何异常都当没有震动 */ }
  }

  /* 多段波形：steps = [{delay:距上一段的间隔ms, dur, strong, weak}, ...]。
     playEffect 不支持渐变与排队，多段只能 setTimeout 链 —— 够用。 */
  function seq(padIndex, steps){
    var t = 0;
    for(var i=0; i<steps.length; i++){
      t += (steps[i].delay || 0);
      (function(step, at){
        setTimeout(function(){ raw(padIndex, step); }, at);
      })(steps[i], t);
    }
  }

  /* ---------------- 预设表 ----------------
     每个预设一段一拍，直线参数；要「渐强 / 锯齿」就用两三段拼，不造曲线。
     力度约定：strong 是低频转子（闷响 / 重击），weak 是高频转子（细碎 / 摩擦）。 */
  var PRESETS = {
    /* 挥刀：轻拂一下 */
    swing:       function(idx){ raw(idx, { dur:40,  strong:0,    weak:0.35 }); },
    /* 命中：普通 90ms，重击 160ms 闷一记 */
    hit:         function(idx, big){
                   if(big) raw(idx, { dur:160, strong:0.55, weak:0.4 });
                   else    raw(idx, { dur:90,  strong:0.3,  weak:0.3 });
                 },
    /* 受击：狠的一下 */
    hurt:        function(idx){ raw(idx, { dur:260, strong:0.85, weak:0.4 }); },
    /* 玩家阵亡：两段重锤 + 中间一拍停顿 */
    die:         function(idx){ seq(idx, [
                   { dur:500, strong:1,   weak:0.6 },
                   { delay:300, dur:300, strong:0.8, weak:0.5 } ]); },
    /* BOSS 击杀：三连重震 */
    bossDie:     function(idx){ seq(idx, [
                   { dur:120, strong:1, weak:0.6 },
                   { delay:120, dur:120, strong:1, weak:0.6 },
                   { delay:120, dur:220, strong:1, weak:0.7 } ]); },
    /* 上手：70ms 双脉冲 */
    pickup:      function(idx){ seq(idx, [
                   { dur:30, strong:0.35, weak:0.55 },
                   { delay:40, dur:40, strong:0.45, weak:0.6 } ]); },
    /* 换手：三短脉冲，与 pickup 的两连区分开 */
    swap:        function(idx){ seq(idx, [
                   { dur:25, strong:0.25, weak:0.5 },
                   { delay:45, dur:25, strong:0.25, weak:0.5 },
                   { delay:45, dur:45, strong:0.4,  weak:0.6 } ]); },
    /* 丢弃：轻一下 */
    drop:        function(idx){ raw(idx, { dur:60, strong:0.15, weak:0.3 }); },
    /* 递队友：两只手柄都震 100ms */
    give:        function(){ play("all", { dur:100, strong:0.4, weak:0.5 }); },
    /* 碎武器：锯齿三段 */
    breakWeapon: function(idx){ seq(idx, [
                   { dur:60, strong:0.7, weak:0.2 },
                   { delay:50, dur:60, strong:0.7, weak:0.2 },
                   { delay:50, dur:90, strong:0.7, weak:0.3 } ]); },
    /* 开箱：120/80/120 三段，一段比一段重 */
    chest:       function(idx){ seq(idx, [
                   { dur:120, strong:0.3, weak:0.4 },
                   { delay:80, dur:80,  strong:0.5, weak:0.5 },
                   { delay:80, dur:120, strong:0.7, weak:0.6 } ]); },
    /* 机关：一记闷震 */
    mechanism:   function(idx){ raw(idx, { dur:350, strong:0.9, weak:0.4 }); },
    /* 旋风斩发动：500ms 渐强 —— playEffect 不支持渐变，两段模拟 */
    whirl:       function(idx){ seq(idx, [
                   { dur:250, strong:0.25, weak:0.35 },
                   { delay:250, dur:250, strong:0.75, weak:0.6 } ]); },
    /* 投掷出手：轻抛一下 */
    throwProj:   function(idx){ raw(idx, { dur:50, strong:0.15, weak:0.4 }); },
    /* 破阵 / 换阵号角：中等一记 */
    wave:        function(idx){ raw(idx, { dur:200, strong:0.5, weak:0.5 }); },
    /* 通关：五连上行脉冲 */
    win:         function(idx){ seq(idx, [
                   { dur:60,  strong:0.2,  weak:0.5 },
                   { delay:80, dur:60,  strong:0.35, weak:0.6 },
                   { delay:80, dur:60,  strong:0.5,  weak:0.7 },
                   { delay:80, dur:60,  strong:0.7,  weak:0.8 },
                   { delay:80, dur:140, strong:1,    weak:0.9 } ]); },
    /* 失败：三连下行重震 */
    lose:        function(idx){ seq(idx, [
                   { dur:150, strong:1,   weak:0.5 },
                   { delay:150, dur:150, strong:0.9, weak:0.4 },
                   { delay:150, dur:260, strong:0.8, weak:0.3 } ]); },
    /* 暂停 / 菜单确认：最轻 */
    ui:          function(idx){ raw(idx, { dur:30, strong:0, weak:0.25 }); }
  };

  function preset(padIndex, name, arg){
    var fn = PRESETS[name];
    if(!fn) return;
    try{ fn(padIndex, arg); }catch(e){ /* 静默 */ }
  }

  /* ---------------- 对外 API ---------------- */

  /* 底层 + 预设统一入口：
     Rumble.play("all", "wave")           → 预设，两只手柄
     Rumble.play(0, "ui")                 → 预设，0 号手柄
     Rumble.play(0, {dur:50, weak:.4})    → 裸波形（一般不用，留给调试） */
  function play(padIndex, what, arg){
    if(padIndex === "all"){
      play(0, what, arg);
      play(1, what, arg);
      return;
    }
    if(typeof what === "string"){ preset(padIndex, what, arg); return; }
    raw(padIndex, what);
  }

  window.Rumble = {
    /* 幂等：只做一次「探测性现读」，把手柄列表摸一遍。
       之后每次 play 都现读 Guide.pads()（拔插即时生效），
       所以这里没有需要长期保存的缓存 —— 空转也无害，重复调用无事。 */
    init: function(){
      try{ if(window.Guide && window.Guide.pads) window.Guide.pads(); }catch(e){}
    },
    play: play,
    /* 按玩家 tag 路由：G.p1 永远 PADS[0]、G.p2 永远 PADS[1]，
       与 index.html 的 readPad 取源一致；不认识的 tag 落到 0 号。 */
    player: function(tag, name, arg){
      preset((tag === "p2") ? 1 : 0, name, arg);
    }
  };
})();
