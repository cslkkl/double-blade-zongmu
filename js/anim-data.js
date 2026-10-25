window.ANIM = {
  idle:   { frames: 4, fps: 6,  loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.00,
            files: ["assets/anim/idle-0.webp", "assets/anim/idle-1.webp", "assets/anim/idle-2.webp", "assets/anim/idle-3.webp"] },
  walk:   { frames: 6, fps: 12, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.49,
            files: ["assets/anim/walk-0.webp", "assets/anim/walk-1.webp", "assets/anim/walk-2.webp",
                    "assets/anim/walk-3.webp", "assets/anim/walk-4.webp", "assets/anim/walk-5.webp"] },
  /* attack 的 scaleFix 从 1.16 调到 1.1147：实测屏幕身高 184.3px，
     比 idle 基准 177.1px 高 7px（超出 AGENTS.md 的 178~181 验收带）。
     attack-0 的身体主体高 314px / 画布 498 = 0.6305，1.16 × 0.6305 × 252 = 184.3。
     反算到 177.1 得 1.1147。挥砍是高频动作，7px 的跳动能被看见。 */
  attack: { frames: 4, fps: 16, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.1147,
            files: ["assets/anim/attack-0.webp", "assets/anim/attack-1.webp", "assets/anim/attack-2.webp", "assets/anim/attack-3.webp"] },
  jump:   { frames: 3, fps: 10, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.96,
            files: ["assets/anim/jump-0.webp", "assets/anim/jump-1.webp", "assets/anim/jump-2.webp"] },
  hurt:   { frames: 2, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.78,
            files: ["assets/anim/hurt-0.webp", "assets/anim/hurt-1.webp"] },
  whirl:  { frames: 4, fps: 18, loop: true,  w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.27,
            files: ["assets/anim/whirl-0.webp", "assets/anim/whirl-1.webp", "assets/anim/whirl-2.webp", "assets/anim/whirl-3.webp"] },
  throw:  { frames: 3, fps: 14, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.94,
            files: ["assets/anim/throw-0.webp", "assets/anim/throw-1.webp", "assets/anim/throw-2.webp"] },
  bow:    { frames: 3, fps: 12, loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 0.85,
            files: ["assets/anim/bow-0.webp", "assets/anim/bow-1.webp", "assets/anim/bow-2.webp"] },
  dead:   { frames: 3, fps: 8,  loop: false, w: 560, h: 498, anchorX: 0.5673, footY: 1.0, scaleFix: 1.04,
            files: ["assets/anim/dead-0.webp", "assets/anim/dead-1.webp", "assets/anim/dead-2.webp"] },
  pickup:        { frames: 3, fps: 10, loop: false, w: 459, h: 560, anchorX: 0.4227, footY: 1.0, scaleFix: 0.914,
            files: ["assets/anim/pickup-0.webp", "assets/anim/pickup-1.webp", "assets/anim/pickup-2.webp"] },
  "attack-heavy":{ frames: 4, fps: 14, loop: false, w: 421, h: 560, anchorX: 0.4763, footY: 1.0, scaleFix: 0.867,
            files: ["assets/anim/attack-heavy-0.webp", "assets/anim/attack-heavy-1.webp", "assets/anim/attack-heavy-2.webp", "assets/anim/attack-heavy-3.webp"] },
  "attack-thrust":{ frames: 4, fps: 16, loop: false, w: 498, h: 403, anchorX: 0.3705, footY: 1.0, scaleFix: 0.754,
            files: ["assets/anim/attack-thrust-0.webp", "assets/anim/attack-thrust-1.webp", "assets/anim/attack-thrust-2.webp", "assets/anim/attack-thrust-3.webp"] },
};

