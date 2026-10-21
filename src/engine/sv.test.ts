import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { newGame, randomSetup, refreshSetup, setCount, setCustomScript, startDeal } from './setup';
import { makeCustom } from './custom';
import {
  cereVerdict, completeSlot, currentSlot, dealNext, execute, finishDay, jugglerCount, jugglerGuess, pithagBlock, slotActor, witchStrikes, type SlotPayload,
} from './flow';
import { clockmakerCount, mathCount, oracleCount } from './info';
import { isEvil, isPoisoned, malfunction, seatOf, townsfolkNeighbors } from './core';
import type { GameState, SlotId } from './types';

/** 按给定角色坐好并发完身份，停在第 1 夜开头 */
function game(roles: RoleId[], extra: Partial<GameState> = {}): GameState {
  const s = newGame();
  s.script = 'sv';
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.demonChar = roles.find((r) => ROLES[r].team === 'demon')!;
  refreshSetup(s, seeded(1));
  Object.assign(s, extra);
  startDeal(s);
  for (let i = 0; i < s.count; i++) dealNext(s);
  return s;
}

/** 走完当前夜晚；answers 里没给的步骤用 {kind:'none'} */
function night(s: GameState, answers: Partial<Record<SlotId, SlotPayload>> = {}): SlotId[] {
  const seen: SlotId[] = [];
  for (let guard = 0; guard < 60 && currentSlot(s) !== 'dawn'; guard++) {
    const slot = currentSlot(s);
    seen.push(slot);
    completeSlot(s, answers[slot] ?? { kind: 'none' });
  }
  completeSlot(s, { kind: 'none' });
  return seen;
}

function day(s: GameState, exec: number | null = null) {
  execute(s, exec);
  finishDay(s);
}

// 7 人局：5 镇民 0 外来者 1 爪牙 1 恶魔
const BASE: RoleId[] = ['clockmaker', 'dreamer', 'oracle', 'witch', 'nodashii', 'sage', 'mathematician'];

describe('梦殒春宵：配板', () => {
  it('方古多一个外来者，亡骨魔少一个外来者', () => {
    for (let i = 0; i < 60; i++) {
      const x = randomSetup('sv', 8, seeded(i));
      const outs = x.roles.filter((r) => ROLES[r].team === 'outsider').length;
      expect(x.roles.length).toBe(8);
      // 8 人局本来 1 个外来者
      expect(outs).toBe(x.demonChar === 'fanggu' ? 2 : x.demonChar === 'vigormortis' ? 0 : 1);
    }
  });

  it('镜像双子在场：开局自动选一名善良玩家当双子', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'eviltwin', 'nodashii', 'sage', 'mathematician']);
    expect(s.twin).not.toBeNull();
    expect(isEvil(seatOf(s, s.twin!))).toBe(false);
  });
});

