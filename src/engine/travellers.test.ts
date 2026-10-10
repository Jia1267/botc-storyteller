import { describe, expect, it } from 'vitest';
import type { RoleId } from './roles';
import { seeded } from './rng';
import { newGame, refreshSetup, startDeal } from './setup';
import { completeSlot, currentSlot, dealNext, execute, finishDay } from './flow';
import { addTraveller, beggarLearns, exile, exileThreshold, gunslingerPreview, gunslingerShoot, leave } from './travellers';
import { aliveCount, aliveNeighbors, aliveVoters, circleOrder, seatName } from './core';
import { chefCount, empathCount } from './info';
import type { GameState } from './types';

/** 暗流涌动，按给定角色坐好；travellers 在发身份前加入 */
function game(roles: RoleId[], travellers: { role: RoleId; after: number; alignment: 'good' | 'evil' }[] = []): GameState {
  const s = newGame();
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.demonChar = 'imp';
  refreshSetup(s, seeded(1));
  for (const t of travellers) addTraveller(s, t.role, t.after, t.alignment);
  startDeal(s);
  for (let i = 0; i < s.seats.length; i++) dealNext(s);
  return s;
}

function toDay(s: GameState) {
  while (currentSlot(s) !== 'dawn') completeSlot(s, { kind: 'none' });
  completeSlot(s, { kind: 'none' });
}

describe('旅行者：座位与人数', () => {
  it('编号显示成"旅1"，坐在指定的人旁边，邻居计算算上他', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'gunslinger', after: 1, alignment: 'evil' }]);
    expect(seatName(101)).toBe('旅1');
    expect(circleOrder(s)).toEqual([1, 101, 2, 3, 4, 5]);
    expect(aliveNeighbors(s, 1)).toEqual([5, 101]);
    // 共情者左边 5号 恶魔、右边 旅1 邪恶旅行者
    expect(empathCount(s, 1)).toBe(2);
    // 圆桌 1 旅1 2 3 4 5：邪恶是 旅1、4、5，相邻的只有 4-5 一对
    expect(chefCount(s)).toBe(1);
  });

  it('发身份包括旅行者；存活人数不算旅行者，投票人数算', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'beggar', after: 3, alignment: 'good' }]);
    expect(s.phase).toBe('night');
    expect(aliveCount(s)).toBe(5);
    expect(aliveVoters(s)).toBe(6);
  });

  it('只剩 2 名非旅行者存活时邪恶获胜（旅行者不算）', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'beggar', after: 3, alignment: 'good' }]);
    toDay(s);
    s.seats[0].alive = false;
    s.seats[1].alive = false;
    execute(s, 3);
    expect(s.winner).toBe('evil');
  });

  it('红唇女郎：存活 ≥5 不算旅行者', () => {
    const s = game(['empath', 'chef', 'scarletwoman', 'monk', 'imp'], [{ role: 'beggar', after: 3, alignment: 'good' }]);
    toDay(s);
    s.seats[0].alive = false; // 剩 4 名非旅行者 + 1 旅行者
    execute(s, 5);
    expect(s.winner).toBe('good');
  });
});

describe('旅行者：放逐 / 离场', () => {
  it('放逐门槛是全体玩家（含死人和旅行者）的一半；被放逐的人死亡', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'thief', after: 2, alignment: 'evil' }]);
    toDay(s);
    s.seats[0].alive = false;
    expect(exileThreshold(s)).toBe(3);
    exile(s, 101);
    expect(s.seats[5].alive).toBe(false);
    expect(s.winner).toBeNull();
  });

  it('离场后不在圆桌上', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'thief', after: 1, alignment: 'good' }]);
    toDay(s);
    leave(s, 101);
    expect(circleOrder(s)).toEqual([1, 2, 3, 4, 5]);
    expect(exileThreshold(s)).toBe(3);
  });
});

describe('旅行者：能力', () => {
  it('替罪羊：处决同阵营的人时可以代替他', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'scapegoat', after: 1, alignment: 'good' }]);
    toDay(s);
    execute(s, 2, '被处决', { scapegoat: true });
    expect(s.seats[1].alive).toBe(true);
    expect(s.seats[5].alive).toBe(false);
    expect(s.executed).toBe(101);
  });

  it('替罪羊：阵营不同不能代替', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'scapegoat', after: 1, alignment: 'evil' }]);
    toDay(s);
    execute(s, 2, '被处决', { scapegoat: true });
    expect(s.seats[1].alive).toBe(false);
    expect(s.seats[5].alive).toBe(true);
  });

  it('枪手：射中恶魔善良获胜；每天只能开一次', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'gunslinger', after: 1, alignment: 'good' }]);
    toDay(s);
    expect(gunslingerPreview(s, 101, 3).hits).toBe(true);
    gunslingerShoot(s, 101, 3);
    expect(s.seats[2].alive).toBe(false);
    expect(gunslingerPreview(s, 101, 5).hits).toBe(false);
    s.gunslingerDay = 0;
    gunslingerShoot(s, 101, 5);
    expect(s.winner).toBe('good');
  });

  it('乞丐：得知给票的死人的阵营', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [{ role: 'beggar', after: 1, alignment: 'good' }]);
    toDay(s);
    s.seats[3].alive = false;
    expect(beggarLearns(s, 101, 4)).toContain('邪恶');
  });

  it('官员/窃贼：入夜后第一个醒，明天投票加成；第二晚清空', () => {
    const s = game(['empath', 'chef', 'monk', 'poisoner', 'imp'], [
      { role: 'bureaucrat', after: 1, alignment: 'good' },
      { role: 'thief', after: 2, alignment: 'evil' },
    ]);
    completeSlot(s, { kind: 'none' }); // dusk
    expect(currentSlot(s)).toBe('bureaucrat');
    completeSlot(s, { kind: 'target', target: 3 });
    expect(currentSlot(s)).toBe('thief');
    completeSlot(s, { kind: 'target', target: 4 });
    expect(s.voteMods).toEqual({ 3: 3, 4: -1 });
    toDay(s);
    execute(s, null);
    finishDay(s);
    expect(s.voteMods).toEqual({});
  });
});
