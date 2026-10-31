import { describe, expect, it } from 'vitest';
import { aiBoardOk, aiFixBoard, aiPlan, aiSlayer, aiVirgin, tallyHands, voteOrder, type AiAnswer, type AiAsk } from './ai';
import { completeSlot, currentSlot, execute, finishDay, nomResults, voteNeed } from './flow';
import { seeded, type Rng } from './rng';
import { newGame, setCount, setScript, shuffleSeats, startDeal } from './setup';
import { finishDeal } from './flow';
import type { GameState } from './types';

/** 一局 AI：网页配板（不配 AI 带不了的角色）、随机坐、发完身份进第 1 夜 */
function aiGame(count: number, seed: number, script: 'tb' | 'bmr' | 'sv' = 'tb'): GameState {
  const rng = seeded(seed);
  const s = newGame();
  setScript(s, script);
  setCount(s, count, rng);
  aiFixBoard(s, rng);
  shuffleSeats(s, rng);
  startDeal(s);
  finishDeal(s);
  return s;
}

/** 手机上的玩家：随机选能选的人和角色，能"不用"时偶尔不用 */
function pick(s: GameState, a: AiAsk, rng: Rng): AiAnswer {
  if (a.skip && rng() < 0.3) return { seats: [], opts: [], skip: true };
  const pool = s.seats.map((x) => x.n).filter((n) => !(a.disabled ?? []).includes(n));
  const out: number[] = [];
  while (out.length < a.count && out.length < pool.length) {
    const n = pool[Math.floor(rng() * pool.length)];
    if (!out.includes(n)) out.push(n);
  }
  const opts = a.opts?.length ? [a.opts[Math.floor(rng() * a.opts.length)].id] : [];
  return { seats: out, opts, skip: false };
}

/** 走完一整晚，返回走过的步骤 */
function runNight(s: GameState, rng: Rng): string[] {
  const seen: string[] = [];
  for (let guard = 0; guard < 60 && s.phase === 'night'; guard++) {
    const slot = currentSlot(s);
    seen.push(slot);
    const plan = aiPlan(s, { spyRows: () => ['1号 · 间谍'] });
    expect(plan, `第 ${s.night} 夜 ${slot} 没有处理办法`).not.toBeNull();
    if ('ask' in plan!) {
      const r = plan.then(pick(s, plan.ask, rng));
      for (const m of r.send) expect(m.card.big.length + (m.card.rows?.length ?? 0)).toBeGreaterThan(0);
      completeSlot(s, r.payload);
    } else completeSlot(s, plan!.payload);
  }
  return seen;
}

