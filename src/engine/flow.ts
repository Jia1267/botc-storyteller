import { ROLES, roleName, type RoleId, type Team } from './roles';
import {
  addLog, aliveCount, demonSeat, hasAbility, inPlay, isDemonSeat, isEvil, isPoisoned, kill, lilMonsta, malfunction, scriptOf,
  seatLabel, seatOf, vortoxActive, wakesAs, seatName,
} from './core';
import { balloonRemaining, pairLabel, scarletCanTakeOver, type PairInfo } from './info';
import type { GameState, Seat, SlotId } from './types';

export const slotsFor = (s: GameState, night = s.night): SlotId[] => (night === 1 ? scriptOf(s).firstNight : scriptOf(s).otherNights);

export function currentSlot(s: GameState): SlotId {
  return slotsFor(s)[s.ns!.slot];
}

/** 按某个能力的位置叫醒、可能不止一个人的步骤 */
const ROLE_SLOTS: SlotId[] = [
  'poisoner', 'washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller',
  'butler', 'spy', 'monk', 'ravenkeeper', 'undertaker',
  'widow', 'fearmonger', 'pixie', 'chambermaid', 'balloonist', 'bureaucrat', 'thief',
];

/** 失忆者被定下的能力，今晚要不要醒 */
function amnesiacWakes(s: GameState): boolean {
  const a = s.amnesiacAbility;
  if (!a) return false;
  if (s.night === 1) return ['washerwoman', 'librarian', 'investigator', 'chef', 'empath', 'fortuneteller'].includes(a);
  if (a === 'undertaker') return s.lastExecution?.night === s.night - 1;
  return a === 'empath' || a === 'fortuneteller';
}

/** 疯子这一步：第一晚告诉真恶魔谁是疯子；之后他以为的恶魔晚上会杀人才叫醒他 */
function lunaticStepNeeded(s: GameState): boolean {
  if (s.night === 1) return !lilMonsta(s) && !!demonSeat(s);
  return s.lunaticFake === 'imp' || s.lunaticFake === 'vortox';
}

function candidates(s: GameState, slot: SlotId): Seat[] {
  if (slot === 'imp' || slot === 'vortox') {
    const d = demonSeat(s);
    return d && d.role === slot && s.night > 1 ? [d] : [];
  }
  if (slot === 'scarletwoman') return s.pendingNewDemon ? [seatOf(s, s.pendingNewDemon)] : [];
  if (slot === 'lunatic') return s.seats.filter((x) => x.role === 'lunatic' && x.alive && lunaticStepNeeded(s));
  if (slot === 'amnesiac') return s.seats.filter((x) => x.role === 'amnesiac' && x.alive && amnesiacWakes(s));
  if (!ROLE_SLOTS.includes(slot)) return [];
  return s.seats.filter((x) => {
    if (!wakesAs(s, x, slot as RoleId)) return false;
    if (slot === 'ravenkeeper') return !!s.ns?.deaths.includes(x.n);
    if (slot === 'undertaker') return x.alive && s.lastExecution?.night === s.night - 1;
    if (slot === 'balloonist') return x.alive && balloonRemaining(s, x.n).length > 0;
    return x.alive;
  });
}

/** 这一步还没处理的人 */
export function pendingActors(s: GameState, slot: SlotId): Seat[] {
  const done = s.ns?.doneActors ?? [];
  return candidates(s, slot).filter((x) => !done.includes(x.n));
}

/** 这一步要叫醒的人 */
export function slotActor(s: GameState, slot: SlotId): Seat | undefined {
  return pendingActors(s, slot)[0];
}

export const minionSeats = (s: GameState) => s.seats.filter((x) => ROLES[x.role].team === 'minion');

export function shouldRun(s: GameState, slot: SlotId): boolean {
  switch (slot) {
    case 'dusk':
    case 'dawn':
      return true;
    case 'minionInfo':
    case 'demonInfo':
      return s.night === 1 && s.count >= 7 && !lilMonsta(s);
    case 'lilmonsta':
      return lilMonsta(s) && s.seats.some((x) => x.alive && ROLES[x.role].team === 'minion');
    case 'duchess':
      return s.fabled.includes('duchess') && s.night > 1 && s.duchessVisitors.length > 0;
    default:
      return pendingActors(s, slot).length > 0;
  }
}