describe('梦殒春宵：信息', () => {
  it('钟表匠：恶魔到最近爪牙的步数（左右取近的）', () => {
    // 5 号恶魔，4 号女巫：挨着 = 1
    const s = game(BASE);
    expect(clockmakerCount(s)).toBe(1);
    const t = game(['witch', 'dreamer', 'oracle', 'clockmaker', 'nodashii', 'sage', 'mathematician']);
    // 恶魔 5 号，女巫 1 号：往右 5→6→7→1 是 3 步，往左 5→4→3→2→1 是 4 步
    expect(clockmakerCount(t)).toBe(3);
  });

  it('诺-达鲺：左右最近的镇民中毒（跳过爪牙），死了也算', () => {
    const s = game(BASE);
    // 恶魔 5 号：左边 4 号是女巫，跳过到 3 号神谕者；右边 6 号贤者
    expect(townsfolkNeighbors(s, 5).sort()).toEqual([3, 6]);
    expect(isPoisoned(s, 3)).toBe(true);
    expect(isPoisoned(s, 6)).toBe(true);
    expect(isPoisoned(s, 2)).toBe(false);
    s.seats[5].alive = false;
    expect(isPoisoned(s, 6)).toBe(true);
  });

  it('数学家：中毒的人拿到假信息算一个；中毒的人碰巧拿到真信息不算', () => {
    const s = game(BASE);
    // 第一晚：钟表匠（1 号，健康）给真数字，筑梦师（2 号）健康
    night(s, {
      clockmaker: { kind: 'number', num: 1, truth: true },
      dreamer: { kind: 'dreamer', target: 5, good: 'sage', evil: 'nodashii', truth: true },
    });
    expect(s.abnormal).toEqual([]);
    day(s);
    // 第二晚：神谕者（3 号，被诺-达鲺毒）拿到假数字
    let seen = 0;
    for (let guard = 0; guard < 40 && currentSlot(s) !== 'dawn'; guard++) {
      const slot = currentSlot(s);
      if (slot === 'oracle') {
        completeSlot(s, { kind: 'number', num: 2, truth: false });
        continue;
      }
      if (slot === 'mathematician') {
        seen = mathCount(s, 7);
        completeSlot(s, { kind: 'number', num: seen, truth: true });
        continue;
      }
      completeSlot(s, slot === 'nodashii' ? { kind: 'target', target: 2 } : { kind: 'none' });
    }
    expect(seen).toBe(1);
  });

  it('神谕者：数死去的邪恶玩家', () => {
    const s = game(BASE);
    expect(oracleCount(s)).toBe(0);
    s.seats[3].alive = false;
    s.seats[1].alive = false;
    expect(oracleCount(s)).toBe(1);
  });

  it('贤者：被恶魔杀死当晚醒', () => {
    const s = game(BASE);
    night(s);
    day(s);
    const seen = night(s, { nodashii: { kind: 'target', target: 6 } });
    expect(seen).toContain('sage');
    expect(seatOf(s, 6).alive).toBe(false);
  });

  it('杂耍艺人：第一个白天公开猜，当晚醒来得知猜对几个', () => {
    const s = game(['juggler', 'dreamer', 'oracle', 'witch', 'nodashii', 'sage', 'mathematician']);
    night(s);
    const guesses = [
      { seat: 4, role: 'witch' as RoleId },
      { seat: 5, role: 'vortox' as RoleId },
    ];
    expect(jugglerCount(s, guesses)).toBe(1);
    jugglerGuess(s, 1, guesses, 1);
    day(s);
    const seen = night(s, { nodashii: { kind: 'target', target: 3 } });
    expect(seen).toContain('juggler');
  });
});

