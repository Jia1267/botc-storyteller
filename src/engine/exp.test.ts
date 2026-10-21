import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { newGame, randomSetup, refreshSetup, startDeal } from './setup';
import { completeSlot, currentSlot, dealNext, execute, finishDay, shouldRun, slotActor, type SlotPayload } from './flow';
import { makeCustom } from './custom';
import { shugenjaChoices, shugenjaSteps } from './info';
import { isPoisoned, malfunction, seatOf } from './core';
import type { GameState, SlotId } from './types';

/** 自由配板：按给定角色坐好并发完身份，停在第 1 夜开头 */
function game(roles: RoleId[], board: RoleId[] = roles, extra: Partial<GameState> = {}): GameState {
  const s = newGame();
  s.script = 'custom';
  s.custom = makeCustom('测试', board);
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.demonChar = roles.find((r) => ROLES[r].team === 'demon')!;
  refreshSetup(s, seeded(1));
  Object.assign(s, extra);
  startDeal(s);
  for (let i = 0; i < s.count; i++) dealNext(s);
  return s;
}

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

const day = (s: GameState, exec: number | null = null) => {
  execute(s, exec);
  finishDay(s);
};

describe('实验性镇民：第一晚信息', () => {
  it('事务官、骑士、贵族、修行者第一晚醒，之后不醒', () => {
    const s = game(['steward', 'knight', 'noble', 'shugenja', 'poisoner', 'imp', 'chef']);
    const n1 = night(s);
    for (const r of ['steward', 'knight', 'noble', 'shugenja'] as SlotId[]) expect(n1).toContain(r);
    day(s);
    const n2 = night(s, { imp: { kind: 'imp', target: 7 } });
    for (const r of ['steward', 'knight', 'noble', 'shugenja'] as SlotId[]) expect(n2).not.toContain(r);
  });

  it('修行者：哪边近指哪边，一样近两边都算对', () => {
    // 修行者 1 号，邪恶在 3 号（顺时针 2 步）、6 号（逆时针 2 步）
    const s = game(['shugenja', 'chef', 'poisoner', 'empath', 'monk', 'imp']);
    expect(shugenjaSteps(s, 1)).toEqual({ cw: 2, ccw: 1 });
    const c = shugenjaChoices(s, 1);
    expect(c[0].value).toBe(false);
    const t = game(['shugenja', 'chef', 'poisoner', 'empath', 'imp', 'monk']);
    expect(shugenjaSteps(t, 1)).toEqual({ cw: 2, ccw: 2 });
    expect(shugenjaChoices(t, 1).every((x) => x.truth)).toBe(true);
  });
});

describe('国王与唱诗男孩', () => {
  it('第一晚叫醒恶魔告诉他谁是国王；死人追上活人后国王每晚得知一个角色', () => {
    const s = game(['king', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    expect(s.log.some((x) => x.text.includes('恶魔得知国王是 1号'))).toBe(true);
    day(s);
    expect(night(s, { imp: { kind: 'imp', target: 2 } })).not.toContain('king');
    for (const n of [3, 6]) seatOf(s, n).alive = false;
    day(s);
    // 现在死 3 活 4；今晚恶魔杀掉自己的爪牙，就是 4 比 3
    expect(night(s, { imp: { kind: 'imp', target: 4 } })).toContain('king');
  });

  it('恶魔杀死国王：唱诗男孩当晚醒来；处决国王不算', () => {
    const s = game(['king', 'choirboy', 'empath', 'poisoner', 'imp', 'monk', 'chef']);
    night(s);
    day(s);
    const seen = night(s, { imp: { kind: 'imp', target: 1 } });
    expect(seen).toContain('choirboy');
    const t = game(['king', 'choirboy', 'empath', 'poisoner', 'imp', 'monk', 'chef']);
    night(t);
    day(t, 1);
    expect(night(t, { imp: { kind: 'imp', target: 3 } })).not.toContain('choirboy');
  });

  it('板子上有唱诗男孩：随机配角色时国王一定在场', () => {
    const board: RoleId[] = ['choirboy', 'king', 'chef', 'empath', 'monk', 'soldier', 'undertaker', 'washerwoman', 'butler', 'drunk', 'poisoner', 'spy', 'imp'];
    const def = makeCustom('唱诗', board);
    for (let i = 0; i < 40; i++) {
      const x = randomSetup(def, 7, seeded(i));
      if (x.roles.includes('choirboy')) expect(x.roles).toContain('king');
    }
  });
});

describe('守夜人、公主、农夫、杂技演员、传教士', () => {
  it('守夜人整局只用一次', () => {
    const s = game(['nightwatchman', 'chef', 'empath', 'poisoner', 'imp']);
    expect(night(s, { nightwatchman: { kind: 'nightwatch', target: 2 } })).toContain('nightwatchman');
    day(s);
    expect(night(s, { imp: { kind: 'imp', target: 3 } })).not.toContain('nightwatchman');
  });

  it('公主第一天提名的人被处决：当晚恶魔杀不死人', () => {
    const s = game(['princess', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    s.princessNight = 2;
    day(s, 2);
    night(s, { imp: { kind: 'imp', target: 3 } });
    expect(seatOf(s, 3).alive).toBe(true);
  });

  it('农夫夜里死了：选中的善良玩家变成农夫', () => {
    const s = game(['farmer', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    day(s);
    const seen = night(s, { imp: { kind: 'imp', target: 1 }, farmer: { kind: 'farmer', to: 6 } });
    expect(seen).toContain('farmer');
    expect(seatOf(s, 6).role).toBe('farmer');
    expect(seatOf(s, 1).alive).toBe(false);
  });

  it('杂技演员选了今晚被毒的人：天亮前他死', () => {
    const s = game(['acrobat', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    day(s);
    // 杂技演员在投毒者之后醒：先选 2 号，投毒者毒的也是 2 号（其实投毒者先醒，这里看"今晚任何时候"）
    night(s, { poisoner: { kind: 'target', target: 2 }, acrobat: { kind: 'target', target: 2 }, imp: { kind: 'imp', target: 7 } });
    expect(seatOf(s, 1).alive).toBe(false);
    expect(s.ns!.deaths).toContain(1);
  });

  it('传教士选中投毒者：投毒者不再醒，也毒不了人', () => {
    const s = game(['preacher', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s, { preacher: { kind: 'target', target: 4 }, poisoner: { kind: 'target', target: 3 } });
    expect(malfunction(s, 4)).toBe(true);
    day(s);
    const seen = night(s, { imp: { kind: 'imp', target: 6 } });
    expect(seen).not.toContain('poisoner');
    expect(isPoisoned(s, 3)).toBe(false);
  });
});

describe('魔术师与罂粟种植者', () => {
  it('罂粟种植者在场：第一晚不做爪牙互认；他死的那晚邪恶互认', () => {
    const s = game(['poppygrower', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    const n1 = night(s);
    expect(n1).not.toContain('minionInfo');
    expect(n1).toContain('demonInfo');
    day(s, 1);
    expect(shouldRun(s, 'poppygrower')).toBe(true);
    const n2 = night(s, { imp: { kind: 'imp', target: 2 } });
    expect(n2).toContain('poppygrower');
    expect(s.poppyResolved).toBe(true);
  });

  it('魔术师：爪牙互认时记下魔术师也被指成恶魔', () => {
    const s = game(['magician', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    expect(s.log.some((x) => x.text.includes('魔术师 1号 也被指为恶魔'))).toBe(true);
    expect(slotActor).toBeTruthy();
  });
});
