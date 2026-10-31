// AI 说书人（B 版）：平板放在桌子中间，它就是说书人。
// 屏幕是公共面板（谁坐哪、谁死了、倒计时、投票），台词用系统自带的中文语音念，同时显示文字；
// 夜里按官方顺序在后台处理，选人、给信息都走各人的手机。平板上不显示任何人的身份。
import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_DEFAULTS, aiPlan, aiSlayer, aiVirgin, tallyHands, voteOrder, type AiAsk } from '../../engine/ai';
import { clone, seatName, seatOf } from '../../engine/core';
import { completeSlot, currentSlot, execute, finishDay, finishDeal, nomResults, nominateVirgin, slayerShoot, voteNeed } from '../../engine/flow';
import { seeded } from '../../engine/rng';
import { dawnLines, endLines, executionLines } from '../../engine/scripts';
import { setCount, shuffleSeats, startDeal } from '../../engine/setup';
import type { GameState } from '../../engine/types';
import { watchOffset } from '../../room/api';
import { answerOf, msgStatus, nightMsgId, type AiActs, type AiPublic, type MsgBody } from '../../room/protocol';
import type { Game } from '../../store';
import { dealCard } from '../dealCard';
import { EndScreen } from '../End';
import { spyRows } from '../Grimoire';
import { BottomBar } from '../common';
import { NightPhones, useNightUnread } from '../room/nightRoom';
import { RoomJoin, useRoom, type HostRoom } from '../room/hostRoom';

/* ---------------- 声音 ---------------- */

const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** 用系统自带的中文语音念出来（iPad 要先点一下屏幕才能出声） */
function useVoice() {
  const voice = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!canSpeak) return;
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      voice.current = vs.find((v) => /zh[-_]CN/i.test(v.lang)) ?? vs.find((v) => /^zh/i.test(v.lang)) ?? null;
    };
    pick();
    speechSynthesis.addEventListener?.('voiceschanged', pick);
    return () => speechSynthesis.removeEventListener?.('voiceschanged', pick);
  }, []);
  return useCallback((text: string) => {
    if (!canSpeak || !text) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (voice.current) u.voice = voice.current;
      speechSynthesis.speak(u);
    } catch {
      /* 没有语音也能玩：字一直显示在屏幕上 */
    }
  }, []);
}

/** 服务器时间：倒计时所有设备按同一个钟算 */
function useServerNow() {
  const offset = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => watchOffset((ms) => (offset.current = ms)), []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset.current), 500);
    return () => clearInterval(t);
  }, []);
  return now;
}