describe('梦殒春宵：改变角色', () => {
  it('舞蛇人选中恶魔：交换角色和阵营，前恶魔一直中毒', () => {
    const s = game(['snakecharmer', 'dreamer', 'oracle', 'witch', 'vortox', 'sage', 'mathematician']);
    night(s, { snakecharmer: { kind: 'target', target: 5 } });
    expect(seatOf(s, 1).role).toBe('vortox');
    expect(isEvil(seatOf(s, 1))).toBe(true);
    expect(seatOf(s, 5).role).toBe('snakecharmer');
    expect(isEvil(seatOf(s, 5))).toBe(false);
    expect(isPoisoned(s, 5)).toBe(true);
  });

  it('哲学家选在场的角色：那个人醉酒；第三晚选钟表匠当晚马上用', () => {
    const s = game(['philosopher', 'dreamer', 'oracle', 'witch', 'nodashii', 'sage', 'clockmaker']);
    // 第一晚不用
    night(s, { philosopher: { kind: 'philo', role: null } });
    day(s);
    // 第二晚选钟表匠（在场，7 号醉酒），当晚马上用
    const seen: SlotId[] = [];
    for (let guard = 0; guard < 40 && currentSlot(s) !== 'dawn'; guard++) {
      const slot = currentSlot(s);
      seen.push(slot);
      if (slot === 'philosopher' && !s.ns!.philoNow) completeSlot(s, { kind: 'philo', role: 'clockmaker' });
      else if (slot === 'philosopher') {
        expect(s.ns!.philoNow).toBe('clockmaker');
        expect(slotActor(s, slot)?.n).toBe(1);
        completeSlot(s, { kind: 'number', num: 1, truth: true });
      } else completeSlot(s, slot === 'nodashii' ? { kind: 'target', target: 2 } : { kind: 'none' });
    }
    expect(seen.filter((x) => x === 'philosopher')).toHaveLength(2);
    expect(s.gained[1]).toBe('clockmaker');
    expect(malfunction(s, 7)).toBe(true);
  });

  it('方古第一次杀外来者：外来者变成邪恶的方古，原来的方古死', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'witch', 'fanggu', 'sage', 'mutant', 'klutz']);
    night(s);
    day(s);
    night(s, { fanggu: { kind: 'target', target: 7 } });
    expect(seatOf(s, 7).role).toBe('fanggu');
    expect(isEvil(seatOf(s, 7))).toBe(true);
    expect(seatOf(s, 7).alive).toBe(true);
    expect(seatOf(s, 5).alive).toBe(false);
    expect(s.winner).toBeNull();
    day(s);
    // 第二次杀外来者就是正常死亡
    night(s, { fanggu: { kind: 'target', target: 8 } });
    expect(seatOf(s, 8).alive).toBe(false);
    expect(seatOf(s, 8).role).toBe('klutz');
  });

  it('亡骨魔杀死爪牙：爪牙保留能力（女巫照常醒），选的镇民中毒', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'witch', 'vigormortis', 'sage', 'mathematician']);
    night(s);
    day(s);
    night(s, { vigormortis: { kind: 'vigor', target: 4, poison: 3 } });
    expect(seatOf(s, 4).alive).toBe(false);
    expect(isPoisoned(s, 3)).toBe(true);
    day(s);
    const seen = night(s, { witch: { kind: 'target', target: 2 }, vigormortis: { kind: 'vigor', target: 6, poison: null } });
    expect(seen).toContain('witch');
    expect(s.witchCurse?.seat).toBe(2);
  });

  it('麻脸巫婆：把恶魔换成另一种恶魔，说书人可以让今晚没人死', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'pithag', 'nodashii', 'sage', 'mathematician']);
    night(s);
    day(s);
    expect(pithagBlock(s, 2, 'vortox')).toMatch(/善良/);
    const seen = night(s, { pithag: { kind: 'pithag', target: 5, role: 'vortox', deaths: [], noKill: true } });
    expect(seatOf(s, 5).role).toBe('vortox');
    expect(seen).not.toContain('vortox');
    expect(s.seats.every((x) => x.alive)).toBe(true);
  });

  it('麻脸巫婆：把善良玩家变成外来者，阵营不变', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'pithag', 'nodashii', 'sage', 'mathematician']);
    night(s);
    day(s);
    night(s, { pithag: { kind: 'pithag', target: 2, role: 'klutz', deaths: [], noKill: false }, nodashii: { kind: 'target', target: 7 } });
    expect(seatOf(s, 2).role).toBe('klutz');
    expect(isEvil(seatOf(s, 2))).toBe(false);
  });
});

describe('梦殒春宵：随机打很多局不出错', () => {
  /** 每一步给一个说得通的回答（选第一个活着的其他人、第一个推荐） */
  function auto(s: GameState): SlotPayload {
    const slot = currentSlot(s);
    const actor = slotActor(s, slot);
    const others = s.seats.filter((x) => x.alive && x.n !== actor?.n).map((x) => x.n);
    const t = others[0] ?? 1;
    switch (slot) {
      case 'witch': case 'snakecharmer': case 'fanggu': case 'nodashii':
        return { kind: 'target', target: t };
      case 'vigormortis':
        return { kind: 'vigor', target: t, poison: null };
      case 'cerenovus':
        return { kind: 'cere', target: t, role: 'sage' };
      case 'pithag':
        return { kind: 'pithag', target: t, role: 'klutz', deaths: [], noKill: false };
      case 'philosopher':
        return s.ns!.philoNow ? { kind: 'number', num: 1, truth: true } : { kind: 'philo', role: s.night === 2 ? 'clockmaker' : null };
      case 'clockmaker': case 'mathematician': case 'oracle': case 'juggler': case 'dreamer':
        return slot === 'dreamer' ? { kind: 'dreamer', target: t, good: 'sage', evil: 'witch', truth: true } : { kind: 'number', num: 0, truth: true };
      case 'towncrier': case 'flowergirl':
        return { kind: 'yesno', yes: false, truth: true };
      case 'sage':
        return { kind: 'sage', picks: [1, 2], truth: true };
      case 'seamstress':
        return { kind: 'seamstress', picks: null, same: false, truth: true };
      case 'sweetheart':
        return { kind: 'target', target: t };
      case 'barber':
        return { kind: 'barber', swap: null };
      default:
        return { kind: 'none' };
    }
  }

  it('5–15 人，各种恶魔，走四夜', () => {
    for (let seed = 0; seed < 60; seed++) {
      const count = 5 + (seed % 11);
      const x = randomSetup('sv', count, seeded(seed));
      const s = game(x.roles);
      if (x.demonChar !== s.demonChar) continue;
      for (let n = 0; n < 4 && !s.winner; n++) {
        for (let guard = 0; guard < 80 && s.phase === 'night'; guard++) completeSlot(s, auto(s));
        expect(s.phase === 'day' || s.phase === 'end').toBe(true);
        // 同时活着的恶魔最多一个
        expect(s.seats.filter((y) => y.alive && ROLES[y.role].team === 'demon').length).toBeLessThanOrEqual(1);
        if (s.phase === 'day') day(s, s.seats.find((y) => y.alive && !isEvil(y))?.n ?? null);
      }
    }
  });
});

