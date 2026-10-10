import { describe, expect, it } from 'vitest';
import { ROLES, type RoleId } from './roles';
import { seeded } from './rng';
import { newGame, randomSetup, refreshSetup, setCount, setScript, startDeal } from './setup';
import {
  completeSlot, currentSlot, dealNext, execute, fearPreview, fearmongerNominates, finishDay, klutzChoose, pixieMad, pixieNeedsCheck,
  setCannibalFake, slotActor,
} from './flow';
import { balloonistChoices, chambermaidChoices, duchessChoices, numberChoices, pixieChoices } from './info';
import { fishermanChoices, savantChoices } from './daytime';
import { isDemonSeat, isPoisoned, malfunction } from './core';
import type { ScriptId } from './editions';
import type { GameState } from './types';

/** 按给定角色坐好并发完身份，停在第 1 夜开头 */
function game(script: ScriptId, roles: RoleId[], demonChar: RoleId, extra: Partial<GameState> = {}): GameState {
  const s = newGame();
  s.script = script;
  s.count = roles.length;
  s.seats = roles.map((r, i) => ({ n: i + 1, role: r, startRole: r, alive: true }));
  s.demonChar = demonChar;
  refreshSetup(s, seeded(1));
  Object.assign(s, extra);
  startDeal(s);
  for (let i = 0; i < s.count; i++) dealNext(s);
  return s;
}

/** 把当前夜晚走完：每一步给一个能过的默认答案 */
function finishNight(s: GameState, pick = (slot: string) => (slot === 'lilmonsta' ? 0 : 1)) {
  for (let guard = 0; guard < 40 && currentSlot(s) !== 'dawn'; guard++) {
    const slot = currentSlot(s);
    const a = slotActor(s, slot);
    const other = s.seats.find((x) => x.alive && x.n !== a?.n)!.n;
    if (slot === 'lilmonsta') {
      const m = s.seats.find((x) => x.alive && ROLES[x.role].team === 'minion')!.n;
      const k = s.night > 1 ? s.seats.find((x) => x.alive && x.n !== m)!.n : undefined;
      completeSlot(s, { kind: 'lilmonsta', babysitter: m, kill: pick(slot) ? k : undefined });
    } else if (slot === 'widow') completeSlot(s, { kind: 'widow', target: other, informed: null });
    else if (slot === 'vortox' || slot === 'imp') completeSlot(s, { kind: 'imp', target: other });
    else completeSlot(s, { kind: 'target', target: other });
  }
  completeSlot(s, { kind: 'none' });
}

const teams = (s: GameState) => {
  const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0, traveller: 0 };
  s.seats.forEach((x) => c[ROLES[x.role].team]++);
  return c;
};

describe('剧本配板', () => {
  it('幽灵茶会/窃窃私语：5–6 人符合人数表，修正正确，没有伪装', () => {
    const rng = seeded(21);
    for (const script of ['spooky', 'whispers'] as ScriptId[]) {
      for (const n of [5, 6]) {
        for (let k = 0; k < 60; k++) {
          const s = newGame();
          setScript(s, script);
          setCount(s, n, rng);
          const c = teams(s);
          expect(s.seats.length).toBe(n);
          expect(s.bluffs).toEqual([]);
          const lil = s.demonChar === 'lilmonsta';
          const balloon = s.seats.some((x) => x.role === 'balloonist');
          const baseOut = n === 6 ? 1 : 0;
          expect(c.minion).toBe(1 + (lil ? 1 : 0));
          expect(c.demon).toBe(lil ? 0 : 1);
          expect(c.outsider).toBe(baseOut + (balloon ? 1 : 0));
          s.seats.forEach((x) => expect(s.script === 'spooky' ? ['chef', 'empath', 'chambermaid', 'artist', 'pixie', 'cannibal', 'klutz', 'lunatic', 'fearmonger', 'widow', 'scarletwoman', 'vortox'] : ['artist', 'balloonist', 'fisherman', 'savant', 'amnesiac', 'cannibal', 'lunatic', 'mutant', 'widow', 'goblin', 'leviathan']).toContain(x.role));
        }
      }
    }
  });

  it('疯子看到在场的恶魔；小怪宝时给他看涡流', () => {
    const a = game('spooky', ['chef', 'empath', 'lunatic', 'widow', 'fearmonger'], 'lilmonsta');
    expect(a.lunaticFake).toBe('vortox');
    const b = game('whispers', ['artist', 'savant', 'lunatic', 'widow', 'leviathan', 'fisherman'], 'leviathan');
    expect(b.lunaticFake).toBe('leviathan');
  });

  it('randomSetup 小怪宝时没有恶魔座位', () => {
    const rng = seeded(3);
    for (let k = 0; k < 100; k++) {
      const x = randomSetup('spooky', 5, rng);
      if (x.demonChar === 'lilmonsta') expect(x.roles.some((r) => ROLES[r].team === 'demon')).toBe(false);
    }
  });
});

