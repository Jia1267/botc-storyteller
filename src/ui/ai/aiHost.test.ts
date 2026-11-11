import { describe, expect, it } from 'vitest';
import { teamOf } from '../../engine/core';
import { completeSlot, execute, finishDay, finishDeal } from '../../engine/flow';
import { seeded, type Rng } from '../../engine/rng';
import { newGame, setCount, setScript, shuffleSeats, startDeal } from '../../engine/setup';
import { aiSetCount, type AI_SCRIPTS } from '../../engine/ai';
import type { GameState } from '../../engine/types';
import { gotKey, idleMsgId, pickKey, type Acks, type AiActs, type AiPublic, type MsgBody, type RoomMeta, type RoomMsg, type SeatInfo } from '../../room/protocol';
import { IDLE_BODY, idleDue, infoUnread, nightUnread, stalePicks } from '../room/nightRoom';
import { aiStep, type AiCtx } from './aiHost';

/** 和数据库一样：去掉 undefined、空数组、空对象 */
function fb<T>(x: T): T {
  if (Array.isArray(x)) return x.map(fb) as T;
  if (x && typeof x === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) {
      const w = fb(v);
      if (w === undefined || w === null || (Array.isArray(w) && !w.length) || (typeof w === 'object' && !Array.isArray(w) && !Object.keys(w as object).length)) continue;
      out[k] = w;
    }
    return out as T;
  }
  return x;
}

/** 假的房间：消息、已读、公开进度都在内存里 */
class FakeRoom {
  code = 'TEST';
  ready = true;
  meta: RoomMeta;
  seats: Record<string, SeatInfo> = {};
  msgs: Record<string, Record<string, RoomMsg>> = {};
  acks: Acks = {};
  sent = 0;
  constructor(seatNs: number[]) {
    this.meta = { count: seatNs.length, seatNs, title: 'AI', phase: 'game', createdAt: 0 };
    for (const n of seatNs) this.seats[n] = { uid: `u${n}`, online: true };
  }
  async send(n: number, id: string, body: MsgBody) {
    const a = (this.acks[n] ??= {});
    delete a[id];
    delete a[gotKey(id)];
    delete a[pickKey(id)];
    (this.msgs[n] ??= {})[id] = fb({ id, ...body, sentAt: ++this.sent }) as RoomMsg;
  }
  async setRole() {}
  async setAi(ai: AiPublic) {
    this.meta = { ...this.meta, ai: fb(ai) };
  }
  unsend(n: number, id: string) {
    delete this.msgs[n]?.[id];
  }
}

/** 玩家的手机：点"看完了"、选人、白天提名投票 */
function phones(s: GameState, room: FakeRoom, rng: Rng, log: string[]) {
  for (const [k, box] of Object.entries(room.msgs)) {
    const n = Number(k);
    for (const m of Object.values(box)) {
      const a = (room.acks[n] ??= {});
      if (a[m.id]) continue;
      if (m.ask) {
        const pool = m.ask.seats.filter((x) => !(m.ask!.disabled ?? []).includes(x));
        const seats: number[] = [];
        while (seats.length < m.ask.count && seats.length < pool.length) {
          const x = pool[Math.floor(rng() * pool.length)];
          if (!seats.includes(x)) seats.push(x);
        }
        const opts = m.ask.opts?.length ? [m.ask.opts[Math.floor(rng() * m.ask.opts.length)].id] : [];
        a[pickKey(m.id)] = m.ask.skip && rng() < 0.3 ? { skip: true } : { seats, opts };
      }
      a[m.id] = 1;
    }
  }
  const ai = room.meta.ai;
  if (!ai || s.phase !== 'day') return;
  const act = <K extends keyof AiActs>(n: number, key: K, v: AiActs[K]) => ((room.acks[n] ??= {})[key] = v as never);
  const acts = (n: number) => (room.acks[n] ?? {}) as AiActs;
  if (ai.stage === 'nominate') {
    const designated = ai.alive[(ai.day - 1) % ai.alive.length];
    const voters = ai.banshee && !ai.alive.includes(ai.banshee) ? [...ai.alive, ai.banshee] : ai.alive;
    for (const n of voters) {
      if (n === designated && !(ai.nominators ?? []).includes(n) && acts(n).nom?.day !== ai.day) {
        const free = ai.alive.concat(ai.ghost ?? []).filter((x) => !(ai.nominees ?? []).includes(x));
        if (free.length) {
          const t = free[Math.floor(rng() * free.length)];
          act(n, 'nom', { day: ai.day, target: t, at: ai.day });
          log.push(`第${ai.day}天 ${n}号提名${t}号`);
        } else act(n, 'nomore', ai.day);
      } else if (n !== designated || (ai.nominators ?? []).includes(n)) act(n, 'nomore', ai.day);
    }
    // 偶尔有人宣称戏法师公开猜（随便猜，或者照着真身份猜）
    if ((ai.claims ?? []).includes('alsaahir') && rng() < 0.05) {
      const g = ai.alive[Math.floor(rng() * ai.alive.length)];
      const team = (t: string) => s.seats.filter((x) => !x.traveller && teamOf(x.role) === t).map((x) => x.n);
      const right = rng() < 0.5;
      if (acts(g).guess?.day !== ai.day)
        act(g, 'guess', right ? { day: ai.day, minions: team('minion'), demons: team('demon') } : { day: ai.day, demons: [ai.alive[Math.floor(rng() * ai.alive.length)]] });
    }
    // 偶尔有人宣称猎手开枪
    if ((ai.claims ?? []).includes('slayer') && rng() < 0.05) {
      const sh = ai.alive[Math.floor(rng() * ai.alive.length)];
      const tg = ai.alive[Math.floor(rng() * ai.alive.length)];
      if (sh !== tg && acts(sh).slay?.day !== ai.day) act(sh, 'slay', { day: ai.day, target: tg });
    }
  }
  if ((ai.stage === 'speech1' || ai.stage === 'speech2') && ai.nom) act(ai.stage === 'speech1' ? ai.nom.by : ai.nom.target, 'spoke', { day: ai.day, i: ai.nom.i });
  if (ai.stage === 'vote' && ai.vote && ai.nom) {
    const v = ai.vote.order[ai.vote.at];
    if (acts(v).hand?.i !== ai.nom.i || acts(v).hand?.day !== ai.day) act(v, 'hand', { day: ai.day, i: ai.nom.i, up: rng() < 0.6 });
  }
}

