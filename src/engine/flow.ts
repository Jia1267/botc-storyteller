import { ROLES, roleName, type RoleId } from './roles';
import {
  actorFor, addLog, aliveCount, demonSeat, isEvil, kill, malfunction, seatLabel, seatOf,
} from './core';
import { pairLabel, scarletCanTakeOver, type PairInfo } from './info';
import type { GameState, Seat, SlotId } from './types';

export const FIRST_NIGHT: SlotId[] = [
  'dusk', 'minionInfo', 'demonInfo', 'poisoner', 'washerwoman', 'librarian', 'investigator',
  'chef', 'empath', 'fortuneteller', 'butler', 'spy', 'dawn',
];
export const OTHER_NIGHTS: SlotId[] = [
  'dusk', 'poisoner', 'monk', 'scarletwoman', 'imp', 'ravenkeeper', 'empath', 'fortuneteller',
  'undertaker', 'butler', 'spy', 'dawn',
];

export const slotsFor = (night: number) => (night === 1 ? FIRST_NIGHT : OTHER_NIGHTS);

export function currentSlot(s: GameState): SlotId {
  return slotsFor(s.night)[s.ns!.slot];
}

const ROLE_SLOTS: SlotId[] = [
  'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller',
  'butler', 'spy', 'monk', 'ravenkeeper', 'undertaker',
];

/** 这一步要叫醒的人 */
export function slotActor(s: GameState, slot: SlotId): Seat | undefined {
  if (slot === 'imp') return demonSeat(s);
  if (slot === 'scarletwoman') return s.pendingNewDemon ? seatOf(s, s.pendingNewDemon) : undefined;
  if (ROLE_SLOTS.includes(slot)) return actorFor(s, slot as RoleId);
  return undefined;
}

export const minionSeats = (s: GameState) => s.seats.filter((x) => ROLES[x.role].team === 'minion');

export function shouldRun(s: GameState, slot: SlotId): boolean {
  switch (slot) {
    case 'dusk':
    case 'dawn':
      return true;
    case 'minionInfo':
    case 'demonInfo':
      return s.night === 1 && s.count >= 7;
    case 'scarletwoman':
      return s.pendingNewDemon !== null;
    case 'imp':
      return !!demonSeat(s);
    case 'ravenkeeper': {
      const a = slotActor(s, slot);
      return !!a && !!s.ns?.deaths.includes(a.n);
    }
    case 'undertaker': {
      const a = slotActor(s, slot);
      return !!a && a.alive && s.lastExecution?.night === s.night - 1;
    }
    default: {
      const a = slotActor(s, slot);
      return !!a && a.alive;
    }
  }
}

function advance(s: GameState) {
  const order = slotsFor(s.night);
  let i = s.ns!.slot + 1;
  // 夜里已经分出胜负（恶魔自杀且无人接任），直接天亮宣布
  if (s.winner) i = order.length - 1;
  while (i < order.length && !shouldRun(s, order[i])) i++;
  s.ns!.slot = i;
  if (order[i] === 'dawn') checkWin(s, 'night');
}

export function startNight(s: GameState) {
  s.phase = 'night';
  s.night += 1;
  s.executed = undefined;
  s.ns = { slot: -1, deaths: [], monk: null };
  addLog(s, 'night', `第 ${s.night} 夜开始`);
  advance(s);
}

/** 发身份：下一位；全部发完就入夜 */
export function dealNext(s: GameState) {
  s.dealIndex += 1;
  if (s.dealIndex >= s.count) startNight(s);
}

/* ---------------- 胜负 ---------------- */

export function checkWin(s: GameState, phase: 'night' | 'day'): boolean {
  if (s.winner) return true;
  if (!demonSeat(s)) {
    s.winner = 'good';
    s.winReason = '恶魔死了';
  } else if (aliveCount(s) <= 2) {
    s.winner = 'evil';
    s.winReason = '只剩两名玩家存活';
  }
  if (s.winner) addLog(s, phase, `${s.winner === 'good' ? '善良' : '邪恶'}阵营获胜：${s.winReason}`);
  return !!s.winner;
}

/** 恶魔死亡时：红唇女郎能接任就接任，否则善良获胜。aliveBefore = 恶魔死前的存活人数 */
function onDemonDeath(s: GameState, aliveBefore: number, phase: 'night' | 'day'): Seat | undefined {
  const sw = s.seats.find((x) => x.role === 'scarletwoman' && x.alive);
  if (sw && !malfunction(s, sw.n) && aliveBefore >= 5) {
    sw.role = 'imp';
    addLog(s, phase, `红唇女郎（${sw.n}号）变成了小恶魔`);
    return sw;
  }
  checkWin(s, phase);
  return undefined;
}

