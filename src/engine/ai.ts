// AI 说书人（B 版，先只做暗流涌动）：夜里每一步怎么处理、白天怎么数票，全由网页按规则决定。
// 要选人的步骤去问他（手机上选），要给信息的步骤按"让局势最均衡"的推荐给法给；
// 和真人说书人模式用同一套引擎，只是把说书人点的那一下换成了推荐的那个选项。
import { balance, recommend } from './balance';
import { actorFor, believedRole, circleOrder, demonSeat, hasAbility, inPlay, isDemonSeat, isEvil, lilMonsta, malfunction, scriptOf, seatName, seatOf, teamOf } from './core';
import {
  currentSlot, demonKillPreview, effectiveSlot, fangguJumps, godfatherOutsiders, goonTriggered, minionSeats, pithagBlock, previewImp, previewSlayer, previewVirgin, slotActor,
  type SlotPayload,
} from './flow';
import {
  balloonistChoices, bountyChoices, chambermaidChoices, clockmakerChoices, dreamerChoices, flowergirlChoices, fortuneChoices, generalChoices, grandmotherChoices,
  innkeeperDrunkChoices, lilKillChoices, mathChoices, mayorBounceChoices, numberChoices, oracleChoices, pairChoices, pithagNightChoices, revealChoices, sageChoices,
  sailorDrunkChoices, seamstressChoices, shabalothReviveChoices, starpassChoices, sweetheartChoices, tinkerChoices, towncrierChoices, twistChoices, vigorPoisonChoices,
  widowInformChoices,
} from './info';
import { ROLES, roleName, type RoleId, type Team } from './roles';
import { seeded, shuffle, type Rng } from './rng';
import { drunkFakeChoices, marionetteFakeChoices, replaceRole, setCount } from './setup';
import { abilityNoSetup, hadikhiaLifeLines, librarianZeroLines, lilmonstaPhoneLines, phoneDuskLines, slotLines } from './scripts';
import type { GameState, SlotId } from './types';

/** AI 说书人能带的剧本 */
export const AI_SCRIPTS = ['tb', 'bmr', 'sv', 'sunset', 'spooky', 'alvsal'] as const;

/**
 * AI 局不配的角色：要靠人判断的（造谣者的话是不是真的、"疯狂"像不像、艺术家/渔夫白天找说书人、
 * 瘟疫医生死后说书人自己用爪牙能力……），以及网页还没接到 AI 白天流程里的。
 * 窃窃私语的镇民几乎都在这里，所以 AI 不带窃窃私语。
 */
export const AI_EXCLUDED: RoleId[] = ['gossip', 'mutant', 'cerenovus', 'artist', 'savant', 'juggler', 'pixie', 'harpy', 'plaguedoctor', 'fisherman'];

/** AI 局里还能选的角色（哲学家、麻脸巫婆的选项） */
const aiRoles = (rs: RoleId[]) => rs.filter((r) => !AI_EXCLUDED.includes(r));

/** 这个板子 AI 能带吗 */
export const aiBoardOk = (roles: RoleId[]) => !roles.some((r) => AI_EXCLUDED.includes(r));

/**
 * 均衡配板之后，把 AI 带不了的角色换成同类型、不在场、AI 带得了的角色；换不了返回 false。
 * 酒鬼、提线木偶以为的身份和恶魔的伪装也换掉：这些角色这局一定不在场，谁说自己是就一定在说谎。
 */
export function aiFixBoard(s: GameState, rng: Rng): boolean {
  for (let guard = 0; guard <= 10; guard++) {
    const bad = s.seats.find((x) => !x.traveller && AI_EXCLUDED.includes(x.role));
    if (!bad) {
      aiFixFakes(s, rng);
      return true;
    }
    const pool = scriptOf(s).roles.filter((r) => teamOf(r) === teamOf(bad.role) && !AI_EXCLUDED.includes(r) && !s.seats.some((x) => x.role === r));
    if (!pool.length) return false;
    replaceRole(s, bad.n, pool[Math.floor(rng() * pool.length)], rng);
  }
  return false;
}

function aiFixFakes(s: GameState, rng: Rng) {
  const ok = (r: RoleId | null) => !r || !AI_EXCLUDED.includes(r);
  if (!ok(s.drunkFake)) s.drunkFake = drunkFakeChoices(s).find((c) => ok(c.value))?.value ?? s.drunkFake;
  if (!ok(s.marionetteFake)) s.marionetteFake = marionetteFakeChoices(s).find((c) => ok(c.value))?.value ?? s.marionetteFake;
  const pool = shuffle(
    scriptOf(s).roles.filter((r) => (teamOf(r) === 'townsfolk' || teamOf(r) === 'outsider') && ok(r) && !inPlay(s, r) && !s.bluffs.includes(r) && r !== s.drunkFake && r !== s.marionetteFake),
    rng,
  );
  s.bluffs = s.bluffs.map((r) => (ok(r) ? r : (pool.pop() ?? r)));
}

/** AI 局一定不会出现的角色（剧本上有、AI 带不了）：开局时公开告诉大家 */
export const aiMissing = (s: GameState) => scriptOf(s).roles.filter((r) => AI_EXCLUDED.includes(r));

