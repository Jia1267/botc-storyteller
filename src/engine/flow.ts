import { ROLES, isEvilTeam, roleName, type RoleId, type Team } from './roles';
import {
  abilityAlive, addLog, aliveCount, aliveVoters, deathShield, demonCause, drunkOrPoisoned, preachedNow, demonSeat, diedOnDay, hasAbility, inPlay, isDemonSeat, isEvil, isPoisoned, kill, lilMonsta,
  malfunction, scriptOf, seatLabel, seatOf, teamOf, vortoxActive, wakesAs, seatName,
} from './core';
import { firstNightOnly } from './nightOrder';
import { balloonRemaining, killPreview, pairLabel, scarletCanTakeOver, type PairInfo } from './info';
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
  'clockmaker', 'snakecharmer', 'mathematician', 'towncrier', 'oracle', 'philosopher', 'juggler', 'sage',
  'eviltwin', 'witch', 'cerenovus', 'pithag',
  'steward', 'knight', 'noble', 'shugenja', 'highpriestess', 'king', 'choirboy', 'nightwatchman', 'farmer', 'acrobat', 'preacher',
  'huntsman', 'ogre', 'qutler', 'boffin', 'wizard', 'organgrinder', 'mezepheles',
];

/** 恶魔自己醒来行动的步骤（驱魔人选中恶魔、麻脸巫婆造了恶魔说书人决定今晚不死人时都不醒） */
const DEMON_SLOTS: SlotId[] = ['zombuul', 'alhadikhia', 'pukka', 'shabaloth', 'po', 'fanggu', 'nodashii', 'vigormortis'];


/** 女巫的诅咒还有效：女巫的能力在（活着或被亡骨魔杀死）、健康、存活超过三人 */
export function witchActive(s: GameState): boolean {
  const w = s.seats.find((x) => x.role === 'witch' && abilityAlive(s, x));
  return !!w && !malfunction(s, w.n) && aliveCount(s) > 3;
}

/** 镜像双子都活着、镜像双子健康、两人阵营相反：善良赢不了 */
export function twinsBlock(s: GameState): boolean {
  const e = s.seats.find((x) => x.role === 'eviltwin' && abilityAlive(s, x));
  if (!e || !s.twin || malfunction(s, e.n)) return false;
  const g = seatOf(s, s.twin);
  return e.alive && g.alive && isEvil(e) !== isEvil(g);
}

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
  return f === 'imp' || f === 'vortox' || f === 'pukka' || f === 'shabaloth' || f === 'po' || f === 'fanggu' || f === 'nodashii' || f === 'vigormortis';
}