describe('幽灵茶会', () => {
  it('首夜顺序：疯子（告诉恶魔）→ 寡妇 → 恐惧之灵 → 小精灵 → 厨师 → 共情者 → 侍女', () => {
    const s = game('spooky', ['chef', 'empath', 'lunatic', 'widow', 'vortox', 'chambermaid'], 'vortox');
    const seen: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      const slot = currentSlot(s);
      seen.push(slot);
      if (slot === 'widow') completeSlot(s, { kind: 'widow', target: 1, informed: 2 });
      else completeSlot(s, { kind: 'none' });
    }
    expect(seen).toEqual(['dusk', 'lunatic', 'widow', 'chef', 'empath', 'chambermaid']);
  });

  it('涡流：镇民只拿假信息；没人被处决邪恶获胜', () => {
    const s = game('spooky', ['empath', 'chef', 'chambermaid', 'fearmonger', 'vortox'], 'vortox');
    expect(numberChoices(s, 'empath', 1).every((c) => !c.truth)).toBe(true);
    finishNight(s);
    execute(s, null);
    expect(s.winner).toBe('evil');
  });

  it('侍女：统计今晚因自己能力醒来的人', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'widow'], 'lilmonsta');
    // 1厨师 2共情 3侍女 4恐惧之灵 5寡妇；小怪宝无人扮演
    while (currentSlot(s) !== 'chambermaid') {
      const slot = currentSlot(s);
      if (slot === 'lilmonsta') completeSlot(s, { kind: 'lilmonsta', babysitter: 4 });
      else if (slot === 'widow') completeSlot(s, { kind: 'widow', target: 2, informed: 1 });
      else completeSlot(s, { kind: 'target', target: 1 });
    }
    // 醒过：5寡妇、4恐惧之灵、1厨师、2共情；爪牙为小怪宝醒不算
    expect(chambermaidChoices(s, 3, [1, 4]).map((c) => c.value)).toContain(2);
    expect(s.ns!.woke.sort()).toEqual([1, 2, 4, 5]);
  });

  it('小怪宝：照看者算恶魔；处决照看者善良获胜；红唇女郎在场时接手', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'widow'], 'lilmonsta');
    finishNight(s);
    expect(s.babysitter).toBe(4);
    expect(isDemonSeat(s, 4)).toBe(true);
    execute(s, 4);
    expect(s.winner).toBe('good');

    const t = game('spooky', ['chef', 'empath', 'chambermaid', 'scarletwoman', 'widow', 'pixie'], 'lilmonsta');
    finishNight(t);
    const bs = t.babysitter!;
    execute(t, bs === 4 ? 4 : bs);
    if (bs !== 4) {
      expect(t.winner).toBeNull();
      expect(t.babysitter).toBe(4);
      expect(t.babysitterLocked).toBe(true);
    }
  });

  it('小怪宝：第二晚由说书人决定谁死', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'widow'], 'lilmonsta');
    finishNight(s);
    execute(s, 1);
    finishDay(s);
    while (currentSlot(s) !== 'lilmonsta') completeSlot(s, { kind: 'target', target: 2 });
    completeSlot(s, { kind: 'lilmonsta', babysitter: 5, kill: 3 });
    expect(s.seats[2].alive).toBe(false);
  });

  it('恐惧之灵：提名并处决目标，目标所在阵营落败；换目标要宣布', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'vortox'], 'vortox');
    while (currentSlot(s) !== 'fearmonger') completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'target', target: 2 });
    expect(s.fearAnnounce).toBe(true);
    finishNight(s);
    expect(fearPreview(s, 3).lethal).toBe(false);
    expect(fearPreview(s, 2).lethal).toBe(true);
    fearmongerNominates(s, 2);
    execute(s, 2); // 记过提名，处决时自动结算
    expect(s.winner).toBe('evil');
  });

  it('恐惧之灵提名的不是目标：处决不触发；第二天提名记录清空', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'vortox', 'artist'], 'vortox');
    while (currentSlot(s) !== 'fearmonger') completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'target', target: 2 });
    finishNight(s);
    fearmongerNominates(s, 3);
    execute(s, 3);
    expect(s.winner).toBeNull();
    finishDay(s);
    finishNight(s);
    expect(s.fearNominated).toBeNull();
  });

  it('食人族吃到邪恶后，说书人可以手动换假能力', () => {
    const s = game('spooky', ['cannibal', 'empath', 'chambermaid', 'fearmonger', 'vortox', 'chef'], 'vortox');
    finishNight(s);
    execute(s, 4);
    expect(s.cannibalPoisoned).toBe(true);
    setCannibalFake(s, 'chambermaid');
    expect(s.gained[1]).toBe('chambermaid');
  });

  it('寡妇：毒一直有效，寡妇死了解除', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'widow', 'vortox'], 'vortox');
    while (currentSlot(s) !== 'widow') completeSlot(s, { kind: 'none' });
    completeSlot(s, { kind: 'widow', target: 2, informed: 1 });
    finishNight(s);
    expect(isPoisoned(s, 2)).toBe(true);
    execute(s, 1);
    finishDay(s);
    expect(isPoisoned(s, 2)).toBe(true);
    s.seats[3].alive = false;
    expect(isPoisoned(s, 2)).toBe(false);
  });

  it('食人族：吃善良得到能力；吃邪恶中毒，善良被处决后解除', () => {
    const s = game('spooky', ['cannibal', 'empath', 'chambermaid', 'fearmonger', 'vortox', 'chef'], 'vortox');
    finishNight(s);
    execute(s, 2);
    expect(s.gained[1]).toBe('empath');
    expect(malfunction(s, 1)).toBe(false);
    finishDay(s);
    while (currentSlot(s) !== 'dawn') {
      // 第二晚：恶魔杀 6 号（别杀到食人族）
      if (currentSlot(s) === 'vortox') completeSlot(s, { kind: 'imp', target: 6 });
      else completeSlot(s, { kind: 'target', target: 3 });
    }
    completeSlot(s, { kind: 'none' });
    expect(s.seats[0].alive).toBe(true);
    execute(s, 4);
    expect(s.cannibalPoisoned).toBe(true);
    expect(malfunction(s, 1)).toBe(true);
  });

  it('小精灵：那名玩家死了且小精灵疯狂成功，获得能力', () => {
    const s = game('spooky', ['pixie', 'empath', 'chambermaid', 'fearmonger', 'vortox'], 'vortox');
    expect(pixieChoices(s, 1, seeded(1)).every((c) => !c.truth)).toBe(true); // 涡流在场只能给假的
    s.pixieRole = 'empath';
    s.seats[1].alive = false;
    expect(pixieNeedsCheck(s)?.n).toBe(1);
    pixieMad(s, true);
    expect(s.gained[1]).toBe('empath');
  });

  it('呆瓜：选到邪恶，善良落败', () => {
    const s = game('spooky', ['klutz', 'empath', 'chambermaid', 'fearmonger', 'vortox', 'chef'], 'vortox');
    finishNight(s);
    execute(s, 1);
    klutzChoose(s, 4);
    expect(s.winner).toBe('evil');
  });

  it('公爵夫人：拜访者中一人拿到假数字', () => {
    const s = game('spooky', ['chef', 'empath', 'chambermaid', 'fearmonger', 'vortox'], 'vortox', { fabled: ['duchess'] });
    s.duchessVisitors = [1, 4, 5];
    const cs = duchessChoices(s, seeded(2));
    expect(cs.length).toBeGreaterThan(0);
    cs.forEach((c) => expect(c.value.falseNum).not.toBe(2));
  });
});

