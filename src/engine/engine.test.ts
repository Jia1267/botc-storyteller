import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import {
  DISTRIBUTION, F4, MAX_F4, balancedRoles, bluffChoices, newGame, randomRoles, replaceRole, setCount, setupZ, startDeal,
} from './setup';
import {
  chefCount, empathCount, fortuneChoices, legalNumbers, numberChoices, pairChoices, pairVerdict,
  revealChoices, revealVerdict, starpassChoices, mayorBounceChoices,
} from './info';
import {
  completeSlot, currentSlot, dealNext, execute, nominateVirgin, previewImp, previewSlayer,
  previewVirgin, slayerShoot, startNight,
} from './flow';
import { balance, recommend } from './balance';
import { aliveNeighbors, malfunction } from './core';
import type { GameState } from './types';

/** 按给定角色顺序坐好，直接进入第 1 夜之前 */
function game(roles: RoleId[], extra: Partial<GameState> = {}): GameState {
  const s = newGame();
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.setupZ = 0;
  Object.assign(s, extra);
  startDeal(s);
  for (let i = 0; i < s.count; i++) dealNext(s);
  return s;
}

/** 跳过当前夜晚剩下的步骤（都给"无操作"） */
function runToDawn(s: GameState) {
  while (currentSlot(s) !== 'dawn') completeSlot(s, { kind: 'none' });
}

const teamCounts = (roles: RoleId[]) => {
  const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
  roles.forEach((r) => c[ROLES[r].team]++);
  return c;
};