const mmss = (ms: number) => {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/* ---------------- 入口 ---------------- */

export default function AiApp({ g, onExit }: { g: Game; onExit: () => void }) {
  const s = g.s;
  const room = useRoom();
  const say = useVoice();
  const [unlocked, setUnlocked] = useState(false);
  // 结束时念一次结果
  const ended = useRef(false);
  useEffect(() => {
    if (s.phase === 'end' && s.winner && !ended.current) {
      ended.current = true;
      say(endLines(s.winner, s.style).join(''));
    }
    if (s.phase !== 'end') ended.current = false;
  }, [s.phase, s.winner, s.style, say]);
  let body;
  if (s.phase === 'setup') body = <AiSetup g={g} onStart={() => say('开始')} onExit={onExit} />;
  else if (s.phase === 'deal') body = <AiDeal g={g} />;
  else if (s.phase === 'end') body = <EndScreen g={g} />;
  else body = <AiTable g={g} room={room} say={say} />;
  return (
    <div className="app ai" onPointerDown={() => setUnlocked(true)}>
      <header className="topbar">
        <div className="title">
          <b>AI 说书人 · 暗流涌动</b>
          <small>{room.code ? `房间 ${room.code}` : '还没开房间'}</small>
        </div>
      </header>
      {!unlocked && s.phase !== 'setup' && canSpeak && <p className="card card-warn ai-unlock">点一下屏幕开启声音（平板要先点一下才能念台词）。</p>}
      {body}
    </div>
  );
}

/* ---------------- 开局：人数、时间、扫码入座 ---------------- */

function AiSetup({ g, onStart, onExit }: { g: Game; onStart: () => void; onExit: () => void }) {
  const s = g.s;
  const room = useRoom();
  const set = s.ai ?? AI_DEFAULTS;
  const seatNs = s.setupStep !== 'count' && s.seats.length ? s.seats.map((x) => x.n) : [];
  const missing = seatNs.filter((n) => !room.seats[n]);
  const tweak = (k: keyof typeof set, v: number) => g.tweak((st) => (st.ai = { ...(st.ai ?? AI_DEFAULTS), [k]: v }));
  const opt = (k: keyof typeof set, vals: number[], unit: (v: number) => string) => (
    <div className="seg">
      {vals.map((v) => (
        <button key={v} className={set[k] === v ? 'on' : ''} onClick={() => tweak(k, v)}>
          {unit(v)}
        </button>
      ))}
    </div>
  );
  const start = () => {
    onStart();
    g.commit((st) => {
      shuffleSeats(st, seeded(Date.now()));
      startDeal(st);
    });
  };
  return (
    <main className="main">
      <div className="stack">
        <div className="step-head">
          <span className="kicker">AI 说书人</span>
          <h2>网页当说书人</h2>
        </div>
        <p className="muted">
          这台平板放在桌子中间：大家用自己的手机扫码入座，身份、夜里的选择和信息都在各自手机上。白天平板念台词、倒计时，大家在手机上提名、举手投票，网页按规则数票、处决。配角色和给什么信息都由网页按"让局势最均衡"来定。
        </p>
        <div className="card stack" style={{ gap: 8 }}>
          <b>几个人玩？</b>
          <div className="role-grid">
            {Array.from({ length: 11 }, (_, i) => i + 5).map((n) => (
              <button key={n} className="role-chip" style={s.count === n && seatNs.length ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => g.commit((st) => setCount(st, n, seeded(Date.now())))}>
                {n} 人
              </button>
            ))}
          </div>
          <p className="dim">角色由网页随机配一套均衡的，平板上不会显示。</p>
        </div>
        <div className="card stack" style={{ gap: 10 }}>
          <b>时间</b>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>私聊</span>
            {opt('priv', [180, 300, 480], (v) => `${v / 60} 分钟`)}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>公聊</span>
            {opt('pub', [180, 300, 480], (v) => `${v / 60} 分钟`)}
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span>投票时每人举手</span>
            {opt('vote', [3, 5, 8], (v) => `${v} 秒`)}
          </div>
        </div>
        {seatNs.length > 0 &&
          (room.code ? (
            <div className="card">
              <RoomJoin seatNs={seatNs} />
            </div>
          ) : (
            <button className="btn btn-outline btn-block" disabled={room.busy} onClick={room.open}>
              开房间（大家扫码入座）
            </button>
          ))}
        {room.err && <p className="card card-warn">{room.err}</p>}
        <button className="btn btn-ghost btn-sm" onClick={onExit}>
          不用 AI 了，回到真人说书人
        </button>
      </div>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!room.code || !seatNs.length || missing.length > 0} onClick={start}>
          {!seatNs.length ? '先选人数' : !room.code ? '先开房间' : missing.length ? `还没入座：${missing.map(seatName).join('、')}` : '开始：把身份发到每个人手机上'}
        </button>
      </BottomBar>
    </main>
  );
}

/* ---------------- 发身份 ---------------- */

