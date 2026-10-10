import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { balancedSetup, godfatherMod, newGame, randomSetup, refreshSetup, setCount, setEvilTownsfolk, setScript, startDeal } from './setup';
import {
  alsaahirCorrect, alsaahirGuess, completeSlot, currentSlot, dealNext, execute, finishDay, harpyPunish, minionSeats,
  slotActor, type SlotPayload,
} from './flow';
import { bountyChoices, dreamerChoices, flowergirlChoices, generalChoices, generalTruth, harpyPunishChoices, killPreview, stPoisonChoices } from './info';
import { recommend } from './balance';
import { believedRole, isEvil, isPoisoned, malfunction, seatOf, wakesAs } from './core';
import type { ScriptId } from './editions';
import type { GameState, SlotId } from './types';

/** 按给定角色坐好并发完身份，停在第 1 夜开头 */
function game(script: ScriptId, roles: RoleId[], extra: Partial<GameState> = {}): GameState {
  const s = newGame();
  s.script = script;
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
  for (let guard = 0; guard < 40 && currentSlot(s) !== 'dawn'; guard++) {
    const slot = currentSlot(s);
    seen.push(slot);
    completeSlot(s, answers[slot] ?? { kind: 'none' });
  }
  completeSlot(s, { kind: 'none' });
  return seen;
}

/** 结束白天（可选处决）并进入下一夜 */
function day(s: GameState, exec: number | null = null) {
  execute(s, exec);
  finishDay(s);
}

describe('残阳高照：配板', () => {
  it('5 人局有教父能力（教父或炼金术士）时外来者 +1，否则 0', () => {
    for (let i = 0; i < 40; i++) {
      const x = randomSetup('sunset', 5, seeded(i));
      const outs = x.roles.filter((r) => ROLES[r].team === 'outsider').length;
      expect(x.roles.length).toBe(5);
      expect(outs).toBe(godfatherMod('sunset', x.roles) ? 1 : 0);
    }
  });

  it('一键配板：6 人局也会出现教父、炼金术士', () => {
    const rng = seeded(8);
    const seen = new Set(Array.from({ length: 300 }, () => balancedSetup('sunset', 6, rng).roles).flat());
    expect(seen.has('godfather')).toBe(true);
    expect(seen.has('alchemist')).toBe(true);
    expect(seen.has('fool')).toBe(true);
  });

  it('炼金术士拿到不在场的爪牙能力，并在那个爪牙的位置醒', () => {
    const s = game('sunset', ['alchemist', 'tealady', 'fool', 'devilsadvocate', 'zombuul', 'recluse']);
    expect(s.alchemistAbility).toBe('godfather');
    expect(wakesAs(s, s.seats[0], 'godfather')).toBe(true);
    const seen = night(s);
    expect(seen).toEqual(['dusk', 'alchemist', 'godfather', 'devilsadvocate']);
  });
});

describe('残阳高照：僵怖', () => {
  it('第一次被处决是假死，游戏继续；当晚因为今天有人死了不醒；再被处决才真的死', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s);
    day(s, 5);
    expect(s.seats[4].alive).toBe(false);
    expect(s.zombuulFake).toBe(true);
    expect(s.winner).toBeNull();
    const seen = night(s);
    expect(seen).not.toContain('zombuul');
    // 送葬者看到的是僵怖
    expect(seen).toContain('undertaker');
    execute(s, 5);
    expect(s.winner).toBe('good');
  });

  it('白天没人死，僵怖醒来杀人', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s);
    day(s, null);
    const seen = night(s, { zombuul: { kind: 'target', target: 1 } });
    expect(seen).toContain('zombuul');
    expect(s.seats[0].alive).toBe(false);
  });

  it('假死的僵怖算活人：看起来只剩 2 人时游戏继续', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s);
    day(s, 5);
    s.seats[0].alive = false;
    s.seats[1].alive = false;
    execute(s, null);
    expect(s.winner).toBeNull();
  });

  it('驱魔人选中僵怖：僵怖今晚不醒', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s);
    day(s, null);
    const seen = night(s, { exorcist: { kind: 'target', target: 5 } });
    expect(seen).not.toContain('zombuul');
  });
});