/* ---------------- 夜晚各步 ---------------- */

export type SlotPayload =
  | { kind: 'none' }
  | { kind: 'target'; target: number }
  | { kind: 'pair'; info: PairInfo; truth: boolean; twist?: boolean }
  | { kind: 'number'; num: number; truth: boolean; twist?: boolean }
  | { kind: 'fortune'; picks: [number, number]; yes: boolean; truth: boolean; twist?: boolean }
  | { kind: 'reveal'; pick: number; role: RoleId; truth: boolean; twist?: boolean }
  | { kind: 'imp'; target: number; bounce?: number; starpassTo?: number };

function infoStat(s: GameState, truth: boolean, twist?: boolean) {
  if (truth && !twist) s.infoTrue += 1;
  else s.infoFalse += 1;
}
const expose = (s: GameState, n: number, k = 1) => (s.exposure[n] = (s.exposure[n] ?? 0) + k);

export function completeSlot(s: GameState, p: SlotPayload) {
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const who = actor ? `${actor.n}号${actor.role === 'drunk' ? '（其实是酒鬼）' : ''}` : '';
  const tag = (truth: boolean, twist?: boolean) => (!truth ? '（假信息）' : twist ? '（合规误导）' : '（真实信息）');

  switch (slot) {
    case 'dawn': {
      const d = s.ns!.deaths;
      addLog(s, 'night', d.length ? `天亮：${d.map((n) => `${n}号`).join('、')} 死亡` : '天亮：平安夜');
      s.phase = s.winner ? 'end' : 'day';
      return;
    }
    case 'minionInfo':
      addLog(s, 'night', `爪牙得知恶魔是 ${demonSeat(s)?.n}号`);
      break;
    case 'demonInfo':
      addLog(s, 'night', `恶魔得知爪牙：${minionSeats(s).map((x) => `${x.n}号`).join('、')}；伪装角色：${s.bluffs.map(roleName).join('、')}`);
      break;
    case 'poisoner':
      if (p.kind === 'target') {
        s.poison = { seat: p.target, night: s.night };
        addLog(s, 'night', `投毒者 ${who} 毒了 ${p.target}号`);
      }
      break;
    case 'monk':
      if (p.kind === 'target') {
        const ok = !malfunction(s, actor!.n);
        s.ns!.monk = ok ? p.target : null;
        addLog(s, 'night', `僧侣 ${who} 保护了 ${p.target}号${ok ? '' : '（无效）'}`);
      }
      break;
    case 'butler':
      if (p.kind === 'target') {
        s.butlerMaster = p.target;
        addLog(s, 'night', `管家 ${who} 选择 ${p.target}号 当主人`);
      }
      break;
    case 'spy':
      addLog(s, 'night', `间谍 ${who} 查看了魔典`);
      break;
    case 'scarletwoman':
      addLog(s, 'night', `告知 ${s.pendingNewDemon}号：你现在是小恶魔`);
      s.pendingNewDemon = null;
      break;
    case 'washerwoman':
    case 'librarian':
    case 'investigator':
      if (p.kind === 'pair') {
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist && p.info.seats && slot === 'investigator')
          p.info.seats.forEach((n) => isEvil(seatOf(s, n)) && expose(s, n));
        addLog(s, 'night', `${roleName(slot)} ${who}：${pairLabel(p.info)}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'chef':
    case 'empath':
      if (p.kind === 'number') {
        infoStat(s, p.truth, p.twist);
        addLog(s, 'night', `${roleName(slot)} ${who}：${p.num}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'fortuneteller':
      if (p.kind === 'fortune') {
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist && p.yes) p.picks.forEach((n) => seatOf(s, n).role === 'imp' && expose(s, n));
        addLog(s, 'night', `占卜师 ${who} 查 ${p.picks[0]}号、${p.picks[1]}号：${p.yes ? '有恶魔' : '没有恶魔'}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'undertaker':
    case 'ravenkeeper':
      if (p.kind === 'reveal') {
        infoStat(s, p.truth, p.twist);
        const sub = seatOf(s, p.pick);
        if (p.truth && !p.twist && sub.alive && isEvil(sub)) expose(s, p.pick, sub.role === 'imp' ? 2 : 1);
        addLog(s, 'night', `${roleName(slot)} ${who} 得知 ${p.pick}号 是【${roleName(p.role)}】${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'imp':
      if (p.kind === 'imp') resolveImp(s, p);
      break;
    case 'dusk':
      break;
  }
  advance(s);
}

/* ---------------- 小恶魔 ---------------- */

export type ImpPreview =
  | { kind: 'none'; reason: string }
  | { kind: 'kill'; reason: string }
  | { kind: 'mayor'; reason: string }
  | { kind: 'starpass'; reason: string }
  | { kind: 'suicide'; reason: string };

export function previewImp(s: GameState, target: number): ImpPreview {
  const imp = demonSeat(s)!;
  const t = seatOf(s, target);
  if (malfunction(s, imp.n)) return { kind: 'none', reason: '恶魔今晚中毒了，杀人无效，没有人会死。' };
  if (!t.alive) return { kind: 'none', reason: `${target}号 已经死了，什么都不会发生。` };
  if (target === imp.n) {
    const minions = s.seats.filter((x) => x.alive && ROLES[x.role].team === 'minion');
    if (!minions.length) return { kind: 'suicide', reason: '恶魔自杀，但没有活着的爪牙可以接任：恶魔死亡，善良获胜。' };
    return { kind: 'starpass', reason: '恶魔自杀：他死亡，由一名爪牙变成新的小恶魔。' };
  }
  if (t.role === 'soldier' && !malfunction(s, target)) return { kind: 'none', reason: `${target}号 是士兵，恶魔杀不死他。` };
  if (s.ns?.monk === target) return { kind: 'none', reason: `${target}号 今晚受到僧侣保护，不会死。` };
  if (t.role === 'mayor' && !malfunction(s, target)) return { kind: 'mayor', reason: `${target}号 是镇长：你可以让别人替他死，也可以就让他死。` };
  return { kind: 'kill', reason: `${seatLabel(s, target)} 死亡。` };
}

function resolveImp(s: GameState, p: { target: number; bounce?: number; starpassTo?: number }) {
  const imp = demonSeat(s)!;
  const pv = previewImp(s, p.target);
  addLog(s, 'night', `小恶魔 ${imp.n}号 选择了 ${p.target}号`);
  if (pv.kind === 'none') {
    addLog(s, 'night', pv.reason);
    return;
  }
  if (pv.kind === 'kill') {
    kill(s, p.target, 'night', '被恶魔杀死');
    return;
  }
  if (pv.kind === 'mayor') {
    const victim = p.bounce ?? p.target;
    kill(s, victim, 'night', victim === p.target ? '被恶魔杀死' : `替镇长（${p.target}号）死亡`);
    if (victim !== p.target) addLog(s, 'night', `镇长被攻击，改由 ${seatLabel(s, victim)} 死亡`);
    return;
  }
  // 自杀：先看红唇女郎能不能接任（按恶魔死前的存活人数算）
  const sw = scarletCanTakeOver(s);
  kill(s, imp.n, 'night', '恶魔自杀');
  if (pv.kind === 'suicide') {
    checkWin(s, 'night');
    return;
  }
  const heir = sw ?? (p.starpassTo ? seatOf(s, p.starpassTo) : undefined);
  if (!heir || !heir.alive) {
    checkWin(s, 'night');
    return;
  }
  heir.role = 'imp';
  addLog(s, 'night', `${heir.n}号（原${roleName(heir.startRole)}）变成了新的小恶魔`);
}

/* ---------------- 白天 ---------------- */

export function execute(s: GameState, n: number | null, cause = '被处决') {
  s.executed = n;
  if (n === null) {
    addLog(s, 'day', '今天没有人被处决');
    const mayor = s.seats.find((x) => x.role === 'mayor' && x.alive);
    if (aliveCount(s) === 3 && mayor && !malfunction(s, mayor.n)) {
      s.winner = 'good';
      s.winReason = '只剩三人且没有处决，镇长带领善良获胜';
      addLog(s, 'day', `善良阵营获胜：${s.winReason}`);
    }
    return;
  }
  const st = seatOf(s, n);
  if (!st.alive) {
    addLog(s, 'day', `${seatLabel(s, n)} 已经死亡，被处决但不会再死`);
    return;
  }
  const aliveBefore = aliveCount(s);
  kill(s, n, 'day', cause);
  s.lastExecution = { night: s.night, seat: n };
  addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
  if (st.role === 'saint' && !malfunction(s, n)) {
    s.winner = 'evil';
    s.winReason = '圣徒被处决';
    addLog(s, 'day', `邪恶阵营获胜：${s.winReason}`);
    return;
  }
  if (st.role === 'imp') {
    const sw = onDemonDeath(s, aliveBefore, 'day');
    if (sw) s.pendingNewDemon = sw.n;
  }
  checkWin(s, 'day');
}

export interface DayPreview {
  applies: boolean;
  reason: string;
  /** 需要说书人决定间谍/陌客要不要被"当成" */
  askTwist?: 'spyTownsfolk' | 'recluseDemon';
}

export function previewVirgin(s: GameState, nominee: number, nominator: number): DayPreview {
  const v = seatOf(s, nominee);
  const isVirgin = v.role === 'virgin' || (v.role === 'drunk' && s.drunkFake === 'virgin');
  if (!isVirgin) return { applies: false, reason: `${nominee}号 不是贞洁者，什么都不会发生，正常进行投票。` };
  if (v.used) return { applies: false, reason: '贞洁者的能力已经用过了，正常进行投票。' };
  if (!v.alive) return { applies: false, reason: '贞洁者已经死亡，能力无效，正常进行投票。' };
  if (malfunction(s, nominee)) return { applies: false, reason: `贞洁者${v.role === 'drunk' ? '其实是酒鬼' : '中毒了'}：能力用掉，但什么都不会发生。正常进行投票。` };
  const nom = seatOf(s, nominator);
  if (ROLES[nom.role].team === 'townsfolk') return { applies: true, reason: `提名者 ${nominator}号 是镇民：他立刻被处决，今天的处决到此结束。` };
  if (nom.role === 'spy') return { applies: false, reason: '提名者是间谍：你可以决定把他当成镇民（他会被处决）。', askTwist: 'spyTownsfolk' };
  return { applies: false, reason: `提名者 ${nominator}号 不是镇民：什么都不会发生，能力用掉。正常进行投票。` };
}

export function nominateVirgin(s: GameState, nominee: number, nominator: number, spyAsTownsfolk = false) {
  const pv = previewVirgin(s, nominee, nominator);
  const v = seatOf(s, nominee);
  const isVirgin = v.role === 'virgin' || (v.role === 'drunk' && s.drunkFake === 'virgin');
  if (isVirgin && !v.used) v.used = true;
  addLog(s, 'day', `${nominator}号 提名了 ${nominee}号（贞洁者）`);
  if (pv.applies || (pv.askTwist === 'spyTownsfolk' && spyAsTownsfolk)) {
    execute(s, nominator, '提名贞洁者，被立刻处决');
  } else addLog(s, 'day', '贞洁者能力没有触发');
}

export function previewSlayer(s: GameState, shooter: number, target: number): DayPreview {
  const sh = seatOf(s, shooter);
  const t = seatOf(s, target);
  const realOrDrunk = sh.role === 'slayer' || (sh.role === 'drunk' && s.drunkFake === 'slayer');
  if (!realOrDrunk) return { applies: false, reason: `${shooter}号 不是猎手：什么都不会发生。公开说"什么都没有发生"。` };
  if (sh.used) return { applies: false, reason: '猎手已经开过枪了：什么都不会发生。' };
  if (!sh.alive) return { applies: false, reason: '猎手已经死亡：什么都不会发生。' };
  if (malfunction(s, shooter)) return { applies: false, reason: `猎手${sh.role === 'drunk' ? '其实是酒鬼' : '中毒了'}：子弹用掉，什么都不会发生。` };
  if (!t.alive) return { applies: false, reason: '目标已经死亡：什么都不会发生，子弹用掉。' };
  if (t.role === 'imp') return { applies: true, reason: `${target}号 是恶魔：他死亡！` };
  if (t.role === 'recluse') return { applies: false, reason: '目标是陌客：你可以决定把他当成恶魔（他会死）。', askTwist: 'recluseDemon' };
  return { applies: false, reason: `${target}号 不是恶魔：什么都不会发生，子弹用掉。` };
}

export function slayerShoot(s: GameState, shooter: number, target: number, recluseAsDemon = false) {
  const pv = previewSlayer(s, shooter, target);
  const sh = seatOf(s, shooter);
  if (sh.role === 'slayer' || (sh.role === 'drunk' && s.drunkFake === 'slayer')) sh.used = true;
  addLog(s, 'day', `${shooter}号 宣称猎手，向 ${target}号 开枪`);
  const hit = pv.applies || (pv.askTwist === 'recluseDemon' && recluseAsDemon);
  if (!hit) {
    addLog(s, 'day', '什么都没有发生');
    return;
  }
  const aliveBefore = aliveCount(s);
  const t = seatOf(s, target);
  kill(s, target, 'day', '被猎手射杀');
  addLog(s, 'day', `${seatLabel(s, target)} 被猎手射杀`);
  if (t.role === 'imp') {
    const sw = onDemonDeath(s, aliveBefore, 'day');
    if (sw) s.pendingNewDemon = sw.n;
  }
  checkWin(s, 'day');
}

export function finishDay(s: GameState) {
  if (s.winner) {
    s.phase = 'end';
    return;
  }
  startNight(s);
}