/* 敌人动画（脚步已放慢：walker 7fps / fast 10fps / brute 6fps） */
window.ENEMY_ANIM = {
  walker: { frames: 4, fps: 7,  loop: true, w: 365, h: 378, anchorX: 0.4452, footY: 1.0,
            files: ["assets/anim/enemy-walker-0.webp", "assets/anim/enemy-walker-1.webp",
                    "assets/anim/enemy-walker-2.webp", "assets/anim/enemy-walker-3.webp"] },
  fast:   { frames: 4, fps: 10, loop: true, w: 400, h: 332, anchorX: 0.5000, footY: 1.0,
            files: ["assets/anim/enemy-fast-0.webp", "assets/anim/enemy-fast-1.webp",
                    "assets/anim/enemy-fast-2.webp", "assets/anim/enemy-fast-3.webp"] },
  brute:  { frames: 4, fps: 6,  loop: true, w: 400, h: 341, anchorX: 0.4939, footY: 1.0,
            files: ["assets/anim/enemy-brute-0.webp", "assets/anim/enemy-brute-1.webp",
                    "assets/anim/enemy-brute-2.webp", "assets/anim/enemy-brute-3.webp"] },
  boss:   { frames: 2, fps: 3,  loop: true, w: 400, h: 270, anchorX: 0.5162, footY: 1.0,
            files: ["assets/anim/enemy-boss-0.webp", "assets/anim/enemy-boss-1.webp"] }
};

/* 手持不同武器的站立姿态：换武器时替换 idle 帧。
   scaleFix 已按 idle 的内容高反算，屏幕身高一致，不会跳变。 */