function AiDeal({ g }: { g: Game }) {
  const s = g.s;
  const room = useRoom();
  const seatNs = s.seats.map((x) => x.n);
  const dealing = useRef(false);
  const dealt = Object.keys(room.dealt).length > 0;
  useEffect(() => {
    if (!room.code || dealt || dealing.current) return;
    dealing.current = true;
    room.deal(Object.fromEntries(s.seats.map((x) => [x.n, dealCard(s, x)]))).finally(() => (dealing.current = false));
  }, [room, dealt, s]);
  const left = seatNs.filter((n) => msgStatus(room.acks, n, room.dealt[n]) !== 'read');
  useEffect(() => {
    if (dealt && !left.length) g.commit(finishDeal);
  }, [dealt, left.length, g]);
  return (
    <main className="main">
      <div className="stack ai-public">
        <h2>{dealt ? '身份已经发到每个人手机上' : '正在发身份……'}</h2>
        <p className="ai-say">看完自己的身份点"看完了"。之后随时能在手机上再看。</p>
        <p className="muted">{left.length ? `还有 ${left.map(seatName).join('、')} 没看完` : '大家都看完了，马上入夜。'}</p>
      </div>
    </main>
  );
}

/* ---------------- 夜里、白天：公共面板 + 后台主持 ---------------- */

const STAGE_TEXT: Record<AiPublic['stage'], string> = {
  wait: '准备中',
  night: '夜晚：大家看自己的手机',
  private: '私聊时间',
  public: '公聊时间',
  nominate: '提名时间：在手机上提名',
  speech1: '提名者发言',
  speech2: '被提名者辩护',
  vote: '投票',
  result: '今天的处决',
};