/** 跑一局 AI 暗流涌动，直到结束 */
async function playGame(count: number, seed: number, script: (typeof AI_SCRIPTS)[number] = 'tb') {
  const rng = seeded(seed);
  const s = newGame();
  setScript(s, script);
  s.ai = { priv: 300, pub: 300, vote: 5 };
  aiSetCount(s, count, rng);
  shuffleSeats(s, rng);
  startDeal(s);
  finishDeal(s);
  const room = new FakeRoom(s.seats.map((x) => x.n));
  const log: string[] = [];
  const said: string[] = [];
  let now = 1_000_000;
  const mark: Record<string, number> = {};
  let ticks = 0;
  for (; ticks < 4000 && s.phase !== 'end'; ticks++) {
    if (s.phase === 'night') {
      for (const [n, id] of stalePicks(s, room)) room.unsend(n, id);
      for (const n of idleDue(s, room)) if (!room.msgs[n]?.[idleMsgId(s.night, n)]) await room.send(n, idleMsgId(s.night, n), IDLE_BODY(s));
    }
    const ctx: AiCtx = {
      s,
      room,
      now,
      unread: s.phase === 'night' ? nightUnread(s, room) : [],
      commit: (fn) => fn(s),
      say: (t) => said.push(t),
      skip: { current: false },
      mark,
    };
    await aiStep(ctx);
    phones(s, room, rng, log);
    now += 10_000;
  }
  return { s, room, log, said, ticks };
}