/** AI 局配板：均衡，并且不配要靠人判断的角色（同类型换不了——比如男爵要的外来者不够——就重新配一套） */
export function aiSetCount(s: GameState, n: number, rng: Rng) {
  for (let i = 0; i < 20; i++) {
    setCount(s, n, rng);
    if (aiFixBoard(s, rng)) return;
  }
}

/** 开房时的设置（秒） */
export interface AiSettings {
  /** 私聊时长 */
  priv: number;
  /** 公聊时长 */
  pub: number;
  /** 投票时每人举手的时间 */
  vote: number;
}

export const AI_DEFAULTS: AiSettings = { priv: 300, pub: 300, vote: 5 };

/** 发到手机上的卡片（和界面上的给他看卡片同一个样子） */
export interface AiCard {
  title?: string;
  big: string[];
  team?: Team;
  alignment?: 'good' | 'evil';
  ability?: string;
  note?: string;
  lines?: string[];
  rows?: string[];
}

export interface AiMsg {
  n: number;
  /** 同一步给同一个人发几条时区分 */
  tag: string;
  card: AiCard;
  /** 他的角色变了：手机上"看我的角色"换成这张 */
  role?: AiCard;
}

/** 要问他：选几个人（有的还要选角色，或者可以不用） */
export interface AiAsk {
  n: number;
  count: number;
  title: string;
  lines: string[];
  disabled?: number[];
  opts?: { id: string; label: string; evil?: boolean }[];
  skip?: string;
  /** 要按顺序选 */
  ordered?: boolean;
  /** 选之前先给他看的魔典（寡妇） */
  rows?: string[];
  /** 同一步问好几个人、或问同一个人两次时区分（默认 pick） */
  tag?: string;
}

/** 他在手机上的回答 */
export interface AiAnswer {
  seats: number[];
  opts: string[];
  skip: boolean;
}

export interface AiDone {
  send: AiMsg[];
  payload: SlotPayload;
}

/** 问完他还要再同时问几个人（哈迪寂亚选中的三个人各选活还是死） */
export interface AiMore {
  more: AiAsk[];
  then: (as: AiAnswer[]) => AiDone;
}

/** 这一步要做什么：直接处理，或者先问他、拿到他的选择再处理（处理时可能还要发信息给别人） */
export type AiPlan = (AiDone & { say?: string[] }) | { ask: AiAsk; send?: AiMsg[]; then: (a: AiAnswer) => AiDone | AiMore };

const roleOpts = (rs: RoleId[]) => rs.map((r) => ({ id: r, label: roleName(r), evil: teamOf(r) === 'minion' || teamOf(r) === 'demon' }));
const deadSeats = (s: GameState) => s.seats.filter((x) => !x.alive).map((x) => x.n);

/** 和真人模式的"推荐"用同一个随机数：同一步算出来的推荐一样 */
const rngOf = (s: GameState, extra = 0): Rng => seeded(s.log.length * 7919 + s.night * 131 + (s.ns?.slot ?? 0) * 17 + extra);
const best = <T,>(s: GameState, choices: { value: T; lean: number }[], extra: number): number =>
  recommend(choices as Parameters<typeof recommend>[0], balance(s).score, rngOf(s, extra));

const roleCardOf = (r: RoleId, title: string, evil?: boolean): AiCard => ({
  title,
  big: [roleName(r)],
  team: ROLES[r].team,
  alignment: evil === undefined ? undefined : evil ? 'evil' : 'good',
  ability: ROLES[r].ability,
});

/** 角色变了：发"你现在是…"，并换掉他手机上的角色卡 */
const becomes = (n: number, r: RoleId, evil: boolean): AiMsg => ({ n, tag: 'info', card: roleCardOf(r, '你现在是', evil), role: roleCardOf(r, '你的角色', evil) });

