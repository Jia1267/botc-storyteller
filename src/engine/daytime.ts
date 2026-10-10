import { ROLES, TEAM_NAME, roleName, type Team } from './roles';
import type { Choice } from './balance';
import { inPlay, isDemonSeat, isEvil, malfunction, mustLie, scriptOf, seatOf } from './core';
import { BALLOON_TYPES, chefCount } from './info';
import { pick, shuffle, type Rng } from './rng';
import type { GameState } from './types';

interface Stmt {
  text: string;
  truth: boolean;
  /** 真话直接指向邪恶 */
  strong: boolean;
  /** 假话把某个具体的人阵营说反了（好人说成邪恶 / 邪恶说成好人）：重度误导 */
  harsh?: boolean;
}

const typeOf = (s: GameState, n: number): Team => (isDemonSeat(s, n) ? 'demon' : ROLES[seatOf(s, n).role].team);

/** 座位上的左右邻居（不管死活） */
const seatNeighbors = (s: GameState, n: number) => [((n - 2 + s.count) % s.count) + 1, (n % s.count) + 1];

/** 从魔典生成一堆可以说的陈述，每条都知道真假 */
export function statements(s: GameState, actorN: number, rng: Rng): Stmt[] {
  const out: Stmt[] = [];
  const others = s.seats.filter((x) => x.n !== actorN).map((x) => x.n);
  for (let i = 0; i < 6; i++) {
    const [a, b] = shuffle(others, rng);
    const truth = isEvil(seatOf(s, a)) || isEvil(seatOf(s, b));
    out.push({ text: `${Math.min(a, b)}号 和 ${Math.max(a, b)}号 之中至少有一个是邪恶玩家`, truth, strong: false });
  }
  for (let i = 0; i < 6; i++) {
    const x = pick(others, rng);
    const real = typeOf(s, x);
    const claim = rng() < 0.5 ? real : pick(BALLOON_TYPES.filter((t) => t !== real), rng);
    const evilT = (t: Team) => t === 'minion' || t === 'demon';
    out.push({
      text: `${x}号 是${TEAM_NAME[claim]}`, truth: claim === real, strong: claim === real && evilT(real),
      harsh: claim !== real && evilT(claim) !== evilT(real),
    });
  }
  const outs = s.seats.filter((x) => ROLES[x.role].team === 'outsider').length;
  const k = rng() < 0.5 ? outs : Math.max(0, outs + (rng() < 0.5 ? 1 : -1));
  out.push({ text: `场上有 ${k} 个外来者`, truth: k === outs, strong: false });
  const d = s.seats.find((x) => isDemonSeat(s, x.n));
  if (d) {
    const odd = rng() < 0.5;
    out.push({ text: `恶魔坐在${odd ? '单' : '双'}数号座位`, truth: (d.n % 2 === 1) === odd, strong: false });
    const x = pick(others.filter((n) => n !== d.n), rng);
    const near = seatNeighbors(s, x).includes(d.n);
    out.push({ text: `恶魔就坐在 ${x}号 旁边`, truth: near, strong: near });
  }
  const adj = chefCount(s) > 0;
  const sayAdj = rng() < 0.5;
  out.push({ text: sayAdj ? '有两名邪恶玩家挨着坐' : '没有任何两名邪恶玩家挨着坐', truth: sayAdj === adj, strong: false });
  for (const r of shuffle(scriptOf(s).roles, rng).slice(0, 3)) out.push({ text: `【${roleName(r)}】在场`, truth: inPlay(s, r), strong: false });
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
}

/** 博学者：几组"一真一假"（他中毒/醉酒时可以两条都假） */
export function savantChoices(s: GameState, actorN: number, rng: Rng): Choice<[string, string]>[] {
  const all = statements(s, actorN, rng);
  const trues = shuffle(all.filter((x) => x.truth), rng);
  const falses = shuffle(all.filter((x) => !x.truth), rng);
  const pair = (a: Stmt, b: Stmt): [string, string] => (rng() < 0.5 ? [a.text, b.text] : [b.text, a.text]);
  const label = (p: [string, string]) => `①「${p[0]}」　②「${p[1]}」`;
  const out: Choice<[string, string]>[] = [];
  const strong = trues.find((x) => x.strong);
  const plain = trues.filter((x) => !x.strong);
  if (strong && falses[0]) {
    const p = pair(strong, falses[0]);
    out.push({ key: 'strong', label: label(p), value: p, lean: 1, truth: true, reason: `真的那条是「${strong.text}」，直接指向邪恶，帮善良。` });
  }
  for (let i = 0; i < 2 && plain[i] && falses[i + 1]; i++) {
    const p = pair(plain[i], falses[i + 1]);
    out.push({ key: `plain${i}`, label: label(p), value: p, lean: 0, truth: true, standard: true, reason: `真的那条是「${plain[i].text}」，信息量适中。` });
  }
  if (malfunction(s, actorN) || mustLie(s, 'savant')) {
    for (const c of out) c.standard = false;
    // 标准假话要温和：不把某个具体的人说成相反阵营；重度冤枉/洗白的单独列出
    const mild = falses.filter((x) => !x.harsh);
    const harsh = falses.filter((x) => x.harsh);
    if (mild.length >= 2) {
      const p = pair(mild[0], mild[1]);
      out.push({ key: 'bothFalse', label: label(p), value: p, lean: 0, truth: false, standard: true, reason: '他中毒/醉酒：两条都是假的，但不点名冤枉谁，温和的误导。' });
    }
    if (harsh.length && mild.length) {
      const p = pair(harsh[0], mild[mild.length - 1]);
      out.push({ key: 'harsh', label: label(p), value: p, lean: -2, truth: false, reason: `两条都是假的，其中「${harsh[0].text}」把一个人的阵营说反了，重度误导，大帮邪恶。` });
    }
    if (mustLie(s, 'savant')) return out.filter((c) => !c.truth).map((c) => ({ ...c, reason: `涡流在场，只能给假信息。${c.reason}` }));
  }
  return out;
}