describe('窃窃私语', () => {
  it('首夜：失忆者（能力需要醒时）→ 疯子告诉利维坦 → 寡妇 → 气球驾驶员', () => {
    const s = game('whispers', ['amnesiac', 'balloonist', 'lunatic', 'widow', 'leviathan', 'mutant'], 'leviathan', {
      amnesiacAbility: 'empath',
    });
    const seen: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      const slot = currentSlot(s);
      seen.push(slot);
      if (slot === 'widow') completeSlot(s, { kind: 'widow', target: 1, informed: 2 });
      else if (slot === 'balloonist') completeSlot(s, { kind: 'balloon', seat: 4, team: 'minion', truth: true });
      else completeSlot(s, { kind: 'number', num: 0, truth: true });
    }
    expect(seen).toEqual(['dusk', 'amnesiac', 'lunatic', 'widow', 'balloonist']);
    expect(s.balloonShown).toEqual(['minion']);
  });

  it('气球驾驶员：每种类型都给过后不再醒', () => {
    const s = game('whispers', ['balloonist', 'savant', 'lunatic', 'widow', 'leviathan', 'fisherman'], 'leviathan');
    s.balloonShown = ['townsfolk', 'outsider', 'minion'];
    expect(balloonistChoices(s, 1, seeded(1)).map((c) => c.value.team)).toEqual(['demon']);
    s.balloonShown.push('demon');
    finishNight(s);
    execute(s, null);
    finishDay(s);
    const seen: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      seen.push(currentSlot(s));
      completeSlot(s, { kind: 'target', target: 2 });
    }
    expect(seen).not.toContain('balloonist');
  });

  it('利维坦：第 2 个善良玩家被处决邪恶获胜；第 5 天结束邪恶获胜', () => {
    const s = game('whispers', ['artist', 'savant', 'fisherman', 'widow', 'leviathan', 'mutant'], 'leviathan');
    finishNight(s);
    execute(s, 1);
    expect(s.winner).toBeNull();
    finishDay(s);
    finishNight(s);
    execute(s, 2);
    expect(s.winner).toBe('evil');

    const t = game('whispers', ['artist', 'savant', 'fisherman', 'widow', 'leviathan', 'mutant'], 'leviathan');
    for (let d = 1; d <= 5; d++) {
      finishNight(t);
      execute(t, null);
      finishDay(t);
    }
    expect(t.winner).toBe('evil');
  });

  it('哥布林：被提名时公开声称并被处决，邪恶获胜', () => {
    const s = game('whispers', ['artist', 'savant', 'fisherman', 'goblin', 'leviathan', 'mutant'], 'leviathan');
    finishNight(s);
    execute(s, 4, '被处决', { goblinClaimed: true });
    expect(s.winner).toBe('evil');
  });

  it('博学者：健康时每组一真一假；渔夫有建议', () => {
    const s = game('whispers', ['artist', 'savant', 'fisherman', 'goblin', 'leviathan', 'mutant'], 'leviathan');
    finishNight(s);
    const pairs = savantChoices(s, 2, seeded(5));
    expect(pairs.length).toBeGreaterThan(0);
    pairs.forEach((p) => expect(p.truth).toBe(true));
    expect(fishermanChoices(s, 3, seeded(5)).length).toBeGreaterThan(0);
  });

  it('中毒博学者：标准选项两条都假但不把人的阵营说反；重度冤枉的标"大帮邪恶"', () => {
    for (let k = 0; k < 40; k++) {
      const s = game('whispers', ['artist', 'savant', 'fisherman', 'widow', 'leviathan', 'mutant'], 'leviathan', { widowPoison: 2 });
      const cs = savantChoices(s, 2, seeded(100 + k));
      const std = cs.find((c) => c.standard)!;
      expect(std.truth).toBe(false);
      // 不应出现把好人说成爪牙/恶魔、或把邪恶说成镇民/外来者的陈述
      for (const line of std.value) {
        const m = line.match(/^(\d+)号 是(镇民|外来者|爪牙|恶魔)$/);
        if (!m) continue;
        const real = s.seats[Number(m[1]) - 1];
        const claimEvil = m[2] === '爪牙' || m[2] === '恶魔';
        const realEvil = real.role === 'widow' || real.role === 'leviathan';
        expect(claimEvil).toBe(realEvil);
      }
      const harsh = cs.find((c) => c.key === 'harsh');
      if (harsh) expect(harsh.lean).toBe(-2);
    }
  });

  it('疯子以为是利维坦：之后的夜晚不醒', () => {
    const s = game('whispers', ['artist', 'savant', 'lunatic', 'goblin', 'leviathan', 'mutant'], 'leviathan');
    finishNight(s);
    execute(s, null);
    finishDay(s);
    const seen: string[] = [];
    while (currentSlot(s) !== 'dawn') {
      seen.push(currentSlot(s));
      completeSlot(s, { kind: 'none' });
    }
    expect(seen).not.toContain('lunatic');
  });
});

describe('疯子（涡流）', () => {
  it('之后的夜晚疯子醒来选人，选的人不会死', () => {
    const s = game('spooky', ['chef', 'empath', 'lunatic', 'fearmonger', 'vortox'], 'vortox');
    finishNight(s);
    execute(s, 1);
    finishDay(s);
    while (currentSlot(s) !== 'lunatic') completeSlot(s, { kind: 'target', target: 2 });
    completeSlot(s, { kind: 'target', target: 2 });
    expect(s.seats[1].alive).toBe(true);
    expect(s.ns!.lunaticPick).toBe(2);
    expect(currentSlot(s)).toBe('vortox');
  });
});