describe('配板', () => {
  it('每个人数都符合官方人数表（男爵 +2 外来者）', () => {
    const rng = seeded(1);
    for (let n = 5; n <= 15; n++) {
      for (let k = 0; k < 50; k++) {
        const roles = randomRoles(n, rng);
        const c = teamCounts(roles);
        const [t, o, m, d] = DISTRIBUTION[n];
        const baron = roles.includes('baron') ? 2 : 0;
        expect(roles.length).toBe(n);
        expect(new Set(roles).size).toBe(n);
        expect(c).toEqual({ townsfolk: t - baron, outsider: o + baron, minion: m, demon: d, traveller: 0 });
      }
    }
  });

  it('一键生成的组合绝大多数是均衡的', () => {
    const rng = seeded(2);
    for (let n = 5; n <= 15; n++) {
      const zs = Array.from({ length: 60 }, () => Math.abs(setupZ(balancedRoles(n, rng), n)));
      expect(zs.filter((z) => z < 0.8).length / zs.length).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('一键生成时剧本上每个角色都有机会出场', () => {
    const rng = seeded(4);
    for (const n of [5, 7, 9]) {
      const seen = new Set(Array.from({ length: 300 }, () => balancedRoles(n, rng)).flat());
      for (const r of ['baron', 'saint', 'drunk', 'recluse', 'butler', 'mayor'] as const) expect(seen.has(r)).toBe(true);
    }
  });

  it('换上/换下男爵时外来者数量自动增减', () => {
    const rng = seeded(3);
    const s = newGame();
    setCount(s, 10, rng);
    let minionSeat = s.seats.find((x) => ROLES[x.role].team === 'minion' && x.role !== 'baron')!;
    if (s.seats.some((x) => x.role === 'baron')) {
      const b = s.seats.find((x) => x.role === 'baron')!;
      replaceRole(s, b.n, (['poisoner', 'spy', 'scarletwoman'] as RoleId[]).find((r) => !s.seats.some((x) => x.role === r))!, rng);
      minionSeat = s.seats.find((x) => ROLES[x.role].team === 'minion')!;
    }
    expect(teamCounts(s.seats.map((x) => x.role)).outsider).toBe(0);
    replaceRole(s, minionSeat.n, 'baron', rng);
    expect(teamCounts(s.seats.map((x) => x.role))).toEqual({ townsfolk: 5, outsider: 2, minion: 2, demon: 1, traveller: 0 });
    replaceRole(s, minionSeat.n, 'poisoner', rng);
    expect(teamCounts(s.seats.map((x) => x.role))).toEqual({ townsfolk: 7, outsider: 0, minion: 2, demon: 1, traveller: 0 });
  });

  it('随机配板的首夜信息位（F4）最多 2 个，换下男爵时也不超', () => {
    const rng = seeded(11);
    const f4 = (rs: RoleId[]) => rs.filter((r) => F4.includes(r)).length;
    for (let n = 5; n <= 15; n++) {
      for (let k = 0; k < 200; k++) expect(f4(randomRoles(n, rng))).toBeLessThanOrEqual(MAX_F4);
      expect(f4(balancedRoles(n, rng))).toBeLessThanOrEqual(MAX_F4);
    }
    for (let k = 0; k < 50; k++) {
      const s = newGame();
      setCount(s, 15, rng);
      const minion = s.seats.find((x) => ROLES[x.role].team === 'minion' && x.role !== 'baron')!;
      replaceRole(s, minion.n, 'baron', rng);
      replaceRole(s, minion.n, 'poisoner', rng);
      expect(f4(s.seats.map((x) => x.role))).toBeLessThanOrEqual(MAX_F4);
    }
  });

  it('恶魔伪装的标准搭配里有一个不在场的首夜信息位，给邪恶假跳', () => {
    const rng = seeded(12);
    for (let k = 0; k < 30; k++) {
      const s = newGame();
      setCount(s, 9, rng);
      const normal = bluffChoices(s, rng).find((c) => c.key === 'normal')!;
      expect(normal.value.some((r) => F4.includes(r))).toBe(true);
      normal.value.forEach((r) => expect(s.seats.some((x) => x.role === r)).toBe(false));
    }
  });

  it('酒鬼假身份不在场、恶魔伪装都不在场', () => {
    const rng = seeded(4);
    for (let k = 0; k < 30; k++) {
      const s = newGame();
      setCount(s, 12, rng);
      const inPlay = new Set(s.seats.map((x) => x.role));
      s.bluffs.forEach((b) => expect(inPlay.has(b)).toBe(false));
      expect(s.bluffs.length).toBe(3);
      if (s.drunkFake) {
        expect(inPlay.has(s.drunkFake)).toBe(false);
        expect(ROLES[s.drunkFake].team).toBe('townsfolk');
        expect(s.bluffs).not.toContain(s.drunkFake);
      }
      if (inPlay.has('fortuneteller')) expect(s.redHerring).not.toBeNull();
    }
  });
});

describe('夜晚顺序', () => {
  it('5 人局没有爪牙/恶魔互认，7 人局有', () => {
    const s5 = game(['washerwoman', 'chef', 'empath', 'poisoner', 'imp']);
    const seen5: string[] = [];
    while (currentSlot(s5) !== 'dawn') {
      seen5.push(currentSlot(s5));
      completeSlot(s5, { kind: 'none' });
    }
    expect(seen5).not.toContain('minionInfo');
    expect(seen5).toEqual(['dusk', 'poisoner', 'washerwoman', 'chef', 'empath']);

    const s7 = game(['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'poisoner', 'imp']);
    const seen7: string[] = [];
    while (currentSlot(s7) !== 'dawn') {
      seen7.push(currentSlot(s7));
      completeSlot(s7, { kind: 'none' });
    }
    expect(seen7).toEqual(['dusk', 'minionInfo', 'demonInfo', 'poisoner', 'washerwoman', 'chef', 'empath']);
  });

  it('酒鬼按假身份被叫醒，而且能力失灵', () => {
    const s = game(['drunk', 'chef', 'soldier', 'poisoner', 'imp'], { drunkFake: 'empath' });
    completeSlot(s, { kind: 'none' }); // dusk
    completeSlot(s, { kind: 'target', target: 3 }); // poisoner
    completeSlot(s, { kind: 'none' }); // chef
    expect(currentSlot(s)).toBe('empath');
    expect(malfunction(s, 1)).toBe(true);
  });

  it('送葬者只在白天有人被处决死亡后的那晚醒', () => {
    const s = game(['undertaker', 'chef', 'soldier', 'monk', 'empath', 'poisoner', 'imp']);
    runToDawn(s);
    completeSlot(s, { kind: 'none' });
    execute(s, null);
    startNight(s);
    const seen: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      seen.push(currentSlot(s));
      if (currentSlot(s) === 'imp') completeSlot(s, { kind: 'imp', target: 2 });
      else completeSlot(s, { kind: 'target', target: 3 });
    }
    expect(seen).not.toContain('undertaker');
    completeSlot(s, { kind: 'none' });
    execute(s, 5);
    startNight(s);
    const seen2: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      seen2.push(currentSlot(s));
      if (currentSlot(s) === 'imp') completeSlot(s, { kind: 'imp', target: 3 });
      else completeSlot(s, { kind: 'target', target: 4 });
    }
    expect(seen2).toContain('undertaker');
  });
});

describe('信息计算', () => {
  it('厨师：数相邻邪恶对数，间谍/陌客有多种合规算法', () => {
    const s = game(['spy', 'imp', 'chef', 'recluse', 'poisoner', 'empath', 'monk']);
    // 7→1 也相邻：1间谍-2恶魔 是一对；4陌客-5投毒 只有陌客算邪恶时才是一对
    expect(chefCount(s)).toBe(1);
    expect(legalNumbers(s, 'chef', 3)).toEqual([0, 1, 2]);
  });

  it('共情者：跳过死人，看最近的存活邻居', () => {
    const s = game(['empath', 'chef', 'soldier', 'monk', 'poisoner', 'imp', 'mayor']);
    expect(empathCount(s, 1)).toBe(0);
    s.seats[1].alive = false;
    s.seats[2].alive = false;
    s.seats[3].alive = false;
    expect(aliveNeighbors(s, 1)).toEqual([7, 5]);
    expect(empathCount(s, 1)).toBe(1);
  });

  it('占卜师：干扰项也得到"有"；陌客可选', () => {
    const s = game(['fortuneteller', 'chef', 'recluse', 'monk', 'poisoner', 'imp', 'mayor'], { redHerring: 2 });
    expect(fortuneChoices(s, 1, [2, 4]).map((c) => c.value)).toEqual([true]);
    expect(fortuneChoices(s, 1, [6, 4]).map((c) => c.value)).toEqual([true]);
    expect(fortuneChoices(s, 1, [3, 4]).map((c) => c.value).sort()).toEqual([false, true]);
    expect(fortuneChoices(s, 1, [7, 4]).map((c) => c.value)).toEqual([false]);
  });

  it('健康的玩家只会拿到合规信息（大量随机局面）', () => {
    const rng = seeded(7);
    for (let k = 0; k < 200; k++) {
      const s = newGame();
      setCount(s, 5 + (k % 11), rng);
      startDeal(s);
      for (let i = 0; i < s.count; i++) dealNext(s);
      s.poison = null;
      for (const x of s.seats) {
        if (x.role === 'drunk') continue;
        for (const kind of ['washerwoman', 'librarian', 'investigator'] as const) {
          if (x.role !== kind) continue;
          for (const c of pairChoices(s, kind, x.n, rng)) {
            expect(c.truth).toBe(true);
            expect(pairVerdict(s, kind, x.n, c.value)).not.toBe('false');
          }
        }
        if (x.role === 'chef' || x.role === 'empath')
          for (const c of numberChoices(s, x.role, x.n)) expect(legalNumbers(s, x.role, x.n)).toContain(c.value);
        if (x.role === 'undertaker' || x.role === 'ravenkeeper')
          for (const sub of s.seats)
            for (const c of revealChoices(s, x.n, sub.n, rng)) expect(revealVerdict(s, sub.n, c.value)).not.toBe('false');
      }
    }
  });

  it('中毒的人可以拿到假信息，推荐里至少有一个假选项', () => {
    const s = game(['empath', 'chef', 'soldier', 'monk', 'imp', 'poisoner', 'mayor']);
    completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'target', target: 1 });
    const cs = numberChoices(s, 'empath', 1);
    expect(cs.some((c) => !c.truth)).toBe(true);
    expect(cs.some((c) => c.truth)).toBe(true);
  });
});

describe('小恶魔', () => {
  function night2(roles: RoleId[], extra: Partial<GameState> = {}) {
    const s = game(roles, extra);
    runToDawn(s);
    completeSlot(s, { kind: 'none' });
    execute(s, null);
    startNight(s);
    return s;
  }
  const toImp = (s: GameState) => {
    while (currentSlot(s) !== 'imp') completeSlot(s, { kind: 'target', target: 99 });
  };

  it('士兵杀不死；僧侣保护有效', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'mayor', 'baron', 'imp']);
    toImp(s);
    expect(previewImp(s, 1).kind).toBe('none');
  });

  it('僧侣保护', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'mayor', 'baron', 'imp']);
    completeSlot(s, { kind: 'none' }); // dusk
    completeSlot(s, { kind: 'target', target: 3 }); // monk
    expect(previewImp(s, 3).kind).toBe('none');
    completeSlot(s, { kind: 'imp', target: 3 });
    expect(s.seats[2].alive).toBe(true);
  });

  it('镇长被杀可以转移', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'mayor', 'baron', 'imp']);
    toImp(s);
    expect(previewImp(s, 5).kind).toBe('mayor');
    const cs = mayorBounceChoices(s, 5, seeded(1));
    expect(cs.map((c) => c.key)).toContain('minion');
    completeSlot(s, { kind: 'imp', target: 5, bounce: 3 });
    expect(s.seats[4].alive).toBe(true);
    expect(s.seats[2].alive).toBe(false);
  });

  it('自杀：存活 ≥5 时红唇女郎必须接任', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'scarletwoman', 'baron', 'imp']);
    toImp(s);
    expect(starpassChoices(s, 7).map((c) => c.value)).toEqual([5]);
    completeSlot(s, { kind: 'imp', target: 7, starpassTo: 6 });
    expect(s.seats[4].role).toBe('imp');
    expect(s.seats[5].role).toBe('baron');
    expect(s.winner).toBeNull();
  });

  it('自杀：接任推荐考虑爪牙能力（男爵接任帮邪恶，投毒者接任帮善良）', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'mayor', 'baron', 'poisoner', 'washerwoman', 'imp', 'virgin']);
    toImp(s);
    const cs = starpassChoices(s, 9);
    expect(cs.find((c) => c.value === 6)!.lean).toBe(-1);
    expect(cs.find((c) => c.value === 7)!.lean).toBe(1);
  });

  it('自杀：没有爪牙接任则善良获胜', () => {
    const s = night2(['soldier', 'monk', 'chef', 'empath', 'imp']);
    s.seats[0].alive = true;
    toImp(s);
    expect(previewImp(s, 5).kind).toBe('suicide');
    completeSlot(s, { kind: 'imp', target: 5 });
    expect(s.winner).toBe('good');
    expect(currentSlot(s)).toBe('dawn');
  });

  it('恶魔中毒杀不了人', () => {
    const s = game(['soldier', 'monk', 'chef', 'empath', 'mayor', 'poisoner', 'imp']);
    runToDawn(s);
    completeSlot(s, { kind: 'none' });
    execute(s, null);
    startNight(s);
    completeSlot(s, { kind: 'none' }); // dusk
    completeSlot(s, { kind: 'target', target: 7 }); // poisoner 毒恶魔
    completeSlot(s, { kind: 'target', target: 2 }); // monk
    expect(previewImp(s, 3).kind).toBe('none');
  });
});

