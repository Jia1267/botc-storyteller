import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { balancedSetup, newGame, refreshSetup, setCount, setScript, startDeal } from './setup';
import {
  completeSlot, currentSlot, dealNext, execute, finishDay, moonchildChoose, moonchildNeedsChoice, setGossip, type SlotPayload,
} from './flow';
import { isEvil, isPoisoned, malfunction } from './core';
import { SCRIPTS } from './editions';
import type { GameState, SlotId } from './types';

/** 暗月初升：按给定角色坐好并发完身份，停在第 1 夜开头 */
function game(roles: RoleId[]): GameState {
  const s = newGame();
  s.script = 'bmr';
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.demonChar = roles.find((r) => ROLES[r].team === 'demon')!;
  refreshSetup(s, seeded(1));
  startDeal(s);
  for (let i = 0; i < s.count; i++) dealNext(s);
  return s;
}

/** 走完当前夜晚；answers 里没给的步骤用 {kind:'none'} */
function night(s: GameState, answers: Partial<Record<SlotId, SlotPayload>> = {}): SlotId[] {
  const seen: SlotId[] = [];
  for (let guard = 0; guard < 40 && currentSlot(s) !== 'dawn'; guard++) {
    const slot = currentSlot(s);
    seen.push(slot);
    completeSlot(s, answers[slot] ?? { kind: 'none' });
  }
  completeSlot(s, { kind: 'none' });
  return seen;
}

function day(s: GameState, exec: number | null = null, opts = {}) {
  execute(s, exec, '被处决', opts);
  finishDay(s);
}

// 7 人：5 镇民 0 外来者 1 爪牙 1 恶魔
const BASE: RoleId[] = ['sailor', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'shabaloth'];

describe('暗月初升：配板', () => {
  it('7–15 人一键配板人数正确，每个角色都会出场', () => {
    const seen = new Set<string>();
    for (let count = 7; count <= 15; count++)
      for (let i = 0; i < 40; i++) {
        const s = newGame();
        setScript(s, 'bmr');
        setCount(s, count, seeded(count * 100 + i));
        expect(s.seats).toHaveLength(count);
        s.seats.forEach((x) => seen.add(x.role));
      }
    for (let i = 0; i < 200; i++) seen.add(balancedSetup('bmr', 9, seeded(i)).demonChar);
    expect(SCRIPTS.bmr.roles.filter((r) => !seen.has(r))).toEqual([]);
  });
});

