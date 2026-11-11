// AI 说书人的后台主持：每次看一眼现在该做什么，只做一件事（发一条消息、记一步、改一下公开进度）。
// 不依赖 React：平板上由 useAiHost 每半秒调一次；测试里用假的房间一局一局地跑。
import { AI_DEFAULTS, aiPlan, aiSlayer, aiVirgin, tallyHands, voteOrder, type AiAnswer, type AiAsk, type AiDone, type AiMsg } from '../../engine/ai';
import { clone, hasAbility, isDemonSeat, malfunction, scriptOf, seatName, seatOf, teamOf } from '../../engine/core';
import {
  alsaahirCorrect, alsaahirGuess, completeSlot, currentSlot, execute, fearmongerNominates, finishDay, goonInformed, klutzChoose, klutzNeedsChoice, moonchildChoose,
  moonchildNeedsChoice, nomResults, nominateVirgin, pacifistCanSave, slayerShoot, voteNeed, witchActive, witchStrikes,
} from '../../engine/flow';
import { balance, recommend } from '../../engine/balance';
import { pacifistChoices } from '../../engine/info';
import { seeded } from '../../engine/rng';
import { dawnLines, executionLines } from '../../engine/scripts';
import type { GameState } from '../../engine/types';
import { answerOf, nightMsgId, voteGoal, type AiActs, type AiPublic, type MsgBody } from '../../room/protocol';
import { spyRows } from '../Grimoire';
import type { HostRoom } from '../room/hostRoom';

export interface AiCtx {
  s: GameState;
  room: Pick<HostRoom, 'code' | 'ready' | 'meta' | 'seats' | 'msgs' | 'acks' | 'send' | 'setRole' | 'setAi'>;
  /** 服务器时间 */
  now: number;
  /** 今晚还没点完手机的人 */
  unread: number[];
  commit: (fn: (s: GameState) => void) => void;
  say: (text: string) => void;
  /** 平板上点了"跳过" */
  skip: { current: boolean };
  /** 记住念过什么、什么时候念的（入夜、处决只念一次） */
  mark: Record<string, number>;
}


const aliveOf = (s: GameState) => s.seats.filter((x) => x.alive && !x.left).map((x) => x.n);

/** 公开状态里跟着局面变的部分 */
function live(s: GameState, ai: Partial<AiPublic>): Pick<AiPublic, 'alive' | 'ghost' | 'spent' | 'claims' | 'banshee'> {
  const spent = ai.spent ?? [];
  const roles = scriptOf(s).roles;
  return {
    alive: aliveOf(s),
    ghost: s.seats.filter((x) => !x.alive && !x.left && !spent.includes(x.n)).map((x) => x.n),
    spent,
    // 剧本上有这个角色，手机上才给"宣称猎手开枪""宣称戏法师猜"
    claims: (['slayer', 'alsaahir'] as const).filter((r) => roles.includes(r)),
    banshee: s.bansheeActive ?? undefined,
  };
}

/** 选人请求发到手机上的内容（和真人说书人模式一样） */
function askBody(s: GameState, a: AiAsk): MsgBody {
  const deaths = s.ns?.deaths ?? [];
  return {
    card: { title: a.title, big: [], lines: a.lines, rows: a.rows },
    ask: {
      count: a.count,
      seats: s.seats.filter((x) => !x.left).map((x) => x.n),
      dead: s.seats.filter((x) => !x.alive && !deaths.includes(x.n)).map((x) => x.n),
      disabled: a.disabled?.filter((n) => !deaths.includes(n)),
      why: a.why,
      ordered: a.ordered,
      opts: a.opts,
      skip: a.skip,
    },
  };
}