/** 夜里这一步：网页怎么处理。不支持的步骤返回 null（AI 局只用暗流涌动，不会遇到） */
export function aiPlan(s: GameState, deps: { spyRows: (s: GameState) => string[] }): AiPlan | null {
  const slot = currentSlot(s);
  const eff = effectiveSlot(s, slot);
  const actor = slotActor(s, slot);
  const lines = (sl: SlotId) => slotLines(sl, s.style);
  const none: SlotPayload = { kind: 'none' };

  switch (eff) {
    case 'dusk':
      return { say: phoneDuskLines(s.style), send: [], payload: none };
    case 'dawn':
      return { send: [], payload: none };
    case 'minionInfo': {
      const d = demonSeat(s)!;
      const ms = minionSeats(s);
      return {
        send: ms.map((x) => ({
          n: x.n,
          tag: 'info',
          card: { big: [seatName(d.n)], note: ms.length > 1 ? `爪牙：${ms.map((m) => seatName(m.n)).join('、')}` : undefined, lines: lines('minionInfo') },
        })),
        payload: none,
      };
    }
    case 'demonInfo': {
      const d = demonSeat(s)!;
      const ms = minionSeats(s);
      const l = lines('demonInfo');
      return {
        send: [
          ...(ms.length ? [{ n: d.n, tag: 'info', card: { big: ms.map((m) => seatName(m.n)), lines: l.slice(0, 1) } }] : []),
          { n: d.n, tag: 'info2', card: { big: s.bluffs.map(roleName), lines: l.slice(1) } },
        ],
        payload: none,
      };
    }
    case 'lilmonsta': {
      // 小怪宝：第一个活着的爪牙替大家选照看者，再告诉所有爪牙（谁是爪牙、疯子是谁）；第 2 夜起谁死按推荐
      const minions = s.seats.filter((x) => x.alive && teamOf(x.role) === 'minion');
      const lun = s.seats.find((x) => x.role === 'lunatic' && x.alive);
      const note = `爪牙：${minions.map((x) => seatName(x.n)).join('、')}。${lun ? `疯子是 ${seatName(lun.n)}${s.ns?.lunaticPick ? `，今晚他选了 ${seatName(s.ns.lunaticPick)}` : ''}。` : ''}`;
      const finish = (bs: number): AiDone => {
        const choices = s.night > 1 ? lilKillChoices({ ...s, babysitter: bs }, rngOf(s, bs)) : [];
        const kill = choices.length ? choices[recommend(choices, balance(s).score, rngOf(s, bs + 2))]?.value : undefined;
        return { send: minions.map((x) => ({ n: x.n, tag: 'info', card: { title: '今晚照看小怪宝的是', big: [seatName(bs)], note } })), payload: { kind: 'lilmonsta', babysitter: bs, kill } };
      };
      if (s.babysitterLocked && s.babysitter) return finish(s.babysitter);
      if (!minions.length) return { send: [], payload: none };
      return {
        ask: { n: minions[0].n, count: 1, title: '小怪宝：替爪牙们选谁照看它', lines: lilmonstaPhoneLines, disabled: s.seats.filter((x) => !minions.includes(x)).map((x) => x.n) },
        then: ({ seats: [bs] }) => finish(bs ?? minions[0].n),
      };
    }
  }
  // 说书人自己决定、不用叫醒任何人的步骤（放在"谁行动"之前，不然会被当成没人行动直接跳过）
  switch (eff) {
    case 'sweetheart': {
      // 心上人死了：按推荐选一个人从此醉酒
      const choices = sweetheartChoices(s, rngOf(s));
      const c = choices[best(s, choices, 1)] ?? choices[0];
      return { send: [], payload: c ? { kind: 'target', target: c.value } : none };
    }
    case 'tinker': {
      // 修补匠：说书人决定他今晚死不死
      const choices = tinkerChoices(s);
      const c = choices[recommend(choices, balance(s).score, rngOf(s, 7))] ?? choices[0];
      return { send: [], payload: { kind: 'yesno', yes: c.value, truth: true } };
    }
  }
  if (!actor) return { send: [], payload: none };
  const me = actor.n;

  switch (eff) {
    case 'poisoner':
    case 'monk':
    case 'butler':
    case 'fearmonger':
      return {
        ask: { n: me, count: 1, title: roleName(eff), lines: lines(eff), disabled: eff === 'monk' || eff === 'butler' ? [me] : [] },
        then: ({ seats: [t] }) => ({ send: [], payload: { kind: 'target', target: t } }),
      };
    case 'widow':
      // 寡妇：先看魔典再下毒；再按推荐告诉一名善良玩家"寡妇在场"
      return {
        ask: { n: me, count: 1, title: roleName('widow'), lines: lines('widow'), rows: deps.spyRows(s) },
        then: ({ seats: [t] }) => {
          const choices = widowInformChoices({ ...s, widowPoison: t }, rngOf(s, t));
          const who = choices.length ? (choices[recommend(choices, balance(s).score, rngOf(s, t + 3))]?.value ?? null) : null;
          return {
            send: who ? [{ n: who, tag: 'inform', card: { title: '这个角色在场', big: ['寡妇'], lines: ['寡妇在场。'] } }] : [],
            payload: { kind: 'widow', target: t, informed: who },
          };
        },
      };
    case 'washerwoman':
    case 'librarian':
    case 'investigator': {
      const choices = pairChoices(s, eff, me, rngOf(s));
      const c = choices[best(s, choices, 1)];
      const v = c.value;
      const card: AiCard =
        v.role && v.seats
          ? { title: `${seatName(v.seats[0])}和${seatName(v.seats[1])}之中有一人是`, big: [roleName(v.role)], lines: lines(eff) }
          : { title: '场上没有外来者', big: ['0'], lines: librarianZeroLines(s.style) };
      return { send: [{ n: me, tag: 'info', card }], payload: { kind: 'pair', info: v, truth: c.truth, twist: !!c.twist } };
    }
    case 'chef':
    case 'empath': {
      const choices = numberChoices(s, eff, me);
      const c = choices[best(s, choices, 1)];
      return { send: [{ n: me, tag: 'info', card: { big: [String(c.value)], lines: lines(eff) } }], payload: { kind: 'number', num: c.value, truth: c.truth, twist: !!c.twist } };
    }
    case 'fortuneteller':
      return {
        ask: { n: me, count: 2, title: roleName('fortuneteller'), lines: lines('fortuneteller') },
        then: ({ seats: picks }) => {
          const p = [picks[0], picks[1]] as [number, number];
          const choices = fortuneChoices(s, me, p);
          const c = choices[recommend(choices, balance(s).score, rngOf(s, p[0] * 31 + p[1]))];
          return {
            send: [{ n: me, tag: 'info', card: { title: `${seatName(p[0])}和${seatName(p[1])}之中`, big: [c.value ? '有恶魔' : '没有恶魔'] } }],
            payload: { kind: 'fortune', picks: p, yes: c.value, truth: c.truth, twist: !!c.twist },
          };
        },
      };
    case 'spy':
      return { send: [{ n: me, tag: 'info', card: { big: [], rows: deps.spyRows(s), lines: lines('spy') } }], payload: none };
    case 'scarletwoman':
      return { send: [{ ...becomes(me, actor.role, true), card: { ...roleCardOf(actor.role, '你现在是', true), lines: lines('scarletwoman') } }], payload: none };
    case 'imp':
    case 'vortox':
      return {
        ask: { n: me, count: 1, title: roleName(actor.role), lines: lines(eff) },
        then: ({ seats: [t] }) => {
          const pv = previewImp(s, t);
          if (pv.kind === 'mayor') {
            const choices = mayorBounceChoices(s, t, rngOf(s, t));
            return { send: [], payload: { kind: 'imp', target: t, bounce: choices[recommend(choices, balance(s).score, rngOf(s, t + 1))]?.value } };
          }
          if (pv.kind === 'starpass') {
            const choices = starpassChoices(s, me);
            const to = choices[recommend(choices, balance(s).score, rngOf(s, t + 1))]?.value;
            return { send: to ? [becomes(to, actor.role, true)] : [], payload: { kind: 'imp', target: t, starpassTo: to } };
          }
          return { send: [], payload: { kind: 'imp', target: t } };
        },
      };
    case 'ravenkeeper':
      return {
        ask: { n: me, count: 1, title: roleName('ravenkeeper'), lines: lines('ravenkeeper') },
        then: ({ seats: [t] }) => {
          const choices = revealChoices(s, me, t, rngOf(s, t), 'ravenkeeper');
          const c = choices[recommend(choices, balance(s).score, rngOf(s, t + 1))];
          return { send: [{ n: me, tag: 'info', card: { title: `${seatName(t)} 的角色是`, big: [roleName(c.value)] } }], payload: { kind: 'reveal', pick: t, role: c.value, truth: c.truth, twist: !!c.twist } };
        },
      };
    case 'undertaker': {
      const t = s.lastExecution!.seat;
      const choices = revealChoices(s, me, t, rngOf(s, t), 'undertaker');
      const c = choices[recommend(choices, balance(s).score, rngOf(s, t + 1))];
      return {
        send: [{ n: me, tag: 'info', card: { title: `今天被处决的 ${seatName(t)} 是`, big: [roleName(c.value)], lines: lines('undertaker') } }],
        payload: { kind: 'reveal', pick: t, role: c.value, truth: c.truth, twist: !!c.twist },
      };
    }
    case 'alchemist': {
      // 炼金术士：告诉他有哪个爪牙的能力，之后在那个爪牙的位置问他
      const ab = s.alchemistAbility;
      if (!ab) return { send: [], payload: none };
      return { send: [{ n: me, tag: 'info', card: { title: '你拥有这个爪牙的能力（你仍然是善良的）', big: [roleName(ab)], ability: abilityNoSetup(ROLES[ab].ability), lines: lines('alchemist') } }], payload: none };
    }
  }
  return bmrPlan(s, eff, actor.n, lines) ?? svPlan(s, eff, actor.n, lines) ?? alvsalPlan(s, eff, actor.n, lines);
}