/** 渔夫：一条帮他获胜的建议 */
export function fishermanChoices(s: GameState, actorN: number, rng: Rng): Choice<string>[] {
  const out: Choice<string>[] = [];
  const others = s.seats.filter((x) => x.n !== actorN);
  const d = s.seats.find((x) => isDemonSeat(s, x.n));
  if (d) {
    const start = d.n - Math.floor(rng() * 3);
    const three = [0, 1, 2].map((k) => ((start - 1 + k + s.count * 2) % s.count) + 1);
    out.push({ key: 'range', label: `恶魔就在 ${three.map((n) => `${n}号`).join('、')} 这三个人之中。`, value: '', lean: 1, truth: true, reason: '直接缩小恶魔范围，帮善良。' });
  }
  const trusty = others.filter((x) => x.alive && ROLES[x.role].team === 'townsfolk');
  if (trusty.length) {
    const t = pick(trusty, rng);
    out.push({ key: 'trust', label: `你可以相信 ${t.n}号 说的话。`, value: '', lean: 0, truth: true, standard: true, reason: `${t.n}号 是善良的${roleName(t.role)}。` });
  }
  const evil = others.filter((x) => x.alive && isEvil(x));
  const good = others.filter((x) => x.alive && !isEvil(x));
  if (evil.length && good.length) {
    const [a, b] = [pick(evil, rng).n, pick(good, rng).n].sort((x, y) => x - y);
    out.push({ key: 'pair', label: `多留意 ${a}号 和 ${b}号，其中有你要找的人。`, value: '', lean: 0, truth: true, standard: true, reason: '一个邪恶一个善良，给个方向但不说死。' });
  }
  const tips: string[] = [];
  if (inPlay(s, 'vortox')) tips.push('每天都一定要处决一个人，否则你们会直接输。');
  if (inPlay(s, 'leviathan')) tips.push('你们最多只能误杀一个好人，而且必须在第 5 天结束前找到恶魔。');
  if (inPlay(s, 'fearmonger')) tips.push('有人提名时先想想：处决他会不会让整个阵营输掉。');
  if (inPlay(s, 'goblin')) tips.push('被提名的人如果自称哥布林，千万别处决他。');
  if (tips.length) out.push({ key: 'rule', label: pick(tips, rng), value: '', lean: 0, truth: true, standard: true, reason: '提醒一条这局最要命的规则。' });
  if (malfunction(s, actorN)) {
    for (const c of out) {
      c.standard = false;
      c.lean = 1;
    }
    // 温和的假建议：让他去怀疑两个好人
    if (good.length >= 2) {
      const [a, b] = shuffle(good, rng).slice(0, 2).map((x) => x.n).sort((x, y) => x - y);
      out.push({ key: 'mild', label: `多留意 ${a}号 和 ${b}号，其中有你要找的人。`, value: '', lean: 0, truth: false, standard: true, reason: `他中毒/醉酒：这两人其实都是善良的，轻度误导。` });
    }
    if (evil.length) {
      const e = pick(evil, rng);
      out.push({ key: 'mislead', label: `你可以相信 ${e.n}号 说的话。`, value: '', lean: -2, truth: false, reason: `他中毒/醉酒：${e.n}号 其实是邪恶的，强烈误导，大帮邪恶。` });
    }
  }
  return out.map((c) => ({ ...c, value: c.label }));
}

/** 艺术家：该说真话还是假话 */
export function artistMode(s: GameState, actorN: number): { mode: 'truth' | 'free' | 'lie'; text: string } {
  if (mustLie(s, 'artist')) return { mode: 'lie', text: '涡流在场：必须回答假的（是变否、否变是）。' };
  if (malfunction(s, actorN)) return { mode: 'free', text: '他中毒/醉酒：可以如实回答，也可以说假话，按平衡来。' };
  return { mode: 'truth', text: '他是健康的：必须如实回答。' };
}

export const AMNESIAC_ANSWERS = ['完全正确', '非常接近', '有点接近', '差得远'];