/** 他没反应、平板上点了跳过：能"不用"就当他不用，不然替他随便选 */
function randomAnswer(s: GameState, a: AiAsk): AiAnswer {
  if (a.skip) return { seats: [], opts: [], skip: true };
  const pool = s.seats.filter((x) => !x.left && !(a.disabled ?? []).includes(x.n)).map((x) => x.n);
  const out: number[] = [];
  while (out.length < a.count && out.length < pool.length) {
    const n = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(n)) out.push(n);
  }
  const opt = a.opts?.length ? [a.opts[Math.floor(Math.random() * a.opts.length)].id] : [];
  return { seats: out, opts: opt, skip: false };
}

/** 发一条夜里的消息（发过就不再发）；发了返回 true */
async function sendNight(room: AiCtx['room'], s: GameState, m: AiMsg): Promise<boolean> {
  const id = nightMsgId(s.night, s.ns!.slot, m.n, m.tag);
  if (room.msgs[m.n]?.[id]) return false;
  await room.send(m.n, id, { card: m.card });
  if (m.role) await room.setRole(m.n, m.role);
  return true;
}

export async function aiStep(c: AiCtx): Promise<void> {
  const { room, now, unread, say, skip, commit } = c;
  const mark = { current: c.mark };
  const s = c.s;
  if (!room.code || !room.ready || !room.meta) return;
  const ai = room.meta.ai;
  const settings = s.ai ?? AI_DEFAULTS;
  const put = (next: Partial<AiPublic>) => room.setAi({ settings, stage: 'wait', day: s.night, ...ai, ...next, ...live(s, { ...ai, ...next }) } as AiPublic);
  const speak = async (text: string, next: Partial<AiPublic> = {}) => {
    say(text);
    await put({ ...next, say: text });
  };
  const acts = (n: number) => (room.acks[n] ?? {}) as AiActs;
  const takeSkip = () => {
    const v = skip.current;
    skip.current = false;
    return v;
  };

  /* ---------- 夜里 ---------- */
  if (s.phase === 'night') {
    if (!ai || ai.stage !== 'night' || ai.day !== s.night) {
      await put({ stage: 'night', day: s.night, until: undefined, nom: undefined, vote: undefined, say: '' });
      return;
    }
    // 莽夫变了阵营：先告诉他
    const gi = s.ns?.goonInform;
    if (gi) {
      const m: AiMsg = { n: gi.seat, tag: 'goon', card: { title: '你的阵营变了，你现在是', big: [gi.evil ? '邪恶阵营' : '善良阵营'] } };
      if (await sendNight(room, s, m)) return;
      if (!room.acks[gi.seat]?.[nightMsgId(s.night, s.ns!.slot, gi.seat, 'goon')] && !takeSkip()) return;
      commit((st) => goonInformed(st));
      return;
    }
    const plan = aiPlan(s, { spyRows });
    const cur = s.ns!.slot;
    const slot = currentSlot(s);
    // 网页不知道这一步怎么处理（是 bug）：不悄悄跳过，平板上报出来，点了"跳过这一步"才往下走
    if (!plan) {
      if (takeSkip()) commit((st) => completeSlot(st, { kind: 'none' }));
      return;
    }
    let r: AiDone & { say?: string[] };
    let before: AiMsg[] = [];
    // 问一个人：没发就发；拿到回答返回回答，还没答返回 null
    const askOne = async (a: AiAsk): Promise<AiAnswer | 'sent' | null> => {
      const id = nightMsgId(s.night, cur, a.n, a.tag ?? 'pick');
      if (!room.msgs[a.n]?.[id]) {
        await room.send(a.n, id, askBody(s, a));
        return 'sent';
      }
      const got = answerOf(room.acks, a.n, id);
      return got ? { seats: got.seats ?? [], opts: got.opts ?? [], skip: !!got.skip } : null;
    };
    if ('ask' in plan) {
      const a = plan.ask;
      // 问他之前先给他看的（例如疯子先看假的爪牙和伪装）
      before = plan.send ?? [];
      for (const m of before) if (await sendNight(room, s, m)) return;
      const got = await askOne(a);
      if (got === 'sent') return;
      const ans = got ?? (takeSkip() ? randomAnswer(s, a) : null);
      if (!ans) return;
      const next = plan.then(ans);
      if ('more' in next) {
        // 再同时问几个人：一起发出去，都答了（或平板点了跳过）才往下走
        const got2: (AiAnswer | 'sent' | null)[] = [];
        for (const q of next.more) got2.push(await askOne(q));
        if (got2.includes('sent')) return;
        if (got2.includes(null) && !takeSkip()) return;
        r = next.then(got2.map((x, i) => (x && x !== 'sent' ? x : randomAnswer(s, next.more[i]))));
      } else r = next;
    } else r = plan;
    for (const m of r.send) if (await sendNight(room, s, m)) return;
    const waiting = [...before, ...r.send].some((m) => !room.acks[m.n]?.[nightMsgId(s.night, cur, m.n, m.tag)]);
    if (waiting && !takeSkip()) return;
    if (slot === 'dusk') {
      const k = `dusk-${s.night}`;
      if (!mark.current[k]) {
        mark.current[k] = now;
        await speak(('say' in r && r.say ? r.say : []).join(''));
        return;
      }
      if (now - mark.current[k] < 5000) return;
    }
    // 天亮前：所有人都点完手机上的消息（没行动的人会收到"今晚你没有行动"）
    if (slot === 'dawn' && unread.length && !takeSkip()) return;
    // 恐惧之灵换了目标要在天亮宣布：天亮这一步会清掉这个标记，先记下来
    if (slot === 'dawn') mark.current[`fear-${s.night}`] = s.fearAnnounce ? 1 : 0;
    commit((st) => completeSlot(st, r.payload));
    return;
  }

  if (s.phase !== 'day') return;

  /* ---------- 白天 ---------- */
  // 白天有人死了分出胜负（猎手打中恶魔、处决圣徒……）：直接结束
  if (s.winner && s.executed === undefined) {
    commit((st) => finishDay(st));
    return;
  }
  // 月之子死了：在他手机上选一个活人（公开的），选完才往下走（投票时先不打断）
  const moon = moonchildNeedsChoice(s);
  if (moon && ai?.stage !== 'vote') {
    const id = `D${s.night}-moon-${moon.n}`;
    const dead = s.seats.filter((x) => !x.alive).map((x) => x.n);
    if (!room.msgs[moon.n]?.[id]) {
      await room.send(moon.n, id, {
        card: { title: '月之子：你死了。公开选一名活着的玩家', big: [], lines: ['可以先和大家商量。他如果是善良的，今晚会死。'] },
        ask: { count: 1, seats: s.seats.filter((x) => !x.left).map((x) => x.n), dead, disabled: [...dead, moon.n] },
      });
      say(`${seatName(moon.n)} 是月之子：请在手机上公开选一名活着的玩家。`);
      return;
    }
    const pick = answerOf(room.acks, moon.n, id)?.seats?.[0] ?? (takeSkip() ? s.seats.find((x) => x.alive && x.n !== moon.n)?.n : undefined);
    if (pick === undefined) return;
    commit((st) => moonchildChoose(st, pick));
    await speak(`${seatName(moon.n)}（月之子）选择了 ${seatName(pick)}。`);
    return;
  }
  // 呆瓜得知自己死了：公开选一名活着的玩家，选到邪恶的善良落败
  const klutz = klutzNeedsChoice(s);
  if (klutz && ai?.stage !== 'vote') {
    const id = `D${s.night}-klutz-${klutz.n}`;
    const dead = s.seats.filter((x) => !x.alive).map((x) => x.n);
    if (!room.msgs[klutz.n]?.[id]) {
      await room.send(klutz.n, id, {
        card: { title: '呆瓜：你死了。公开选一名活着的玩家', big: [], lines: ['可以先和大家商量。如果你选到邪恶玩家，善良阵营落败。'] },
        ask: { count: 1, seats: s.seats.filter((x) => !x.left).map((x) => x.n), dead, disabled: [...dead, klutz.n] },
      });
      say(`${seatName(klutz.n)} 是呆瓜：请在手机上公开选一名活着的玩家。`);
      return;
    }
    const pick = answerOf(room.acks, klutz.n, id)?.seats?.[0] ?? (takeSkip() ? s.seats.find((x) => x.alive && x.n !== klutz.n)?.n : undefined);
    if (pick === undefined) return;
    commit((st) => klutzChoose(st, pick));
    await speak(`${seatName(klutz.n)}（呆瓜）选择了 ${seatName(pick)}。`);
    return;
  }
  // 新的一天：念死讯，开始私聊倒计时
  if (!ai || ai.day !== s.night || ai.stage === 'night' || ai.stage === 'wait') {
    // 报丧女妖昨晚被恶魔杀死、哈迪寂亚选了谁、谁复活了、恐惧之灵换了目标：和死讯一起公开说
    const bs = s.bansheeActive ? seatOf(s, s.bansheeActive) : null;
    const banshee = bs?.death?.when === 'night' && bs.death.night === s.night ? bs.n : undefined;
    const dawn = dawnLines(s.ns?.deaths ?? [], s.style, { phones: true, fear: !!mark.current[`fear-${s.night}`], hadikhia: s.ns?.hadikhia, banshee, revived: s.ns?.revived });
    await speak(`${dawn.join('')}现在是第 ${s.night} 天。私聊时间 ${Math.round(settings.priv / 60)} 分钟，可以离开座位找人单独聊。`, {
      stage: 'private', day: s.night, dawn: dawn.slice(1).join(''), until: now + settings.priv * 1000, nominators: [], nominees: [], noMore: [], shots: [], guesses: [], results: [], nom: undefined, vote: undefined,
    });
    return;
  }
  // 处决已经定了（例如刷新前刚处决）：进入"今天的处决"
  if (s.executed !== undefined && ai.stage !== 'result') {
    // 提名记录里的"现在待处决"改成处决的结果（死了还是没死）
    const ex = s.executed;
    const fate = ex === null ? '' : seatOf(s, ex).alive ? '被处决了，但没有死' : '被处决，死了';
    const results = (ai.results ?? []).map((r) => (r.target === ex && r.text.includes('待处决') ? { ...r, text: fate } : r));
    await put({ stage: 'result', until: now + 6000, results });
    return;
  }
  // 宣称猎手开枪：投票时不处理
  if (ai.stage !== 'vote' && ai.stage !== 'result') {
    const shooter = aliveOf(s).find((n) => acts(n).slay?.day === ai.day && !(ai.shots ?? []).includes(n));
    if (shooter !== undefined) {
      const target = acts(shooter).slay!.target;
      const r = aiSlayer(s, shooter, target);
      commit((st) => slayerShoot(st, shooter, target, r.twist));
      await speak(`${seatName(shooter)} 宣称自己是猎手，向 ${seatName(target)} 开枪。${r.hits ? `${seatName(target)} 死了。` : '什么都没有发生。'}`, { shots: [...(ai.shots ?? []), shooter] });
      return;
    }
    // 宣称戏法师公开猜：真戏法师全猜中（并且没中毒）善良直接获胜，否则什么都不会发生
    const guesser = aliveOf(s).find((n) => acts(n).guess?.day === ai.day && !(ai.guesses ?? []).includes(n));
    if (guesser !== undefined) {
      const g = acts(guesser).guess!;
      const m = g.minions ?? [];
      const d = g.demons ?? [];
      const real = hasAbility(s, seatOf(s, guesser), 'alsaahir');
      const wins = real && alsaahirCorrect(s, m, d) && !malfunction(s, guesser);
      if (real) commit((st) => alsaahirGuess(st, guesser, m, d, alsaahirCorrect(st, m, d)));
      await speak(
        `${seatName(guesser)} 宣称自己是戏法师，公开猜：爪牙是 ${m.map(seatName).join('、') || '没有'}，恶魔是 ${d.map(seatName).join('、') || '没有'}。${wins ? '' : '什么都没有发生。'}`,
        { guesses: [...(ai.guesses ?? []), guesser] },
      );
      return;
    }
  }
  switch (ai.stage) {
    case 'private':
      if (now >= (ai.until ?? 0) || takeSkip())
        await speak(`私聊结束，请回到座位。现在是公聊时间 ${Math.round(settings.pub / 60)} 分钟。`, { stage: 'public', until: now + settings.pub * 1000 });
      return;
    case 'public':
      if (now >= (ai.until ?? 0) || takeSkip())
        await speak('公聊结束，现在开始提名。想提名谁，就在手机上点他。每人每天只能提名一次，每人每天只能被提名一次。不想再提名了，就点"今天不再提名"。', { stage: 'nominate', until: undefined });
      return;
    case 'nominate': {
      // 报丧女妖能力生效：死了也能提名，每天两次
      const banshee = s.bansheeActive;
      const alive = aliveOf(s);
      const voters = banshee && !alive.includes(banshee) ? [...alive, banshee] : alive;
      const times = (n: number) => (ai.nominators ?? []).filter((x) => x === n).length;
      const used = (n: number) => times(n) >= (n === banshee ? 2 : 1);
      // 公开的"到齐了"名单：点了"今天不再提名"的，加上提名次数用完的
      const noMore = voters.filter((n) => acts(n).nomore === ai.day || used(n));
      if (noMore.join() !== (ai.noMore ?? []).join()) {
        await put({ noMore });
        return;
      }
      const canNominate = voters.filter((n) => !used(n));
      // 能提名的人都到齐了：今天结束
      if (voters.every((n) => noMore.includes(n)) || takeSkip()) {
        const block = nomResults(s).block;
        // 和平主义者：被处决的善良玩家要不要不死，按推荐
        let pacifist = false;
        if (block && pacifistCanSave(s, block)) {
          const ch = pacifistChoices(s, block);
          pacifist = !!ch[recommend(ch, balance(s).score, seeded(s.log.length * 7919 + 91))]?.value;
        }
        commit((st) => execute(st, block, '被处决', { pacifist }));
        return;
      }
      const noms = canNominate
        .map((n) => ({ by: n, a: acts(n).nom }))
        .filter((x) => x.a?.day === ai.day && seatOf(s, x.a.target) && !(ai.nominees ?? []).includes(x.a.target))
        .sort((p, q) => p.a!.at - q.a!.at);
      if (!noms.length) return;
      const { by } = noms[0];
      const target = noms[0].a!.target;
      const i = (ai.results ?? []).length;
      const base = { nominators: [...(ai.nominators ?? []), by], nominees: [...(ai.nominees ?? []), target], nom: { i, by, target } };
      // 城镇公告员要知道今天有没有爪牙提名过
      if (teamOf(seatOf(s, by).role) === 'minion') commit((st) => (st.minionNominatedDay = st.night));
      // 恐惧之灵提名：记下来（处决的正好是他的目标，那一方落败）
      if (seatOf(s, by).role === 'fearmonger' && seatOf(s, by).alive) commit((st) => fearmongerNominates(st, target));
      // 被女巫诅咒的人一提名就死（提名照常投票）
      const curse = s.witchCurse;
      if (curse && curse.seat === by && curse.night === s.night && witchActive(s) && seatOf(s, by).alive) {
        commit((st) => witchStrikes(st));
        await speak(`${seatName(by)} 提名了 ${seatName(target)}。${seatName(by)} 死了。请 ${seatName(by)} 说明理由，说完在手机上点"发言结束"。`, { ...base, stage: 'speech1' });
        return;
      }
      const v = aiVirgin(s, target, by);
      if (v.virgin) {
        // 先在副本上试：贞洁者会不会把提名者处决
        const trial = clone(s);
        nominateVirgin(trial, target, by, v.twist);
        const fired = trial.executed !== undefined;
        commit((st) => nominateVirgin(st, target, by, v.twist));
        if (fired) {
          await speak(`${seatName(by)} 提名了 ${seatName(target)}。${seatName(by)} 被立刻处决了。`, { ...base, stage: 'result', until: now + 8000 });
          return;
        }
      }
      await speak(`${seatName(by)} 提名了 ${seatName(target)}。请 ${seatName(by)} 说明理由，说完在手机上点"发言结束"。`, { ...base, stage: 'speech1' });
      return;
    }
    case 'speech1':
    case 'speech2': {
      const nom = ai.nom!;
      const who = ai.stage === 'speech1' ? nom.by : nom.target;
      const done = acts(who).spoke;
      if (!(done?.day === ai.day && done.i === nom.i) && !takeSkip()) return;
      if (ai.stage === 'speech1') {
        await speak(`请 ${seatName(nom.target)} 辩护，说完在手机上点"发言结束"。`, { stage: 'speech2' });
        return;
      }
      const order = voteOrder(s, nom.target).filter((n) => seatOf(s, n).alive || !(ai.spent ?? []).includes(n));
      const need = voteNeed(s);
      await speak(`开始投票，${voteGoal(need, ai.results)}。从 ${seatName(order[0])} 开始，按顺时针一人 ${settings.vote} 秒，轮到你时在手机上举手。`, {
        stage: 'vote', vote: { order, at: 0, hands: {}, need }, until: now + settings.vote * 1000 + 4000,
      });
      return;
    }
    case 'vote': {
      const nom = ai.nom!;
      const vote = ai.vote!;
      if (now < (ai.until ?? 0)) return;
      const voter = vote.order[vote.at];
      const h = acts(voter).hand;
      const hands = { ...(vote.hands ?? {}), [voter]: !!(h?.day === ai.day && h.i === nom.i && h.up) };
      if (vote.at + 1 < vote.order.length) {
        await put({ vote: { ...vote, at: vote.at + 1, hands }, until: now + settings.vote * 1000 });
        return;
      }
      // 数票：死人用掉一票、管家看主人
      const handsN: Record<number, boolean> = Object.fromEntries(Object.entries(hands).map(([k, v]) => [Number(k), !!v]));
      const t = tallyHands(s, vote.order, handsN, ai.spent ?? []);
      commit((st) => {
        st.noms.push({ day: st.night, seat: nom.target, votes: t.votes, need: vote.need });
        // 卖花女孩要知道今天恶魔有没有投票
        if (t.counted.some((n) => isDemonSeat(st, n))) st.demonVotedDay = st.night;
      });
      const after = nomResults({ ...s, noms: [...s.noms, { day: s.night, seat: nom.target, votes: t.votes, need: vote.need }] });
      const text =
        after.block === nom.target
          ? `${seatName(nom.target)} 现在待处决`
          : t.votes >= vote.need && t.votes === after.top
            ? '和最高票打平，现在没人待处决'
            : t.votes < vote.need
              ? '票数不够，不上处决台'
              : '没有超过之前的最高票';
      await speak(`${t.votes} 票，${text}。`, {
        stage: 'nominate', vote: { ...vote, hands }, until: undefined, spent: [...(ai.spent ?? []), ...t.spent],
        results: [...(ai.results ?? []), { by: nom.by, target: nom.target, votes: t.votes, text }],
      });
      return;
    }
    case 'result': {
      const k = `exec-${s.night}`;
      if (!mark.current[k]) {
        mark.current[k] = now;
        const n = s.executed ?? null;
        const survived = n !== null && seatOf(s, n).alive;
        await speak(`今天的提名结束。${executionLines(n, s.style, survived).join('')}`, { stage: 'result', until: now + 8000 });
        return;
      }
      if (now < (ai.until ?? 0)) return;
      commit((st) => finishDay(st));
      return;
    }
  }
}
