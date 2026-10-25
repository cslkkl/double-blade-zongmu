#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 tools/align_weapon_frames.html 导出的对齐数据写回 js/anim-data.js。

用法（在仓库根目录）：
    python tools/align_apply.py align.json              # 写入
    python tools/align_apply.py align.json --dry        # 只看将要改什么
    python tools/align_apply.py --report                # 只看现状（不需要导出文件）

输入格式（工具「生成整把武器」按钮出来的就是它）：
    {
      "short": {
        "walk":   { "anchorX": [0.5,0.5,0.5,0.5], "footY": [1,1,1,1] },
        "attack": { "anchorX": [...],             "footY": [...] }
      },
      "blade": { ... }
    }
也接受带 /* */ 注释与尾逗号的 JS 片段（工具导出的原文），会先清掉注释。

为什么要有这一步：
    对齐是「人肉眼拖 + 机器只做换算」，产出就是一堆四位小数。手抄进
    js/anim-data.js 必然抄错一位。这个脚本只改 anchorX / footY 两个字段，
    不碰 frames / files / scaleFix，改完自动 node --check。

安全阀：
    ① 帧数对不上直接拒（说明导出的是旧数据，粘上去会让整段动画错位）；
    ② 写入前存 .bak，写完 node --check 不过就自动回滚；
    ③ 只按「状态头位置」切段，不猜括号配对 —— 状态块是以 `... ] },`
       在同一行里闭合的，正则配对括号会当场失手。
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import re
import shutil
import subprocess
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "js", "anim-data.js")
BEGIN = "/* >>> slice_weapon_assets: WEAPON_CLIP >>> */"
END = "/* <<< slice_weapon_assets: WEAPON_CLIP <<< */"

RE_WEAPON = re.compile(r"(?m)^  (\w+):\s*\{")
RE_WCLOSE = re.compile(r"(?m)^  \}")
RE_STATE = re.compile(r"(?m)^    (\w+):\s*\{")


# --------------------------------------------------------------------------- #
# 读导出文件
# --------------------------------------------------------------------------- #
def load_payload(path: str) -> dict:
    raw = open(path, encoding="utf-8-sig").read()
    # 先按 JSON 试（工具导出的就是合法 JSON）
    stripped = raw.strip()
    for candidate in (stripped,
                      re.sub(r",(\s*[}\]])", r"\1", stripped)):  # 容忍尾逗号
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 退路：旧版工具导出的是「JS 片段」（无引号键名、武器名写在注释里）。
    # 这条退路留着，是因为导出的文本可能被人手改过、或贴着旧版本用。
    body = re.sub(r"/\*.*?\*/", "", raw, flags=re.S)
    body = re.sub(r"(?m)//.*$", "", body)
    body = re.sub(r",(\s*[}\]])", r"\1", body)                 # 尾逗号
    body = re.sub(r"(?m)^(\s*)(\w+)\s*:", r'\1"\2":', body)    # 无引号键名加引号
    body = body.strip()
    if not body.startswith("{"):
        body = "{" + body + "}"
    try:
        data = json.loads(body)
    except json.JSONDecodeError as e:
        sys.exit("导出的数据既不是 JSON、也解析不成 JS 片段：%s（第 %d 行）\n---\n%s"
                 % (e.msg, e.lineno, raw[:800]))

    # 若顶层直接是状态名（walk/jump/...）而没有武器名那一层，
    # 就从注释里捞武器名：旧版工具写的是 `武器对齐数据 · blade`。
    known_states = {"walk", "jump", "attack", "hurt", "pickup"}
    if data and set(data.keys()) <= known_states:
        m = re.search(r"[·:：]\s*([a-z]+)\s*$", raw.split("\n")[0]) or \
            re.search(r"\b(short|dagger|sword|axe|hammer|spear|bow|rock|blade|jar|bell)\b", raw)
        if not m:
            sys.exit("导出内容里没有武器名（顶层只有状态名）。请在工具里用"
                     "「生成整把武器」，或把工具导出的 JSON 整段发我。")
        data = {m.group(1): data}
    return data


# --------------------------------------------------------------------------- #
# 切出每个 (武器, 状态) 的块体
# --------------------------------------------------------------------------- #
def split_states(block: str):
    """返回 (starts, spans)。

    starts[(key, state)] = 状态头在 block 里的起点
    spans[(key, state)]  = (body_start, body_end)，body 从 '{' 之后到下一个
                           状态头 / 武器闭合之前 —— 状态块的 '}' 与 '},' 都算块体
                           的一部分（它们和 files 行挤在同一行里）。
    """
    spans = {}
    weapons = []
    for m in RE_WEAPON.finditer(block):
        close = RE_WCLOSE.search(block, m.end())
        kend = close.start() if close else len(block)
        weapons.append((m.group(1), m.end(), kend))
    for key, kstart, kend in weapons:
        headers = [(m.group(1), m.start(), m.end()) for m in RE_STATE.finditer(block, kstart, kend)]
        for i, (state, hstart, hend) in enumerate(headers):
            body_end = headers[i + 1][1] if i + 1 < len(headers) else kend
            spans[(key, state)] = (hend, body_end)
    return spans