describe('自由配板：随机挑角色组板，走三夜不出错', () => {
  it('跨剧本混搭的板子', () => {
    const pool = (Object.keys(ROLES) as RoleId[]).filter((r) => ROLES[r].team !== 'traveller');
    for (let seed = 0; seed < 40; seed++) {
      const rng = seeded(500 + seed);
      const pickN = (team: string, n: number) => pool.filter((r) => ROLES[r].team === team).sort(() => rng() - 0.5).slice(0, n);
      const roles = [...pickN('townsfolk', 10), ...pickN('outsider', 3), ...pickN('minion', 4), ...pickN('demon', 2)];
      const def = makeCustom('测试板', roles);
      const s = newGame();
      setCustomScript(s, def);
      setCount(s, def.min + (seed % (def.max - def.min + 1)), rng);
      startDeal(s);
      while (s.phase === 'deal') dealNext(s);
      for (let n = 0; n < 3 && !s.winner; n++) {
        for (let guard = 0; guard < 80 && s.phase === 'night'; guard++) {
          const slot = currentSlot(s);
          const a = slotActor(s, slot);
          const t = s.seats.find((x) => x.alive && x.n !== a?.n)?.n ?? 1;
          completeSlot(s, ['witch', 'snakecharmer', 'fanggu', 'nodashii', 'poisoner', 'monk', 'zombuul', 'godfather'].includes(slot) ? { kind: 'target', target: t } : slot === 'imp' || slot === 'vortox' ? { kind: 'imp', target: t } : { kind: 'none' });
        }
        expect(s.phase === 'day' || s.phase === 'end').toBe(true);
        if (s.phase === 'day') day(s, null);
      }
    }
  });
});

describe('梦殒春宵：白天与胜负', () => {
  it('女巫诅咒的人提名就死', () => {
    const s = game(BASE);
    night(s, { witch: { kind: 'target', target: 2 } });
    expect(s.witchCurse).toEqual({ seat: 2, night: 1 });
    witchStrikes(s);
    expect(seatOf(s, 2).alive).toBe(false);
  });

  it('洗脑师：没做到疯狂，说书人处决他（算今天的处决）', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'cerenovus', 'nodashii', 'sage', 'mathematician']);
    night(s, { cerenovus: { kind: 'cere', target: 2, role: 'sage' } });
    expect(s.cereMad).toEqual({ seat: 2, role: 'sage', night: 1 });
    cereVerdict(s, true);
    expect(s.executed).toBe(2);
    expect(seatOf(s, 2).alive).toBe(false);
  });

  it('镜像双子：双子都活着时恶魔死了游戏继续；善良的双子被处决邪恶获胜', () => {
    const s = game(['clockmaker', 'dreamer', 'oracle', 'eviltwin', 'nodashii', 'sage', 'mathematician'], {});
    s.twin = 2;
    night(s);
    execute(s, 5);
    expect(seatOf(s, 5).alive).toBe(false);
    expect(s.winner).toBeNull();
    finishDay(s);
    night(s);
    execute(s, 4);
    // 镜像双子死了：善良获胜
    expect(s.winner).toBe('good');

    const t = game(['clockmaker', 'dreamer', 'oracle', 'eviltwin', 'nodashii', 'sage', 'mathematician']);
    t.twin = 3;
    night(t);
    execute(t, 3);
    expect(t.winner).toBe('evil');
  });
});