function advance(s: GameState) {
  const order = slotsFor(s);
  const ns = s.ns!;
  // 同一个能力还有人没处理（例如食人族也拿到了这个能力）
  if (ns.slot >= 0 && !s.winner && ROLE_SLOTS.includes(order[ns.slot]) && pendingActors(s, order[ns.slot]).length) return;
  let i = ns.slot + 1;
  // 夜里已经分出胜负，直接天亮宣布
  if (s.winner) i = order.length - 1;
  ns.doneActors = [];
  while (i < order.length && !shouldRun(s, order[i])) i++;
  ns.slot = i;
  if (order[i] === 'dawn') checkWin(s, 'night');
}

export function startNight(s: GameState) {
  s.phase = 'night';
  s.night += 1;
  s.executed = undefined;
  s.ns = { slot: -1, doneActors: [], deaths: [], monk: null, woke: [], lunaticPick: null };
  s.voteMods = {};
  addLog(s, 'night', `第 ${s.night} 夜开始`);
  advance(s);
}

/** 发身份：下一位；全部发完就入夜 */
export function dealNext(s: GameState) {
  s.dealIndex += 1;
  // 旅行者也要发身份（排在最后）
  if (s.dealIndex >= s.seats.length) startNight(s);
}

/* ---------------- 胜负 ---------------- */

function win(s: GameState, who: 'good' | 'evil', reason: string, phase: 'night' | 'day') {
  if (s.winner) return;
  s.winner = who;
  s.winReason = reason;
  addLog(s, phase, `${who === 'good' ? '善良' : '邪恶'}阵营获胜：${reason}`);
}

export function checkWin(s: GameState, phase: 'night' | 'day'): boolean {
  if (s.winner) return true;
  if (!demonSeat(s)) win(s, 'good', lilMonsta(s) ? '照看小怪宝的人死了' : '恶魔死了', phase);
  else if (aliveCount(s) <= 2) win(s, 'evil', '只剩两名玩家存活', phase);
  return !!s.winner;
}