/* ---------------- 王不见王 ---------------- */

function alvsalPlan(s: GameState, eff: SlotId, me: number, lines: (sl: SlotId) => string[]): AiPlan | null {
  const none: SlotPayload = { kind: 'none' };
  const info = (card: AiCard, l?: string[]): AiMsg[] => [{ n: me, tag: 'info', card: l?.length ? { ...card, lines: l } : card }];
  switch (eff) {
    case 'marionette': {
      const m = s.seats.find((x) => x.role === 'marionette');
      return m ? { send: info({ title: '这名玩家是你的提线木偶', big: [seatName(m.n)] }, lines('marionette')), payload: none } : { send: [], payload: none };
    }
    case 'balloonist': {
      const choices = balloonistChoices(s, me, rngOf(s));
      const c = choices[best(s, choices, 1)] ?? choices[0];
      if (!c) return { send: [], payload: none };
      return {
        send: info({ title: '这名玩家的角色类型和你之前得知的都不同', big: [seatName(c.value.seat)] }, lines('balloonist')),
        payload: { kind: 'balloon', seat: c.value.seat, team: c.value.team, truth: c.truth },
      };
    }
    case 'bountyhunter': {
      const choices = bountyChoices(s, me, rngOf(s));
      const c = choices[best(s, choices, 1)] ?? choices[0];
      if (!c) return { send: [], payload: none };
      return { send: info({ title: '这名玩家是邪恶的', big: [seatName(c.value)] }, lines('bountyhunter')), payload: { kind: 'bounty', seat: c.value, truth: c.truth, twist: c.twist } };
    }
    case 'general': {
      const choices = generalChoices(s, me);
      const c = choices[best(s, choices, 1)] ?? choices[0];
      const word = c.value === 'good' ? '善良占优' : c.value === 'evil' ? '邪恶占优' : '都不占优';
      return { send: info({ title: '现在的局势', big: [word] }, lines('general')), payload: { kind: 'general', answer: c.value, truth: c.truth } };
    }
    case 'alhadikhia':
      // 哈迪寂亚：按顺序选三个人，三个人再各自在手机上选活还是死（同时问，互相看不到）
      return {
        ask: { n: me, count: 3, ordered: true, title: roleName('alhadikhia'), lines: lines('alhadikhia'), skip: '今晚不选' },
        then: (a): AiDone | AiMore => {
          if (a.skip || a.seats.length < 3) return { send: [], payload: { kind: 'hadikhia', picks: [], live: [] } };
          const picks = a.seats;
          return {
            more: picks.map((n, i) => ({
              n,
              tag: `life${i}`,
              count: 0,
              title: '恶魔选中了你：你选择活还是死？',
              lines: hadikhiaLifeLines(picks, !seatOf(s, n).alive),
              opts: [
                { id: 'live', label: '活' },
                { id: 'die', label: '死' },
              ],
            })),
            then: (as) => ({ send: [], payload: { kind: 'hadikhia', picks, live: as.map((x) => x.opts[0] === 'live') } }),
          };
        },
      };
  }
  return null;
}

