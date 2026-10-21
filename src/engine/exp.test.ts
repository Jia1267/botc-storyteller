import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { newGame, randomSetup, refreshSetup, setCount, startDeal } from './setup';
import { boomResolve, completeSlot, cultVote, currentSlot, damselGuess, dealNext, execute, executeStoryteller, finishDay, golemNominates, mezeSaid, psychoKill, riotNominate, shouldRun, slotActor, yaggaSay, type SlotPayload } from './flow';
import { makeCustom } from './custom';
import { shugenjaChoices, shugenjaSteps } from './info';
import { isEvil, isPoisoned, malfunction, seatOf } from './core';
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

describe('实验性外来者', () => {
  it('魔像提名非恶魔：被提名的人死；提名恶魔什么都不发生', () => {
    const s = game(['golem', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    golemNominates(s, 1, 2);
    expect(seatOf(s, 2).alive).toBe(false);
    const t = game(['golem', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(t);
    golemNominates(t, 1, 5);
    expect(seatOf(t, 5).alive).toBe(true);
    expect(seatOf(t, 1).used).toBe(true);
  });

  it('落难少女：第一晚爪牙得知；爪牙公开猜中邪恶获胜，猜错就用掉', () => {
    const s = game(['damsel', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    expect(night(s)).toContain('damsel');
    damselGuess(s, 4, 2);
    expect(s.winner).toBeNull();
    damselGuess(s, 4, 1);
    expect(s.winner).toBeNull();
    const t = game(['damsel', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(t);
    damselGuess(t, 4, 1);
    expect(t.winner).toBe('evil');
  });

  it('巡山人选中落难少女：她变成选定的镇民；板子上有巡山人时落难少女一定在场', () => {
    const s = game(['huntsman', 'damsel', 'empath', 'poisoner', 'imp', 'monk', 'soldier'], ['huntsman', 'damsel', 'empath', 'poisoner', 'imp', 'monk', 'soldier', 'chef']);
    night(s, { huntsman: { kind: 'huntsman', target: 2, become: 'chef' } });
    expect(seatOf(s, 2).role).toBe('chef');
    const def = makeCustom('巡山', ['huntsman', 'damsel', 'chef', 'empath', 'monk', 'soldier', 'undertaker', 'washerwoman', 'butler', 'recluse', 'poisoner', 'spy', 'imp']);
    for (let i = 0; i < 40; i++) {
      const x = randomSetup(def, 8, seeded(i));
      if (x.roles.includes('huntsman')) expect(x.roles).toContain('damsel');
    }
  });

  it('告密者：第一晚爪牙得到伪装；解谜大师：开局有一人整局醉酒', () => {
    const s = game(['snitch', 'puzzlemaster', 'empath', 'poisoner', 'imp', 'monk', 'chef']);
    expect(night(s)).toContain('snitch');
    expect(s.puzzleDrunk).not.toBeNull();
    expect(malfunction(s, s.puzzleDrunk!)).toBe(true);
  });

  it('食人魔选了邪恶玩家：他变成邪恶', () => {
    const s = game(['ogre', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s, { ogre: { kind: 'target', target: 4 } });
    expect(isEvil(seatOf(s, 1))).toBe(true);
  });

  it('帽匠被处决：当晚邪恶可以换角色', () => {
    const s = game(['hatter', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier'], ['hatter', 'chef', 'empath', 'poisoner', 'spy', 'imp', 'zombuul', 'monk', 'soldier']);
    night(s);
    day(s, 1);
    const seen = night(s, { hatter: { kind: 'hatter', changes: [{ seat: 4, role: 'spy' }] }, imp: { kind: 'imp', target: 2 } });
    expect(seen).toContain('hatter');
    expect(seatOf(s, 4).role).toBe('spy');
  });

  it('异端分子在场：恶魔被处决，邪恶获胜', () => {
    const s = game(['heretic', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    execute(s, 5);
    expect(s.winner).toBe('evil');
  });
});

describe('实验性爪牙', () => {
  it('精神病患者白天杀人；被处决猜拳没输就不死', () => {
    const s = game(['chef', 'empath', 'psychopath', 'monk', 'imp', 'soldier', 'undertaker']);
    night(s);
    psychoKill(s, 3, 1);
    expect(seatOf(s, 1).alive).toBe(false);
    execute(s, 3, '被处决', { psychoSurvives: true });
    expect(seatOf(s, 3).alive).toBe(true);
  });

  it('维齐尔白天不会死', () => {
    const s = game(['chef', 'empath', 'vizier', 'monk', 'imp', 'soldier', 'undertaker']);
    night(s);
    execute(s, 3);
    expect(seatOf(s, 3).alive).toBe(true);
  });

  it('灵言师：说出秘密词的好人当晚变邪恶；能力只用一次', () => {
    const s = game(['chef', 'empath', 'mezepheles', 'monk', 'imp', 'soldier', 'undertaker']);
    expect(s.mezeWord).not.toBe('');
    night(s);
    mezeSaid(s, 2);
    day(s);
    const seen = night(s, { imp: { kind: 'imp', target: 1 } });
    expect(seen).toContain('mezepheles');
    expect(isEvil(seatOf(s, 2))).toBe(true);
    expect(s.mezeUsed).toBe(true);
  });

  it('科学怪人：恶魔在那个善良角色的位置醒', () => {
    const board: RoleId[] = ['chef', 'empath', 'monk', 'soldier', 'undertaker', 'fortuneteller', 'boffin', 'imp'];
    const s = game(['chef', 'empath', 'boffin', 'monk', 'imp', 'soldier', 'undertaker'], board);
    expect(s.boffinAbility).toBe('fortuneteller');
    const n1 = night(s);
    expect(n1).toContain('boffin');
    expect(n1).toContain('fortuneteller');
  });

  it('限：开局 1 个外来者，第 1 夜所有镇民中毒', () => {
    const s = game(['chef', 'empath', 'xaan', 'monk', 'imp', 'butler', 'undertaker', 'soldier']);
    expect(s.xaanNight).toBe(1);
    night(s);
    expect(isPoisoned(s, 1)).toBe(true);
    day(s);
    night(s, { imp: { kind: 'imp', target: 2 } });
    expect(isPoisoned(s, 1)).toBe(false);
  });

  it('炸弹人被处决：只剩三人，再死被指最多的人', () => {
    const s = game(['chef', 'empath', 'boomdandy', 'monk', 'imp', 'soldier', 'undertaker']);
    night(s);
    execute(s, 3);
    expect(s.boomPending).toBe(true);
    boomResolve(s, [1, 2, 5], 2);
    expect(s.seats.filter((x) => x.alive).map((x) => x.n)).toEqual([1, 5]);
    expect(s.winner).toBe('evil');
  });
});

describe('实验性恶魔（一）', () => {
  it('奥赫指角色：在场就那人死', () => {
    const s = game(['chef', 'empath', 'poisoner', 'monk', 'ojo', 'soldier', 'undertaker']);
    night(s);
    day(s);
    night(s, { ojo: { kind: 'ojo', role: 'empath', target: 2 } });
    expect(seatOf(s, 2).alive).toBe(false);
  });

  it('痢蛭：宿主整局中毒；宿主活着痢蛭不死，宿主死了痢蛭跟着死、善良获胜', () => {
    const s = game(['chef', 'empath', 'poisoner', 'monk', 'lleech', 'soldier', 'undertaker']);
    night(s, { lleech: { kind: 'target', target: 2 } });
    expect(s.lleechHost).toBe(2);
    expect(isPoisoned(s, 2)).toBe(true);
    execute(s, 5);
    expect(seatOf(s, 5).alive).toBe(true);
    finishDay(s);
    night(s, { lleech: { kind: 'target', target: 1 } });
    expect(seatOf(s, 1).alive).toBe(false);
    execute(s, 2);
    expect(seatOf(s, 5).alive).toBe(false);
    expect(s.winner).toBe('good');
  });

  it('牙噶巴卜：白天说了两次，当晚最多死两人', () => {
    const s = game(['chef', 'empath', 'poisoner', 'monk', 'yaggababble', 'soldier', 'undertaker']);
    expect(s.yaggaPhrase).not.toBe('');
    expect(night(s)).toContain('yaggababble');
    yaggaSay(s, 1);
    yaggaSay(s, 1);
    day(s);
    const seen = night(s, { yaggababble: { kind: 'yagga', picks: [1, 2] } });
    expect(seen).toContain('yaggababble');
    expect([1, 2].every((n) => !seatOf(s, n).alive)).toBe(true);
  });

  it('堤丰之首：多一个爪牙，邪恶坐成一排、恶魔在中间', () => {
    const board: RoleId[] = ['chef', 'empath', 'monk', 'soldier', 'undertaker', 'washerwoman', 'fortuneteller', 'poisoner', 'spy', 'scarletwoman', 'lordoftyphon'];
    const def = makeCustom('堤丰', board);
    for (let i = 0; i < 20; i++) {
      const s = newGame();
      s.script = 'custom';
      s.custom = def;
      setCount(s, 8, seeded(i));
      const d = s.seats.find((x) => x.role === 'lordoftyphon')!;
      const evil = s.seats.filter((x) => ROLES[x.role].team === 'minion').map((x) => x.n);
      expect(evil).toHaveLength(2);
      const nb = [((d.n - 2 + 8) % 8) + 1, (d.n % 8) + 1];
      expect([...evil].sort()).toEqual([...nb].sort());
    }
  });

  it('卡扎力：开局没有爪牙；第一晚他定下爪牙，再做爪牙互认', () => {
    const board: RoleId[] = ['chef', 'empath', 'monk', 'soldier', 'undertaker', 'washerwoman', 'fortuneteller', 'poisoner', 'spy', 'kazali'];
    const def = makeCustom('卡扎力', board);
    const x = randomSetup(def, 7, seeded(3));
    expect(x.roles.some((r) => ROLES[r].team === 'minion')).toBe(false);
    const s = game(['chef', 'empath', 'monk', 'soldier', 'kazali', 'undertaker', 'washerwoman'], board);
    const seen = night(s, { kazali: { kind: 'kazali', picks: [{ seat: 2, role: 'poisoner' }] } });
    expect(seen.indexOf('kazali')).toBeLessThan(seen.indexOf('minionInfo'));
    expect(seatOf(s, 2).role).toBe('poisoner');
    expect(isEvil(seatOf(s, 2))).toBe(true);
  });

  it('暴乱：第三晚爪牙变暴乱；第三天被提名就死，暴乱都死了善良赢', () => {
    const s = game(['chef', 'empath', 'poisoner', 'monk', 'riot', 'soldier', 'undertaker']);
    night(s);
    day(s);
    night(s);
    day(s);
    expect(night(s)).toContain('riot');
    expect(seatOf(s, 3).role).toBe('riot');
    riotNominate(s, 3);
    expect(s.winner).toBeNull();
    riotNominate(s, 5);
    expect(s.winner).toBe('good');
  });
});

describe('实验性角色（二）：军团、召唤师、无神论者、村夫、工程师、半兽人、异教领袖、隐士', () => {
  const towns: RoleId[] = ['chef', 'empath', 'monk', 'soldier', 'undertaker', 'washerwoman', 'fortuneteller', 'investigator', 'librarian'];

  it('军团：好人只有爪牙数 + 1 个，其余都是军团', () => {
    const def = makeCustom('军团', [...towns, 'butler', 'poisoner', 'spy', 'legion']);
    const x = randomSetup(def, 10, seeded(2));
    expect(x.roles.filter((r) => r === 'legion')).toHaveLength(7);
    expect(x.demonChar).toBe('legion');
  });

  it('军团：每晚由说书人决定死谁；军团都死了善良赢', () => {
    const s = game(['chef', 'empath', 'legion', 'legion', 'legion', 'legion', 'legion']);
    expect(night(s)).toContain('demonInfo');
    day(s);
    const seen = night(s, { legion: { kind: 'target', target: 3 } });
    expect(seen).toContain('legion');
    expect(seatOf(s, 3).alive).toBe(false);
    for (const n of [4, 5, 6]) seatOf(s, n).alive = false;
    execute(s, 7);
    expect(s.winner).toBe('good');
  });

  it('召唤师：开局没有恶魔，游戏不结束；第三晚造出恶魔', () => {
    const def = makeCustom('召唤', [...towns, 'summoner', 'imp']);
    const x = randomSetup(def, 7, seeded(5));
    expect(x.roles.some((r) => ROLES[r].team === 'demon')).toBe(false);
    expect(x.demonChar).toBe('summoner');
    const s = game(['chef', 'empath', 'summoner', 'monk', 'soldier', 'undertaker', 'washerwoman'], [...towns, 'summoner', 'imp'], { demonChar: 'summoner' });
    night(s);
    expect(s.winner).toBeNull();
    day(s);
    night(s);
    day(s);
    expect(s.winner).toBeNull();
    const seen = night(s, { summoner: { kind: 'summon', target: 2, role: 'imp' } });
    expect(seen).toContain('summoner');
    expect(seen).toContain('imp');
    expect(seatOf(s, 2).role).toBe('imp');
    expect(isEvil(seatOf(s, 2))).toBe(true);
  });

  it('召唤师死了：没有恶魔，善良获胜', () => {
    const s = game(['chef', 'empath', 'summoner', 'monk', 'soldier', 'undertaker', 'washerwoman'], [...towns, 'summoner', 'imp'], { demonChar: 'summoner' });
    night(s);
    execute(s, 3);
    expect(s.winner).toBe('good');
  });

  it('无神论者：没有邪恶角色；处决说书人善良获胜', () => {
    const def = makeCustom('无神', [...towns, 'atheist', 'poisoner', 'imp']);
    for (let i = 0; i < 30; i++) {
      const x = randomSetup(def, 7, seeded(i));
      if (x.roles.includes('atheist')) expect(x.roles.every((r) => !['minion', 'demon'].includes(ROLES[r].team))).toBe(true);
    }
    const s = game(['chef', 'empath', 'atheist', 'monk', 'soldier'], [...towns, 'atheist', 'imp'], { demonChar: 'atheist' });
    night(s);
    expect(s.winner).toBeNull();
    executeStoryteller(s);
    expect(s.winner).toBe('good');
  });

  it('村夫：多出来的村夫里有一个整局醉酒；每个村夫都醒', () => {
    const s = game(['villageidiot', 'villageidiot', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    expect([1, 2]).toContain(s.viDrunk);
    expect(malfunction(s, s.viDrunk!)).toBe(true);
    const seen = night(s);
    expect(seen.filter((x) => x === 'villageidiot')).toHaveLength(2);
  });

  it('工程师把恶魔换成另一种恶魔', () => {
    const s = game(['engineer', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier'], ['engineer', 'chef', 'empath', 'poisoner', 'imp', 'zombuul', 'monk', 'soldier']);
    night(s, { engineer: { kind: 'engineer', demon: 'zombuul' } });
    expect(seatOf(s, 5).role).toBe('zombuul');
  });

  it('半兽人杀死好人：恶魔今晚杀不了人', () => {
    const s = game(['lycanthrope', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    s.fauxPaw = 7;
    night(s);
    day(s);
    night(s, { lycanthrope: { kind: 'target', target: 2 }, imp: { kind: 'imp', target: 3 } });
    expect(seatOf(s, 2).alive).toBe(false);
    expect(seatOf(s, 3).alive).toBe(true);
  });

  it('异教领袖：所有善良玩家入教，他的阵营获胜', () => {
    const s = game(['cultleader', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s, { cultleader: { kind: 'cult', evil: false } });
    cultVote(s, 1, true);
    expect(s.winner).toBe('good');
  });

  it('隐士在场、剧本有圣徒：处决隐士邪恶获胜', () => {
    const s = game(['hermit', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier'], ['hermit', 'saint', 'chef', 'empath', 'poisoner', 'imp', 'monk', 'soldier']);
    night(s);
    execute(s, 1);
    expect(s.winner).toBe('evil');
  });
});