/** 恶魔死亡时：红唇女郎能接任就接任，否则善良获胜。aliveBefore = 恶魔死前的存活人数 */
function onDemonDeath(s: GameState, deadN: number, aliveBefore: number, phase: 'night' | 'day'): Seat | undefined {
  const sw = s.seats.find((x) => x.role === 'scarletwoman' && x.alive);
  if (sw && !malfunction(s, sw.n) && aliveBefore >= 5) {
    if (lilMonsta(s)) {
      s.babysitter = sw.n;
      s.babysitterLocked = true;
      addLog(s, phase, `照看者死亡，红唇女郎（${seatName(sw.n)}）接手照看小怪宝`);
    } else {
      sw.role = seatOf(s, deadN).role;
      addLog(s, phase, `红唇女郎（${seatName(sw.n)}）变成了${roleName(sw.role)}`);
    }
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
  | { kind: 'imp'; target: number; bounce?: number; starpassTo?: number }
  | { kind: 'role'; role: RoleId; truth: boolean }
  | { kind: 'lilmonsta'; babysitter: number; kill?: number }
  | { kind: 'widow'; target: number; informed: number | null }
  | { kind: 'balloon'; seat: number; team: Team; truth: boolean }
  | { kind: 'duchess'; falseFor: number; falseNum: number };

function infoStat(s: GameState, truth: boolean, twist?: boolean) {
  if (truth && !twist) s.infoTrue += 1;
  else s.infoFalse += 1;
}
const expose = (s: GameState, n: number, k = 1) => (s.exposure[n] = (s.exposure[n] ?? 0) + k);

/** 失忆者那一步实际用的是哪个能力 */
export const effectiveSlot = (s: GameState, slot: SlotId): SlotId => (slot === 'amnesiac' && s.amnesiacAbility ? (s.amnesiacAbility as SlotId) : slot);

export function completeSlot(s: GameState, p: SlotPayload) {
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const ns = s.ns!;
  const eff = effectiveSlot(s, slot);
  const tagWho = (x: Seat) =>
    x.role === 'drunk' ? '（其实是酒鬼）' : x.role === 'cannibal' ? '（食人族）' : x.role === 'pixie' ? '（小精灵）' : x.role === 'amnesiac' ? '（失忆者）' : '';
  const who = actor ? `${seatName(actor.n)}${tagWho(actor)}` : '';
  const tag = (truth: boolean, twist?: boolean) => (!truth ? '（假信息）' : twist ? '（合规误导）' : '（真实信息）');
  if (actor) {
    ns.doneActors.push(actor.n);
    // 侍女：因为自己的能力醒来过（疯子第一晚不醒，只是告诉恶魔）
    if (!(slot === 'lunatic' && s.night === 1)) ns.woke.push(actor.n);
  }

  switch (eff) {
    case 'dawn': {
      const d = ns.deaths;
      addLog(s, 'night', d.length ? `天亮：${d.map((n) => `${seatName(n)}`).join('、')} 死亡` : '天亮：平安夜');
      s.fearAnnounce = false;
      s.fearNominated = null;
      s.babysitterLocked = false;
      s.phase = s.winner ? 'end' : 'day';
      return;
    }
    case 'minionInfo':
      addLog(s, 'night', `爪牙得知恶魔是 ${seatName(demonSeat(s)?.n)}`);
      break;
    case 'demonInfo':
      addLog(s, 'night', `恶魔得知爪牙：${minionSeats(s).map((x) => `${seatName(x.n)}`).join('、')}；伪装角色：${s.bluffs.map(roleName).join('、')}`);
      break;
    case 'poisoner':
      if (p.kind === 'target') {
        s.poison = { seat: p.target, night: s.night };
        addLog(s, 'night', `投毒者 ${who} 毒了 ${seatName(p.target)}`);
      }
      break;
    case 'monk':
      if (p.kind === 'target') {
        const ok = !malfunction(s, actor!.n);
        ns.monk = ok ? p.target : null;
        addLog(s, 'night', `僧侣 ${who} 保护了 ${seatName(p.target)}${ok ? '' : '（无效）'}`);
      }
      break;
    case 'bureaucrat':
    case 'thief':
      if (p.kind === 'target') {
        const ok = !malfunction(s, actor!.n);
        if (ok) s.voteMods[p.target] = (s.voteMods[p.target] ?? 1) * (eff === 'bureaucrat' ? 3 : -1);
        addLog(s, 'night', `${roleName(eff)} ${who} 选了 ${seatName(p.target)}：明天他的票${eff === 'bureaucrat' ? '算 3 票' : '算负数'}${ok ? '' : '（中毒，无效）'}`);
      }
      break;
    case 'butler':
      if (p.kind === 'target') {
        s.butlerMaster = p.target;
        addLog(s, 'night', `管家 ${who} 选择 ${seatName(p.target)} 当主人`);
      }
      break;
    case 'spy':
      addLog(s, 'night', `间谍 ${who} 查看了魔典`);
      break;
    case 'scarletwoman':
      addLog(s, 'night', `告知 ${seatName(s.pendingNewDemon)}：你现在是${roleName(seatOf(s, s.pendingNewDemon!).role)}`);
      s.pendingNewDemon = null;
      break;
    case 'lunatic':
      if (p.kind === 'target') {
        ns.lunaticPick = p.target;
        addLog(s, 'night', `疯子 ${who} 选择了 ${seatName(p.target)}（不会死）；恶魔已被告知`);
      } else addLog(s, 'night', `告知恶魔：${seatName(actor?.n)} 是疯子`);
      break;
    case 'lilmonsta':
      if (p.kind === 'lilmonsta') {
        s.babysitter = p.babysitter;
        addLog(s, 'night', `爪牙们决定由 ${seatName(p.babysitter)} 照看小怪宝`);
        if (p.kill) {
          kill(s, p.kill, 'night', '被小怪宝杀死');
          addLog(s, 'night', `说书人决定 ${seatLabel(s, p.kill)} 死亡`);
        }
      }
      break;
    case 'widow':
      if (p.kind === 'widow') {
        s.widowPoison = p.target;
        s.widowInformed = p.informed;
        addLog(s, 'night', `寡妇 ${who} 看了魔典，毒了 ${seatName(p.target)}${p.informed ? `；${seatName(p.informed)} 得知寡妇在场` : ''}`);
      }
      break;
    case 'fearmonger':
      if (p.kind === 'target') {
        if (p.target !== s.fearTarget) s.fearAnnounce = true;
        s.fearTarget = p.target;
        addLog(s, 'night', `恐惧之灵 ${who} 选择了 ${seatName(p.target)}${s.fearAnnounce ? '（新目标，天亮要宣布）' : ''}`);
      }
      break;
    case 'pixie':
      if (p.kind === 'role') {
        infoStat(s, p.truth);
        s.pixieRole = p.role;
        addLog(s, 'night', `小精灵 ${who} 得知【${roleName(p.role)}】在场${tag(p.truth)}`, p.truth);
      }
      break;
    case 'chambermaid':
      if (p.kind === 'number') {
        infoStat(s, p.truth, p.twist);
        addLog(s, 'night', `侍女 ${who}：${p.num}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'balloonist':
      if (p.kind === 'balloon') {
        infoStat(s, p.truth);
        if (p.truth && !s.balloonShown.includes(p.team)) s.balloonShown.push(p.team);
        addLog(s, 'night', `气球驾驶员 ${who}：指向 ${seatName(p.seat)}${tag(p.truth)}`, p.truth);
      }
      break;
    case 'duchess':
      if (p.kind === 'duchess') {
        const real = s.duchessVisitors.filter((n) => isEvil(seatOf(s, n))).length;
        addLog(s, 'night', `公爵夫人的拜访者 ${s.duchessVisitors.map((n) => `${seatName(n)}`).join('、')} 得知 ${real}；${seatName(p.falseFor)} 拿到假数字 ${p.falseNum}`);
        s.duchessVisitors = [];
      }
      break;
    case 'washerwoman':
    case 'librarian':
    case 'investigator':
      if (p.kind === 'pair') {
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist && p.info.seats && eff === 'investigator')
          p.info.seats.forEach((n) => isEvil(seatOf(s, n)) && expose(s, n));
        addLog(s, 'night', `${roleName(eff)} ${who}：${pairLabel(p.info)}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'chef':
    case 'empath':
      if (p.kind === 'number') {
        infoStat(s, p.truth, p.twist);
        addLog(s, 'night', `${roleName(eff)} ${who}：${p.num}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'fortuneteller':
      if (p.kind === 'fortune') {
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist && p.yes) p.picks.forEach((n) => isDemonSeat(s, n) && expose(s, n));
        addLog(s, 'night', `占卜 ${who} 查 ${seatName(p.picks[0])}、${seatName(p.picks[1])}：${p.yes ? '有恶魔' : '没有恶魔'}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'undertaker':
    case 'ravenkeeper':
      if (p.kind === 'reveal') {
        infoStat(s, p.truth, p.twist);
        const sub = seatOf(s, p.pick);
        if (p.truth && !p.twist && sub.alive && isEvil(sub)) expose(s, p.pick, isDemonSeat(s, p.pick) ? 2 : 1);
        addLog(s, 'night', `${roleName(eff)} ${who} 得知 ${seatName(p.pick)} 是【${roleName(p.role)}】${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'imp':
    case 'vortox':
      if (p.kind === 'imp') resolveImp(s, p);
      break;
    case 'dusk':
      break;
  }
  advance(s);
}

/* ---------------- 恶魔杀人（小恶魔 / 涡流） ---------------- */

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
  if (!t.alive) return { kind: 'none', reason: `${seatName(target)} 已经死了，什么都不会发生。` };
  if (target === imp.n) {
    if (imp.role !== 'imp')
      return scarletCanTakeOver(s)
        ? { kind: 'starpass', reason: '恶魔选了自己：他死亡，红唇女郎接任成为新的恶魔。' }
        : { kind: 'suicide', reason: '恶魔选了自己：他死亡，善良获胜。' };
    const minions = s.seats.filter((x) => x.alive && ROLES[x.role].team === 'minion');
    if (!minions.length) return { kind: 'suicide', reason: '恶魔自杀，但没有活着的爪牙可以接任：恶魔死亡，善良获胜。' };
    return { kind: 'starpass', reason: '恶魔自杀：他死亡，由一名爪牙变成新的小恶魔。' };
  }
  if (t.role === 'soldier' && !malfunction(s, target)) return { kind: 'none', reason: `${seatName(target)} 是士兵，恶魔杀不死他。` };
  if (s.ns?.monk === target) return { kind: 'none', reason: `${seatName(target)} 今晚受到僧侣保护，不会死。` };
  if (t.role === 'mayor' && !malfunction(s, target)) return { kind: 'mayor', reason: `${seatName(target)} 是镇长：你可以让别人替他死，也可以就让他死。` };
  return { kind: 'kill', reason: `${seatLabel(s, target)} 死亡。` };
}

function resolveImp(s: GameState, p: { target: number; bounce?: number; starpassTo?: number }) {
  const imp = demonSeat(s)!;
  const pv = previewImp(s, p.target);
  addLog(s, 'night', `${roleName(imp.role)} ${seatName(imp.n)} 选择了 ${seatName(p.target)}`);
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
    kill(s, victim, 'night', victim === p.target ? '被恶魔杀死' : `替镇长（${seatName(p.target)}）死亡`);
    if (victim !== p.target) addLog(s, 'night', `镇长被攻击，改由 ${seatLabel(s, victim)} 死亡`);
    return;
  }
  // 自杀：先看红唇女郎能不能接任（按恶魔死前的存活人数算）
  const sw = scarletCanTakeOver(s);
  const demonRole = imp.role;
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
  heir.role = demonRole;
  addLog(s, 'night', `${seatName(heir.n)}（原${roleName(heir.startRole)}）变成了新的${roleName(demonRole)}`);
}

/* ---------------- 白天 ---------------- */

export interface ExecuteOpts {
  /** 恐惧之灵提名了他的目标 */
  fearmongerNominated?: boolean;
  /** 哥布林被提名时公开说了自己是哥布林 */
  goblinClaimed?: boolean;
  /** 改成处决同阵营的替罪羊 */
  scapegoat?: boolean;
}

/** 食人族：有人被处决死亡，换成他的能力；吃到邪恶就中毒并给一个假的善良能力 */
function cannibalEats(s: GameState, eaten: Seat) {
  const c = s.seats.find((x) => x.role === 'cannibal' && x.alive && x.n !== eaten.n);
  if (!c) return;
  if (isEvil(eaten)) {
    const night = scriptOf(s).otherNights as string[];
    const fake =
      scriptOf(s).roles.find((r) => ROLES[r].team === 'townsfolk' && r !== 'cannibal' && r !== 'amnesiac' && night.includes(r) && !inPlay(s, r)) ??
      scriptOf(s).roles.find((r) => ROLES[r].team === 'townsfolk' && r !== 'cannibal' && night.includes(r)) ??
      'empath';
    s.gained[c.n] = fake;
    s.cannibalPoisoned = true;
    addLog(s, 'day', `食人族（${seatName(c.n)}）吃到邪恶玩家：中毒，之后按假的【${roleName(fake)}】能力叫醒他`);
  } else {
    s.gained[c.n] = eaten.role;
    if (s.cannibalPoisoned) addLog(s, 'day', '善良玩家被处决，食人族的中毒解除');
    s.cannibalPoisoned = false;
    addLog(s, 'day', `食人族（${seatName(c.n)}）现在拥有【${roleName(eaten.role)}】的能力`);
  }
}

/** 说书人手动换食人族（吃到邪恶时）的假能力 */
export function setCannibalFake(s: GameState, r: RoleId) {
  const c = s.seats.find((x) => x.role === 'cannibal' && x.alive);
  if (!c) return;
  s.gained[c.n] = r;
  addLog(s, 'day', `说书人把食人族（${seatName(c.n)}）的假能力换成【${roleName(r)}】`);
}

export function execute(s: GameState, n: number | null, cause = '被处决', opts: ExecuteOpts = {}) {
  // 替罪羊：处决和他同阵营的人时，说书人可以改成处决他
  if (n !== null && opts.scapegoat) {
    const sg = scapegoatFor(s, n);
    if (sg) {
      addLog(s, 'day', `替罪羊（${seatName(sg.n)}）代替 ${seatName(n)} 被处决`);
      n = sg.n;
    }
  }
  s.executed = n;
  if (n === null) {
    addLog(s, 'day', '今天没有人被处决');
    if (vortoxActive(s)) return win(s, 'evil', '涡流在场，今天没有人被处决', 'day');
    const mayor = s.seats.find((x) => x.role === 'mayor' && x.alive);
    if (aliveCount(s) === 3 && mayor && !malfunction(s, mayor.n)) win(s, 'good', '只剩三人且没有处决，镇长带领善良获胜', 'day');
    return;
  }
  const st = seatOf(s, n);
  if (!isEvil(st)) {
    s.goodExecutions += 1;
    const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive);
    if (lev && !malfunction(s, lev.n) && s.goodExecutions >= 2) {
      if (st.alive) kill(s, n, 'day', cause);
      addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
      return win(s, 'evil', `利维坦在场，已经处决了 ${s.goodExecutions} 名善良玩家`, 'day');
    }
  }
  if (!st.alive) {
    addLog(s, 'day', `${seatLabel(s, n)} 已经死亡，被处决但不会再死`);
    return;
  }
  const aliveBefore = aliveCount(s);
  kill(s, n, 'day', cause);
  s.lastExecution = { night: s.night, seat: n };
  addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
  if (st.role === 'saint' && !malfunction(s, n)) return win(s, 'evil', '圣徒被处决', 'day');
  if (st.role === 'goblin' && !malfunction(s, n) && opts.goblinClaimed) return win(s, 'evil', '哥布林被提名时公开声称自己是哥布林，并被处决', 'day');
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  const fearNominated = opts.fearmongerNominated ?? s.fearNominated === n;
  if (fm && !malfunction(s, fm.n) && s.fearTarget === n && fearNominated)
    return win(s, isEvil(st) ? 'good' : 'evil', `恐惧之灵提名并处决了他的目标 ${seatName(n)}`, 'day');
  cannibalEats(s, st);
  if (isDemonSeat(s, n)) {
    const sw = onDemonDeath(s, n, aliveBefore, 'day');
    if (sw && !lilMonsta(s)) s.pendingNewDemon = sw.n;
  }
  checkWin(s, 'day');
}

export interface DayPreview {
  applies: boolean;
  reason: string;
  /** 需要说书人决定间谍/陌客要不要被"当成" */
  askTwist?: 'spyTownsfolk' | 'recluseDemon';
  /** 恶魔死后会接任的红唇女郎座位（游戏继续） */
  swTakeover?: number;
}

export function previewVirgin(s: GameState, nominee: number, nominator: number): DayPreview {
  const v = seatOf(s, nominee);
  if (!hasAbility(s, v, 'virgin')) return { applies: false, reason: `${seatName(nominee)} 不是贞洁者，什么都不会发生，正常进行投票。` };
  if (v.used) return { applies: false, reason: '贞洁者的能力已经用过了，正常进行投票。' };
  if (!v.alive) return { applies: false, reason: '贞洁者已经死亡，能力无效，正常进行投票。' };
  if (malfunction(s, nominee)) return { applies: false, reason: `贞洁者${v.role === 'drunk' ? '其实是酒鬼' : '中毒了'}：能力用掉，但什么都不会发生。正常进行投票。` };
  const nom = seatOf(s, nominator);
  if (ROLES[nom.role].team === 'townsfolk') return { applies: true, reason: `提名者 ${seatName(nominator)} 是镇民：他立刻被处决，今天的处决到此结束。` };
  if (nom.role === 'spy') return { applies: false, reason: '提名者是间谍：你可以决定把他当成镇民（他会被处决）。', askTwist: 'spyTownsfolk' };
  return { applies: false, reason: `提名者 ${seatName(nominator)} 不是镇民：什么都不会发生，能力用掉。正常进行投票。` };
}

export function nominateVirgin(s: GameState, nominee: number, nominator: number, spyAsTownsfolk = false) {
  const pv = previewVirgin(s, nominee, nominator);
  const v = seatOf(s, nominee);
  if (hasAbility(s, v, 'virgin') && !v.used) v.used = true;
  addLog(s, 'day', `${seatName(nominator)} 提名了 ${seatName(nominee)}（贞洁者）`);
  if (pv.applies || (pv.askTwist === 'spyTownsfolk' && spyAsTownsfolk)) {
    execute(s, nominator, '提名贞洁者，被立刻处决');
  } else addLog(s, 'day', '贞洁者能力没有触发');
}

export function previewSlayer(s: GameState, shooter: number, target: number): DayPreview {
  const sh = seatOf(s, shooter);
  const t = seatOf(s, target);
  if (!hasAbility(s, sh, 'slayer')) return { applies: false, reason: `${seatName(shooter)} 不是猎手：什么都不会发生。公开说"什么都没有发生"。` };
  if (sh.used) return { applies: false, reason: '猎手已经开过枪了：什么都不会发生。' };
  if (!sh.alive) return { applies: false, reason: '猎手已经死亡：什么都不会发生。' };
  if (malfunction(s, shooter)) return { applies: false, reason: `猎手${sh.role === 'drunk' ? '其实是酒鬼' : '中毒了'}：子弹用掉，什么都不会发生。` };
  if (!t.alive) return { applies: false, reason: '目标已经死亡：什么都不会发生，子弹用掉。' };
  if (isDemonSeat(s, target)) {
    const sw = scarletCanTakeOver(s);
    return sw
      ? { applies: true, swTakeover: sw.n, reason: `${seatName(target)} 是恶魔：他死亡。但红唇女郎（${seatName(sw.n)}）会立刻接任成为新恶魔，游戏继续！` }
      : { applies: true, reason: `${seatName(target)} 是恶魔：他死亡！善良获胜。` };
  }
  if (t.role === 'recluse') return { applies: false, reason: '目标是陌客：你可以决定把他当成恶魔（他会死）。', askTwist: 'recluseDemon' };
  return { applies: false, reason: `${seatName(target)} 不是恶魔：什么都不会发生，子弹用掉。` };
}

export function slayerShoot(s: GameState, shooter: number, target: number, recluseAsDemon = false) {
  const pv = previewSlayer(s, shooter, target);
  const sh = seatOf(s, shooter);
  if (hasAbility(s, sh, 'slayer')) sh.used = true;
  addLog(s, 'day', `${seatName(shooter)} 宣称猎手，向 ${seatName(target)} 开枪`);
  const hit = pv.applies || (pv.askTwist === 'recluseDemon' && recluseAsDemon);
  if (!hit) {
    addLog(s, 'day', '什么都没有发生');
    return;
  }
  dayDeath(s, target, '被猎手射杀');
}

/** 白天非处决的死亡（猎手、枪手）：恶魔死了看红唇女郎，再判胜负 */
export function dayDeath(s: GameState, n: number, cause: string) {
  const aliveBefore = aliveCount(s);
  const demon = isDemonSeat(s, n);
  kill(s, n, 'day', cause);
  addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
  if (demon) {
    const sw = onDemonDeath(s, n, aliveBefore, 'day');
    if (sw && !lilMonsta(s)) s.pendingNewDemon = sw.n;
  }
  checkWin(s, 'day');
}

/** 能代替 n 被处决的替罪羊（活着、没中毒、和 n 同阵营、不是 n 自己） */
export function scapegoatFor(s: GameState, n: number): Seat | undefined {
  const target = seatOf(s, n);
  return s.seats.find((x) => x.role === 'scapegoat' && x.alive && !x.left && x.n !== n && !malfunction(s, x.n) && isEvil(x) === isEvil(target));
}

/* ---------------- 白天的其他能力 ---------------- */

/** 呆瓜得知自己死亡后公开选人 */
export function klutzChoose(s: GameState, pick: number) {
  const k = s.seats.find((x) => x.role === 'klutz');
  s.klutzResolved = true;
  if (!k) return;
  addLog(s, 'day', `呆瓜（${seatName(k.n)}）公开选择了 ${seatName(pick)}`);
  if (!isPoisoned(s, k.n) && isEvil(seatOf(s, pick))) win(s, 'evil', `呆瓜选中了邪恶玩家 ${seatName(pick)}`, s.phase === 'night' ? 'night' : 'day');
}

/** 小精灵：他看到的那个角色的玩家死了，判断他是否一直疯狂 */
export function pixieMad(s: GameState, mad: boolean) {
  s.pixieResolved = true;
  const p = s.seats.find((x) => x.role === 'pixie' && x.alive);
  if (!p || !s.pixieRole) return;
  if (mad) {
    s.gained[p.n] = s.pixieRole;
    addLog(s, 'day', `小精灵（${seatName(p.n)}）一直疯狂地声称自己是${roleName(s.pixieRole)}：获得这个能力`);
  } else addLog(s, 'day', `小精灵（${seatName(p.n)}）没有做到疯狂，不获得能力`);
}

/** 小精灵需要判断吗：他看到的角色在场且那名玩家已经死了 */
export function pixieNeedsCheck(s: GameState): Seat | undefined {
  if (s.pixieResolved || !s.pixieRole) return undefined;
  const p = s.seats.find((x) => x.role === 'pixie' && x.alive);
  const holder = s.seats.find((x) => x.role === s.pixieRole && x.n !== p?.n);
  return p && holder && !holder.alive ? p : undefined;
}

/** 呆瓜需要公开选人吗 */
export function klutzNeedsChoice(s: GameState): Seat | undefined {
  if (s.klutzResolved || s.winner) return undefined;
  return s.seats.find((x) => x.role === 'klutz' && !x.alive);
}

export function markUsed(s: GameState, n: number, text: string) {
  seatOf(s, n).used = true;
  addLog(s, 'day', text);
}

export function savantVisit(s: GameState, n: number, pair: [string, string]) {
  s.savantDay = s.night;
  addLog(s, 'day', `博学者（${seatName(n)}）得知：①「${pair[0]}」②「${pair[1]}」`);
}

export function setDuchessVisitors(s: GameState, visitors: number[]) {
  s.duchessVisitors = visitors;
  addLog(s, 'day', `公爵夫人的拜访者：${visitors.map((n) => `${seatName(n)}`).join('、')}`);
}

/** 利维坦：第几天结束邪恶获胜 */
export const LEVIATHAN_DAYS = 5;

export function finishDay(s: GameState) {
  const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive);
  if (!s.winner && lev && !malfunction(s, lev.n) && s.night >= LEVIATHAN_DAYS) win(s, 'evil', `利维坦撑到了第 ${LEVIATHAN_DAYS} 天结束`, 'day');
  if (s.winner) {
    s.phase = 'end';
    return;
  }
  startNight(s);
}

/** 恐惧之灵提名了某人：当场告诉说书人是不是目标 */
export function fearPreview(s: GameState, nominee: number): { lethal: boolean; text: string } {
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  if (!fm) return { lethal: false, text: '恐惧之灵已经死了，什么都不会发生。' };
  if (s.fearTarget !== nominee) return { lethal: false, text: `${seatName(nominee)} 不是恐惧之灵的目标（目标是 ${seatName(s.fearTarget ?? '—')}）：正常投票。` };
  if (malfunction(s, fm.n)) return { lethal: false, text: `${seatName(nominee)} 是他的目标，但恐惧之灵中毒了：处决也不会触发。正常投票。` };
  const team = isEvil(seatOf(s, nominee)) ? '邪恶' : '善良';
  return { lethal: true, text: `${seatName(nominee)} 就是恐惧之灵的目标！如果今天处决他，${team}阵营直接落败。不要说出来，正常投票。` };
}

export function fearmongerNominates(s: GameState, nominee: number) {
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  s.fearNominated = nominee;
  addLog(s, 'day', `恐惧之灵（${seatName(fm?.n)}）提名了 ${seatName(nominee)}${fearPreview(s, nominee).lethal ? '（是他的目标）' : ''}`);
}

/** 恐惧之灵在场，处决某人时要问"是他提名的吗" */
export const fearmongerAsk = (s: GameState, n: number) => {
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  return !!fm && !malfunction(s, fm.n) && s.fearTarget === n;
};

/** 哥布林被处决时要问"他公开声称了吗" */
export const goblinAsk = (s: GameState, n: number) => seatOf(s, n).role === 'goblin' && seatOf(s, n).alive && !malfunction(s, n);