/* ---------------- 梦殒春宵 ---------------- */

function svPlan(s: GameState, eff: SlotId, me: number, lines: (sl: SlotId) => string[]): AiPlan | null {
  const none: SlotPayload = { kind: 'none' };
  const info = (card: AiCard, l?: string[]): AiMsg[] => [{ n: me, tag: 'info', card: l?.length ? { ...card, lines: l } : card }];
  const count = (kind: 'clockmaker' | 'mathematician' | 'oracle', choices: { value: number; lean: number; truth: boolean; twist?: boolean }[]): AiPlan => {
    const c = choices[best(s, choices, 1)] ?? choices[0];
    return { send: info({ big: [String(c.value)] }, lines(kind)), payload: { kind: 'number', num: c.value, truth: c.truth, twist: !!c.twist } };
  };
  switch (eff) {
    case 'clockmaker':
      return count('clockmaker', clockmakerChoices(s, me));
    case 'mathematician':
      return count('mathematician', mathChoices(s, me));
    case 'oracle':
      return count('oracle', oracleChoices(s, me));
    case 'flowergirl': {
      const choices = flowergirlChoices(s, me);
      const c = choices[best(s, choices, 1)] ?? choices[0];
      return { send: info({ title: '恶魔今天有没有投票', big: [c.value ? '投过' : '没投'] }, lines('flowergirl')), payload: { kind: 'yesno', yes: c.value, truth: c.truth } };
    }
    case 'towncrier': {
      const choices = towncrierChoices(s, me);
      const c = choices[best(s, choices, 1)] ?? choices[0];
      return { send: info({ title: '今天有没有爪牙提名过', big: [c.value ? '有' : '没有'] }, lines('towncrier')), payload: { kind: 'yesno', yes: c.value, truth: c.truth } };
    }
    case 'sage': {
      const choices = sageChoices(s, me, rngOf(s));
      const c = choices[best(s, choices, 1)] ?? choices[0];
      if (!c) return { send: [], payload: none };
      return { send: info({ title: '这两人之中有一个是恶魔', big: c.value.map(seatName) }, lines('sage')), payload: { kind: 'sage', picks: c.value, truth: c.truth } };
    }
    case 'dreamer':
      return {
        ask: { n: me, count: 1, title: roleName('dreamer'), lines: lines('dreamer'), disabled: [me, ...s.seats.filter((x) => x.traveller).map((x) => x.n)] },
        then: ({ seats: [t] }) => {
          const choices = dreamerChoices(s, me, t, rngOf(s, t));
          const c = choices[recommend(choices, balance(s).score, rngOf(s, t + 1))] ?? choices[0];
          return {
            send: info({ title: `${seatName(t)} 是这两个角色之一`, big: [roleName(c.value.good), roleName(c.value.evil)] }),
            payload: { kind: 'dreamer', target: t, good: c.value.good, evil: c.value.evil, truth: c.truth, twist: !!c.twist },
          };
        },
      };
    case 'seamstress':
      return {
        ask: { n: me, count: 2, title: roleName('seamstress'), lines: lines('seamstress'), disabled: [me], skip: '今晚不用（整局只能用一次）' },
        then: (a) => {
          if (a.skip || a.seats.length < 2) return { send: [], payload: { kind: 'seamstress', picks: null, same: false, truth: true } };
          const p = [a.seats[0], a.seats[1]] as [number, number];
          const choices = seamstressChoices(s, me, p);
          const c = choices[recommend(choices, balance(s).score, rngOf(s, p[0] * 17 + p[1]))] ?? choices[0];
          return { send: info({ title: `${p.map(seatName).join('、')}：`, big: [c.value ? '同一阵营' : '不同阵营'] }), payload: { kind: 'seamstress', picks: p, same: c.value, truth: c.truth, twist: !!c.twist } };
        },
      };
    case 'philosopher': {
      const goods = aiRoles(scriptOf(s).roles.filter((r) => (teamOf(r) === 'townsfolk' || teamOf(r) === 'outsider') && r !== 'philosopher'));
      return {
        ask: { n: me, count: 0, title: roleName('philosopher'), lines: lines('philosopher'), opts: roleOpts(goods), skip: '今晚不用（整局一次）' },
        then: (a) => ({ send: [], payload: { kind: 'philo', role: a.skip ? null : ((a.opts[0] as RoleId) ?? null) } }),
      };
    }
    case 'snakecharmer':
      return {
        ask: { n: me, count: 1, title: roleName('snakecharmer'), lines: lines('snakecharmer'), disabled: deadSeats(s) },
        then: ({ seats: [t] }) => {
          const x = seatOf(s, t);
          const hit = teamOf(x.role) === 'demon' && !malfunction(s, me) && !goonTriggered(s, seatOf(s, me), [t], 'snakecharmer');
          return { send: hit ? [becomes(me, x.role, true), becomes(t, 'snakecharmer', false)] : [], payload: { kind: 'target', target: t } };
        },
      };
    case 'eviltwin': {
      const good = seatOf(s, s.twin!);
      return {
        send: [
          { n: good.n, tag: 'info', card: { title: '你的双子是镜像双子（邪恶）', big: [seatName(me)], lines: lines('eviltwin') } },
          { n: me, tag: 'info', card: { title: `你的善良双子是 ${seatName(good.n)}，他的角色是`, big: [roleName(good.role)], lines: lines('eviltwin') } },
        ],
        payload: none,
      };
    }
    case 'witch':
      return {
        ask: { n: me, count: 1, title: roleName('witch'), lines: lines('witch') },
        then: ({ seats: [t] }) => ({ send: [], payload: { kind: 'target', target: t } }),
      };
    case 'pithag':
      return {
        ask: { n: me, count: 1, title: '麻脸巫婆：选一名玩家，再选一个角色', lines: lines('pithag'), opts: roleOpts(aiRoles(scriptOf(s).roles)) },
        then: (a) => {
          const t = a.seats[0];
          const role = (a.opts[0] as RoleId) ?? seatOf(s, t).role;
          const x = seatOf(s, t);
          const bad = malfunction(s, me) || !!goonTriggered(s, seatOf(s, me), [t], 'pithag');
          const block = pithagBlock(s, t, role);
          const changes = !bad && !block;
          const makesDemon = changes && teamOf(role) === 'demon';
          const nc = makesDemon ? pithagNightChoices(s, t) : [];
          const night = nc.length ? nc[recommend(nc, balance(s).score, rngOf(s, 3))]?.value : undefined;
          return {
            send: changes ? [becomes(t, role, isEvil(x))] : [],
            payload: { kind: 'pithag', target: t, role, deaths: [], noKill: makesDemon && !!night?.noKill },
          };
        },
      };
    case 'fanggu':
    case 'nodashii':
    case 'vigormortis':
      return {
        ask: { n: me, count: 1, title: roleName(eff), lines: lines(eff) },
        then: ({ seats: [t] }) => {
          const x = seatOf(s, t);
          const bad = malfunction(s, me) || !!goonTriggered(s, seatOf(s, me), [t], eff);
          if (eff === 'fanggu') {
            const jump = !bad && fangguJumps(s, t);
            return { send: jump ? [becomes(t, 'fanggu', true)] : [], payload: { kind: 'target', target: t } };
          }
          if (eff === 'vigormortis') {
            const minion = !bad && demonKillPreview(s, t).dies && teamOf(x.role) === 'minion';
            const pc = minion ? vigorPoisonChoices(s, t) : [];
            const poison = pc.length ? (pc[recommend(pc, balance(s).score, rngOf(s, 4))]?.value ?? null) : null;
            return { send: [], payload: { kind: 'vigor', target: t, poison } };
          }
          return { send: [], payload: { kind: 'target', target: t } };
        },
      };
    case 'barber': {
      const others = s.seats.filter((x) => x.n !== me && teamOf(x.role) === 'demon').map((x) => x.n);
      return {
        ask: { n: me, count: 2, title: '理发师死了：你可以选两个人交换角色（可以选自己）', lines: lines('barber'), disabled: others, skip: '不换' },
        then: (a) => {
          if (a.skip || a.seats.length < 2) return { send: [], payload: { kind: 'barber', swap: null } };
          const [p, q] = a.seats;
          const roleP = seatOf(s, q).role;
          const roleQ = seatOf(s, p).role;
          return { send: [becomes(p, roleP, isEvil(seatOf(s, p))), becomes(q, roleQ, isEvil(seatOf(s, q)))], payload: { kind: 'barber', swap: [p, q] } };
        },
      };
    }
  }
  return null;
}