function candidates(s: GameState, slot: SlotId): Seat[] {
  if (slot === 'imp' || slot === 'vortox') {
    const d = demonSeat(s);
    return d && d.role === slot && s.night > 1 && !s.ns?.exorcised && !s.ns?.noDemonKill ? [d] : [];
  }
  if (slot === 'scarletwoman') return s.pendingNewDemon ? [seatOf(s, s.pendingNewDemon)] : [];
  if (DEMON_SLOTS.includes(slot)) {
    const d = demonSeat(s);
    if (!d || d.role !== slot || s.ns?.exorcised || s.ns?.noDemonKill) return [];
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
  // 被亡骨魔杀死的爪牙照常醒；被传教士选中的爪牙不醒
  if (slot === 'witch') return s.seats.filter((x) => wakesAs(s, x, 'witch') && abilityAlive(s, x) && aliveCount(s) > 3 && !preachedNow(s, x.n));
  if (slot === 'cerenovus' || slot === 'pithag') return s.seats.filter((x) => wakesAs(s, x, slot) && abilityAlive(s, x) && !preachedNow(s, x.n));
  // 灵言师：第一晚看秘密词；之后有人说出秘密词的那晚才醒
  if (slot === 'mezepheles')
    return s.seats.filter((x) => x.role === 'mezepheles' && abilityAlive(s, x) && !preachedNow(s, x.n) && (s.night === 1 || (s.mezeTarget !== null && !s.mezeUsed)));
  // 国王：第一晚叫醒恶魔告诉他谁是国王
  if (slot === 'king' && s.night === 1) {
    const d = demonSeat(s);
    return d && s.seats.some((x) => x.role === 'king') ? [d] : [];
  }
  // 农夫：今晚死了（死时没中毒醉酒）的农夫，由他带出下一个农夫（他自己不醒）
  if (slot === 'farmer')
    return s.seats.filter(
      (x) => x.role === 'farmer' && !x.alive && x.death?.when === 'night' && x.death.night === s.night && !x.death.sick && !(s.ns?.doneActors ?? []).includes(x.n),
    );
  return s.seats.filter((x) => {
    if (!wakesAs(s, x, slot as RoleId)) return false;
    if (teamOf(x.role) === 'minion' && preachedNow(s, x.n)) return false;
    if (slot === 'king') return x.alive && s.seats.filter((y) => !y.alive).length >= s.seats.filter((y) => y.alive).length;
    if (slot === 'choirboy') return x.alive && kingKilledTonight(s);
    if (slot === 'nightwatchman' || slot === 'huntsman' || slot === 'wizard') return x.alive && !x.used;
    if (slot === 'boffin') return x.alive && !!s.boffinAbility;
    if (slot === 'philosopher') return x.alive && (!x.used || !!s.ns?.philoNow);
    if (slot === 'juggler') return x.alive && s.juggler?.seat === x.n && s.juggler.day === s.night - 1 && !!s.juggler.guesses;
    if (slot === 'sage') return !x.alive && x.death?.when === 'night' && x.death.night === s.night && demonCause(x.death.cause);
    if (slot === 'eviltwin') return x.alive && !!s.twin;
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

/** 罂粟种植者在场且活着：第一晚邪恶不互认 */
export const poppyActive = (s: GameState) => s.seats.some((x) => x.role === 'poppygrower' && x.alive) && !s.poppyResolved;

/** 魔术师在场：爪牙以为他是恶魔，恶魔以为他是爪牙 */
export const magicianSeat = (s: GameState) => s.seats.find((x) => x.role === 'magician' && x.alive);

/** 今晚国王被恶魔杀死了（唱诗男孩） */
export const kingKilledTonight = (s: GameState) =>
  s.seats.some((x) => x.role === 'king' && !x.alive && x.death?.when === 'night' && x.death.night === s.night && demonCause(x.death.cause));

/** 爪牙（提线木偶不算：他不知道自己是爪牙，爪牙互认时不叫他） */
export const minionSeats = (s: GameState) => s.seats.filter((x) => ROLES[x.role].team === 'minion' && x.role !== 'marionette');

export function shouldRun(s: GameState, slot: SlotId): boolean {
  switch (slot) {
    case 'dusk':
    case 'dawn':
      return true;
    // 唯一的爪牙是提线木偶（他不知道自己是爪牙）：没有爪牙要互认
    case 'minionInfo':
      return s.night === 1 && s.count >= 7 && !lilMonsta(s) && minionSeats(s).length > 0 && !poppyActive(s);
    // 第一晚：落难少女、告密者在场，叫醒爪牙
    case 'damsel':
    case 'snitch':
      return s.night === 1 && s.seats.some((x) => x.role === slot) && minionSeats(s).some((x) => x.alive);
    // 帽匠今天白天或今晚死了（死时健康）：邪恶可以换角色
    case 'hatter': {
      const h = s.seats.find((x) => x.role === 'hatter');
      return !!h && !s.hatterResolved && diedJustNow(s, h) && s.seats.some((x) => x.alive && isEvil(x) && ['minion', 'demon'].includes(teamOf(x.role)));
    }
    // 罂粟种植者死了（死时健康）：当晚邪恶互认
    case 'poppygrower': {
      const p = s.seats.find((x) => x.role === 'poppygrower');
      return !!p && !p.alive && !p.death?.sick && !s.poppyResolved && !!demonSeat(s);
    }
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
  if (order[i] === 'dawn') {
    resolveAcrobats(s);
    checkWin(s, 'night');
  }
}

/** 杂技演员：他选的人今晚醉酒或中毒了，他死 */
function resolveAcrobats(s: GameState) {
  for (const a of s.ns?.acrobat ?? []) {
    const x = seatOf(s, a.actor);
    if (x.alive && !malfunction(s, a.actor) && drunkOrPoisoned(s, a.target)) kill(s, a.actor, 'night', `杂技演员选的 ${seatName(a.target)} 今晚醉酒或中毒`);
  }
  if (s.ns) s.ns.acrobat = [];
}

export function startNight(s: GameState) {
  s.phase = 'night';
  s.night += 1;
  s.executed = undefined;
  s.ns = { slot: -1, doneActors: [], deaths: [], monk: null, woke: [], lunaticPick: null };
  const pr = s.seats.find((x) => x.role === 'princess' && x.alive);
  if (s.princessNight === s.night && pr && !malfunction(s, pr.n)) s.ns.demonNoKill = '公主提名的人今天被处决了，今晚恶魔不杀人';
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
  // 异端分子：胜负反过来（他死了也算，中毒醉酒不算）
  const her = s.seats.find((x) => x.role === 'heretic');
  if (her && !malfunction(s, her.n)) {
    who = who === 'good' ? 'evil' : 'good';
    reason = `${reason}；异端分子（${seatName(her.n)}）在场，胜负反过来`;
  }
  s.winner = who;
  s.winReason = reason;
  s.endedAt = Date.now();
  addLog(s, phase, `${who === 'good' ? '善良' : '邪恶'}阵营获胜：${reason}`);
}

export function checkWin(s: GameState, phase: 'night' | 'day'): boolean {
  if (s.winner) return true;
  // 主谋：恶魔被处决后还要再进行一天，那一天结束前不判胜负
  if (!demonSeat(s) && s.mastermindDay && s.night <= s.mastermindDay) return false;
  // 镜像双子：两个双子都活着时善良赢不了，游戏继续
  if (!demonSeat(s) && twinsBlock(s)) return false;
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
  | { kind: 'plague'; ability: RoleId; to?: number; baron?: { seat: number; role: RoleId }[]; marionette?: number }
  | { kind: 'sailor'; target: number; drunk: number }
  | { kind: 'innkeeper'; picks: [number, number]; drunk: number }
  | { kind: 'gambler'; target: number; role: RoleId }
  | { kind: 'grandmother'; seat: number; role: RoleId; truth: boolean }
  | { kind: 'courtier'; role: RoleId | null }
  | { kind: 'shabaloth'; picks: number[]; revive: number | null }
  | { kind: 'po'; picks: number[] }
  | { kind: 'philo'; role: RoleId | null }
  | { kind: 'sage'; picks: [number, number]; truth: boolean }
  | { kind: 'cere'; target: number; role: RoleId }
  | { kind: 'pithag'; target: number; role: RoleId; deaths: number[]; noKill: boolean }
  | { kind: 'vigor'; target: number; poison: number | null }
  | { kind: 'seats'; seats: number[]; truth: boolean; twist?: boolean }
  | { kind: 'direction'; cw: boolean; truth: boolean; twist?: boolean }
  | { kind: 'nightwatch'; target: number | null }
  | { kind: 'farmer'; to: number }
  | { kind: 'huntsman'; target: number | null; become?: RoleId }
  | { kind: 'hatter'; changes: { seat: number; role: RoleId }[] }
  | { kind: 'wish'; text: string | null };

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
    case 'cere':
    case 'pithag':
    case 'vigor':
      return [p.target];
    case 'nightwatch':
    case 'huntsman':
      return p.target ? [p.target] : [];
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
  const g = s.seats.find((x) => x.role === 'goon' && x.alive && picks.includes(x.n) && x.n !== actor.n && !malfunction(s, x.n));
  return g;
}

/** 恶魔杀人会怎样（不改状态）：僧侣、士兵挡下，再看茶艺师/弄臣等 */
export function demonKillPreview(s: GameState, n: number): { dies: boolean; text: string } {
  const x = seatOf(s, n);
  if (x.alive && s.ns?.monk === n) return { dies: false, text: `${seatName(n)} 今晚受到僧侣保护，不会死。` };
  if (x.alive && x.role === 'soldier' && !malfunction(s, n)) return { dies: false, text: `${seatName(n)} 是士兵，恶魔杀不死他。` };
  return killPreview(s, n);
}

/** 恶魔杀人：僧侣、士兵挡下；孙子被恶魔杀死时祖母也死 */
function demonKill(s: GameState, n: number, cause = '被恶魔杀死'): boolean {
  const pv = demonKillPreview(s, n);
  if (!pv.dies && (s.ns?.monk === n || seatOf(s, n).role === 'soldier')) {
    addLog(s, 'night', pv.text);
    return false;
  }
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
  const diedTonight = s.phase === 'night' && x.death?.when === 'night' && x.death.night === s.night;
  x.alive = true;
  delete x.death;
  if (s.ns) {
    s.ns.deaths = s.ns.deaths.filter((m) => m !== n);
    if (!diedTonight) s.ns.revived = [...(s.ns.revived ?? []), n];
  }
  addLog(s, s.phase === 'night' ? 'night' : 'day', `${seatName(n)} ${why}，复活了`);
}

function infoStat(s: GameState, truth: boolean, twist?: boolean) {
  if (truth && !twist) s.infoTrue += 1;
  else s.infoFalse += 1;
}
const expose = (s: GameState, n: number, k = 1) => (s.exposure[n] = (s.exposure[n] ?? 0) + k);

/** 失忆者那一步实际用的是哪个能力；哲学家后来的夜晚获得只在第一晚用的能力时，在他这一步马上用 */
export const effectiveSlot = (s: GameState, slot: SlotId): SlotId =>
  slot === 'amnesiac' && s.amnesiacAbility ? (s.amnesiacAbility as SlotId) : slot === 'philosopher' && s.ns?.philoNow ? (s.ns.philoNow as SlotId) : slot;

/** 数学家：记下一个没正常生效的能力 */
function abnormal(s: GameState, n: number, why: string) {
  if (!s.abnormal.some((a) => a.seat === n && a.why === why)) s.abnormal.push({ seat: n, why });
}

/** 这一步他真的用了能力吗（不用、不选人的不算） */
function usedAbility(p: SlotPayload): boolean {
  switch (p.kind) {
    case 'none':
      return false;
    case 'courtier':
    case 'philo':
      return !!p.role;
    case 'nightwatch':
    case 'huntsman':
      return !!p.target;
    case 'hatter':
      return p.changes.length > 0;
    case 'wish':
      return !!p.text;
    case 'seamstress':
      return !!p.picks;
    case 'po':
    case 'hadikhia':
      return p.picks.length > 0;
    default:
      return true;
  }
}

/** 数学家：这一步的能力有没有正常生效（假信息、被登记误导、中毒醉酒导致没效果） */
function noteAbnormal(s: GameState, actor: Seat | undefined, eff: SlotId, p: SlotPayload) {
  if (!actor || eff === 'mathematician' || eff === 'lunatic' || !usedAbility(p)) return;
  const name = ROLES[eff as RoleId] ? roleName(eff as RoleId) : '';
  if ('truth' in p) {
    if (!p.truth) abnormal(s, actor.n, `${seatName(actor.n)}${name}拿到了假信息`);
    else if ('twist' in p && p.twist) abnormal(s, actor.n, `${seatName(actor.n)}${name}的信息被间谍/陌客的登记影响了`);
    return;
  }
  if (malfunction(s, actor.n)) abnormal(s, actor.n, `${seatName(actor.n)}${name}中毒/醉酒，能力没生效`);
}

export function completeSlot(s: GameState, p: SlotPayload) {
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const ns = s.ns!;
  const eff = effectiveSlot(s, slot);
  const tagWho = (x: Seat) =>
    x.role === 'drunk' ? '（其实是酒鬼）' : x.role === 'marionette' ? '（其实是提线木偶）' : x.role === 'cannibal' ? '（食人族）' : x.role === 'pixie' ? '（小精灵）' : x.role === 'amnesiac' ? '（失忆者）' : x.role === 'alchemist' && slot !== 'alchemist' ? '（炼金术士）' : x.role === 'philosopher' && eff !== 'philosopher' ? '（哲学家）' : '';
  const who = actor ? `${seatName(actor.n)}${tagWho(actor)}` : '';
  const tag = (truth: boolean, twist?: boolean) => (!truth ? '（假信息）' : twist ? '（合规误导）' : '（真实信息）');
  if (!ns.ran) ns.ran = [];
  if (!ns.ran.includes(ns.slot)) ns.ran.push(ns.slot);
  // 哲学家选了能力：只在第一晚用的能力（钟表匠等）当晚马上用，这一步先不结束
  if (slot === 'philosopher' && p.kind === 'philo' && actor) {
    philosopherChoose(s, actor, p.role);
    if (p.role && s.night > 1 && firstNightOnly(p.role) && !malfunction(s, actor.n)) {
      ns.philoNow = p.role;
      return;
    }
  }
  // 莽夫：今晚第一个用能力选他的人当场醉酒（这次能力无效），莽夫变成他的阵营
  const goon = goonTriggered(s, actor, chosenSeats(p), slot);
  if (goon && actor) {
    ns.goonHit = true;
    s.tempDrunk.push({ seat: actor.n, from: s.night, to: s.night, why: '选了莽夫' });
    const was = isEvil(goon);
    setAlignment(goon, isEvil(actor));
    // 阵营变了要单独叫醒莽夫告知（网页会弹出一步，不让说书人漏掉）
    if (was !== isEvil(goon)) ns.goonInform = { seat: goon.n, evil: isEvil(goon) };
    addLog(s, 'night', `${seatName(actor.n)} 选了莽夫（${seatName(goon.n)}）：醉酒到明天黄昏，这次能力无效${was !== isEvil(goon) ? `；莽夫变成${isEvil(goon) ? '邪恶' : '善良'}阵营` : ''}`);
  }
  if (eff !== 'philosopher' || p.kind !== 'philo') noteAbnormal(s, actor, eff, p);
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
      // 数学家从天亮重新数
      s.abnormal = [];
      s.phase = s.winner ? 'end' : 'day';
      return;
    }
    case 'minionInfo': {
      const mg = magicianSeat(s);
      addLog(s, 'night', `爪牙得知恶魔是 ${seatName(demonSeat(s)?.n)}${mg ? `（魔术师 ${seatName(mg.n)} 也被指为恶魔）` : ''}`);
      break;
    }
    case 'demonInfo': {
      const mg = magicianSeat(s);
      addLog(
        s, 'night',
        poppyActive(s)
          ? `罂粟种植者在场：恶魔只得知伪装角色 ${s.bluffs.map(roleName).join('、')}`
          : `恶魔得知爪牙：${minionSeats(s).map((x) => `${seatName(x.n)}`).join('、') || '没有（只有提线木偶）'}${mg ? `（魔术师 ${seatName(mg.n)} 也被指为爪牙）` : ''}；伪装角色：${s.bluffs.map(roleName).join('、')}`,
      );
      break;
    }
    case 'poppygrower':
      s.poppyResolved = true;
      addLog(s, 'night', `罂粟种植者死了：爪牙得知恶魔是 ${seatName(demonSeat(s)?.n)}，恶魔得知爪牙 ${minionSeats(s).map((x) => seatName(x.n)).join('、') || '（无）'}`);
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
        addLog(s, 'night', `${roleName(eff)} ${who} 选了 ${seatName(p.target)}：明天他的票${eff === 'bureaucrat' ? '算 3 票' : '算负数'}${ok ? '' : failNote(s, actor!.n)}`);
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
        addLog(s, 'night', `魔鬼代言人 ${who} 保护了 ${seatName(p.target)}：明天被处决不会死${ok ? '' : failNote(s, actor!.n)}`);
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
        addLog(s, 'night', `${eff === 'stHarpy' ? '说书人（鹰身女妖能力）' : `鹰身女妖 ${who}`}：${seatName(p.mad)} 明天要疯狂地证明 ${seatName(p.second)} 是邪恶的${ok ? '' : failNote(s, actor!.n)}`);
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
        } else if (p.ability === 'baron' && p.baron) {
          for (const b of p.baron) {
            const x = seatOf(s, b.seat);
            x.role = b.role;
            x.used = false;
          }
          addLog(s, 'night', `瘟疫医生死了，说书人获得男爵的能力（相克规则）：${p.baron.map((b) => `${seatName(b.seat)} 变成${roleName(b.role)}`).join('，')}，已告知他们`);
        } else if (p.ability === 'marionette' && p.marionette) {
          const x = seatOf(s, p.marionette);
          s.marionetteFake = x.role;
          x.role = 'marionette';
          delete x.alignment;
          addLog(s, 'night', `瘟疫医生死了，说书人获得提线木偶的能力（相克规则）：${seatName(x.n)} 变成提线木偶（他以为自己还是${roleName(s.marionetteFake)}），已告知恶魔`);
        } else {
          s.stAbility = p.ability;
          addLog(s, 'night', `瘟疫医生死了：说书人获得【${roleName(p.ability)}】的能力`);
        }
      }
      break;
    case 'clockmaker':
    case 'mathematician':
    case 'oracle':
    case 'juggler':
      if (p.kind === 'number') {
        infoStat(s, p.truth, p.twist);
        addLog(s, 'night', `${roleName(eff)} ${who}：${p.num}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'towncrier':
      if (p.kind === 'yesno') {
        infoStat(s, p.truth);
        addLog(s, 'night', `城镇公告员 ${who}：今天${p.yes ? '有' : '没有'}爪牙提名${tag(p.truth)}`, p.truth);
      }
      break;
    case 'sage':
      if (p.kind === 'sage') {
        infoStat(s, p.truth);
        addLog(s, 'night', `贤者 ${who} 得知恶魔是 ${seatName(p.picks[0])} 或 ${seatName(p.picks[1])}${tag(p.truth)}`, p.truth);
      }
      break;
    case 'snakecharmer':
      if (p.kind === 'target') {
        const d = seatOf(s, p.target);
        const hit = !malfunction(s, actor!.n) && teamOf(d.role) === 'demon' && d.alive;
        addLog(s, 'night', `舞蛇人 ${who} 选择了 ${seatName(p.target)}${hit ? '：是恶魔！' : '：什么都没有发生'}`);
        if (hit) snakeSwap(s, actor!, d);
      }
      break;
    case 'philosopher':
      // 哲学家当晚马上用的能力在上面按那个能力结算；这里只是"不用"或已经选好
      break;
    case 'eviltwin':
      addLog(s, 'night', `镜像双子 ${who} 和善良的双子 ${seatName(s.twin)} 互相认识了`);
      break;
    case 'witch':
      if (p.kind === 'target') {
        const ok = !malfunction(s, actor!.n);
        s.witchCurse = ok ? { seat: p.target, night: s.night } : null;
        addLog(s, 'night', `女巫 ${who} 诅咒了 ${seatName(p.target)}：明天他提名就会死${ok ? '' : failNote(s, actor!.n)}`);
      }
      break;
    case 'cerenovus':
      if (p.kind === 'cere') {
        const ok = !malfunction(s, actor!.n);
        s.cereMad = ok ? { seat: p.target, role: p.role, night: s.night } : null;
        addLog(s, 'night', `洗脑师 ${who}：${seatName(p.target)} 明天要疯狂地证明自己是${roleName(p.role)}${ok ? '' : failNote(s, actor!.n)}`);
      }
      break;
    case 'pithag':
      if (p.kind === 'pithag') resolvePithag(s, actor!, p);
      break;
    case 'fanggu':
      if (p.kind === 'target') resolveFanggu(s, actor!, p.target);
      break;
    case 'nodashii':
      if (p.kind === 'target') {
        addLog(s, 'night', `诺-达鲺 ${seatName(actor!.n)} 选择了 ${seatName(p.target)}`);
        if (malfunction(s, actor!.n)) addLog(s, 'night', '诺-达鲺中毒/醉酒：没有人死');
        else demonKill(s, p.target);
      }
      break;
    case 'vigormortis':
      if (p.kind === 'vigor') {
        addLog(s, 'night', `亡骨魔 ${seatName(actor!.n)} 选择了 ${seatName(p.target)}`);
        if (malfunction(s, actor!.n)) addLog(s, 'night', '亡骨魔中毒/醉酒：没有人死');
        else {
          const x = seatOf(s, p.target);
          const minion = teamOf(x.role) === 'minion';
          if (demonKill(s, p.target) && minion) {
            s.vigor.push({ minion: p.target, poisoned: p.poison ?? 0 });
            addLog(s, 'night', `爪牙 ${seatLabel(s, p.target)} 被亡骨魔杀死：保留能力${p.poison ? `，${seatName(p.poison)} 中毒` : ''}`);
          }
        }
      }
      break;
    case 'steward':
    case 'knight':
    case 'noble':
    case 'highpriestess':
    case 'choirboy':
      if (p.kind === 'seats') {
        infoStat(s, p.truth, p.twist);
        const what = { steward: '是善良的', knight: '都不是恶魔', noble: '中恰好一人邪恶', highpriestess: '：最该去聊的人', choirboy: '：杀死国王的恶魔' }[eff];
        addLog(s, 'night', `${roleName(eff)} ${who} 得知 ${p.seats.map((n) => seatName(n)).join('、')}${what}${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'shugenja':
      if (p.kind === 'direction') {
        infoStat(s, p.truth, p.twist);
        addLog(s, 'night', `修行者 ${who}：最近的邪恶玩家在${p.cw ? '顺时针' : '逆时针'}方向${tag(p.truth, p.twist)}`, p.truth && !p.twist);
      }
      break;
    case 'king':
      if (s.night === 1) addLog(s, 'night', `恶魔得知国王是 ${seatName(s.seats.find((x) => x.role === 'king')?.n)}`);
      else if (p.kind === 'role') {
        infoStat(s, p.truth);
        addLog(s, 'night', `国王 ${who} 得知【${roleName(p.role)}】还活着${tag(p.truth)}`, p.truth);
      }
      break;
    case 'nightwatchman':
      if (p.kind === 'nightwatch') {
        if (!p.target) addLog(s, 'night', `守夜人 ${who} 今晚不用能力`);
        else {
          actor!.used = true;
          const ok = !malfunction(s, actor!.n);
          addLog(s, 'night', `守夜人 ${who} 选择了 ${seatName(p.target)}${ok ? `：${seatName(p.target)} 得知守夜人是 ${seatName(actor!.n)}` : '（中毒/醉酒：那人没有被叫醒）'}`);
        }
      }
      break;
    case 'farmer':
      if (p.kind === 'farmer') {
        const x = seatOf(s, p.to);
        const from = x.role;
        x.role = 'farmer';
        x.used = false;
        delete s.gained[x.n];
        s.roleSince[x.n] = s.night;
        addLog(s, 'night', `农夫 ${seatName(actor!.n)} 夜里死了：${seatName(x.n)}（原${roleName(from)}）变成农夫，已告知他`);
      }
      break;
    case 'acrobat':
      if (p.kind === 'target') {
        ns.acrobat = [...(ns.acrobat ?? []), { actor: actor!.n, target: p.target }];
        addLog(s, 'night', `杂技演员 ${who} 选择了 ${seatName(p.target)}（天亮前他醉酒或中毒，杂技演员就死）`);
      }
      break;
    case 'preacher':
      if (p.kind === 'target') {
        const x = seatOf(s, p.target);
        const hit = !malfunction(s, actor!.n) && teamOf(x.role) === 'minion';
        if (hit && !s.preached.includes(x.n)) s.preached.push(x.n);
        addLog(s, 'night', `传教士 ${who} 选择了 ${seatName(p.target)}${hit ? '：是爪牙，他失去能力，已告知他' : ''}`);
      }
      break;
    case 'huntsman':
      if (p.kind === 'huntsman') {
        if (!p.target) addLog(s, 'night', `巡山人 ${who} 今晚不用能力`);
        else {
          actor!.used = true;
          const x = seatOf(s, p.target);
          const hit = !malfunction(s, actor!.n) && x.role === 'damsel' && !!p.become;
          if (hit) {
            x.role = p.become!;
            s.roleSince[x.n] = s.night;
          }
          addLog(s, 'night', `巡山人 ${who} 选择了 ${seatName(p.target)}${hit ? `：她是落难少女，变成了${roleName(p.become!)}，已告知她` : '：什么都没有发生'}`);
        }
      }
      break;
    case 'damsel':
      addLog(s, 'night', `爪牙得知落难少女在场`);
      break;
    case 'snitch':
      addLog(s, 'night', `告密者在场：爪牙得知伪装角色 ${s.bluffs.map(roleName).join('、')}`);
      break;
    case 'ogre':
      if (p.kind === 'target') {
        const evil = isEvil(seatOf(s, p.target));
        setAlignment(actor!, evil);
        addLog(s, 'night', `食人魔 ${who} 选择了 ${seatName(p.target)}：食人魔变成${evil ? '邪恶' : '善良'}阵营（他自己不知道）`);
      }
      break;
    case 'qutler':
      if (p.kind === 'target') {
        s.qutlerMaster = p.target;
        addLog(s, 'night', `Q宝 ${who} 选择 ${seatName(p.target)} 当主人`);
      }
      break;
    case 'hatter':
      s.hatterResolved = true;
      if (p.kind === 'hatter' && p.changes.length) {
        for (const c of p.changes) {
          const x = seatOf(s, c.seat);
          x.role = c.role;
          x.used = false;
          s.roleSince[x.n] = s.night;
        }
        addLog(s, 'night', `帽匠死了：${p.changes.map((c) => `${seatName(c.seat)} 换成${roleName(c.role)}`).join('，')}`);
      } else addLog(s, 'night', '帽匠死了：邪恶都没有换角色');
      break;
    case 'boffin':
      addLog(s, 'night', `科学怪人 ${who} 和恶魔得知：恶魔拥有【${roleName(s.boffinAbility!)}】的能力`);
      break;
    case 'wizard':
      if (p.kind === 'wish') {
        if (!p.text) addLog(s, 'night', `巫师 ${who} 今晚不许愿`);
        else {
          actor!.used = true;
          addLog(s, 'night', `巫师 ${who} 许愿：「${p.text}」${malfunction(s, actor!.n) ? '（中毒/醉酒：愿望不会实现）' : ''}`);
        }
      }
      break;
    case 'organgrinder':
      if (p.kind === 'yesno') {
        if (p.yes) s.tempDrunk.push({ seat: actor!.n, from: s.night, to: s.night, why: '街头风琴手自己' });
        addLog(s, 'night', `街头风琴手 ${who}：${p.yes ? '选择醉酒到明天黄昏（明天投票正常睁眼）' : '保持清醒（明天投票要闭眼、票数保密）'}`);
      }
      break;
    case 'mezepheles':
      if (s.night === 1) addLog(s, 'night', `灵言师 ${who} 得知秘密词「${s.mezeWord}」`);
      else if (s.mezeTarget !== null) {
        const t = seatOf(s, s.mezeTarget);
        const ok = !malfunction(s, actor!.n) && !isEvil(t);
        if (ok) setAlignment(t, true);
        addLog(s, 'night', `说出秘密词的 ${seatName(t.n)} ${ok ? '变成邪恶，已告知他' : '没有变（灵言师中毒/醉酒）'}；灵言师的能力用掉了`);
        s.mezeUsed = true;
        s.mezeTarget = null;
      }
      break;
    case 'dusk':
      break;
  }
  if (slot === 'philosopher') ns.philoNow = undefined;
  advance(s);
}

/* ---------------- 梦殒春宵 ---------------- */

/** 哲学家选一个善良角色：获得能力；角色在场的话那个人醉酒。选的时候中毒/醉酒：这次用掉了，但他以为获得了 */
function philosopherChoose(s: GameState, actor: Seat, role: RoleId | null) {
  if (!role) {
    addLog(s, 'night', `哲学家 ${seatName(actor.n)} 今晚不用能力`);
    return;
  }
  actor.used = true;
  const healthy = !malfunction(s, actor.n);
  s.gained[actor.n] = role;
  const holder = s.seats.find((x) => x.role === role && x.n !== actor.n);
  if (!healthy) s.tempDrunk.push({ seat: actor.n, from: s.night, to: 999, why: '哲学家选能力时中毒/醉酒' });
  else if (holder) s.philoDrunk = holder.n;
  if (role === 'juggler') s.juggler = { seat: actor.n, since: s.night };
  addLog(
    s, 'night',
    `哲学家 ${seatName(actor.n)} 选择了【${roleName(role)}】：获得这个能力${!healthy ? '（他中毒/醉酒：能力其实没获得，之后照常叫醒、给假信息）' : holder ? `；${seatLabel(s, holder.n)} 醉酒` : ''}`,
  );
}

/** 舞蛇人选中恶魔：交换角色和阵营，前恶魔（现在的舞蛇人）一直中毒 */
function snakeSwap(s: GameState, sc: Seat, d: Seat) {
  const [scEvil, dEvil] = [isEvil(sc), isEvil(d)];
  const scRole = sc.role;
  sc.role = d.role;
  d.role = scRole;
  setAlignment(sc, dEvil);
  setAlignment(d, scEvil);
  // 拥有舞蛇人能力的哲学家：能力跟着角色走
  if (s.gained[sc.n]) {
    s.gained[d.n] = s.gained[sc.n];
    delete s.gained[sc.n];
  }
  s.snakePoisoned.push(d.n);
  addLog(s, 'night', `${seatName(sc.n)} 变成邪恶的${roleName(sc.role)}；${seatName(d.n)} 变成善良的${roleName(d.role)}，从此一直中毒`);
}

/** 麻脸巫婆不能造的角色：酒鬼、疯子这类要另配假身份的，镜像双子要另配双子 */
export const PITHAG_UNSUPPORTED: RoleId[] = ['drunk', 'lunatic', 'marionette', 'eviltwin', 'lilmonsta'];

/** 麻脸巫婆能不能把 target 变成 role；不能就给出原因 */
export function pithagBlock(s: GameState, target: number, role: RoleId): string | null {
  const x = seatOf(s, target);
  if (inPlay(s, role)) return `【${roleName(role)}】已经在场：什么都不会发生。`;
  if (PITHAG_UNSUPPORTED.includes(role)) return `网页暂不支持把人变成【${roleName(role)}】。`;
  if (teamOf(role) === 'demon') {
    if (!x.alive) return '网页暂不支持把死人变成恶魔。';
    if (!isEvil(x)) return '网页暂不支持同时有两个恶魔：不能把善良玩家变成恶魔。';
  }
  return null;
}

function resolvePithag(s: GameState, actor: Seat, p: { target: number; role: RoleId; deaths: number[]; noKill: boolean }) {
  const x = seatOf(s, p.target);
  addLog(s, 'night', `麻脸巫婆 ${seatName(actor.n)} 选择了 ${seatName(p.target)} 和【${roleName(p.role)}】`);
  if (malfunction(s, actor.n)) {
    addLog(s, 'night', `麻脸巫婆${failNote(s, actor.n)}：什么都没有发生`);
    return;
  }
  const block = pithagBlock(s, p.target, p.role);
  if (block) {
    addLog(s, 'night', block);
    return;
  }
  const oldDemon = demonSeat(s);
  const wasDemon = isDemonSeat(s, p.target);
  const evil = isEvil(x);
  const from = x.role;
  x.role = p.role;
  x.used = false;
  delete s.gained[x.n];
  setAlignment(x, evil);
  if (p.role === 'juggler') s.juggler = { seat: x.n, since: s.night };
  addLog(s, 'night', `${seatName(x.n)} 从${roleName(from)}变成了${roleName(p.role)}（仍是${evil ? '邪恶' : '善良'}阵营）`);
  if (teamOf(p.role) !== 'demon') return;
  // 造出了恶魔：今晚谁死由说书人决定
  if (!wasDemon && oldDemon && oldDemon.n !== x.n) kill(s, oldDemon.n, 'night', '麻脸巫婆造了新恶魔，原来的恶魔死亡', true);
  for (const n of p.deaths) kill(s, n, 'night', '麻脸巫婆造了新恶魔，说书人决定他死亡', true);
  if (p.noKill) {
    s.ns!.noDemonKill = true;
    addLog(s, 'night', '说书人决定：今晚恶魔杀人无效');
  }
}

/** 方古杀人：第一次杀死外来者时跳到他身上 */
export function fangguJumps(s: GameState, target: number): boolean {
  const t = seatOf(s, target);
  const fg = demonSeat(s);
  return !s.fangguJumped && !!fg && fg.n !== target && teamOf(t.role) === 'outsider' && demonKillPreview(s, target).dies;
}

function resolveFanggu(s: GameState, fg: Seat, target: number) {
  addLog(s, 'night', `方古 ${seatName(fg.n)} 选择了 ${seatName(target)}`);
  if (malfunction(s, fg.n)) {
    addLog(s, 'night', '方古中毒/醉酒：没有人死');
    return;
  }
  if (!fangguJumps(s, target)) {
    demonKill(s, target);
    return;
  }
  const t = seatOf(s, target);
  s.fangguJumped = true;
  t.role = 'fanggu';
  delete t.alignment;
  kill(s, fg.n, 'night', '方古跳到外来者身上，原来的方古死亡', true);
  addLog(s, 'night', `${seatName(target)}（外来者）变成了邪恶的方古，原来的方古 ${seatName(fg.n)} 代替他死亡`);
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
  /** 精神病患者被处决：猜拳他没输，不死 */
  psychoSurvives?: boolean;
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

/** 和平主义者在场：被处决的善良玩家可以不死（本来就不会死的人不用再选） */
export function pacifistCanSave(s: GameState, n: number): boolean {
  const pc = s.seats.find((x) => x.role === 'pacifist' && x.alive);
  return !!pc && !malfunction(s, pc.n) && !isEvil(seatOf(s, n)) && !deathShield(s, n) && !advocateSaves(s, n);
}

/** 能力失效时，日志里写清是中毒还是醉酒 */
const failNote = (s: GameState, n: number) => `（${isPoisoned(s, n) ? '中毒' : '醉酒'}，无效）`;

/** 处决至少需要的票数：存活玩家（含旅行者）的一半，向上取整 */
export const voteNeed = (s: GameState) => Math.ceil(aliveVoters(s) / 2);

export type NomResult = 'short' | 'lower' | 'block' | 'beaten' | 'tie';
export interface NomRow {
  /** 在 s.noms 里的下标（删除用） */
  i: number;
  seat: number;
  votes: number;
  need: number;
  result: NomResult;
}

/**
 * 按顺序判定今天的提名：票数够、而且比之前的最高票多 → 成为待处决（之前的人被换下）；
 * 和最高票打平 → 都不处决，之后要比这个票数多才能再上去。
 */
export function nomResults(s: GameState): { rows: NomRow[]; block: number | null; top: number } {
  const rows: NomRow[] = [];
  s.noms.forEach((x, i) => {
    if (x.day === s.night) rows.push({ i, seat: x.seat, votes: x.votes, need: x.need, result: 'short' });
  });
  let top = 0;
  let lead: NomRow[] = [];
  for (const r of rows) {
    if (r.votes < r.need) continue;
    if (r.votes > top) {
      for (const p of lead) p.result = 'beaten';
      top = r.votes;
      lead = [r];
      r.result = 'block';
    } else if (r.votes === top) {
      lead.push(r);
      for (const p of lead) p.result = 'tie';
    } else r.result = 'lower';
  }
  return { rows, block: lead.length === 1 ? lead[0].seat : null, top };
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
  // 炸弹人被处决（死不死都算）：爆炸，在白天结果页结算
  if (n !== null && seatOf(s, n).role === 'boomdandy' && !malfunction(s, n)) s.boomPending = true;
  // 镜像双子：善良的双子被处决，邪恶获胜
  if (n !== null && n === s.twin && twinActive(s) && !isEvil(seatOf(s, n))) {
    const x = seatOf(s, n);
    if (x.alive) kill(s, n, 'day', cause);
    addLog(s, 'day', `${seatLabel(s, n)} ${cause}`);
    return win(s, 'evil', `善良的双子 ${seatName(n)} 被处决`, 'day');
  }
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
  if (st.role === 'psychopath' && !malfunction(s, n) && opts.psychoSurvives) {
    addLog(s, 'day', `${seatLabel(s, n)} 被处决，但猜拳没输，没有死`);
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

/** 镜像双子的能力在：他活着（或被亡骨魔杀死）且健康 */
export function twinActive(s: GameState): boolean {
  const e = s.seats.find((x) => x.role === 'eviltwin' && abilityAlive(s, x));
  return !!e && !!s.twin && !malfunction(s, e.n) && isEvil(e) !== isEvil(seatOf(s, s.twin));
}

/* ---------------- 梦殒春宵：白天 ---------------- */

/** 精神病患者白天公开杀人（提名开始前，每天一次） */
export function psychoKill(s: GameState, pN: number, target: number) {
  s.psychoDay = s.night;
  addLog(s, 'day', `精神病患者（${seatName(pN)}）公开选择了 ${seatName(target)}`);
  if (malfunction(s, pN)) addLog(s, 'day', '精神病患者中毒/醉酒：什么都没有发生');
  else dayDeath(s, target, '被精神病患者当众杀死');
}

/** 维齐尔下令立即处决刚才被提名的人（有善良玩家投了票） */
export function vizierExecute(s: GameState, vN: number, n: number) {
  addLog(s, 'day', `维齐尔（${seatName(vN)}）下令立即处决 ${seatName(n)}`);
  execute(s, n, '被维齐尔下令立即处决');
}

/** 善良玩家说出了灵言师的秘密词 */
export function mezeSaid(s: GameState, n: number) {
  s.mezeTarget = n;
  addLog(s, 'day', `${seatName(n)} 说出了灵言师的秘密词「${s.mezeWord}」：今晚他会变成邪恶`);
}

/** 炸弹人爆炸：除三名幸存者外的活人都死；然后被指得最多的人死（平票没人死） */
export function boomResolve(s: GameState, survivors: number[], pointed: number | null) {
  s.boomPending = false;
  addLog(s, 'day', `炸弹人爆炸：只留下 ${survivors.map((n) => seatName(n)).join('、')}`);
  for (const x of s.seats) if (x.alive && !survivors.includes(x.n)) kill(s, x.n, 'day', '炸弹人爆炸', true);
  if (pointed !== null) dayDeath(s, pointed, '炸弹人爆炸后被最多人指着');
  else addLog(s, 'day', '倒数结束：平票，没有人死');
  checkWin(s, 'day');
}

/** 魔像提名了一个人：不是恶魔就死（整局一次） */
export function golemNominates(s: GameState, golemN: number, nominee: number, recluseAsDemon = false) {
  const gm = seatOf(s, golemN);
  gm.used = true;
  const x = seatOf(s, nominee);
  const demon = isDemonSeat(s, nominee) || (x.role === 'recluse' && recluseAsDemon);
  addLog(s, 'day', `魔像（${seatName(golemN)}）提名了 ${seatName(nominee)}`);
  if (malfunction(s, golemN)) addLog(s, 'day', '魔像中毒/醉酒：什么都没有发生');
  else if (demon) addLog(s, 'day', '被提名的是恶魔：什么都没有发生，照常投票');
  else dayDeath(s, nominee, '被魔像提名，死亡');
}

/** 爪牙公开猜落难少女：猜中邪恶获胜；整局只算一次 */
export function damselGuess(s: GameState, minionN: number, guess: number) {
  if (s.damselGuessed) return;
  s.damselGuessed = true;
  const d = s.seats.find((x) => x.role === 'damsel');
  const right = !!d && d.n === guess && d.alive && !malfunction(s, d.n) && teamOf(seatOf(s, minionN).role) === 'minion';
  addLog(s, 'day', `${seatName(minionN)} 公开猜 ${seatName(guess)} 是落难少女：${right ? '猜中了' : '没猜中，之后再猜也没用'}`);
  if (right) win(s, 'evil', `爪牙（${seatName(minionN)}）猜中了落难少女 ${seatName(guess)}`, 'day');
}

/** 解谜大师猜谁是醉酒的人：说书人告诉他一个人（猜对是恶魔，猜错是别人） */
export function puzzleGuess(s: GameState, puzzleN: number, guess: number, shown: number) {
  s.puzzleGuessed = true;
  const right = guess === s.puzzleDrunk;
  addLog(s, 'day', `解谜大师（${seatName(puzzleN)}）猜 ${seatName(guess)} 醉酒：${right ? '猜对了' : '猜错了'}；告诉他 ${seatName(shown)}${right && !malfunction(s, puzzleN) ? '（恶魔）' : '（假信息）'}`);
}

/** 被女巫诅咒的人提名了：他死亡（提名照常） */
export function witchStrikes(s: GameState) {
  const c = s.witchCurse;
  if (!c) return;
  s.witchCurse = null;
  if (teamOf(seatOf(s, c.seat).role) === 'minion') s.minionNominatedDay = s.night;
  dayDeath(s, c.seat, '被女巫诅咒，提名后死亡');
}

/** 城镇公告员：白天记下有爪牙提名过 */
export function setMinionNominated(s: GameState, yes: boolean) {
  s.minionNominatedDay = yes ? s.night : 0;
  addLog(s, 'day', yes ? '今天有爪牙提名过（城镇公告员）' : '改为：今天没有爪牙提名');
}

/** 洗脑师：被洗脑的人没做到疯狂，说书人处决他（算今天的处决）；不处决就只记一笔 */
export function cereVerdict(s: GameState, punish: boolean) {
  const m = s.cereMad;
  if (!m) return;
  s.cereMad = null;
  if (!punish) {
    addLog(s, 'day', `洗脑师：${seatName(m.seat)} 不受罚`);
    return;
  }
  execute(s, m.seat, `没有疯狂地证明自己是${roleName(m.role)}，被处决（洗脑师）`);
}

/** 杂耍艺人公开猜了几个人的角色：算出猜对几个（间谍/陌客可以由说书人改判） */
export function jugglerCount(s: GameState, guesses: { seat: number; role: RoleId }[]): number {
  return guesses.filter((g) => seatOf(s, g.seat).role === g.role).length;
}

export function jugglerGuess(s: GameState, n: number, guesses: { seat: number; role: RoleId }[], correct: number) {
  s.juggler = { seat: n, since: s.juggler?.seat === n ? s.juggler.since : s.night, day: s.night, guesses, correct };
  addLog(s, 'day', `杂耍艺人（${seatName(n)}）公开猜：${guesses.map((g) => `${seatName(g.seat)}是${roleName(g.role)}`).join('，') || '没有猜'}；猜对 ${correct} 个`);
}

/** 杂耍艺人今天能猜吗：他成为杂耍艺人后的第一个白天，还没猜过 */
export function jugglerCanGuess(s: GameState, n: number): boolean {
  const j = s.juggler;
  if (!j || j.seat !== n) return s.night === 1 && !j;
  return j.day === undefined && j.since === s.night;
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

/** 叫醒莽夫告诉他新阵营：说书人做完了 */
export function goonInformed(s: GameState) {
  if (s.ns?.goonInform) {
    addLog(s, 'night', `已叫醒莽夫（${seatName(s.ns.goonInform.seat)}），告诉他现在是${s.ns.goonInform.evil ? '邪恶' : '善良'}阵营`);
    s.ns.goonInform = undefined;
  }
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