describe('AI 说书人：一局从第 1 夜到结束（假的房间和手机）', () => {
  it('不同人数、不同种子都能走到游戏结束，白天有提名、投票、处决', async () => {
    let nominations = 0;
    let executions = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const { s, said, ticks, log, room } = await playGame(5 + (seed % 11), seed);
      const ai = room.meta.ai;
      expect(s.phase, `种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}，提名 ${JSON.stringify(Object.fromEntries(Object.entries(room.acks).map(([k, v]) => [k, (v as AiActs).nom])))}，被提名过 ${ai?.nominees}，提名过 ${ai?.nominators}，不再提名 ${ai?.noMore}，活着 ${ai?.alive}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
      expect(s.winner).toBeTruthy();
      nominations += log.length;
      executions += s.log.filter((e) => e.text.includes('被处决')).length;
    }
    expect(nominations).toBeGreaterThan(10);
    expect(executions).toBeGreaterThan(5);
  });

  it('暗月初升：不同人数都能走到结束（月之子、和平主义者、莽夫等由网页处理）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, said, ticks, room } = await playGame(7 + (seed % 9), seed + 100, 'bmr');
      const ai = room.meta.ai;
      expect(s.phase, `暗月初升种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
    }
  });

  it('梦殒春宵：不同人数都能走到结束（女巫、呆瓜、卖花女孩、城镇公告员等由网页处理）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, said, ticks, room } = await playGame(5 + (seed % 11), seed + 200, 'sv');
      const ai = room.meta.ai;
      expect(s.phase, `梦殒春宵种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
    }
  });

  it('残阳高照：5、6 人都能走到结束（炼金术士、茶艺师、弄臣、僵怖假死等由网页处理）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, said, ticks, room } = await playGame(5 + (seed % 2), seed + 300, 'sunset');
      const ai = room.meta.ai;
      expect(s.phase, `残阳高照种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
    }
  });

  it('幽灵茶会：5、6 人都能走到结束（小怪宝、寡妇、恐惧之灵、呆瓜等由网页处理）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, said, ticks, room } = await playGame(5 + (seed % 2), seed + 400, 'spooky');
      const ai = room.meta.ai;
      expect(s.phase, `幽灵茶会种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
    }
  });

  it('王不见王：不同人数都能走到结束（哈迪寂亚三人选活死、报丧女妖、戏法师等由网页处理）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const { s, said, ticks, room } = await playGame(7 + (seed % 9), seed + 500, 'alvsal');
      const ai = room.meta.ai;
      expect(s.phase, `王不见王种子 ${seed}：${ticks} 步还没结束（第${ai?.day}天 ${ai?.stage}），最后说的是：${said.slice(-3).join(' / ')}`).toBe('end');
    }
  });

  it('每晚活着的人都收到至少一条消息；之前就死了的人不用点"今晚你没有行动"', async () => {
    let deadNights = 0;
    for (const seed of [7, 8, 9, 10]) {
      const { room, s } = await playGame(8, seed);
      for (const x of s.seats) {
        for (let night = 1; night < s.night; night++) {
          const ids = Object.keys(room.msgs[x.n] ?? {}).filter((id) => id.startsWith(`N${night}-`));
          // 第 night 夜开始前就死了（死在更早的夜里或白天）
          if (x.death && x.death.night < night) {
            deadNights++;
            expect(ids.includes(idleMsgId(night, x.n)), `${x.n} 号第 ${night} 夜已经死了，还收到了"今晚你没有行动"`).toBe(false);
          } else expect(ids.length, `${x.n} 号第 ${night} 夜没收到任何东西`).toBeGreaterThan(0);
        }
      }
    }
    expect(deadNights).toBeGreaterThan(0);
  });

  it('死人里有人今晚还要行动（假死的僵怖）：所有死人都收到"今晚你没有行动"打掩护；没人要行动的夜晚死人什么都不收', () => {
    const s = newGame();
    setScript(s, 'sunset');
    setCount(s, 6, seeded(1));
    const roles = ['zombuul', 'tealady', 'undertaker', 'alchemist', 'devilsadvocate', 'recluse'] as const;
    s.seats.forEach((x, i) => (x.role = x.startRole = roles[i]));
    s.demonChar = 'zombuul';
    startDeal(s);
    finishDeal(s);
    const room = { code: 'T', seats: Object.fromEntries(s.seats.map((x) => [x.n, { uid: `u${x.n}`, online: true }])), msgs: {}, acks: {} };
    const toDay = () => {
      for (let g = 0; g < 40 && s.phase === 'night'; g++) completeSlot(s, { kind: 'none' });
    };
    toDay();
    // 第 1 天：处决僵怖（假死），陌客也死了
    execute(s, 1);
    s.seats[5].alive = false;
    s.seats[5].death = { night: 1, when: 'day', cause: '测试' };
    expect(s.zombuulFake).toBe(true);
    finishDay(s);
    // 第 2 夜：白天有人死了，僵怖不醒（复盘里写明原因）：之前就死的两个人都不用点
    expect(s.log.some((e) => e.night === 2 && e.text.includes('僵怖今晚不醒'))).toBe(true);
    expect(nightUnread(s, room)).not.toContain(6);
    expect(nightUnread(s, room)).not.toContain(1);
    toDay();
    execute(s, null);
    finishDay(s);
    // 第 3 夜：白天没人死，假死的僵怖要醒：所有死人都要收到"没有行动"打掩护
    expect(nightUnread(s, room)).toContain(6);
  });

  it('说书人带局天亮：只剩"今晚你没有行动"没点的人不用等，还没看信息的人才要等', () => {
    const s = newGame();
    setScript(s, 'tb');
    setCount(s, 5, seeded(1));
    startDeal(s);
    finishDeal(s);
    const room = {
      seats: { 1: { uid: 'a', online: true }, 2: { uid: 'b', online: true }, 3: { uid: 'c', online: true } },
      msgs: {
        1: { 'N1-5-1-info': { id: 'N1-5-1-info', card: { big: ['0'] }, sentAt: 1 } as RoomMsg },
        2: { [idleMsgId(1, 2)]: { id: idleMsgId(1, 2), card: { big: [] }, sentAt: 2 } as RoomMsg },
        3: { 'N1-6-3-info': { id: 'N1-6-3-info', card: { big: ['1'] }, sentAt: 3 } as RoomMsg },
      },
      acks: { 3: { 'N1-6-3-info': 1 } },
    };
    expect(nightUnread(s, room)).toEqual([1, 2]);
    expect(infoUnread(s, room)).toEqual([1]);
  });

  it('公开进度里没有任何人的身份', async () => {
    const { room, s } = await playGame(9, 3);
    const text = JSON.stringify({ ...room.meta.ai, claims: undefined });
    for (const x of s.seats) expect(text.includes(x.role)).toBe(false);
  });
});