/* ---------------- 暗月初升 ---------------- */

function bmrPlan(s: GameState, eff: SlotId, me: number, lines: (sl: SlotId) => string[]): AiPlan | null {
  const none: SlotPayload = { kind: 'none' };
  const target = (t: number): SlotPayload => ({ kind: 'target', target: t });
  const pickOne = (title: string, l: string[], disabled: number[] = []): AiPlan => ({
    ask: { n: me, count: 1, title, lines: l, disabled },
    then: ({ seats: [t] }) => ({ send: [], payload: target(t) }),
  });
  const d = demonSeat(s);
  switch (eff) {
    case 'lunatic': {
      const fake = s.lunaticFake ?? 'imp';
      const tell = (note?: string): AiMsg[] => (d && !lilMonsta(s) ? [{ n: d.n, tag: 'info', card: { title: '这名玩家是疯子', big: [seatName(me)], note } }] : []);
      if (s.night === 1 && s.count < 7) return { send: tell(), payload: none };
      if (s.night === 1) {
        // 像真恶魔一样给他假的爪牙和伪装
        const nMin = minionSeats(s).length;
        const fakeMinions = shuffle(s.seats.filter((x) => x.n !== me && !x.traveller).map((x) => x.n), rngOf(s, 21)).slice(0, nMin).sort((a, b) => a - b);
        const fakeBluffs = shuffle(scriptOf(s).roles.filter((r) => (teamOf(r) === 'townsfolk' || teamOf(r) === 'outsider') && r !== 'lunatic' && r !== 'drunk'), rngOf(s, 22)).slice(0, 3);
        const l = lines('demonInfo');
        const info: AiMsg[] = [
          ...(nMin ? [{ n: me, tag: 'info', card: { big: fakeMinions.map(seatName), lines: l.slice(0, 1) } }] : []),
          { n: me, tag: 'info2', card: { big: fakeBluffs.map(roleName), lines: l.slice(1) } },
        ];
        if (fake !== 'pukka') return { send: [...info, ...tell()], payload: none };
        return {
          ask: { n: me, count: 1, title: roleName(fake), lines: lines('pukka') },
          send: info,
          then: ({ seats: [t] }) => ({ send: tell(`今晚他选了 ${seatName(t)}`), payload: target(t) }),
        };
      }
      const l = lines(fake as SlotId).length ? lines(fake as SlotId) : lines('lunatic');
      return { ask: { n: me, count: 1, title: roleName(fake), lines: l }, then: ({ seats: [t] }) => ({ send: tell(`今晚他选了 ${seatName(t)}`), payload: target(t) }) };
    }
    case 'sailor':
      return {
        ask: { n: me, count: 1, title: roleName('sailor'), lines: lines('sailor'), disabled: deadSeats(s) },
        then: ({ seats: [t] }) => {
          const choices = sailorDrunkChoices(s, me, t);
          const c = choices[recommend(choices, balance(s).score, rngOf(s, t))] ?? choices[0];
          return { send: [], payload: { kind: 'sailor', target: t, drunk: c.value } };
        },
      };
    case 'courtier':
      return {
        ask: { n: me, count: 0, title: roleName('courtier'), lines: lines('courtier'), opts: roleOpts(scriptOf(s).roles), skip: '今晚不用（整局一次）' },
        then: (a) => ({ send: [], payload: { kind: 'courtier', role: a.skip ? null : ((a.opts[0] as RoleId) ?? null) } }),
      };
    case 'godfather': {
      if (s.night > 1) return pickOne(roleName('godfather'), ['今天有外来者死了。请选择一名玩家，他会死亡。']);
      const outs = godfatherOutsiders(s);
      const card: AiCard = outs.length ? { title: '这些外来者在场', big: outs.map(roleName), lines: lines('godfather') } : { title: '场上没有外来者', big: ['0'] };
      return { send: [{ n: me, tag: 'info', card }], payload: none };
    }
    case 'devilsadvocate': {
      const last = s.advocate?.night === s.night - 1 ? [s.advocate.seat] : [];
      return pickOne(roleName('devilsadvocate'), lines('devilsadvocate'), [...deadSeats(s), ...last]);
    }
    case 'exorcist': {
      const last = s.exorcistPick?.night === s.night - 1 ? [s.exorcistPick.seat] : [];
      return {
        ask: { n: me, count: 1, title: roleName('exorcist'), lines: lines('exorcist'), disabled: last },
        then: ({ seats: [t] }) => ({
          // 选中了恶魔：告诉恶魔驱魔人是谁，他今晚不醒
          send: isDemonSeat(s, t) && !malfunction(s, me) && !goonTriggered(s, seatOf(s, me), [t], 'exorcist') ? [{ n: t, tag: 'info', card: { title: `${seatName(me)} 是`, big: ['驱魔人'], note: '他选中了你：今晚你不用醒了。' } }] : [],
          payload: target(t),
        }),
      };
    }
    case 'pukka':
      return pickOne(roleName('pukka'), lines('pukka'));
    case 'zombuul':
      return pickOne(roleName('zombuul'), lines('zombuul'));
    case 'shabaloth':
      return {
        ask: { n: me, count: 2, title: roleName('shabaloth'), lines: lines('shabaloth') },
        then: ({ seats }) => {
          const choices = shabalothReviveChoices(s);
          const revive = choices.length ? (choices[recommend(choices, balance(s).score, rngOf(s, 3))]?.value ?? null) : null;
          return { send: [], payload: { kind: 'shabaloth', picks: seats, revive } };
        },
      };
    case 'po': {
      const need = s.poCharged ? 3 : 1;
      const l = s.poCharged ? (s.style === 'simple' ? ['请选择三名玩家，他们会死亡。'] : ['珀积蓄了一整晚的力量……选出三个人吧。']) : lines('po');
      return {
        ask: { n: me, count: need, title: roleName('po'), lines: l, skip: s.poCharged ? undefined : '今晚不选（下一晚可以选三个）' },
        then: (a) => ({ send: [], payload: { kind: 'po', picks: a.skip ? [] : a.seats } }),
      };
    }
    case 'assassin':
    case 'professor':
      return {
        ask: { n: me, count: 1, title: roleName(eff), lines: lines(eff), disabled: eff === 'professor' ? s.seats.filter((x) => x.alive).map((x) => x.n) : [], skip: '今晚不用（整局一次）' },
        then: (a) => ({ send: [], payload: a.skip || !a.seats.length ? none : target(a.seats[0]) }),
      };
    case 'grandmother': {
      const choices = grandmotherChoices(s, me, rngOf(s));
      const c = choices[best(s, choices, 1)] ?? choices[0];
      if (!c) return { send: [], payload: none };
      return {
        send: [{ n: me, tag: 'info', card: { title: `你的孙子是 ${seatName(c.value.seat)}，他的角色是`, big: [roleName(c.value.role)], lines: lines('grandmother') } }],
        payload: { kind: 'grandmother', seat: c.value.seat, role: c.value.role, truth: c.truth },
      };
    }
    case 'chambermaid':
      return {
        ask: { n: me, count: 2, title: roleName('chambermaid'), lines: lines('chambermaid'), disabled: s.seats.filter((x) => !x.alive || x.n === me).map((x) => x.n) },
        then: ({ seats: picks }) => {
          const choices = chambermaidChoices(s, me, picks, !!goonTriggered(s, seatOf(s, me), picks, 'chambermaid'));
          const c = choices[recommend(choices, balance(s).score, rngOf(s, picks[0] * 13 + picks[1]))] ?? choices[0];
          return {
            send: [{ n: me, tag: 'info', card: { title: `${picks.map(seatName).join('、')} 中今晚因自己的能力醒来过的人数`, big: [String(c.value)] } }],
            payload: { kind: 'number', num: c.value, truth: c.truth, twist: !!c.twist, picks },
          };
        },
      };
    case 'innkeeper':
      return {
        ask: { n: me, count: 2, title: roleName('innkeeper'), lines: lines('innkeeper') },
        then: ({ seats: picks }) => {
          const p = [picks[0], picks[1]] as [number, number];
          const choices = innkeeperDrunkChoices(s, p);
          const c = choices[recommend(choices, balance(s).score, rngOf(s, p[0] * 7 + p[1]))] ?? choices[0];
          return { send: [], payload: { kind: 'innkeeper', picks: p, drunk: c.value } };
        },
      };
    case 'gambler':
      return {
        ask: { n: me, count: 1, title: '赌徒：选一名玩家，再猜他的角色', lines: lines('gambler'), disabled: [me], opts: roleOpts(scriptOf(s).roles) },
        then: (a) => ({ send: [], payload: { kind: 'gambler', target: a.seats[0], role: (a.opts[0] as RoleId) ?? seatOf(s, a.seats[0]).role } }),
      };
    case 'gossip':
    case 'moonchild':
      return { send: [], payload: none };
  }
  return null;
}