describe('白天与胜负', () => {
  const day1 = (roles: RoleId[]) => {
    const s = game(roles);
    runToDawn(s);
    completeSlot(s, { kind: 'none' });
    return s;
  };

  it('圣徒被处决 → 邪恶获胜', () => {
    const s = day1(['saint', 'chef', 'empath', 'monk', 'imp']);
    execute(s, 1);
    expect(s.winner).toBe('evil');
  });

  it('处决恶魔：存活 5 人时红唇接任；4 人时善良获胜', () => {
    const s = day1(['chef', 'empath', 'monk', 'scarletwoman', 'imp']);
    execute(s, 5);
    expect(s.winner).toBeNull();
    expect(s.seats[3].role).toBe('imp');
    expect(s.pendingNewDemon).toBe(4);

    const t = day1(['chef', 'empath', 'monk', 'scarletwoman', 'imp']);
    t.seats[0].alive = false;
    execute(t, 5);
    expect(t.winner).toBe('good');
  });

  it('剩 3 人且无处决，健康的镇长获胜', () => {
    const s = day1(['mayor', 'chef', 'empath', 'monk', 'imp']);
    s.seats[1].alive = false;
    s.seats[2].alive = false;
    execute(s, null);
    expect(s.winner).toBe('good');
  });

  it('只剩 2 人 → 邪恶获胜', () => {
    const s = day1(['chef', 'empath', 'monk', 'soldier', 'imp']);
    s.seats[0].alive = false;
    s.seats[1].alive = false;
    execute(s, 3);
    expect(s.winner).toBe('evil');
  });

  it('贞洁者：镇民提名被处决，外来者不触发，间谍可选', () => {
    const s = day1(['virgin', 'chef', 'saint', 'spy', 'imp']);
    expect(previewVirgin(s, 1, 2).applies).toBe(true);
    expect(previewVirgin(s, 1, 3).applies).toBe(false);
    expect(previewVirgin(s, 1, 4).askTwist).toBe('spyTownsfolk');
    nominateVirgin(s, 1, 2);
    expect(s.seats[1].alive).toBe(false);
    expect(s.executed).toBe(2);
    expect(s.seats[0].used).toBe(true);
  });

  it('猎手射中恶魔时，提前告诉说书人红唇女郎会接任', () => {
    const s = day1(['slayer', 'chef', 'scarletwoman', 'monk', 'imp']);
    expect(previewSlayer(s, 1, 5).swTakeover).toBe(3);
    slayerShoot(s, 1, 5);
    expect(s.winner).toBeNull();
    expect(s.pendingNewDemon).toBe(3);

    const t = day1(['slayer', 'chef', 'scarletwoman', 'monk', 'imp']);
    t.seats[3].alive = false;
    expect(previewSlayer(t, 1, 5).swTakeover).toBeUndefined();
  });

  it('猎手：打中恶魔就死，陌客可选', () => {
    const s = day1(['slayer', 'chef', 'recluse', 'monk', 'imp']);
    expect(previewSlayer(s, 1, 3).askTwist).toBe('recluseDemon');
    expect(previewSlayer(s, 2, 5).applies).toBe(false);
    slayerShoot(s, 1, 5);
    expect(s.winner).toBe('good');
  });

  it('中毒持续到第二天白天，第二晚自动解除', () => {
    const s = game(['chef', 'empath', 'monk', 'poisoner', 'imp']);
    completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'target', target: 2 });
    runToDawn(s);
    completeSlot(s, { kind: 'none' });
    expect(malfunction(s, 2)).toBe(true);
    execute(s, null);
    startNight(s);
    expect(malfunction(s, 2)).toBe(false);
  });
});