describe('AI 说书人（暗流涌动）', () => {
  it('夜里每一步都有处理办法，一局能从第 1 夜走到结束', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed * 97);
      const s = aiGame(5 + (seed % 11), seed);
      for (let round = 0; round < 12 && s.phase !== 'end'; round++) {
        runNight(s, rng);
        if (s.phase !== 'day') break;
        // 白天：随机处决一个活人或者不处决
        const alive = s.seats.filter((x) => x.alive);
        execute(s, rng() < 0.6 ? alive[Math.floor(rng() * alive.length)].n : null);
        finishDay(s);
      }
      expect(['end', 'night', 'day']).toContain(s.phase);
    }
  });

  it('暗月初升：夜里每一步都有处理办法，一局能走到结束；不配造谣者', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed * 53);
      const s = aiGame(7 + (seed % 9), seed, 'bmr');
      expect(s.seats.some((x) => x.role === 'gossip')).toBe(false);
      for (let round = 0; round < 12 && s.phase !== 'end'; round++) {
        runNight(s, rng);
        if (s.phase !== 'day') break;
        const alive = s.seats.filter((x) => x.alive);
        execute(s, rng() < 0.6 ? alive[Math.floor(rng() * alive.length)].n : null);
        if (s.phase === 'day') finishDay(s);
      }
      expect(['end', 'night', 'day']).toContain(s.phase);
    }
  });

  it('梦殒春宵：夜里每一步都有处理办法，一局能走到结束；不配要靠人判断的角色', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = seeded(seed * 71);
      const s = aiGame(5 + (seed % 11), seed, 'sv');
      expect(aiBoardOk(s.seats.map((x) => x.role))).toBe(true);
      for (let round = 0; round < 12 && s.phase !== 'end'; round++) {
        runNight(s, rng);
        if (s.phase !== 'day') break;
        const alive = s.seats.filter((x) => x.alive);
        execute(s, rng() < 0.6 ? alive[Math.floor(rng() * alive.length)].n : null);
        if (s.phase === 'day') finishDay(s);
      }
      expect(['end', 'night', 'day']).toContain(s.phase);
    }
  });

  it('信息步骤给的卡片和记下的结果一致', () => {
    const s = aiGame(8, 3);
    const rng = seeded(5);
    for (let guard = 0; guard < 30 && s.phase === 'night'; guard++) {
      const plan = aiPlan(s, { spyRows: () => [] })!;
      if ('ask' in plan) {
        const r = plan.then(pick(s, plan.ask, rng));
        if (r.payload.kind === 'fortune') expect(r.send[0].card.big[0]).toBe(r.payload.yes ? '有恶魔' : '没有恶魔');
        completeSlot(s, r.payload);
      } else {
        if (plan.payload.kind === 'number') expect(plan.send[0].card.big).toEqual([String(plan.payload.num)]);
        completeSlot(s, plan.payload);
      }
    }
    expect(s.phase).toBe('day');
  });

  it('投票顺序：从被提名者下一位开始，被提名者最后', () => {
    const s = aiGame(6, 1);
    expect(voteOrder(s, 3)).toEqual([4, 5, 6, 1, 2, 3]);
    expect(voteOrder(s, 6)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('数票：死人只有一票，管家要主人举手才算', () => {
    const s = aiGame(7, 2);
    s.seats.forEach((x, i) => (x.role = (['butler', 'chef', 'empath', 'monk', 'mayor', 'poisoner', 'imp'] as const)[i]));
    s.butlerMaster = 2;
    s.seats[3].alive = false; // 4 号死了
    const order = voteOrder(s, 7);
    // 主人没举手：管家不算
    expect(tallyHands(s, order, { 1: true, 3: true }, []).votes).toBe(1);
    // 主人举手：管家算
    expect(tallyHands(s, order, { 1: true, 2: true }, []).votes).toBe(2);
    // 死人第一次举手算、用掉；用过以后不算
    expect(tallyHands(s, order, { 4: true }, [])).toEqual({ votes: 1, counted: [4], spent: [4] });
    expect(tallyHands(s, order, { 4: true }, [4]).votes).toBe(0);
  });

  it('够票、比之前多才上处决台；平票都不处决', () => {
    const s = aiGame(6, 4);
    for (let i = 0; i < 2; i++) runNight(s, seeded(1));
    if (s.phase !== 'day') return;
    const need = voteNeed(s);
    s.noms.push({ day: s.night, seat: 1, votes: need, need });
    expect(nomResults(s).block).toBe(1);
    s.noms.push({ day: s.night, seat: 2, votes: need, need });
    expect(nomResults(s).block).toBeNull();
  });

  it('贞洁者：只有被提名的人真是贞洁者才算；猎手：只有打中恶魔才死', () => {
    const s = aiGame(7, 6);
    s.seats.forEach((x, i) => (x.role = (['virgin', 'slayer', 'empath', 'monk', 'chef', 'poisoner', 'imp'] as const)[i]));
    expect(aiVirgin(s, 1, 3).virgin).toBe(true);
    expect(aiVirgin(s, 2, 3).virgin).toBe(false);
    expect(aiSlayer(s, 2, 7).hits).toBe(true);
    expect(aiSlayer(s, 2, 6).hits).toBe(false);
    expect(aiSlayer(s, 3, 7).hits).toBe(false);
  });
});
