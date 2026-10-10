import { ROLES, isEvilTeam, roleName, type RoleId, type Team } from './roles';
import {
  addLog, aliveCount, demonSeat, diedOnDay, hasAbility, inPlay, isDemonSeat, isEvil, isPoisoned, kill, lilMonsta, malfunction, scriptOf,
  seatLabel, seatOf, teamOf, vortoxActive, wakesAs, seatName,
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
  'alchemist', 'godfather', 'devilsadvocate', 'exorcist', 'flowergirl',
  'harpy', 'dreamer', 'seamstress', 'bountyhunter', 'general',
  'sailor', 'courtier', 'grandmother', 'innkeeper', 'gambler', 'assassin', 'professor',
];

/** 恶魔自己醒来行动的步骤（驱魔人选中恶魔时都不醒） */
const DEMON_SLOTS: SlotId[] = ['zombuul', 'alhadikhia', 'pukka', 'shabaloth', 'po'];

/** 今天白天有外来者死了（教父当晚杀人） */
export const outsiderDiedToday = (s: GameState) => diedOnDay(s, s.night - 1).some((x) => teamOf(x.role) === 'outsider');

/** 今晚本该醒、但按规则不醒的角色和原因（入夜时告诉说书人，免得以为网页漏了一步） */
export function notWakingTonight(s: GameState): string[] {
  if (s.night <= 1) return [];
  const order = slotsFor(s);
  const today = diedOnDay(s, s.night - 1);
  const out: string[] = [];
  const z = demonSeat(s);
  if (order.includes('zombuul') && z?.role === 'zombuul' && today.length)
    out.push(`僵怖（${seatName(z.n)}）今晚不醒：今天白天有人死了（${today.map((x) => seatName(x.n)).join('、')}）。`);
  if (order.includes('godfather') && !outsiderDiedToday(s))
    for (const x of s.seats.filter((y) => y.alive && wakesAs(s, y, 'godfather')))
      out.push(`${x.role === 'godfather' ? '教父' : '炼金术士（有教父的能力）'}（${seatName(x.n)}）今晚不醒：今天白天没有外来者死亡。`);
  return out;
}

/** 某人在"今天白天或今晚"死的（心上人、理发师、瘟疫医生） */
const diedJustNow = (s: GameState, x: Seat) =>
  !x.alive && !!x.death && !x.death.sick && ((x.death.when === 'day' && x.death.night === s.night - 1) || (x.death.when === 'night' && x.death.night === s.night));

/** 赏金猎人还能得知的邪恶玩家 */
export const bountyPool = (s: GameState, actorN: number) => s.seats.filter((x) => x.alive && x.n !== actorN && isEvil(x) && !s.bountyKnown.includes(x.n));

/** 赏金猎人今晚要醒吗：第一晚；或他盯着的人死了 */
function bountyNeeded(s: GameState, actorN: number): boolean {
  const last = s.bountyKnown[s.bountyKnown.length - 1];
  if (last === undefined) return s.night === 1;
  return !seatOf(s, last).alive && bountyPool(s, actorN).length > 0;
}

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
  const f = s.lunaticFake;
  if (f === 'zombuul') return diedOnDay(s, s.night - 1).length === 0;
  return f === 'imp' || f === 'vortox' || f === 'pukka' || f === 'shabaloth' || f === 'po';
}

