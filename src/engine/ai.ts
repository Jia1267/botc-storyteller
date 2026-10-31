// AI 说书人（B 版，先只做暗流涌动）：夜里每一步怎么处理、白天怎么数票，全由网页按规则决定。
// 要选人的步骤去问他（手机上选），要给信息的步骤按"让局势最均衡"的推荐给法给；
// 和真人说书人模式用同一套引擎，只是把说书人点的那一下换成了推荐的那个选项。
import { balance, recommend } from './balance';
import { actorFor, believedRole, circleOrder, demonSeat, hasAbility, seatName, seatOf } from './core';
import { currentSlot, effectiveSlot, minionSeats, previewImp, previewSlayer, previewVirgin, slotActor, type SlotPayload } from './flow';
import { fortuneChoices, mayorBounceChoices, numberChoices, pairChoices, revealChoices, starpassChoices, twistChoices } from './info';
import { ROLES, roleName, type RoleId, type Team } from './roles';
import { seeded, type Rng } from './rng';
import { librarianZeroLines, phoneDuskLines, slotLines } from './scripts';
import type { GameState, SlotId } from './types';

/** AI 说书人能带的剧本 */
export const AI_SCRIPTS = ['tb'] as const;

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

/** 要问他：选几个人 */
export interface AiAsk {
  n: number;
  count: number;
  title: string;
  lines: string[];
  disabled?: number[];
}

/** 这一步要做什么：直接处理，或者先问他、拿到他的选择再处理 */
export type AiPlan =
  | { say?: string[]; send: AiMsg[]; payload: SlotPayload }
  | { ask: AiAsk; then: (picks: number[]) => { send: AiMsg[]; payload: SlotPayload } };

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
  }
  if (!actor) return { send: [], payload: none };
  const me = actor.n;

  switch (eff) {
    case 'poisoner':
    case 'monk':
    case 'butler':
      return {
        ask: { n: me, count: 1, title: roleName(eff), lines: lines(eff), disabled: eff === 'poisoner' ? [] : [me] },
        then: ([t]) => ({ send: [], payload: { kind: 'target', target: t } }),
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
        then: (picks) => {
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
      return {
        ask: { n: me, count: 1, title: roleName(actor.role), lines: lines('imp') },
        then: ([t]) => {
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
        then: ([t]) => {
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
 * 管家（包括以为自己是管家的酒鬼）只有主人也举手时才算。
 */
export function tallyHands(s: GameState, order: number[], hands: Record<number, boolean>, ghostUsed: number[]): { votes: number; counted: number[]; spent: number[] } {
  const counted: number[] = [];
  const spent: number[] = [];
  for (const n of order) {
    if (!hands[n]) continue;
    const x = seatOf(s, n);
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