describe('残阳高照：保护', () => {
  it('茶艺师两边都是好人：两边的人死不了（夜里和处决都算）', () => {
    const s = game('sunset', ['fool', 'tealady', 'undertaker', 'devilsadvocate', 'zombuul']);
    night(s);
    // 茶艺师(2) 两边：1 弄臣、3 送葬者，都是好人
    expect(killPreview(s, 3).dies).toBe(false);
    day(s, 3);
    expect(s.seats[2].alive).toBe(true);
    expect(s.lastExecution).toBeNull();
  });

  it('茶艺师旁边有邪恶玩家：不保护', () => {
    const s = game('sunset', ['undertaker', 'tealady', 'devilsadvocate', 'fool', 'zombuul']);
    night(s);
    expect(killPreview(s, 1).dies).toBe(true);
  });

  it('弄臣第一次不会死，第二次会', () => {
    const s = game('sunset', ['fool', 'undertaker', 'flowergirl', 'devilsadvocate', 'zombuul']);
    night(s);
    day(s, 1);
    expect(s.seats[0].alive).toBe(true);
    expect(s.seats[0].used).toBe(true);
    night(s);
    day(s, 1);
    expect(s.seats[0].alive).toBe(false);
  });

  it('魔鬼代言人保护的人被处决不会死', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s, { devilsadvocate: { kind: 'target', target: 2 } });
    day(s, 2);
    expect(s.seats[1].alive).toBe(true);
  });

  it('教父：外来者今天死了，当晚教父杀人', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'recluse', 'godfather', 'zombuul', 'exorcist']);
    night(s);
    day(s, 3);
    const seen = night(s, { godfather: { kind: 'target', target: 1 } });
    expect(seen).toContain('godfather');
    expect(s.seats[0].alive).toBe(false);
  });

  it('卖花女孩：白天记下恶魔投票，夜里真答案是"投过"', () => {
    const s = game('sunset', ['undertaker', 'flowergirl', 'exorcist', 'devilsadvocate', 'zombuul']);
    night(s);
    s.demonVotedDay = s.night;
    day(s, null);
    expect(flowergirlChoices(s, 2)[0].value).toBe(true);
  });
});

/* ---------------- 王不见王 ---------------- */

const AL: RoleId[] = ['librarian', 'empath', 'dreamer', 'general', 'alsaahir', 'barber', 'sweetheart', 'poisoner', 'alhadikhia'];

describe('王不见王：配板', () => {
  it('7–15 人随机配板：人数对、提线木偶挨着恶魔、赏金猎人在场时恰好一个邪恶镇民', () => {
    for (let count = 7; count <= 15; count++)
      for (let seed = 0; seed < 12; seed++) {
        const s = newGame();
        setScript(s, 'alvsal');
        setCount(s, count, seeded(seed * 31 + count));
        expect(s.seats).toHaveLength(count);
        const m = s.seats.find((x) => x.role === 'marionette');
        const d = s.seats.find((x) => ROLES[x.role].team === 'demon')!;
        if (m) expect([1, count - 1]).toContain((m.n - d.n + count) % count);
        const etf = s.seats.filter((x) => x.alignment === 'evil');
        expect(etf).toHaveLength(s.seats.some((x) => x.role === 'bountyhunter') ? 1 : 0);
      }
  });
});

describe('王不见王：提线木偶 / 赏金猎人', () => {
  it('提线木偶被安排在恶魔旁边，以为自己是好人，爪牙互认不叫他', () => {
    const s = game('alvsal', ['marionette', 'librarian', 'empath', 'dreamer', 'general', 'chef', 'alhadikhia']);
    const m = s.seats.find((x) => x.role === 'marionette')!;
    const d = s.seats.find((x) => x.role === 'alhadikhia')!;
    expect([1, s.count - 1]).toContain((m.n - d.n + s.count) % s.count);
    expect(isEvil(m)).toBe(true);
    expect(malfunction(s, m.n)).toBe(true);
    expect(ROLES[believedRole(s, m)].team).toBe('townsfolk');
    expect(minionSeats(s)).toHaveLength(0);
  });

  it('邪恶镇民算邪恶；赏金猎人盯着的人死了，当晚得知下一个', () => {
    const s = game('alvsal', ['bountyhunter', 'librarian', 'empath', 'dreamer', 'general', 'poisoner', 'alhadikhia']);
    setEvilTownsfolk(s, 2);
    expect(isEvil(s.seats[1])).toBe(true);
    expect(bountyChoices(s, 1, seeded(1)).some((c) => c.value === 2)).toBe(true);
    night(s, { bountyhunter: { kind: 'bounty', seat: 6, truth: true } });
    expect(s.bountyKnown).toEqual([6]);
    day(s, 6);
    const seen = night(s, { bountyhunter: { kind: 'bounty', seat: 2, truth: true } });
    expect(seen).toContain('bountyhunter');
    expect(s.bountyKnown).toEqual([6, 2]);
  });
});

describe('王不见王：哈迪寂亚', () => {
  it('三人都选活：三人都死', () => {
    const s = game('alvsal', AL);
    night(s);
    day(s, null);
    night(s, { alhadikhia: { kind: 'hadikhia', picks: [1, 2, 3], live: [true, true, true] } });
    expect([1, 2, 3].map((n) => s.seats[n - 1].alive)).toEqual([false, false, false]);
    expect(s.ns!.hadikhia!.alive).toEqual([false, false, false]);
  });

  it('有人选死：只有他死；死人选活会复活', () => {
    const s = game('alvsal', AL);
    night(s);
    day(s, 4);
    night(s, { alhadikhia: { kind: 'hadikhia', picks: [4, 2, 3], live: [true, false, true] } });
    expect(s.seats[3].alive).toBe(true);
    expect(s.seats[1].alive).toBe(false);
    expect(s.seats[2].alive).toBe(true);
  });

  it('报丧女妖被哈迪寂亚杀死：能力生效', () => {
    const s = game('alvsal', ['banshee', 'librarian', 'empath', 'dreamer', 'general', 'poisoner', 'alhadikhia']);
    night(s);
    day(s, null);
    night(s, { alhadikhia: { kind: 'hadikhia', picks: [1, 2, 3], live: [false, true, true] } });
    expect(s.bansheeActive).toBe(1);
  });
});