/* ---------------- 白天：提名、投票 ---------------- */

/** 投票顺序：从被提名者顺时针的下一位开始，被提名者最后 */
export function voteOrder(s: GameState, nominee: number): number[] {
  const order = circleOrder(s).filter((n) => !seatOf(s, n).left);
  const i = order.indexOf(nominee);
  return [...order.slice(i + 1), ...order.slice(0, i + 1)];
}

/**
 * 数票：活人举手算一票；死人举手用掉他整局唯一的一票（已经用过的不算）；
 * 管家（包括以为自己是管家的酒鬼）只有主人也举手时才算；
 * 能力生效的报丧女妖举手算两票，死了也不用掉那一票。
 */
export function tallyHands(s: GameState, order: number[], hands: Record<number, boolean>, ghostUsed: number[]): { votes: number; counted: number[]; spent: number[] } {
  const counted: number[] = [];
  const spent: number[] = [];
  for (const n of order) {
    if (!hands[n]) continue;
    const x = seatOf(s, n);
    if (s.bansheeActive === n) {
      counted.push(n, n);
      continue;
    }
    if (!x.alive && ghostUsed.includes(n)) continue;
    if (x.alive && believedRole(s, x) === 'butler' && s.butlerMaster && !hands[s.butlerMaster]) continue;
    counted.push(n);
    if (!x.alive) spent.push(n);
  }
  return { votes: counted.length, counted, spent };
}