def field_span(body: str, field: str):
    """定位 `field: <值>`。

    ⚠️ 不能用行首锚定：数据里 footY 与 anchorX 挤在同一行
       （`footY: 1.0, anchorX: [0.811, ...],`），按 `^\\s*anchorX:` 找
       一个都匹配不到 —— 这个坑让 --report 一开始静默输出「全部已对齐」。
    """
    return re.search(r"\b" + field + r":\s*(\[[^\]]*\]|[-0-9.]+)", body)


def frames_of(body: str) -> int:
    m = re.search(r"frames:\s*(\d+)", body)
    if m:
        return int(m.group(1))
    m = re.search(r"files:\s*\[([^\]]*)\]", body, re.S)
    return len(re.findall(r'"', m.group(1))) // 2 if m else -1


def anchors_of(body: str):
    m = field_span(body, "anchorX")
    if not m:
        return []
    inner = m.group(1).strip("[]")
    return [float(x) for x in inner.split(",") if x.strip()]


def foots_of(body: str):
    m = field_span(body, "footY")
    if not m:
        return []
    raw = m.group(1).strip()
    if raw.startswith("["):
        return [float(x) for x in raw.strip("[]").split(",") if x.strip()]
    try:
        return [float(raw)]
    except ValueError:
        return []


# --------------------------------------------------------------------------- #
# 格式化
# --------------------------------------------------------------------------- #
def fmt_num(v) -> str:
    s = ("%.4f" % float(v)).rstrip("0").rstrip(".")
    if s in ("", "-0", "-"):
        return "0"
    return s


def fmt_arr(vals) -> str:
    return "[" + ", ".join(fmt_num(v) for v in vals) + "]"