describe('王不见王：外来者死亡触发', () => {
  it('理发师被处决：当晚恶魔可以换角色，阵营不变', () => {
    const s = game('alvsal', AL);
    night(s);
    day(s, 6);
    const seen = night(s, { barber: { kind: 'barber', swap: [9, 2] } });
    expect(seen).toContain('barber');
    expect(s.seats[8].role).toBe('empath');
    expect(isEvil(s.seats[8])).toBe(true);
    expect(s.seats[1].role).toBe('alhadikhia');
    expect(isEvil(s.seats[1])).toBe(false);
  });

  it('心上人死了：选一人从此醉酒', () => {
    const s = game('alvsal', AL);
    night(s);
    day(s, 7);
    const seen = night(s, { sweetheart: { kind: 'target', target: 2 } });
    expect(seen).toContain('sweetheart');
    expect(malfunction(s, 2)).toBe(true);
  });

  it('瘟疫医生死了：说书人拿投毒者能力，之后每晚毒人', () => {
    const s = game('alvsal', ['plaguedoctor', 'librarian', 'empath', 'dreamer', 'general', 'chef', 'harpy', 'alhadikhia']);
    night(s);
    day(s, 1);
    night(s, { plaguedoctor: { kind: 'plague', ability: 'poisoner' } });
    expect(s.stAbility).toBe('poisoner');
    day(s, null);
    const seen = night(s, { stPoisoner: { kind: 'target', target: 3 } });
    expect(seen).toContain('stPoisoner');
    expect(isPoisoned(s, 3)).toBe(true);
  });
});

describe('王不见王：白天与信息', () => {
  it('鹰身女妖：第一个人没做到疯狂，说书人让他死', () => {
    const s = game('alvsal', ['librarian', 'empath', 'dreamer', 'general', 'chef', 'harpy', 'alhadikhia']);
    night(s, { harpy: { kind: 'harpy', mad: 1, second: 2 } });
    expect(s.harpy).toMatchObject({ mad: 1, second: 2 });
    harpyPunish(s, [1]);
    expect(s.seats[0].alive).toBe(false);
    expect(s.harpy!.done).toBe(true);
  });

  it('鹰身女妖：局势均衡时推荐只罚要疯狂的人；两人都死算帮邪恶', () => {
    const s = game('alvsal', ['librarian', 'empath', 'dreamer', 'general', 'chef', 'harpy', 'alhadikhia']);
    night(s, { harpy: { kind: 'harpy', mad: 1, second: 6 } });
    const cs = harpyPunishChoices(s);
    expect(cs[recommend(cs, 0, seeded(1))].value).toEqual([1]);
    expect(cs.find((c) => c.key === 'both')!.lean).toBe(-1);
  });

  it('说书人的投毒者能力：有推荐，均衡时毒一名善良玩家', () => {
    const s = game('alvsal', AL);
    const cs = stPoisonChoices(s, seeded(3));
    const c = cs[recommend(cs, 0, seeded(4))];
    expect(isEvil(seatOf(s, c.value))).toBe(false);
    expect(cs.some((x) => x.key === 'demon' && x.lean === 2)).toBe(true);
  });

  it('戏法师：所有爪牙和恶魔都说对才赢', () => {
    const s = game('alvsal', AL);
    night(s);
    expect(alsaahirCorrect(s, [8], [9])).toBe(true);
    expect(alsaahirCorrect(s, [8, 1], [9])).toBe(false);
    alsaahirGuess(s, 5, [8], [9], true);
    expect(s.winner).toBe('good');
  });

  it('筑梦师健康时给出的两个角色里有他的真实角色；将军按局势条回答', () => {
    const s = game('alvsal', AL);
    const c = dreamerChoices(s, 3, 9, seeded(2))[0];
    expect(c.value.evil).toBe('alhadikhia');
    expect(generalChoices(s, 4)[0].value).toBe(generalTruth(s));
    expect(seatOf(s, 1).role).toBe('librarian');
  });

  it('第一晚提线木偶步骤：恶魔得知谁是提线木偶', () => {
    const s = game('alvsal', ['marionette', 'librarian', 'empath', 'dreamer', 'general', 'chef', 'alhadikhia']);
    const seen = night(s);
    expect(seen).toContain('marionette');
    // 提线木偶是唯一的爪牙：跳过爪牙互认，但恶魔照样得知伪装
    expect(seen).not.toContain('minionInfo');
    expect(seen).toContain('demonInfo');
    expect(slotActor(s, 'dawn')).toBeUndefined();
  });
});
