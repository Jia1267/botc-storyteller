import { isEvilTeam, ROLES } from './roles';
import { aliveSeats, isEvil, isTraveller } from './core';
import type { Rng } from './rng';
import type { GameState } from './types';

/** 说书人的一个可选项 */
export interface Choice<T> {
  key: string;
  label: string;
  value: T;
  /** -2..+2：正数帮善良，负数帮邪恶 */
  lean: number;
  reason: string;
  /** 这条信息是否符合真实情况（复盘标真假用） */
  truth: boolean;
  /** 合法但误导（间谍/陌客的登记） */
  twist?: boolean;
  /** 均势时优先选它 */
  standard?: boolean;
}

export interface BalancePart {
  name: string;
  value: number;
  text: string;
}

export interface Balance {
  score: number;
  label: string;
  parts: BalancePart[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function setupLabel(z: number): string {
  if (z >= 0.8) return '偏善良';
  if (z <= -0.8) return '偏邪恶';
  return '均衡';
}

/**
 * 局势指数：-100（邪恶大优势）到 +100（善良大优势）。
 * 由配板、人数、时间、信息四部分相加，每部分都能用一句话讲清楚。
 */
export function balance(s: GameState): Balance {
  const parts: BalancePart[] = [];
  const setupPart = clamp(s.setupZ * 15, -25, 25) * 0.6;
  parts.push({ name: '配板', value: setupPart, text: `配板${setupLabel(s.setupZ)}` });

  if (s.phase !== 'setup' && s.phase !== 'deal') {
    const evil0 = s.seats.filter((x) => isEvilTeam(ROLES[x.startRole].team)).length;
    const good0 = s.count - evil0;
    const alive = aliveSeats(s).filter((x) => !isTraveller(x));
    const aliveEvil = alive.filter(isEvil).length;
    const aliveGood = alive.length - aliveEvil;

    const ms = aliveEvil === 0 ? 40 : clamp((aliveGood / aliveEvil / (good0 / evil0) - 1) * 25, -40, 40);
    const dir = ms > 2 ? '比开局对善良更有利' : ms < -2 ? '比开局对邪恶更有利' : '和开局差不多';
    parts.push({ name: '人数', value: ms, text: `存活 ${alive.length} 人，其中邪恶 ${aliveEvil} 人，${dir}` });

    const E = Math.floor((alive.length - 1) / 2);
    const E0 = Math.floor((s.count - 1) / 2);
    const ts = clamp((E - aliveEvil - (E0 - evil0)) * 5, -25, 25);
    parts.push({ name: '时间', value: ts, text: `还剩约 ${E} 次处决机会，邪恶还剩 ${aliveEvil} 人` });

    let demonExp = 0;
    let minionExp = 0;
    for (const x of alive) {
      const e = s.exposure[x.n] ?? 0;
      if (x.role === 'imp') demonExp += e;
      else if (ROLES[x.role].team === 'minion') minionExp += e;
    }
    const is = clamp(demonExp * 6 + minionExp * 3 + s.infoTrue * 0.5 - s.infoFalse * 1.5, -30, 30);
    parts.push({
      name: '信息',
      value: is,
      text: `恶魔被真实信息指向 ${demonExp} 次，存活爪牙 ${minionExp} 次；真信息 ${s.infoTrue} 条，假/误导信息 ${s.infoFalse} 条`,
    });
  }

  const score = clamp(Math.round(parts.reduce((a, p) => a + p.value, 0)), -100, 100);
  return { score, label: scoreLabel(score), parts };
}

export function scoreLabel(score: number): string {
  if (score >= 30) return '善良大优势';
  if (score >= 12) return '善良优势';
  if (score <= -30) return '邪恶大优势';
  if (score <= -12) return '邪恶优势';
  return '均势';
}

/** 局势 → 希望这次选择往哪边倾斜 */
export function targetLean(score: number): number {
  if (score >= 30) return -2;
  if (score >= 12) return -1;
  if (score <= -30) return 2;
  if (score <= -12) return 1;
  return 0;
}

/** 从选项里挑最符合局势的一个，返回下标 */
export function recommend<T>(choices: Choice<T>[], score: number, rng: Rng): number {
  if (choices.length <= 1) return 0;
  const t = targetLean(score);
  let best = Infinity;
  let cands: number[] = [];
  choices.forEach((c, i) => {
    const d = Math.abs(c.lean - t);
    if (d < best) {
      best = d;
      cands = [i];
    } else if (d === best) cands.push(i);
  });
  const std = cands.filter((i) => choices[i].standard);
  const pool = std.length ? std : cands;
  return pool[Math.floor(rng() * pool.length)];
}

export function leanTag(lean: number): string {
  if (lean >= 2) return '大帮善良';
  if (lean >= 1) return '帮善良';
  if (lean <= -2) return '大帮邪恶';
  if (lean <= -1) return '帮邪恶';
  return '中立';
}

/** 推荐理由的开头一句 */
export function whyPrefix(score: number, choicesCount: number, pickedLean = 0): string {
  if (choicesCount <= 1) return '只有这一种合规的给法。';
  const t = targetLean(score);
  const sign = score > 0 ? `+${score}` : `${score}`;
  const dir =
    t < 0
      ? '这次稍微帮一下邪恶方'
      : t > 0
        ? '这次稍微帮一下善良方'
        : pickedLean === 0
          ? '按标准做法来'
          : '两边都可以，这次随机挑了一个';
  return `局势：${scoreLabel(score)}（${sign}），${dir}。`;
}