# --------------------------------------------------------------------------- #
# 现状报告
# --------------------------------------------------------------------------- #
def report(spans, block: str) -> int:
    """按**屏幕像素**报告，不用 0..1 的分数。

    为什么：anchorX 是「占画布宽的比例」，同一跨度在 361 宽与 543 宽的画布上
    差 1.5 倍。分数的阈值（0.02）既会漏掉窄画布上的真抖动，也会把宽画布上
    正常的身体摆动判成错。
    屏幕位移 = 跨度 × 画布宽 × scaleFix × 252 / 画布高（与 char-rig 同一套公式）。
    走路一个循环里身体本来就前后摆 5~15px（两拍交替、重心左右移），
    所以合格线定 16px；超过就说明还有帧没对齐。
    """
    TARGET_H = 252
    LIMIT = 16.0
    print("%-8s %-8s %-4s %-11s %-11s %-9s %s"
          % ("武器", "状态", "帧", "ax 最小", "ax 最大", "屏幕抖动", "判断"))
    bad = 0
    worst = 0.0
    for (key, state), (bs, be) in spans.items():
        body = block[bs:be]
        ax = anchors_of(body)
        if not ax:
            continue
        mw = re.search(r"\bw:\s*(\d+)", body)
        mh = re.search(r"\bh:\s*(\d+)", body)
        mf = re.search(r"\bscaleFix:\s*([\d.]+)", body)
        if not (mw and mh and mf):
            continue
        cw, ch, fix = int(mw.group(1)), int(mh.group(1)), float(mf.group(1))
        sc = TARGET_H / float(ch) * fix
        px = (max(ax) - min(ax)) * cw * sc
        ok = px <= LIMIT
        if not ok:
            bad += 1
            worst = max(worst, px)
        print("%-8s %-8s %-4d %-11.4f %-11.4f %-9.1f %s"
              % (key, state, len(ax), min(ax), max(ax), px,
                 "OK" if ok else "未对齐"))
    print("-" * 76)
    if bad:
        print("有 %d 个状态屏幕抖动 > %.0fpx（最大 %.0fpx）。"
              "用 tools/align_weapon_frames.html 对齐后导回。" % (bad, LIMIT, worst))
    else:
        print("全部状态屏幕抖动 ≤ %.0fpx（走路本身的身体摆动范围内）。" % LIMIT)
    return 0 if bad == 0 else 2


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("payload", nargs="?")
    ap.add_argument("--dry", action="store_true", help="只打印 diff，不写文件")
    ap.add_argument("--report", action="store_true", help="只报告当前数据的逐帧差")
    args = ap.parse_args()

    # newline="" —— 必须写。
    # 不写的话文本模式会把 \r\n 通用化成 \n，写回时整份文件的 374 行行尾
    # 全部翻转成 LF：git diff 从「11 行改动」变成「374 行全改」，
    # 真正的改动被行尾噪音埋掉。仓库里这份文件是 CRLF（见 git ls-files --eol）。
    src = open(DATA, encoding="utf-8", newline="").read()
    bi, ei = src.index(BEGIN), src.index(END)
    head, block, tail = src[:bi], src[bi:ei], src[ei:]
    spans = split_states(block)

    if args.report or not args.payload:
        return report(spans, block)

    payload = load_payload(args.payload)
    problems, edits, done = [], [], []

    for key, states in payload.items():
        if not isinstance(states, dict):
            problems.append("顶层 %s 不是对象（跳过）" % key)
            continue
        for state, vals in states.items():
            span = spans.get((key, state))
            if not span:
                problems.append("数据里没有 %s.%s（跳过）" % (key, state))
                continue
            if not isinstance(vals, dict):
                problems.append("%s.%s 不是对象（跳过）" % (key, state))
                continue
            ax = vals.get("anchorX")
            fy = vals.get("footY")
            if not isinstance(ax, list) or not ax:
                problems.append("%s.%s 的 anchorX 不是数组（跳过）" % (key, state))
                continue

            bs, be = span
            body = block[bs:be]
            n = frames_of(body)
            if n > 0 and len(ax) != n:
                problems.append("%s.%s 帧数对不上：数据 %d 帧、导出 %d 个 anchorX —— "
                                "导出的是旧数据，整段拒绝" % (key, state, n, len(ax)))
                continue

            new_body = body
            m = field_span(new_body, "anchorX")
            if not m:
                problems.append("%s.%s 块内找不到 anchorX 字段（跳过）" % (key, state))
                continue
            new_body = new_body[:m.start()] + "anchorX: " + fmt_arr(ax) + new_body[m.end():]

            fyv = fy if isinstance(fy, list) and fy else None
            if fyv is not None and len(fyv) != len(ax):
                problems.append("%s.%s 的 footY 个数与 anchorX 不一致（只改 anchorX）" % (key, state))
                fyv = None
            if fyv:
                m2 = field_span(new_body, "footY")
                if m2:
                    new_body = new_body[:m2.start()] + "footY: " + fmt_arr(fyv) + new_body[m2.end():]
                else:
                    problems.append("%s.%s 块内找不到 footY 字段（只改 anchorX）" % (key, state))

            edits.append((bs, be, new_body, key, state, len(ax), ax, fyv))

    if problems:
        for p in problems:
            print("  [WARN] " + p)
    if not edits:
        print("没有任何字段被修改。检查导出内容里的武器 / 状态名。")
        return 1

    # 从后往前替换：位置不会互相干扰
    new_block = block
    for bs, be, new_body, *_ in sorted(edits, key=lambda e: e[0], reverse=True):
        new_block = new_block[:bs] + new_body + new_block[be:]
    out = head + new_block + tail

    if args.dry:
        print("--- dry-run：将写入 %s（未落盘）---" % os.path.relpath(DATA, ROOT))
        d = difflib.unified_diff(src.split("\n"), out.split("\n"),
                                 "a/js/anim-data.js", "b/js/anim-data.js", lineterm="", n=1)
        print("\n".join(list(d)[:220]))
        print("--- 共 %d 个状态会被改写 ---" % len(edits))
        return 0

    bak = DATA + ".bak"
    shutil.copyfile(DATA, bak)
    open(DATA, "w", encoding="utf-8", newline="").write(out)

    r = subprocess.run(["node", "--check", DATA], capture_output=True, text=True,
                       cwd=ROOT, shell=(os.name == "nt"))
    if r.returncode != 0:
        shutil.copyfile(bak, DATA)
        os.remove(bak)
        sys.exit("语法检查失败，已回滚：\n" + (r.stderr or r.stdout))

    os.remove(bak)
    print("已写入 %s（node --check 通过）" % os.path.relpath(DATA, ROOT))
    still = 0
    for bs, be, _nb, key, state, n, ax, fyv in edits:
        span = max(ax) - min(ax)
        if span > 0.02:
            still += 1
        print("  [OK]   %-8s %-8s %d 帧  anchorX %s  footY %s"
              % (key, state, n, fmt_arr(ax), fmt_arr(fyv) if fyv else "未改"))
    if still:
        print("注意：其中 %d 个状态的 anchorX 跨度仍 > 0.02（导出值本身还没对齐）。" % still)
    print("接着跑：node tools/selftest_weapons.mjs && node tools/check-inline.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