/** 有人提名：贞洁者会不会把提名者处决（间谍要不要当成镇民按推荐） */
export function aiVirgin(s: GameState, nominee: number, nominator: number): { virgin: boolean; twist: boolean } {
  const v = actorFor(s, 'virgin');
  if (!v || v.n !== nominee || v.used) return { virgin: false, twist: false };
  const pv = previewVirgin(s, nominee, nominator);
  return { virgin: true, twist: pv.askTwist ? twistPick(s, pv.askTwist) : false };
}

/** 有人宣称猎手开枪：陌客要不要当成恶魔按推荐 */
export function aiSlayer(s: GameState, shooter: number, target: number): { twist: boolean; hits: boolean; reason: string } {
  const pv = previewSlayer(s, shooter, target);
  const twist = pv.askTwist ? twistPick(s, pv.askTwist) : false;
  return { twist, hits: pv.applies || twist, reason: pv.reason };
}

const twistPick = (s: GameState, kind: 'spyTownsfolk' | 'recluseDemon') => {
  const choices = twistChoices(kind);
  return choices[recommend(choices, balance(s).score, rngOf(s, 7))].value;
};

/** 这个人真的有猎手能力（公开开枪的结果由引擎判，这里只用来写提示） */
export const isSlayer = (s: GameState, n: number) => hasAbility(s, seatOf(s, n), 'slayer');