function AiTable({ g, room, say }: { g: Game; room: HostRoom; say: (t: string) => void }) {
  const s = g.s;
  const ai = room.meta?.ai;
  const now = useServerNow();
  const unread = useNightUnread(s) ?? [];
  const skip = useRef(false);
  const waitSince = useRef<{ key: string; at: number }>({ key: '', at: Date.now() });
  useAiHost(g, room, say, now, unread, skip);

  const waitKey = `${s.phase}-${s.night}-${s.ns?.slot}-${unread.join()}-${ai?.stage}-${ai?.nom?.i}`;
  if (waitSince.current.key !== waitKey) waitSince.current = { key: waitKey, at: Date.now() };
  const stuck = Date.now() - waitSince.current.at > 45000;
  const left = ai?.until ? ai.until - now : 0;
  const voter = ai?.stage === 'vote' && ai.vote ? ai.vote.order[ai.vote.at] : null;
  const name = (n: number) => room.seats[n]?.name;

  return (
    <main className="main">
      <div className="stack ai-public">
        <div className="step-head">
          <span className="kicker">{s.phase === 'night' ? `第 ${s.night} 夜` : `第 ${s.night} 天`}</span>
          <h2>{ai ? STAGE_TEXT[ai.stage] : '准备中'}</h2>
        </div>
        {ai?.until && (ai.stage === 'private' || ai.stage === 'public' || ai.stage === 'vote') && <div className="ai-clock">{mmss(left)}</div>}
        {ai?.nom && (ai.stage === 'speech1' || ai.stage === 'speech2' || ai.stage === 'vote') && (
          <p className="ai-nom">
            {seatName(ai.nom.by)} 提名了 {seatName(ai.nom.target)}
            {ai.stage === 'vote' && ai.vote && `　需要 ${ai.vote.need} 票　现在 ${Object.values(ai.vote.hands ?? {}).filter(Boolean).length} 人举手`}
            {voter && `　轮到 ${seatName(voter)}`}
          </p>
        )}
        {ai?.say && <p className="ai-say">{ai.say}</p>}
        {s.phase === 'night' && <p className="muted">{unread.length ? `还在等 ${unread.length} 个人点手机。` : '网页在处理……'}</p>}
        <div className="ai-seats">
          {s.seats.map((x) => {
            const hand = ai?.vote?.hands?.[x.n];
            return (
              <div key={x.n} className={`ai-seat${x.alive ? '' : ' dead'}${voter === x.n ? ' turn' : ''}${hand ? ' up' : ''}`}>
                <b>{seatName(x.n)}</b>
                <small>{name(x.n) || ''}</small>
                <small>
                  {x.alive ? '' : ai?.ghost.includes(x.n) ? '已死 · 还有一票' : '已死 · 没有票了'}
                  {hand ? ' ✋' : ''}
                  {ai?.nominees?.includes(x.n) ? ' · 被提名过' : ''}
                </small>
              </div>
            );
          })}
        </div>
        {ai?.results && ai.results.length > 0 && (
          <div className="card stack" style={{ gap: 4 }}>
            <b>今天的提名</b>
            {ai.results.map((r, i) => (
              <p key={i}>
                {seatName(r.by)} → {seatName(r.target)}：{r.votes} 票，{r.text}
              </p>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 8 }}>
          {ai?.say && (
            <button className="btn btn-ghost btn-sm" onClick={() => say(ai.say!)}>
              再念一遍
            </button>
          )}
          {(ai?.stage === 'private' || ai?.stage === 'public') && (
            <button className="btn btn-ghost btn-sm" onClick={() => (skip.current = true)}>
              大家都准备好了：跳过倒计时
            </button>
          )}
          {(ai?.stage === 'speech1' || ai?.stage === 'speech2') && (
            <button className="btn btn-ghost btn-sm" onClick={() => (skip.current = true)}>
              他说完了（替他点"发言结束"）
            </button>
          )}
          {ai?.stage === 'nominate' && (
            <button className="btn btn-ghost btn-sm" onClick={() => (skip.current = true)}>
              大家都不提名了：结束今天
            </button>
          )}
          {stuck && s.phase === 'night' && (
            <button className="btn btn-ghost btn-sm" onClick={() => (skip.current = true)}>
              等太久了：跳过（替他随便选、当他看过了）
            </button>
          )}
        </div>
      </div>
      <NightPhones s={s} />
    </main>
  );
}

/* ---------------- 后台主持：每半秒看一眼该做什么，每次只做一件事 ---------------- */

const aliveOf = (s: GameState) => s.seats.filter((x) => x.alive && !x.left).map((x) => x.n);

/** 公开状态里跟着死活变的部分 */
function live(s: GameState, ai: Partial<AiPublic>): Pick<AiPublic, 'alive' | 'ghost' | 'spent'> {
  const spent = ai.spent ?? [];
  return { alive: aliveOf(s), ghost: s.seats.filter((x) => !x.alive && !x.left && !spent.includes(x.n)).map((x) => x.n), spent };
}

/** 选人请求发到手机上的内容（和真人说书人模式一样） */
function askBody(s: GameState, a: AiAsk): MsgBody {
  const deaths = s.ns?.deaths ?? [];
  return {
    card: { title: a.title, big: [], lines: a.lines },
    ask: {
      count: a.count,
      seats: s.seats.filter((x) => !x.left).map((x) => x.n),
      dead: s.seats.filter((x) => !x.alive && !deaths.includes(x.n)).map((x) => x.n),
      disabled: a.disabled?.filter((n) => !deaths.includes(n)),
    },
  };
}

/** 他没反应、平板上点了跳过：替他随便选 */
function randomPicks(s: GameState, a: AiAsk): number[] {
  const pool = s.seats.filter((x) => !x.left && !(a.disabled ?? []).includes(x.n)).map((x) => x.n);
  const out: number[] = [];
  while (out.length < a.count && out.length < pool.length) {
    const n = pool[Math.floor(Math.random() * pool.length)];
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

function useAiHost(g: Game, room: HostRoom, say: (t: string) => void, now: number, unread: number[], skip: { current: boolean }) {
  const latest = useRef({ g, room, now, unread });
  latest.current = { g, room, now, unread };
  const busy = useRef(false);
  const mark = useRef<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (busy.current) return;
    busy.current = true;
    step()
      .catch((e) => console.error('AI 说书人出错', e))
      .finally(() => (busy.current = false));

    async function step() {
      const { g, room, now, unread } = latest.current;
      const s = g.s;
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
        const plan = aiPlan(s, { spyRows });
        const cur = s.ns!.slot;
        const slot = currentSlot(s);
        if (!plan) {
          g.commit((st) => completeSlot(st, { kind: 'none' }));
          return;
        }
        let r: Exclude<typeof plan, { ask: unknown }>;
        if ('ask' in plan) {
          const a = plan.ask;
          const id = nightMsgId(s.night, cur, a.n, 'pick');
          if (!room.msgs[a.n]?.[id]) {
            await room.send(a.n, id, askBody(s, a));
            return;
          }
          const picks = answerOf(room.acks, a.n, id)?.seats ?? (takeSkip() ? randomPicks(s, a) : null);
          if (!picks) return;
          r = plan.then(picks);
        } else r = plan;
        for (const m of r.send) {
          const id = nightMsgId(s.night, cur, m.n, m.tag);
          if (!room.msgs[m.n]?.[id]) {
            await room.send(m.n, id, { card: m.card });
            if (m.role) await room.setRole(m.n, m.role);
            return;
          }
        }
        const waiting = r.send.some((m) => !room.acks[m.n]?.[nightMsgId(s.night, cur, m.n, m.tag)]);
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
        g.commit((st) => completeSlot(st, r.payload));
        return;
      }

      if (s.phase !== 'day') return;

      /* ---------- 白天 ---------- */
      // 白天有人死了分出胜负（猎手打中恶魔、处决圣徒……）：直接结束
      if (s.winner && s.executed === undefined) {
        g.commit((st) => finishDay(st));
        return;
      }
      // 新的一天：念死讯，开始私聊倒计时
      if (!ai || ai.day !== s.night || ai.stage === 'night' || ai.stage === 'wait') {
        const deaths = dawnLines(s.ns?.deaths ?? [], s.style, { phones: true }).join('');
        await speak(`${deaths}现在是第 ${s.night} 天。私聊时间 ${Math.round(settings.priv / 60)} 分钟，可以离开座位找人单独聊。`, {
          stage: 'private', day: s.night, until: now + settings.priv * 1000, nominators: [], nominees: [], noMore: [], shots: [], results: [], nom: undefined, vote: undefined,
        });
        return;
      }
      // 处决已经定了（例如刷新前刚处决）：进入"今天的处决"
      if (s.executed !== undefined && ai.stage !== 'result') {
        await put({ stage: 'result', until: now + 6000 });
        return;
      }
      // 宣称猎手开枪：投票时不处理
      if (ai.stage !== 'vote' && ai.stage !== 'result') {
        const shooter = aliveOf(s).find((n) => acts(n).slay?.day === ai.day && !(ai.shots ?? []).includes(n));
        if (shooter !== undefined) {
          const target = acts(shooter).slay!.target;
          const r = aiSlayer(s, shooter, target);
          g.commit((st) => slayerShoot(st, shooter, target, r.twist));
          await speak(`${seatName(shooter)} 宣称自己是猎手，向 ${seatName(target)} 开枪。${r.hits ? `${seatName(target)} 死了。` : '什么都没有发生。'}`, { shots: [...(ai.shots ?? []), shooter] });
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
          const alive = aliveOf(s);
          const noMore = alive.filter((n) => acts(n).nomore === ai.day);
          if (noMore.join() !== (ai.noMore ?? []).join()) {
            await put({ noMore });
            return;
          }
          const canNominate = alive.filter((n) => !(ai.nominators ?? []).includes(n));
          // 所有活人都点了"不再提名"，或者没人还能提名：今天结束
          if (canNominate.every((n) => noMore.includes(n)) || takeSkip()) {
            const block = nomResults(s).block;
            g.commit((st) => execute(st, block));
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
          const v = aiVirgin(s, target, by);
          if (v.virgin) {
            // 先在副本上试：贞洁者会不会把提名者处决
            const trial = clone(s);
            nominateVirgin(trial, target, by, v.twist);
            const fired = trial.executed !== undefined;
            g.commit((st) => nominateVirgin(st, target, by, v.twist));
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
          await speak(`开始投票，需要 ${need} 票。从 ${seatName(order[0])} 开始，按顺时针一人 ${settings.vote} 秒，轮到你时在手机上举手。`, {
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
          g.commit((st) => void st.noms.push({ day: st.night, seat: nom.target, votes: t.votes, need: vote.need }));
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
          g.commit((st) => finishDay(st));
          return;
        }
      }
    }
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
}