function candidates(s: GameState, slot: SlotId): Seat[] {
  if (slot === 'imp' || slot === 'vortox') {
    const d = demonSeat(s);
    return d && d.role === slot && s.night > 1 ? [d] : [];
  }
  if (slot === 'scarletwoman') return s.pendingNewDemon ? [seatOf(s, s.pendingNewDemon)] : [];
  if (DEMON_SLOTS.includes(slot)) {
    const d = demonSeat(s);
    if (!d || d.role !== slot || s.ns?.exorcised) return [];
    // 普卡第一晚也醒（只下毒）；其他恶魔第一晚不醒
    if (s.night === 1 && slot !== 'pukka') return [];
    // 僵怖：今天白天有人死了就不醒
    if (slot === 'zombuul' && diedOnDay(s, s.night - 1).length) return [];
    return [d];
  }
  if (slot === 'marionette') {
    const d = demonSeat(s);
    return s.night === 1 && d && inPlay(s, 'marionette') ? [d] : [];
  }
  if (slot === 'barber') {
    const b = s.seats.find((x) => x.role === 'barber');
    const d = demonSeat(s);
    return b && d && !s.barberResolved && diedJustNow(s, b) ? [d] : [];
  }
  if (slot === 'lunatic') return s.seats.filter((x) => x.role === 'lunatic' && x.alive && lunaticStepNeeded(s));
  if (slot === 'amnesiac') return s.seats.filter((x) => x.role === 'amnesiac' && x.alive && amnesiacWakes(s));
  if (!ROLE_SLOTS.includes(slot)) return [];
  return s.seats.filter((x) => {
    if (!wakesAs(s, x, slot as RoleId)) return false;
    if (slot === 'ravenkeeper') return !!s.ns?.deaths.includes(x.n);
    if (slot === 'undertaker') return x.alive && s.lastExecution?.night === s.night - 1;
    if (slot === 'balloonist') return x.alive && balloonRemaining(s, x.n).length > 0;
    if (slot === 'godfather') return x.alive && (s.night === 1 || outsiderDiedToday(s));
    if (slot === 'seamstress') return x.alive && !x.used;
    if (slot === 'bountyhunter') return x.alive && bountyNeeded(s, x.n);
    if (slot === 'courtier') return x.alive && !x.used;
    if (slot === 'assassin') return x.alive && !x.used;
    if (slot === 'professor') return x.alive && !x.used && s.seats.some((y) => !y.alive && !y.left);
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

/** 爪牙（提线木偶不算：他不知道自己是爪牙，爪牙互认时不叫他） */
export const minionSeats = (s: GameState) => s.seats.filter((x) => ROLES[x.role].team === 'minion' && x.role !== 'marionette');

export function shouldRun(s: GameState, slot: SlotId): boolean {
  switch (slot) {
    case 'dusk':
    case 'dawn':
      return true;
    // 唯一的爪牙是提线木偶（他不知道自己是爪牙）：没有爪牙要互认
    case 'minionInfo':
      return s.night === 1 && s.count >= 7 && !lilMonsta(s) && minionSeats(s).length > 0;
    case 'demonInfo':
      return s.night === 1 && s.count >= 7 && !lilMonsta(s);
    case 'lilmonsta':
      return lilMonsta(s) && s.seats.some((x) => x.alive && ROLES[x.role].team === 'minion');
    case 'duchess':
      return s.fabled.includes('duchess') && s.night > 1 && s.duchessVisitors.length > 0;
    case 'stPoisoner':
      return s.stAbility === 'poisoner';
    case 'stHarpy':
      return s.stAbility === 'harpy';
    case 'sweetheart': {
      const x = s.seats.find((y) => y.role === 'sweetheart');
      return !!x && !s.sweetheartResolved && diedJustNow(s, x);
    }
    case 'plaguedoctor': {
      const x = s.seats.find((y) => y.role === 'plaguedoctor');
      return !!x && !s.plagueResolved && diedJustNow(s, x);
    }
    // 造谣者白天的声明是真的：今晚由说书人定谁死
    case 'gossip':
      return s.gossipTrueDay === s.night - 1 && s.seats.some((x) => x.role === 'gossip' && x.alive);
    case 'tinker':
      return s.night > 1 && s.seats.some((x) => x.role === 'tinker' && x.alive);
    case 'moonchild':
      return s.moonchildPick !== null;
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
  // 主谋：恶魔被处决后还要再进行一天，那一天结束前不判胜负
  if (!demonSeat(s) && s.mastermindDay && s.night <= s.mastermindDay) return false;
  if (!demonSeat(s)) win(s, 'good', lilMonsta(s) ? '照看小怪宝的人死了' : '恶魔死了', phase);
  // 假死的僵怖其实还活着，要算上
  else if (aliveCount(s) + (s.zombuulFake ? 1 : 0) <= 2) win(s, 'evil', '只剩两名玩家存活', phase);
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
  | { kind: 'number'; num: number; truth: boolean; twist?: boolean; picks?: number[] }
  | { kind: 'fortune'; picks: [number, number]; yes: boolean; truth: boolean; twist?: boolean }
  | { kind: 'reveal'; pick: number; role: RoleId; truth: boolean; twist?: boolean }
  | { kind: 'imp'; target: number; bounce?: number; starpassTo?: number }
  | { kind: 'role'; role: RoleId; truth: boolean }
  | { kind: 'lilmonsta'; babysitter: number; kill?: number }
  | { kind: 'widow'; target: number; informed: number | null }
  | { kind: 'balloon'; seat: number; team: Team; truth: boolean }
  | { kind: 'duchess'; falseFor: number; falseNum: number }
  | { kind: 'yesno'; yes: boolean; truth: boolean }
  | { kind: 'harpy'; mad: number; second: number }
  | { kind: 'dreamer'; target: number; good: RoleId; evil: RoleId; truth: boolean; twist?: boolean }
  | { kind: 'seamstress'; picks: [number, number] | null; same: boolean; truth: boolean; twist?: boolean }
  | { kind: 'bounty'; seat: number; truth: boolean; twist?: boolean }
  | { kind: 'general'; answer: 'good' | 'evil' | 'neither'; truth: boolean }
  | { kind: 'hadikhia'; picks: number[]; live: boolean[] }
  | { kind: 'barber'; swap: [number, number] | null }
  | { kind: 'plague'; ability: RoleId; to?: number }
  | { kind: 'sailor'; target: number; drunk: number }
  | { kind: 'innkeeper'; picks: [number, number]; drunk: number }
  | { kind: 'gambler'; target: number; role: RoleId }
  | { kind: 'grandmother'; seat: number; role: RoleId; truth: boolean }
  | { kind: 'courtier'; role: RoleId | null }
  | { kind: 'shabaloth'; picks: number[]; revive: number | null }
  | { kind: 'po'; picks: number[] };

/** 这一步里玩家用能力"选择"了哪些人（莽夫用） */
function chosenSeats(p: SlotPayload): number[] {
  switch (p.kind) {
    case 'target':
    case 'imp':
    case 'sailor':
    case 'gambler':
      return [p.target];
    case 'fortune':
      return p.picks;
    case 'number':
      return p.picks ?? [];
    case 'harpy':
      return [p.mad, p.second];
    case 'dreamer':
      return [p.target];
    case 'seamstress':
      return p.picks ?? [];
    case 'hadikhia':
    case 'shabaloth':
    case 'po':
      return p.picks;
    case 'innkeeper':
      return p.picks;
    default:
      return [];
  }
}

/** 某人阵营改成 evil/good（和角色类型一致时去掉标记） */
function setAlignment(x: Seat, evil: boolean) {
  if (isEvilTeam(teamOf(x.role)) === evil) delete x.alignment;
  else x.alignment = evil ? 'evil' : 'good';
}

/** 莽夫：这一步会不会触发（今晚第一个用能力选他的人） */
export function goonTriggered(s: GameState, actor: Seat | undefined, picks: number[], slot: SlotId): Seat | undefined {
  if (!actor || slot === 'lunatic' || s.ns?.goonHit) return undefined;
  const g = s.seats.find((x) => x.role === 'goon' && picks.includes(x.n) && x.n !== actor.n);
  return g;
}

/** 恶魔杀人：孙子被恶魔杀死时祖母也死 */
function demonKill(s: GameState, n: number, cause = '被恶魔杀死'): boolean {
  const died = kill(s, n, 'night', cause);
  if (died && n === s.grandchild) {
    const gm = s.seats.find((x) => x.role === 'grandmother' && x.alive);
    if (gm && !malfunction(s, gm.n)) {
      kill(s, gm.n, 'night', '孙子被恶魔杀死，祖母也死了');
      addLog(s, 'night', `孙子 ${seatName(n)} 被恶魔杀死，祖母（${seatName(gm.n)}）也死了`);
    }
  }
  return died;
}

/** 复活（教授、沙巴洛斯） */
function revive(s: GameState, n: number, why: string) {
  const x = seatOf(s, n);
  if (x.alive) return;
  x.alive = true;
  delete x.death;
  if (s.ns) {
    s.ns.deaths = s.ns.deaths.filter((m) => m !== n);
    s.ns.revived = [...(s.ns.revived ?? []), n];
  }
  addLog(s, s.phase === 'night' ? 'night' : 'day', `${seatName(n)} ${why}，复活了`);
}

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
    x.role === 'drunk' ? '（其实是酒鬼）' : x.role === 'marionette' ? '（其实是提线木偶）' : x.role === 'cannibal' ? '（食人族）' : x.role === 'pixie' ? '（小精灵）' : x.role === 'amnesiac' ? '（失忆者）' : x.role === 'alchemist' && slot !== 'alchemist' ? '（炼金术士）' : '';
  const who = actor ? `${seatName(actor.n)}${tagWho(actor)}` : '';
  const tag = (truth: boolean, twist?: boolean) => (!truth ? '（假信息）' : twist ? '（合规误导）' : '（真实信息）');
  if (!ns.ran) ns.ran = [];
  if (!ns.ran.includes(ns.slot)) ns.ran.push(ns.slot);
  // 莽夫：今晚第一个用能力选他的人当场醉酒（这次能力无效），莽夫变成他的阵营
  const goon = goonTriggered(s, actor, chosenSeats(p), slot);
  if (goon && actor) {
    ns.goonHit = true;
    s.tempDrunk.push({ seat: actor.n, from: s.night, to: s.night, why: '选了莽夫' });
    const was = isEvil(goon);
    setAlignment(goon, isEvil(actor));
    addLog(s, 'night', `${seatName(actor.n)} 选了莽夫（${seatName(goon.n)}）：醉酒到明天黄昏，这次能力无效${was !== isEvil(goon) ? `；莽夫变成${isEvil(goon) ? '邪恶' : '善良'}阵营` : ''}`);
  }
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
      addLog(s, 'night', `恶魔得知爪牙：${minionSeats(s).map((x) => `${seatName(x.n)}`).join('、') || '没有（只有提线木偶）'}；伪装角色：${s.bluffs.map(roleName).join('、')}`);
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
    case 'alchemist':
      addLog(s, 'night', `炼金术士 ${who} 得知自己拥有【${roleName(s.alchemistAbility ?? 'godfather')}】的能力`);
      break;
    case 'godfather':
      if (s.night === 1) addLog(s, 'night', `教父 ${who} 得知在场的外来者：${godfatherOutsiders(s).map(roleName).join('、') || '没有'}`);
      else if (p.kind === 'target') {
        addLog(s, 'night', `教父 ${who} 选择了 ${seatName(p.target)}`);
        if (malfunction(s, actor!.n)) addLog(s, 'night', '他中毒/醉酒：没有效果');
        else kill(s, p.target, 'night', '被教父杀死');
      }
      break;
    case 'devilsadvocate':
      if (p.kind === 'target') {
        const ok = !malfunction(s, actor!.n);
        s.advocate = { seat: p.target, night: s.night, ok };
        addLog(s, 'night', `魔鬼代言人 ${who} 保护了 ${seatName(p.target)}：明天被处决不会死${ok ? '' : '（中毒，无效）'}`);
      }
      break;
    case 'exorcist':
      if (p.kind === 'target') {
        s.exorcistPick = { seat: p.target, night: s.night };
        const hit = !malfunction(s, actor!.n) && isDemonSeat(s, p.target);
        if (hit) ns.exorcised = true;
        // 普卡被驱魔不醒：不下新毒，但上一个被毒的人照样死
        if (hit && seatOf(s, p.target).role === 'pukka' && s.pukkaPoison !== null) {
          demonKill(s, s.pukkaPoison, '被普卡的毒杀死');
          s.pukkaPoison = null;
        }
        addLog(s, 'night', `驱魔人 ${who} 选择了 ${seatName(p.target)}${hit ? '：是恶魔，恶魔得知驱魔人是谁，今晚不醒' : ''}`);
      }
      break;
    case 'zombuul':
      if (p.kind === 'target') {
        addLog(s, 'night', `僵怖 ${seatName(actor!.n)} 选择了 ${seatName(p.target)}`);
        if (malfunction(s, actor!.n)) addLog(s, 'night', '僵怖中毒/醉酒：没有人死');
        else demonKill(s, p.target);
      }
      break;
    case 'pukka': {
      const healthy = !malfunction(s, actor!.n);
      const prev = s.pukkaPoison;
      // 上一个被毒的人先死，然后恢复健康
      if (s.night > 1 && prev !== null && healthy) {
        demonKill(s, prev, '被普卡的毒杀死');
        s.pukkaPoison = null;
      }
      if (p.kind === 'target') {
        addLog(s, 'night', `普卡 ${seatName(actor!.n)} 选择了 ${seatName(p.target)}${healthy ? '：他中毒' : '（中毒/醉酒，无效）'}`);
        if (healthy) s.pukkaPoison = p.target;
      }
      break;
    }
    case 'shabaloth':
      if (p.kind === 'shabaloth') {
        const healthy = !malfunction(s, actor!.n);
        addLog(s, 'night', `沙巴洛斯 ${seatName(actor!.n)} 选择了 ${p.picks.map((n) => seatName(n)).join('、')}${healthy ? '' : '（中毒/醉酒，无效）'}`);
        if (healthy) {
          if (p.revive !== null) revive(s, p.revive, '被沙巴洛斯吐了出来');
          for (const n of p.picks) demonKill(s, n);
        }
        s.shabalothLast = p.picks;
        s.shabalothNight = s.night;
      }
      break;
    case 'po':
      if (p.kind === 'po') {
        const healthy = !malfunction(s, actor!.n);
        if (!p.picks.length) {
          s.poCharged = true;
          addLog(s, 'night', `珀 ${seatName(actor!.n)} 今晚没有选人：下一晚要选三个人`);
        } else {
          s.poCharged = false;
          addLog(s, 'night', `珀 ${seatName(actor!.n)} 选择了 ${p.picks.map((n) => seatName(n)).join('、')}${healthy ? '' : '（中毒/醉酒，无效）'}`);
          if (healthy) for (const n of p.picks) demonKill(s, n);
        }
      }
      break;
    case 'sailor':
      if (p.kind === 'sailor') {
        const healthy = !malfunction(s, actor!.n);
        if (healthy) s.tempDrunk.push({ seat: p.drunk, from: s.night, to: s.night, why: '水手' });
        addLog(s, 'night', `水手 ${who} 选择了 ${seatName(p.target)}${healthy ? `：${seatName(p.drunk)} 醉酒到明天黄昏` : '（中毒/醉酒，无效）'}`);
      }
      break;
    case 'innkeeper':
      if (p.kind === 'innkeeper') {
        const healthy = !malfunction(s, actor!.n);
        if (healthy) {
          ns.innkeeper = p.picks;
          s.tempDrunk.push({ seat: p.drunk, from: s.night, to: s.night, why: '旅店老板' });
        }
        addLog(s, 'night', `旅店老板 ${who} 保护了 ${p.picks.map((n) => seatName(n)).join('、')}${healthy ? `；${seatName(p.drunk)} 醉酒到明天黄昏` : '（中毒/醉酒，无效）'}`);
      }
      break;
    case 'courtier':
      if (p.kind === 'courtier') {
        if (!p.role) addLog(s, 'night', `侍臣 ${who} 今晚不用能力`);
        else {
          actor!.used = true;
          const target = s.seats.find((x) => x.role === p.role);
          const healthy = !malfunction(s, actor!.n);
          if (healthy && target) s.tempDrunk.push({ seat: target.n, from: s.night, to: s.night + 2, why: '侍臣' });
          addLog(s, 'night', `侍臣 ${who} 选择了【${roleName(p.role)}】${!healthy ? '（中毒/醉酒，无效）' : target ? `：${seatName(target.n)} 醉酒三天三夜` : '：这个角色不在场，什么都没发生'}`);
        }
      }
      break;
    case 'gambler':
      if (p.kind === 'gambler') {
        const right = seatOf(s, p.target).role === p.role;
        addLog(s, 'night', `赌徒 ${who} 猜 ${seatName(p.target)} 是【${roleName(p.role)}】：${right ? '猜对了' : '猜错了'}`);
        if (!right && !malfunction(s, actor!.n)) kill(s, actor!.n, 'night', '赌徒猜错了');
      }
      break;
    case 'grandmother':
      if (p.kind === 'grandmother') {
        infoStat(s, p.truth);
        s.grandchild = p.seat;
        addLog(s, 'night', `祖母 ${who} 得知孙子是 ${seatName(p.seat)}【${roleName(p.role)}】${tag(p.truth)}`, p.truth);
      }
      break;
    case 'assassin':
      if (p.kind === 'target') {
        actor!.used = true;
        addLog(s, 'night', `刺客 ${who} 选择了 ${seatName(p.target)}`);
        if (malfunction(s, actor!.n)) addLog(s, 'night', '刺客中毒/醉酒：没有效果（能力用掉了）');
        else kill(s, p.target, 'night', '被刺客杀死', true);
      } else addLog(s, 'night', `刺客 ${who} 今晚不用能力`);
      break;
    case 'professor':
      if (p.kind === 'target') {
        actor!.used = true;
        const x = seatOf(s, p.target);
        addLog(s, 'night', `教授 ${who} 选择了 ${seatName(p.target)}`);
        if (!malfunction(s, actor!.n) && !x.alive && teamOf(x.role) === 'townsfolk') revive(s, p.target, '被教授救活');
        else addLog(s, 'night', '什么都没有发生（能力用掉了）');
      } else addLog(s, 'night', `教授 ${who} 今晚不用能力`);
      break;
    case 'gossip':
      if (p.kind === 'target') {
        addLog(s, 'night', `造谣者的声明是真的：说书人决定 ${seatName(p.target)} 死亡`);
        kill(s, p.target, 'night', '造谣者的声明成真');
      }
      break;
    case 'tinker':
      if (p.kind === 'yesno' && p.yes) {
        const t = s.seats.find((x) => x.role === 'tinker' && x.alive);
        if (t) kill(s, t.n, 'night', '修补匠死了');
      }
      break;
    case 'moonchild': {
      const pick = s.moonchildPick;
      const mc = s.seats.find((x) => x.role === 'moonchild');
      s.moonchildPick = null;
      if (pick !== null && mc && !malfunction(s, mc.n) && seatOf(s, pick).alive && !isEvil(seatOf(s, pick))) kill(s, pick, 'night', '月之子选中了他');
      else addLog(s, 'night', '月之子选的人不会死（他是邪恶的、已经死了，或月之子中毒/醉酒）');
      break;
    }
    case 'flowergirl':
      if (p.kind === 'yesno') {
        infoStat(s, p.truth);
        addLog(s, 'night', `卖花女孩 ${who}：今天恶魔${p.yes ? '投过票' : '没投票'}${tag(p.truth)}`, p.truth);
      }
      break;
    case 'marionette':
      addLog(s, 'night', `恶魔得知提线木偶是 ${seatName(s.seats.find((x) => x.role === 'marionette')?.n)}`);
      break;
    case 'harpy':
    case 'stHarpy':
      if (p.kind === 'harpy') {
        const ok = eff === 'stHarpy' || !malfunction(s, actor!.n);
        s.harpy = ok ? { mad: p.mad, second: p.second, night: s.night, done: false } : null;
        addLog(s, 'night', `${eff === 'stHarpy' ? '说书人（鹰身女妖能力）' : `鹰身女妖 ${who}`}：${seatName(p.mad)} 明天要疯狂地证明 ${seatName(p.second)} 是邪恶的${ok ? '' : '（中毒，无效）'}`);
      }
      break;
    case 'stPoisoner':
      if (p.kind === 'target') {
        s.stPoison = { seat: p.target, night: s.night };
        addLog(s, 'night', `说书人（投毒者能力）毒了 ${seatName(p.target)}`);
      }
      break;
    case 'dreamer':
      if (p.kind === 'dreamer') {
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist && isEvil(seatOf(s, p.target))) expose(s, p.target);
        addLog(s, 'night', `筑梦师 ${who} 查 ${seatName(p.target)}：【${roleName(p.good)}】或【${roleName(p.evil)}】${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'seamstress':
      if (p.kind === 'seamstress') {
        if (!p.picks) addLog(s, 'night', `女裁缝 ${who} 今晚不用能力`);
        else {
          actor!.used = true;
          infoStat(s, p.truth, p.twist);
          addLog(s, 'night', `女裁缝 ${who} 查 ${seatName(p.picks[0])}、${seatName(p.picks[1])}：${p.same ? '同一阵营' : '不同阵营'}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
        }
      }
      break;
    case 'bountyhunter':
      if (p.kind === 'bounty') {
        s.bountyKnown.push(p.seat);
        infoStat(s, p.truth, p.twist);
        if (p.truth && !p.twist) expose(s, p.seat, isDemonSeat(s, p.seat) ? 2 : 1);
        addLog(s, 'night', `赏金猎人 ${who} 得知 ${seatName(p.seat)} 是邪恶的${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'general':
      if (p.kind === 'general') {
        infoStat(s, p.truth);
        const txt = { good: '善良占优', evil: '邪恶占优', neither: '都不占优' }[p.answer];
        addLog(s, 'night', `将军 ${who}：${txt}${tag(p.truth)}`, p.truth);
      }
      break;
    case 'alhadikhia':
      if (p.kind === 'hadikhia') resolveHadikhia(s, actor!, p.picks, p.live);
      break;
    case 'sweetheart':
      if (p.kind === 'target') {
        s.sweetheartResolved = true;
        s.sweetheartDrunk = p.target;
        addLog(s, 'night', `心上人死了：${seatName(p.target)} 从此一直醉酒`);
      }
      break;
    case 'barber':
      s.barberResolved = true;
      if (p.kind === 'barber' && p.swap) barberSwap(s, p.swap[0], p.swap[1]);
      else addLog(s, 'night', '理发师死了：恶魔选择不换角色');
      break;
    case 'plaguedoctor':
      if (p.kind === 'plague') {
        s.plagueResolved = true;
        if (p.ability === 'spy' && p.to) {
          s.gained[p.to] = 'spy';
          addLog(s, 'night', `瘟疫医生死了：爪牙 ${seatName(p.to)} 获得间谍的能力（相克规则），已告知他`);
        } else {
          s.stAbility = p.ability;
          addLog(s, 'night', `瘟疫医生死了：说书人获得【${roleName(p.ability)}】的能力`);
        }
      }
      break;
    case 'dusk':
      break;
  }
  advance(s);
}

/** 教父第一晚得知的外来者 */
export const godfatherOutsiders = (s: GameState): RoleId[] => s.seats.filter((x) => !x.traveller && teamOf(x.role) === 'outsider').map((x) => x.role);

/* ---------------- 哈迪寂亚 ---------------- */

/** 按每人的选择算结果（不改状态）：每人最后是死是活 */
export function hadikhiaPreview(s: GameState, picks: number[], live: boolean[]): { alive: boolean[]; allDie: boolean } {
  const d = demonSeat(s);
  if (!d || malfunction(s, d.n)) return { alive: picks.map((n) => seatOf(s, n).alive), allDie: false };
  const alive = picks.map((_, i) => live[i]);
  const allDie = picks.length === 3 && alive.every(Boolean);
  return { alive: allDie ? alive.map(() => false) : alive, allDie };
}

function resolveHadikhia(s: GameState, d: Seat, picks: number[], live: boolean[]) {
  const ns = s.ns!;
  if (!picks.length) {
    addLog(s, 'night', `哈迪寂亚 ${seatName(d.n)} 今晚没有选人`);
    return;
  }
  addLog(s, 'night', `哈迪寂亚 ${seatName(d.n)} 选择了 ${picks.map((n) => seatName(n)).join('、')}；各自选择：${picks.map((n, i) => `${seatName(n)}${live[i] ? '活' : '死'}`).join('，')}`);
  if (malfunction(s, d.n)) {
    addLog(s, 'night', '哈迪寂亚中毒：没有效果');
    ns.hadikhia = { picks, alive: picks.map((n) => seatOf(s, n).alive) };
    return;
  }
  picks.forEach((n, i) => {
    const x = seatOf(s, n);
    if (live[i] && !x.alive) {
      x.alive = true;
      delete x.death;
      ns.deaths = ns.deaths.filter((m) => m !== n);
      addLog(s, 'night', `${seatName(n)} 选择活：复活了`);
    } else if (!live[i] && x.alive) kill(s, n, 'night', '被恶魔杀死（自己选择了死）');
  });
  if (picks.length === 3 && picks.every((n) => seatOf(s, n).alive)) {
    addLog(s, 'night', '三人都选择活：三人都死');
    for (const n of picks) kill(s, n, 'night', '被恶魔杀死（三人都选了活）');
  }
  // 报丧女妖被恶魔杀死：天亮宣布
  const b = picks.map((n) => seatOf(s, n)).find((x) => x.role === 'banshee' && !x.alive && x.death?.when === 'night' && x.death.night === s.night && !x.death.sick);
  if (b && s.bansheeActive === null) {
    s.bansheeActive = b.n;
    addLog(s, 'night', `报丧女妖（${seatName(b.n)}）被恶魔杀死：能力生效，天亮公开宣布`);
  }
  ns.hadikhia = { picks, alive: picks.map((n) => seatOf(s, n).alive) };
}

/* ---------------- 理发师 ---------------- */

/** 交换两人的角色，阵营不变 */
function barberSwap(s: GameState, a: number, b: number) {
  const A = seatOf(s, a);
  const B = seatOf(s, b);
  const [ea, eb] = [isEvil(A), isEvil(B)];
  [A.role, B.role] = [B.role, A.role];
  A.used = false;
  B.used = false;
  for (const [x, evil] of [[A, ea], [B, eb]] as const) {
    if (isEvilTeam(teamOf(x.role)) === evil) delete x.alignment;
    else x.alignment = evil ? 'evil' : 'good';
  }
  addLog(s, 'night', `理发师死了：恶魔让 ${seatName(a)}、${seatName(b)} 交换角色（现在分别是${roleName(A.role)}、${roleName(B.role)}，阵营不变）`);
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
  /** 和平主义者：这名善良玩家被处决但不死 */
  pacifist?: boolean;
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

/** 和平主义者在场：被处决的善良玩家可以不死 */
export function pacifistCanSave(s: GameState, n: number): boolean {
  const pc = s.seats.find((x) => x.role === 'pacifist' && x.alive);
  return !!pc && !malfunction(s, pc.n) && !isEvil(seatOf(s, n));
}

/** 魔鬼代言人昨晚保护了他：今天被处决不会死 */
export function advocateSaves(s: GameState, n: number): boolean {
  const a = s.advocate;
  return !!a && a.ok && a.night === s.night && a.seat === n && s.seats.some((x) => x.alive && wakesAs(s, x, 'devilsadvocate'));
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
  // 主谋的额外一天：处决了谁，谁的阵营就输；没人被处决善良获胜
  if (s.mastermindDay && s.night === s.mastermindDay && !demonSeat(s)) {
    if (n === null) return win(s, 'good', '恶魔已被处决，主谋的额外一天没有人被处决', 'day');
    const x = seatOf(s, n);
    if (x.alive) kill(s, n, 'day', cause);
    addLog(s, 'day', `${seatLabel(s, n)} ${cause}（主谋的额外一天）`);
    return win(s, isEvil(x) ? 'good' : 'evil', `主谋的额外一天处决了${isEvil(x) ? '邪恶' : '善良'}玩家 ${seatName(n)}`, 'day');
  }
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
  // 假死的僵怖再被处决会真的死
  if (!st.alive && !(st.role === 'zombuul' && s.zombuulFake)) {
    addLog(s, 'day', `${seatLabel(s, n)} 已经死亡，被处决但不会再死`);
    return;
  }
  if (advocateSaves(s, n)) {
    addLog(s, 'day', `${seatLabel(s, n)} 被处决，但受魔鬼代言人保护，没有死`);
    return;
  }
  if (opts.pacifist && pacifistCanSave(s, n)) {
    addLog(s, 'day', `${seatLabel(s, n)} 被处决，但和平主义者让他没有死`);
    return;
  }
  const aliveBefore = aliveCount(s);
  if (!kill(s, n, 'day', cause)) {
    addLog(s, 'day', `${seatLabel(s, n)} 被处决，但没有死`);
    return;
  }
  s.lastExecution = { night: s.night, seat: n };
  addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
  if (st.role === 'saint' && !malfunction(s, n)) return win(s, 'evil', '圣徒被处决', 'day');
  if (st.role === 'goblin' && !malfunction(s, n) && opts.goblinClaimed) return win(s, 'evil', '哥布林被提名时公开声称自己是哥布林，并被处决', 'day');
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  const fearNominated = opts.fearmongerNominated ?? s.fearNominated === n;
  if (fm && !malfunction(s, fm.n) && s.fearTarget === n && fearNominated)
    return win(s, isEvil(st) ? 'good' : 'evil', `恐惧之灵提名并处决了他的目标 ${seatName(n)}`, 'day');
  cannibalEats(s, st);
  // 吟游诗人：爪牙被处决死亡，其他人醉酒到明天黄昏
  const minstrel = s.seats.find((x) => x.role === 'minstrel' && x.alive);
  if (teamOf(st.role) === 'minion' && minstrel && !malfunction(s, minstrel.n)) {
    for (const x of s.seats) if (x.n !== minstrel.n && !x.traveller) s.tempDrunk.push({ seat: x.n, from: s.night, to: s.night + 1, why: '吟游诗人' });
    addLog(s, 'day', `爪牙被处决：除吟游诗人（${seatName(minstrel.n)}）外所有人醉酒到明天黄昏`);
  }
  // 主谋：恶魔被处决死亡本该结束游戏，改成再进行一天
  const mm = s.seats.find((x) => x.role === 'mastermind' && x.alive);
  if (isDemonSeat(s, n) && !demonSeat(s) && mm && !malfunction(s, mm.n) && !s.mastermindDay) {
    s.mastermindDay = s.night + 1;
    addLog(s, 'day', `恶魔被处决，但主谋（${seatName(mm.n)}）在场：游戏再进行一天，不要宣布结束`);
    return;
  }
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
  if (!kill(s, n, 'day', cause)) return;
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

/** 造谣者：白天的声明是真是假（他当时中毒/醉酒就不算） */
export function setGossip(s: GameState, gossipN: number, isTrue: boolean) {
  const ok = isTrue && !malfunction(s, gossipN);
  s.gossipTrueDay = ok ? s.night : 0;
  addLog(s, 'day', `造谣者（${seatName(gossipN)}）的声明是${isTrue ? '真' : '假'}的${isTrue && !ok ? '（但他中毒/醉酒，不会有人死）' : ok ? '：今晚会有一名玩家死亡' : ''}`);
}

/** 修补匠：说书人决定他白天死 */
export function tinkerDies(s: GameState) {
  const t = s.seats.find((x) => x.role === 'tinker' && x.alive);
  if (t) dayDeath(s, t.n, '修补匠死了');
}

/** 月之子死了还没选人 */
export function moonchildNeedsChoice(s: GameState): Seat | undefined {
  if (s.moonchildResolved || s.winner) return undefined;
  return s.seats.find((x) => x.role === 'moonchild' && !x.alive);
}

/** 月之子公开选了一个人：如果是善良的，今晚死 */
export function moonchildChoose(s: GameState, pick: number) {
  const mc = s.seats.find((x) => x.role === 'moonchild');
  s.moonchildResolved = true;
  s.moonchildPick = pick;
  addLog(s, s.phase === 'night' ? 'night' : 'day', `月之子（${seatName(mc?.n)}）公开选择了 ${seatName(pick)}${isEvil(seatOf(s, pick)) ? '（邪恶，不会死）' : '（善良，今晚会死）'}`);
}

/** 卖花女孩：白天记下恶魔投过票 */
export function setDemonVoted(s: GameState, voted: boolean) {
  s.demonVotedDay = voted ? s.night : 0;
  addLog(s, 'day', voted ? '恶魔今天投过票（卖花女孩）' : '改为：恶魔今天没投票');
}

/** 鹰身女妖：第一个人没做到疯狂时，说书人决定谁死 */
export function harpyPunish(s: GameState, kills: number[]) {
  if (!s.harpy) return;
  s.harpy.done = true;
  if (!kills.length) addLog(s, 'day', `鹰身女妖：${seatName(s.harpy.mad)} 没有受罚`);
  for (const n of kills) dayDeath(s, n, '没能疯狂地证明（鹰身女妖）');
}

/** 戏法师：所有爪牙和恶魔（死了的也算）都要说对 */
export function alsaahirCorrect(s: GameState, minions: number[], demons: number[]): boolean {
  const real = (t: Team) => s.seats.filter((x) => !x.traveller && teamOf(x.role) === t).map((x) => x.n).sort((a, b) => a - b).join();
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b).join();
  return real('minion') === sorted(minions) && real('demon') === sorted(demons);
}

export function alsaahirGuess(s: GameState, n: number, minions: number[], demons: number[], correct: boolean) {
  s.alsaahirDay = s.night;
  addLog(s, 'day', `戏法师（${seatName(n)}）公开猜：爪牙 ${minions.map((m) => seatName(m)).join('、') || '无'}；恶魔 ${demons.map((m) => seatName(m)).join('、')}`);
  if (correct && !malfunction(s, n)) win(s, 'good', `戏法师（${seatName(n)}）猜中了所有爪牙和恶魔`, 'day');
  else addLog(s, 'day', correct ? '猜对了，但戏法师中毒/醉酒：没有效果' : '没猜对：什么都不会发生');
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

