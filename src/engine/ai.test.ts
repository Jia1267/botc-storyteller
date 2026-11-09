import { describe, expect, it } from 'vitest';
import { aiBoardOk, aiPlan, aiSetCount, aiSlayer, aiVirgin, tallyHands, voteOrder, type AI_SCRIPTS, type AiAnswer, type AiAsk } from './ai';
import { completeSlot, currentSlot, execute, finishDay, nomResults, voteNeed } from './flow';
import { seeded, type Rng } from './rng';
import { newGame, setScript, shuffleSeats, startDeal } from './setup';
import { finishDeal } from './flow';
import { dawnLines } from './scripts';
import type { GameState } from './types';

/** 一局 AI：网页配板（不配 AI 带不了的角色）、随机坐、发完身份进第 1 夜 */
function aiGame(count: number, seed: number, script: (typeof AI_SCRIPTS)[number] = 'tb'): GameState {
  const rng = seeded(seed);
  const s = newGame();
  setScript(s, script);
  aiSetCount(s, count, rng);
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
      const r0 = plan.then(pick(s, plan.ask, rng));
      // 哈迪寂亚：再问选中的三个人
      const r = 'more' in r0 ? r0.then(r0.more.map((q) => pick(s, q, rng))) : r0;
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
        const r0 = plan.then(pick(s, plan.ask, rng));
        const r = 'more' in r0 ? r0.then(r0.more.map((q) => pick(s, q, rng))) : r0;
        if (r.payload.kind === 'fortune') expect(r.send[0].card.big[0]).toBe(r.payload.yes ? '有恶魔' : '没有恶魔');
        completeSlot(s, r.payload);
      } else {
        if (plan.payload.kind === 'number') expect(plan.send[0].card.big).toEqual([String(plan.payload.num)]);
        completeSlot(s, plan.payload);
      }
    }
    expect(s.phase).toBe('day');
  });

  it('残阳高照、幽灵茶会、王不见王：夜里每一步都有处理办法；不配要靠人判断的角色', () => {
    const cases = [
      ['sunset', 5, 2],
      ['spooky', 5, 2],
      ['alvsal', 7, 9],
    ] as const;
    for (const [script, min, span] of cases)
      for (let seed = 1; seed <= 30; seed++) {
        const rng = seeded(seed * 29);
        const s = aiGame(min + (seed % span), seed, script);
        // 在场的角色、酒鬼/提线木偶以为的身份、恶魔的伪装都不能是 AI 带不了的
        expect(aiBoardOk([...s.seats.map((x) => x.role), ...s.bluffs, ...[s.drunkFake, s.marionetteFake].filter((r) => r !== null)]), `${script} 种子 ${seed}`).toBe(true);
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

  it('每条线索都有理由：清醒健康的人只拿真信息或规则允许的误导，假信息都写明是醉酒、中毒还是涡流', () => {
    const cases = [
      ['tb', 5, 11],
      ['bmr', 7, 9],
      ['sv', 5, 11],
      ['sunset', 5, 2],
      ['spooky', 5, 2],
      ['alvsal', 7, 9],
    ] as const;
    let falses = 0;
    for (const [script, min, span] of cases)
      for (let seed = 1; seed <= 20; seed++) {
        const rng = seeded(seed * 41);
        const s = aiGame(min + (seed % span), seed + 900, script);
        for (let round = 0; round < 12 && s.phase !== 'end'; round++) {
          runNight(s, rng);
          if (s.phase !== 'day') break;
          const alive = s.seats.filter((x) => x.alive);
          execute(s, rng() < 0.6 ? alive[Math.floor(rng() * alive.length)].n : null);
          if (s.phase === 'day') finishDay(s);
        }
        for (const e of s.log) {
          if (e.truth !== 'false') continue;
          falses++;
          // 记录里标红的：假信息（写明醉酒/中毒/涡流）或规则允许的误导（间谍、陌客）
          expect(e.text, `${script} 种子 ${seed}`).toMatch(/（(假信息|合规误导)：.+）/);
        }
      }
    // 真的跑到了假信息（醉酒、中毒的局不少）
    expect(falses).toBeGreaterThan(20);
  });

  it('心上人死了：AI 说书人当晚按推荐选一个人从此醉酒；修补匠那一步也会处理（不会被当成没人行动跳过）', () => {
    const s = newGame();
    setScript(s, 'sv');
    aiSetCount(s, 7, seeded(1));
    const roles = ['clockmaker', 'dreamer', 'sweetheart', 'mathematician', 'flowergirl', 'witch', 'nodashii'] as const;
    s.seats.forEach((x, i) => (x.role = x.startRole = roles[i]));
    s.demonChar = 'nodashii';
    startDeal(s);
    finishDeal(s);
    const rng = seeded(2);
    runNight(s, rng);
    execute(s, 3);
    finishDay(s);
    runNight(s, rng);
    expect(s.sweetheartDrunk).not.toBeNull();
    expect(s.log.some((e) => e.text.includes('心上人死了'))).toBe(true);

    const b = newGame();
    setScript(b, 'bmr');
    aiSetCount(b, 7, seeded(1));
    const broles = ['grandmother', 'sailor', 'tinker', 'chambermaid', 'exorcist', 'godfather', 'zombuul'] as const;
    b.seats.forEach((x, i) => (x.role = x.startRole = broles[i]));
    b.demonChar = 'zombuul';
    startDeal(b);
    finishDeal(b);
    runNight(b, rng);
    execute(b, null);
    finishDay(b);
    let seen = false;
    for (let g = 0; g < 40 && b.phase === 'night'; g++) {
      const plan = aiPlan(b, { spyRows: () => [] })!;
      if (currentSlot(b) === 'tinker') {
        seen = true;
        expect('payload' in plan && plan.payload.kind).toBe('yesno');
      }
      if ('ask' in plan) {
        const r0 = plan.then(pick(b, plan.ask, rng));
        completeSlot(b, ('more' in r0 ? r0.then(r0.more.map((q) => pick(b, q, rng))) : r0).payload);
      } else completeSlot(b, plan.payload);
    }
    expect(seen).toBe(true);
  });

  it('报丧女妖能力生效：举手算两票，死了也不用掉那一票', () => {
    const s = aiGame(7, 2);
    s.seats.forEach((x, i) => (x.role = (['banshee', 'chef', 'empath', 'dreamer', 'general', 'poisoner', 'alhadikhia'] as const)[i]));
    s.seats[0].alive = false;
    s.bansheeActive = 1;
    const order = voteOrder(s, 7);
    expect(tallyHands(s, order, { 1: true, 2: true }, []).votes).toBe(3);
    expect(tallyHands(s, order, { 1: true }, []).spent).toEqual([]);
  });

  it('哈迪寂亚让死人复活：天亮念"复活了"，不说"活着"，也不重复念', () => {
    const t = dawnLines([4], 'simple', { phones: true, hadikhia: { picks: [2, 3, 4], alive: [true, true, false] }, revived: [2] }).join('');
    expect(t).toContain('2号复活了');
    expect(t).toContain('3号活着');
    expect(t).toContain('4号死了');
    expect(t.match(/复活/g)?.length).toBe(1);
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