window.ANIM_HOLD = {
axe     : { w: 543, h: 560, anchorX: 0.5212, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-axe.webp" },
  hammer  : { w: 545, h: 560, anchorX: 0.4376, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-hammer.webp" },
  sword   : { w: 435, h: 560, anchorX: 0.4057, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-sword.webp" },
  dagger  : { w: 465, h: 560, anchorX: 0.5527, footY: 1.0, scaleFix: 0.71,
            file: "assets/anim/hold-dagger.webp" },
  spear   : { w: 348, h: 560, anchorX: 0.5029, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-spear.webp" },
  bow     : { w: 560, h: 545, anchorX: 0.6357, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bow.webp" },
  rock    : { w: 558, h: 560, anchorX: 0.457, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-rock.webp" },
  short   : { w: 380, h: 560, anchorX: 0.5868, footY: 1.0, scaleFix: 0.711,
            file: "assets/anim/hold-short.webp" },
  blade   : { w: 365, h: 560, anchorX: 0.5767, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-blade.webp" },
  jar     : { w: 363, h: 560, anchorX: 0.6129, footY: 1.0, scaleFix: 0.708,
            file: "assets/anim/hold-jar.webp" },
  bell    : { w: 425, h: 560, anchorX: 0.5394, footY: 1.0, scaleFix: 0.709,
            file: "assets/anim/hold-bell.webp" }
};

/* >>> slice_weapon_assets: WEAPON_ATTACK >>> */
/* 攻击姿态帧：键集合固定，bell 不在其中（沿用 jar 姿态，由上层兜底）。
   scaleFix 按「头冠顶 → 脚底」反算：身体高度的屏幕长度与 idle 一致。
   武器举过头顶的格（axe/hammer）画布会高很多，scaleFix 因此偏大，属正常。 */
window.WEAPON_ATTACK = {
  short   : { w: 477, h: 479, anchorX: 0.6567, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-short.webp" },
  dagger  : { w: 560, h: 452, anchorX: 0.5687, footY: 1.0, scaleFix: 0.723,
            file: "assets/anim/atk-dagger.webp" },
  sword   : { w: 560, h: 538, anchorX: 0.4696, footY: 1.0, scaleFix: 0.752,
            file: "assets/anim/atk-sword.webp" },
  axe     : { w: 363, h: 560, anchorX: 0.5096, footY: 1.0, scaleFix: 1.078,
            file: "assets/anim/atk-axe.webp" },
  hammer  : { w: 560, h: 481, anchorX: 0.5411, footY: 1.0, scaleFix: 0.72,
            file: "assets/anim/atk-hammer.webp" },
  spear   : { w: 560, h: 446, anchorX: 0.3241, footY: 1.0, scaleFix: 0.724,
            file: "assets/anim/atk-spear.webp" },
  bow     : { w: 386, h: 552, anchorX: 0.4197, footY: 1.0, scaleFix: 0.784,
            file: "assets/anim/atk-bow.webp" },
  rock    : { w: 392, h: 503, anchorX: 0.5319, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-rock.webp" },
  blade   : { w: 537, h: 503, anchorX: 0.5121, footY: 1.0, scaleFix: 0.717,
            file: "assets/anim/atk-blade.webp" },
  jar     : { w: 357, h: 552, anchorX: 0.5658, footY: 1.0, scaleFix: 0.793,
            file: "assets/anim/atk-jar.webp" }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK <<< */


/* >>> slice_weapon_assets: WEAPON_FX >>> */
/* 武器刀光：r 为建议半径，arc 为挥砍弧张开角度（弧度）。
   bell 与 jar 共用 burst 那张爆炸环。 */
window.WEAPON_FX = {
  short   : { file: "assets/fx/wp-slash-short.webp", scale: 1.0, r: 98, arc: 1.15 },
  dagger  : { file: "assets/fx/wp-slash-dagger.webp", scale: 1.0, r: 84, arc: 0.75 },
  sword   : { file: "assets/fx/wp-slash-sword.webp", scale: 1.0, r: 112, arc: 1.45 },
  axe     : { file: "assets/fx/wp-slash-axe.webp", scale: 1.0, r: 126, arc: 1.85 },
  hammer  : { file: "assets/fx/wp-slash-hammer.webp", scale: 1.0, r: 132, arc: 1.95 },
  spear   : { file: "assets/fx/wp-slash-spear.webp", scale: 1.0, r: 130, arc: 0.45 },
  bow     : { file: "assets/fx/wp-slash-bow.webp", scale: 1.0, r: 100, arc: 0.9 },
  rock    : { file: "assets/fx/wp-slash-rock.webp", scale: 1.0, r: 92, arc: 1.0 },
  blade   : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 96, arc: 1.3 },
  jar     : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 112, arc: 1.05 },
  bell    : { file: "assets/fx/wp-slash-burst.webp", scale: 1.0, r: 108, arc: 1.2 }
};
/* <<< slice_weapon_assets: WEAPON_FX <<< */


/* >>> slice_weapon_assets: HIT_MATERIAL >>> */
/* 打击火花四张：按材质选图。 */
window.HIT_MATERIAL = {
  jade   : "assets/fx/hit-jade.webp",
  bronze : "assets/fx/hit-bronze.webp",
  blunt  : "assets/fx/hit-blunt.webp",
  airy   : "assets/fx/hit-airy.webp"
};
/* <<< slice_weapon_assets: HIT_MATERIAL <<< */

/* >>> slice_weapon_assets: WEAPON_ATTACK_CLIP >>> */
/* 4 帧出招序列。与 WEAPON_ATTACK（单帧降级）并存。
   同一把武器的 4 帧共用同一画布 w/h 与同一个 scaleFix（否则播放会跳）。
   anchorX 逐帧一个：身体轴线随姿势前后移，逐帧取才不漂。 */
window.WEAPON_ATTACK_CLIP = {
  short   : { frames: 4, w: 347, h: 560, scaleFix: 0.997, footY: 1.0,
            anchorX: [0.6268, 0.6268, 0.6268, 0.6268],
            files: ["assets/anim/atk-short-0.webp", "assets/anim/atk-short-1.webp", "assets/anim/atk-short-2.webp", "assets/anim/atk-short-3.webp"] },
  dagger  : { frames: 4, w: 547, h: 526, scaleFix: 0.715, footY: 1.0,
            anchorX: [0.5622, 0.5622, 0.5622, 0.5622],
            files: ["assets/anim/atk-dagger-0.webp", "assets/anim/atk-dagger-1.webp", "assets/anim/atk-dagger-2.webp", "assets/anim/atk-dagger-3.webp"] },
  sword   : { frames: 4, w: 365, h: 560, scaleFix: 0.926, footY: 1.0,
            anchorX: [0.5699, 0.5699, 0.5699, 0.5699],
            files: ["assets/anim/atk-sword-0.webp", "assets/anim/atk-sword-1.webp", "assets/anim/atk-sword-2.webp", "assets/anim/atk-sword-3.webp"] },
  axe     : { frames: 4, w: 327, h: 560, scaleFix: 0.951, footY: 1.0,
            anchorX: [0.5, 0.5, 0.5107, 0.5],
            files: ["assets/anim/atk-axe-0.webp", "assets/anim/atk-axe-1.webp", "assets/anim/atk-axe-2.webp", "assets/anim/atk-axe-3.webp"] },
  hammer  : { frames: 4, w: 284, h: 560, scaleFix: 0.97, footY: 1.0,
            anchorX: [0.4701, 0.4701, 0.4701, 0.4701],
            files: ["assets/anim/atk-hammer-0.webp", "assets/anim/atk-hammer-1.webp", "assets/anim/atk-hammer-2.webp", "assets/anim/atk-hammer-3.webp"] },
  spear   : { frames: 4, w: 559, h: 405, scaleFix: 0.718, footY: 1.0,
            anchorX: [0.4548, 0.4658, 0.4658, 0.4767],
            files: ["assets/anim/atk-spear-0.webp", "assets/anim/atk-spear-1.webp", "assets/anim/atk-spear-2.webp", "assets/anim/atk-spear-3.webp"] },
  bow     : { frames: 4, w: 391, h: 560, scaleFix: 0.796, footY: 1.0,
            anchorX: [0.4316, 0.4357, 0.4357, 0.4399],
            files: ["assets/anim/atk-bow-0.webp", "assets/anim/atk-bow-1.webp", "assets/anim/atk-bow-2.webp", "assets/anim/atk-bow-3.webp"] },
  rock    : { frames: 4, w: 407, h: 560, scaleFix: 0.724, footY: 1.0,
            anchorX: [0.5461, 0.4969, 0.5215, 0.5215],
            files: ["assets/anim/atk-rock-0.webp", "assets/anim/atk-rock-1.webp", "assets/anim/atk-rock-2.webp", "assets/anim/atk-rock-3.webp"] },
  blade   : { frames: 4, w: 429, h: 559, scaleFix: 0.722, footY: 1.0,
            anchorX: [0.5746, 0.5408, 0.5577, 0.5577],
            files: ["assets/anim/atk-blade-0.webp", "assets/anim/atk-blade-1.webp", "assets/anim/atk-blade-2.webp", "assets/anim/atk-blade-3.webp"] },
  jar     : { frames: 4, w: 378, h: 530, scaleFix: 0.745, footY: 1.0,
            anchorX: [0.629, 0.5909, 0.5529, 0.5909],
            files: ["assets/anim/atk-jar-0.webp", "assets/anim/atk-jar-1.webp", "assets/anim/atk-jar-2.webp", "assets/anim/atk-jar-3.webp"] }
};
/* <<< slice_weapon_assets: WEAPON_ATTACK_CLIP <<< */

/* >>> slice_weapon_assets: WEAPON_CLIP >>> */
/* 每把武器一套独立动作。查不到某个 state 时，渲染层逐级回落到公共 clip。
   ★ 同一把武器所有状态共用**同一张画布 w/h 与同一个 scaleFix**：
     蹲姿 / 弯腰 / 后仰的身体本来就短，若各自归一化到同一屏幕身高，
     换状态时人会忽大忽小（这是踩过的 bug）。共用画布保证像素比例恒定。
   anchorX 逐帧一个：身体轴线随姿势前后移。
   帧号来源：walk 跟 p.walk 位移、attack 跟 swingT 判定、
             jump 看 vy、hurt/pickup 跟各自计时器。 */
window.WEAPON_CLIP = {
  short:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 381, h: 560, scaleFix: 0.741,
              footY: [1, 1, 1, 1], anchorX: [0.4332, 0.4957, 0.4379, 0.5085],
              files: ["assets/anim/walk-short-0.webp", "assets/anim/walk-short-1.webp", "assets/anim/walk-short-2.webp", "assets/anim/walk-short-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 381, h: 560, scaleFix: 0.741,
              footY: 1.0, anchorX: [0.6238, 0.6742],
              files: ["assets/anim/jump-short-0.webp", "assets/anim/jump-short-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 381, h: 560, scaleFix: 0.741,
              footY: 1.0, anchorX: [0.5517, 0.4446, 0.5996, 0.5822],
              files: ["assets/anim/attack-short-0.webp", "assets/anim/attack-short-1.webp", "assets/anim/attack-short-2.webp", "assets/anim/attack-short-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 381, h: 560, scaleFix: 0.7091,
              footY: 1.0, anchorX: [0.6948],
              files: ["assets/anim/hurt-short.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 381, h: 560, scaleFix: 0.741,
              footY: 1.0, anchorX: [0.3677],
              files: ["assets/anim/pickup-short.webp"] }
  },
  dagger:  {
    walk:    { frames: 4, loop: true, fps: 10, w: 415, h: 560, scaleFix: 0.786,
              footY: [1, 1, 1, 1], anchorX: [0.3886, 0.3202, 0.39, 0.327],
              files: ["assets/anim/walk-dagger-0.webp", "assets/anim/walk-dagger-1.webp", "assets/anim/walk-dagger-2.webp", "assets/anim/walk-dagger-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 415, h: 560, scaleFix: 0.786,
              footY: 1.0, anchorX: [0.6135, 0.5653],
              files: ["assets/anim/jump-dagger-0.webp", "assets/anim/jump-dagger-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 415, h: 560, scaleFix: 0.786,
              footY: 1.0, anchorX: [0.8557, 0.7488, 0.3879, 0.3224],
              files: ["assets/anim/attack-dagger-0.webp", "assets/anim/attack-dagger-1.webp", "assets/anim/attack-dagger-2.webp", "assets/anim/attack-dagger-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 415, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.6343],
              files: ["assets/anim/hurt-dagger.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 415, h: 560, scaleFix: 0.786,
              footY: 1.0, anchorX: [0.3531],
              files: ["assets/anim/pickup-dagger.webp"] }
  },
  sword:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 543, h: 560, scaleFix: 0.761,
              footY: [1, 1, 1, 1], anchorX: [0.535, 0.565, 0.5281, 0.5682],
              files: ["assets/anim/walk-sword-0.webp", "assets/anim/walk-sword-1.webp", "assets/anim/walk-sword-2.webp", "assets/anim/walk-sword-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.761,
              footY: 1.0, anchorX: [0.6172, 0.6859],
              files: ["assets/anim/jump-sword-0.webp", "assets/anim/jump-sword-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.761,
              footY: 1.0, anchorX: [0.4724, 0.5291, 0.5386, 0.6706],
              files: ["assets/anim/attack-sword-0.webp", "assets/anim/attack-sword-1.webp", "assets/anim/attack-sword-2.webp", "assets/anim/attack-sword-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.4934],
              files: ["assets/anim/hurt-sword.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 543, h: 560, scaleFix: 0.761,
              footY: 1.0, anchorX: [0.4615],
              files: ["assets/anim/pickup-sword.webp"] }
  },
  axe:     {
    /* walk-axe-3.webp 曾是 0 字节空文件（全仓唯一），第 4 帧永远走
       char-rig 的「找最近可用帧」兜底落到第 3 帧 —— 实测 p.walk 推一整圈
       的实际帧序列是 000…111…222222…（第 3 帧被画 33 次，正常值 15 次的 2.2 倍），
       4 帧循环退化成 3 帧，玩家读到「走路卡住」。
       空文件已删，这里按实际可用帧数登记成 3 帧；frames 必须与 files.length
       一致，否则 char-rig 的 n 会取错。要根治得重跑 slice_weapon_walk.py 重出条带。 */
    walk:    { frames: 3, loop: true, fps: 10, w: 372, h: 560, scaleFix: 0.774,
              footY: [1, 1, 1], anchorX: [0.5495, 0.5543, 0.538],
              files: ["assets/anim/walk-axe-0.webp", "assets/anim/walk-axe-1.webp", "assets/anim/walk-axe-2.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 372, h: 560, scaleFix: 0.774,
              footY: 1.0, anchorX: [0.23, 0.5144],
              files: ["assets/anim/jump-axe-0.webp", "assets/anim/jump-axe-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 372, h: 560, scaleFix: 0.774,
              footY: 1.0, anchorX: [0.8234, 0.6105, 0.8037, 0.5963],
              files: ["assets/anim/attack-axe-0.webp", "assets/anim/attack-axe-1.webp", "assets/anim/attack-axe-2.webp", "assets/anim/attack-axe-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 372, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.722],
              files: ["assets/anim/hurt-axe.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 372, h: 560, scaleFix: 0.774,
              footY: 1.0, anchorX: [0.2574],
              files: ["assets/anim/pickup-axe.webp"] }
  },
  hammer:  {
    walk:    { frames: 4, loop: true, fps: 10, w: 373, h: 560, scaleFix: 0.772,
              footY: [1, 1, 1, 1], anchorX: [0.418, 0.3906, 0.4366, 0.3885],
              files: ["assets/anim/walk-hammer-0.webp", "assets/anim/walk-hammer-1.webp", "assets/anim/walk-hammer-2.webp", "assets/anim/walk-hammer-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 373, h: 560, scaleFix: 0.772,
              footY: 1.0, anchorX: [0.6814, 0.1553],
              files: ["assets/anim/jump-hammer-0.webp", "assets/anim/jump-hammer-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 373, h: 560, scaleFix: 0.772,
              footY: 1.0, anchorX: [0.8552, 0.657, 0.5635, 0.3906],
              files: ["assets/anim/attack-hammer-0.webp", "assets/anim/attack-hammer-1.webp", "assets/anim/attack-hammer-2.webp", "assets/anim/attack-hammer-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 373, h: 560, scaleFix: 0.7091,
              footY: 1.0, anchorX: [0.5855],
              files: ["assets/anim/hurt-hammer.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 373, h: 560, scaleFix: 0.772,
              footY: 1.0, anchorX: [0.2445],
              files: ["assets/anim/pickup-hammer.webp"] }
  },
  spear:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 361, h: 560, scaleFix: 0.7511,
              footY: [1, 1, 1, 1], anchorX: [0.3665, 0.2945, 0.3641, 0.2913],
              files: ["assets/anim/walk-spear-0.webp", "assets/anim/walk-spear-1.webp", "assets/anim/walk-spear-2.webp", "assets/anim/walk-spear-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 361, h: 560, scaleFix: 0.7511,
              footY: 1.0, anchorX: [0.4279, 0.4574],
              files: ["assets/anim/jump-spear-0.webp", "assets/anim/jump-spear-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 361, h: 560, scaleFix: 0.7511,
              footY: 1.0, anchorX: [0.8777, 0.5671, 0.8442, 0.4334],
              files: ["assets/anim/attack-spear-0.webp", "assets/anim/attack-spear-1.webp", "assets/anim/attack-spear-2.webp", "assets/anim/attack-spear-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 361, h: 560, scaleFix: 0.7091,
              footY: 1.0, anchorX: [0.4839],
              files: ["assets/anim/hurt-spear.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 361, h: 560, scaleFix: 0.6169,
              footY: 1.0, anchorX: [0.2658],
              files: ["assets/anim/pickup-spear.webp"] }
  },
  bow:     {
    walk:    { frames: 4, loop: true, fps: 10, w: 439, h: 560, scaleFix: 0.804,
              footY: [1, 1, 1, 1], anchorX: [0.4131, 0.336, 0.4159, 0.3403],
              files: ["assets/anim/walk-bow-0.webp", "assets/anim/walk-bow-1.webp", "assets/anim/walk-bow-2.webp", "assets/anim/walk-bow-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.804,
              footY: 1.0, anchorX: [0.4029, 0.3465],
              files: ["assets/anim/jump-bow-0.webp", "assets/anim/jump-bow-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.804,
              footY: 1.0, anchorX: [0.4537, 0.4352, 0.4777, 0.4795],
              files: ["assets/anim/attack-bow-0.webp", "assets/anim/attack-bow-1.webp", "assets/anim/attack-bow-2.webp", "assets/anim/attack-bow-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.7219],
              files: ["assets/anim/hurt-bow.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 439, h: 560, scaleFix: 0.804,
              footY: 1.0, anchorX: [0.6359],
              files: ["assets/anim/pickup-bow.webp"] }
  },
  rock:    {
    walk:    { frames: 4, loop: true, fps: 10, w: 399, h: 560, scaleFix: 0.842,
              footY: [1, 1, 1, 1], anchorX: [0.4743, 0.4469, 0.4826, 0.4614],
              files: ["assets/anim/walk-rock-0.webp", "assets/anim/walk-rock-1.webp", "assets/anim/walk-rock-2.webp", "assets/anim/walk-rock-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 399, h: 560, scaleFix: 0.842,
              footY: 1.0, anchorX: [0.6032, 0.1573],
              files: ["assets/anim/jump-rock-0.webp", "assets/anim/jump-rock-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 399, h: 560, scaleFix: 0.842,
              footY: 1.0, anchorX: [0.5651, 0.8737, 0.5987, 0.463],
              files: ["assets/anim/attack-rock-0.webp", "assets/anim/attack-rock-1.webp", "assets/anim/attack-rock-2.webp", "assets/anim/attack-rock-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 399, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.6793],
              files: ["assets/anim/hurt-rock.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 399, h: 560, scaleFix: 0.842,
              footY: 1.0, anchorX: [0.3745],
              files: ["assets/anim/pickup-rock.webp"] }
  },
  blade:   {
    walk:    { frames: 4, loop: true, fps: 10, w: 414, h: 560, scaleFix: 0.728,
              footY: [1, 1, 1, 1], anchorX: [0.4475, 0.4926, 0.4564, 0.5035],
              files: ["assets/anim/walk-blade-0.webp", "assets/anim/walk-blade-1.webp", "assets/anim/walk-blade-2.webp", "assets/anim/walk-blade-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.728,
              footY: 1.0, anchorX: [0.5228, 0.511],
              files: ["assets/anim/jump-blade-0.webp", "assets/anim/jump-blade-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.728,
              footY: 1.0, anchorX: [0.5497, 0.5706, 0.3862, 0.6333],
              files: ["assets/anim/attack-blade-0.webp", "assets/anim/attack-blade-1.webp", "assets/anim/attack-blade-2.webp", "assets/anim/attack-blade-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.7091,
              footY: 1.0, anchorX: [0.7101],
              files: ["assets/anim/hurt-blade.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 414, h: 560, scaleFix: 0.728,
              footY: 1.0, anchorX: [0.3129],
              files: ["assets/anim/pickup-blade.webp"] }
  },
  jar:     {
    walk:    { frames: 4, loop: true, fps: 10, w: 402, h: 560, scaleFix: 0.718,
              footY: [1, 1, 1, 1], anchorX: [0.4624, 0.461, 0.4684, 0.4466],
              files: ["assets/anim/walk-jar-0.webp", "assets/anim/walk-jar-1.webp", "assets/anim/walk-jar-2.webp", "assets/anim/walk-jar-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.718,
              footY: 1.0, anchorX: [0.3861, 0.3007],
              files: ["assets/anim/jump-jar-0.webp", "assets/anim/jump-jar-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.718,
              footY: 1.0, anchorX: [0.4795, 0.5855, 0.427, 0.462],
              files: ["assets/anim/attack-jar-0.webp", "assets/anim/attack-jar-1.webp", "assets/anim/attack-jar-2.webp", "assets/anim/attack-jar-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.6897],
              files: ["assets/anim/hurt-jar.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 402, h: 560, scaleFix: 0.718,
              footY: 1.0, anchorX: [0.2755],
              files: ["assets/anim/pickup-jar.webp"] }
  },
  bell:    {
    walk:    { frames: 4, loop: true, fps: 10, w: 466, h: 560, scaleFix: 0.727,
              footY: [1, 1, 1, 1], anchorX: [0.5236, 0.5712, 0.5362, 0.5719],
              files: ["assets/anim/walk-bell-0.webp", "assets/anim/walk-bell-1.webp", "assets/anim/walk-bell-2.webp", "assets/anim/walk-bell-3.webp"] },
    jump:    { frames: 2, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.727,
              footY: 1.0, anchorX: [0.48, 0.5258],
              files: ["assets/anim/jump-bell-0.webp", "assets/anim/jump-bell-1.webp"] },
    attack:  { frames: 4, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.727,
              footY: 1.0, anchorX: [0.5506, 0.422, 0.1627, 0.7708],
              files: ["assets/anim/attack-bell-0.webp", "assets/anim/attack-bell-1.webp", "assets/anim/attack-bell-2.webp", "assets/anim/attack-bell-3.webp"] },
    hurt:    { frames: 1, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.7104,
              footY: 1.0, anchorX: [0.7192],
              files: ["assets/anim/hurt-bell.webp"] },
    pickup:  { frames: 1, loop: false, fps: 0, w: 466, h: 560, scaleFix: 0.727,
              footY: 1.0, anchorX: [0.2247],
              files: ["assets/anim/pickup-bell.webp"] }
  }
};
/* <<< slice_weapon_assets: WEAPON_CLIP <<< */