describe('暗月初升：保护与醉酒', () => {
  it('水手：选的人醉酒到明天黄昏；水手健康时杀不死', () => {
    const s = game(BASE);
    night(s, { sailor: { kind: 'sailor', target: 2, drunk: 2 } });
    expect(malfunction(s, 2)).toBe(true);
    day(s);
    expect(malfunction(s, 2)).toBe(false);
    night(s, { sailor: { kind: 'sailor', target: 3, drunk: 3 }, shabaloth: { kind: 'shabaloth', picks: [1, 4], revive: null } });
    expect(s.seats[0].alive).toBe(true);
    expect(s.seats[3].alive).toBe(false);
  });

  it('旅店老板：保护的两人今晚死不了，其中一人醉酒', () => {
    const s = game(BASE);
    night(s);
    day(s);
    night(s, { innkeeper: { kind: 'innkeeper', picks: [3, 4], drunk: 3 }, shabaloth: { kind: 'shabaloth', picks: [3, 4], revive: null } });
    expect(s.seats[2].alive).toBe(true);
    expect(s.seats[3].alive).toBe(true);
    expect(malfunction(s, 3)).toBe(true);
  });

  it('祖母：孙子被恶魔杀死，祖母也死', () => {
    const s = game(BASE);
    night(s, { grandmother: { kind: 'grandmother', seat: 5, role: 'professor', truth: true } });
    expect(s.grandchild).toBe(5);
    day(s);
    night(s, { shabaloth: { kind: 'shabaloth', picks: [5, 3], revive: null } });
    expect(s.seats[4].alive).toBe(false);
    expect(s.seats[3].alive).toBe(false);
  });

  it('赌徒：猜错死、猜对活', () => {
    const s = game(BASE);
    night(s);
    day(s);
    night(s, { gambler: { kind: 'gambler', target: 1, role: 'sailor' } });
    expect(s.seats[2].alive).toBe(true);
    day(s);
    night(s, { gambler: { kind: 'gambler', target: 1, role: 'po' } });
    expect(s.seats[2].alive).toBe(false);
  });

  it('侍臣：选中的角色醉酒三天三夜', () => {
    const s = game(['courtier', 'sailor', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s, { courtier: { kind: 'courtier', role: 'assassin' } });
    for (let i = 0; i < 3; i++) {
      expect(malfunction(s, 6)).toBe(true);
      day(s);
      night(s);
    }
    expect(malfunction(s, 6)).toBe(false);
  });

  it('教授：救活死去的镇民；刺客无视水手保护', () => {
    const s = game(BASE);
    night(s);
    day(s, 4);
    night(s, { professor: { kind: 'target', target: 4 }, assassin: { kind: 'target', target: 1 } });
    expect(s.seats[3].alive).toBe(true);
    expect(s.ns!.revived).toEqual([4]);
    expect(s.seats[0].alive).toBe(false);
  });
});

describe('暗月初升：恶魔', () => {
  it('普卡：第一晚下毒没人死；第二晚上一个被毒的人死，换毒新的人', () => {
    const s = game(['sailor', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'pukka']);
    night(s, { pukka: { kind: 'target', target: 3 } });
    expect(isPoisoned(s, 3)).toBe(true);
    expect(s.seats[2].alive).toBe(true);
    day(s);
    night(s, { pukka: { kind: 'target', target: 4 } });
    expect(s.seats[2].alive).toBe(false);
    expect(isPoisoned(s, 4)).toBe(true);
  });

  it('普卡被驱魔：不下新毒，但上一个被毒的人照样死', () => {
    const s = game(['exorcist', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'pukka']);
    night(s, { pukka: { kind: 'target', target: 3 } });
    day(s);
    const seen = night(s, { exorcist: { kind: 'target', target: 7 } });
    expect(seen).not.toContain('pukka');
    expect(s.seats[2].alive).toBe(false);
    expect(s.pukkaPoison).toBeNull();
  });

  it('沙巴洛斯：杀两个人；下一晚可以吐出一个复活', () => {
    const s = game(BASE);
    night(s);
    day(s);
    night(s, { shabaloth: { kind: 'shabaloth', picks: [3, 4], revive: null } });
    expect([s.seats[2].alive, s.seats[3].alive]).toEqual([false, false]);
    day(s);
    night(s, { shabaloth: { kind: 'shabaloth', picks: [2, 5], revive: 3 } });
    expect(s.seats[2].alive).toBe(true);
  });

  it('珀：不选人就蓄力，下一晚杀三个', () => {
    const s = game(['sailor', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s);
    day(s);
    night(s, { po: { kind: 'po', picks: [] } });
    expect(s.poCharged).toBe(true);
    day(s);
    night(s, { po: { kind: 'po', picks: [2, 3, 4] } });
    expect([2, 3, 4].map((n) => s.seats[n - 1].alive)).toEqual([false, false, false]);
  });
});

describe('暗月初升：外来者与爪牙', () => {
  it('莽夫：恶魔先选他，恶魔醉酒、杀人无效，莽夫变邪恶', () => {
    const s = game(['goon', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'shabaloth']);
    night(s);
    day(s);
    night(s, { shabaloth: { kind: 'shabaloth', picks: [1, 3], revive: null } });
    expect(s.seats[0].alive).toBe(true);
    expect(s.seats[2].alive).toBe(true);
    expect(isEvil(s.seats[0])).toBe(true);
    expect(malfunction(s, 7)).toBe(true);
  });

  it('主谋：恶魔被处决后再玩一天；那天处决好人邪恶赢', () => {
    const s = game(['sailor', 'innkeeper', 'gambler', 'grandmother', 'professor', 'mastermind', 'po']);
    night(s);
    day(s, 7);
    expect(s.winner).toBeNull();
    night(s);
    expect(s.winner).toBeNull();
    execute(s, 3);
    expect(s.winner).toBe('evil');
  });

  it('主谋：那天没人被处决，善良赢', () => {
    const s = game(['sailor', 'innkeeper', 'gambler', 'grandmother', 'professor', 'mastermind', 'po']);
    night(s);
    day(s, 7);
    night(s);
    execute(s, null);
    expect(s.winner).toBe('good');
  });

  it('和平主义者：被处决的善良玩家可以不死', () => {
    const s = game(['pacifist', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s);
    execute(s, 3, '被处决', { pacifist: true });
    expect(s.seats[2].alive).toBe(true);
  });

  it('吟游诗人：爪牙被处决死亡，其他人醉酒到明天黄昏', () => {
    const s = game(['minstrel', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s);
    day(s, 6);
    expect(malfunction(s, 2)).toBe(true);
    expect(malfunction(s, 1)).toBe(false);
    day(s);
    night(s);
    expect(malfunction(s, 2)).toBe(false);
  });

  it('月之子：被处决后选了好人，那人当晚死', () => {
    const s = game(['moonchild', 'innkeeper', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s);
    execute(s, 1);
    expect(moonchildNeedsChoice(s)?.n).toBe(1);
    moonchildChoose(s, 4);
    finishDay(s);
    const seen = night(s);
    expect(seen).toContain('moonchild');
    expect(s.seats[3].alive).toBe(false);
  });

  it('造谣者说了真话：当晚由说书人选一人死；修补匠可以随时死', () => {
    const s = game(['gossip', 'tinker', 'gambler', 'grandmother', 'professor', 'assassin', 'po']);
    night(s);
    setGossip(s, 1, true);
    day(s);
    const seen = night(s, { gossip: { kind: 'target', target: 4 }, tinker: { kind: 'yesno', yes: true, truth: true } });
    expect(seen).toContain('gossip');
    expect(s.seats[3].alive).toBe(false);
    expect(s.seats[1].alive).toBe(false);
  });
});