describe('平衡', () => {
  it('开局均势；处决邪恶后偏善良，连续误杀后偏邪恶', () => {
    const roles: RoleId[] = ['washerwoman', 'chef', 'empath', 'monk', 'soldier', 'mayor', 'virgin', 'poisoner', 'spy', 'imp'];
    const s = game(roles);
    expect(Math.abs(balance(s).score)).toBeLessThan(12);
    s.seats[8].alive = false;
    s.seats[6].alive = false;
    s.seats[7].alive = false;
    s.seats[5].alive = false;
    expect(balance(s).score).toBeGreaterThanOrEqual(12);

    const t = game(roles);
    [0, 1, 2, 3].forEach((i) => (t.seats[i].alive = false));
    expect(balance(t).score).toBeLessThanOrEqual(-12);
  });

  it('推荐：善良优势时选帮邪恶的，邪恶优势时选帮善良的，均势选标准做法', () => {
    const cs = [
      { key: 'a', label: '', value: 1, lean: -1, reason: '', truth: true },
      { key: 'b', label: '', value: 2, lean: 0, reason: '', truth: true, standard: true },
      { key: 'c', label: '', value: 3, lean: 1, reason: '', truth: true },
    ];
    const rng = seeded(9);
    expect(recommend(cs, 20, rng)).toBe(0);
    expect(recommend(cs, -20, rng)).toBe(2);
    expect(recommend(cs, 0, rng)).toBe(1);
  });
});
