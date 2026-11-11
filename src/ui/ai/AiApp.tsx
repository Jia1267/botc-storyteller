// AI 说书人（B 版）：平板放在桌子中间，它就是说书人。
// 屏幕是公共面板（谁坐哪、谁死了、倒计时、投票），台词用系统自带的中文语音念，同时显示文字；
// 夜里按官方顺序在后台处理，选人、给信息都走各人的手机。平板上不显示任何人的身份。
import { useCallback, useEffect, useRef, useState } from 'react';
import { AI_DEFAULTS, AI_SCRIPTS, aiMissing, aiPlan, aiSetCount } from '../../engine/ai';
import { roleName } from '../../engine/roles';
import { scriptOf } from '../../engine/core';
import { SCRIPTS } from '../../engine/editions';
import { seatName } from '../../engine/core';
import { currentSlot, finishDeal } from '../../engine/flow';
import { seeded } from '../../engine/rng';
import { SLOT_TITLE, endLines } from '../../engine/scripts';
import { setScript, shuffleSeats, startDeal } from '../../engine/setup';
import { watchOffset } from '../../room/api';
import { handVotes, msgStatus, voteGoal, type AiPublic } from '../../room/protocol';
import type { Game } from '../../store';
import { dealCard } from '../dealCard';
import { EndScreen } from '../End';
import { BottomBar, ConfirmButton } from '../common';
import { spyRows } from '../Grimoire';
import { NightPhones, useNightUnread } from '../room/nightRoom';
import { RoomJoin, useRoom, type HostRoom } from '../room/hostRoom';
import { aiStep } from './aiHost';

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

/**
 * 平板别自动锁屏：私聊、公聊一放就是几分钟没人碰，一锁屏后台主持就停了。
 * 浏览器支持就一直亮着（切回来再要一次）；不支持返回 false，设置页提醒手动关自动锁定。
 */
function useWakeLock(on: boolean): boolean {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  useEffect(() => {
    if (!on || !supported) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else l.release().catch(() => {});
        })
        .catch(() => {});
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', ask);
      lock?.release().catch(() => {});
    };
  }, [on, supported]);
  return supported;
}

/* ---------------- 入口 ---------------- */

export default function AiApp({ g, onExit }: { g: Game; onExit: () => void }) {
  const s = g.s;
  const room = useRoom();
  const say = useVoice();
  const [unlocked, setUnlocked] = useState(false);
  const awake = useWakeLock(!!room.code);
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
          <b>AI 说书人 · {scriptOf(s).name}</b>
          <small>{room.code ? `房间 ${room.code}` : '还没开房间'}</small>
        </div>
        {room.code && (
          <ConfirmButton
            className="btn btn-ghost btn-sm"
            label="关闭房间"
            confirmLabel={s.phase === 'end' ? '再点一次：关闭房间（手机上的复盘还能看，MVP 不能再投）' : '再点一次：关闭房间，所有玩家退出'}
            onConfirm={room.close}
          />
        )}
      </header>
      {!unlocked && s.phase !== 'setup' && s.phase !== 'end' && canSpeak && <p className="card card-warn ai-unlock">点一下屏幕开启声音（平板要先点一下才能念台词）。</p>}
      {!awake && <p className="card card-warn">这台设备的浏览器不能保持屏幕常亮：请在系统设置里把"自动锁定"关掉，不然几分钟没人碰，平板一锁屏网页就不主持了。</p>}
      {body}
    </div>
  );
}

/* ---------------- 开局：人数、时间、扫码入座 ---------------- */

function AiSetup({ g, onStart, onExit }: { g: Game; onStart: () => void; onExit: () => void }) {
  const s = g.s;
  const room = useRoom();
  const set = s.ai ?? AI_DEFAULTS;
  const sc = scriptOf(s);
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
          <b>玩哪个剧本？</b>
          <div className="seg">
            {AI_SCRIPTS.map((id) => (
              <button key={id} className={s.script === id ? 'on' : ''} onClick={() => g.commit((st) => setScript(st, id))}>
                {SCRIPTS[id].name}
              </button>
            ))}
          </div>
          <b>几个人玩？</b>
          <div className="role-grid">
            {Array.from({ length: sc.max - sc.min + 1 }, (_, i) => i + sc.min).map((n) => (
              <button key={n} className="role-chip" style={s.count === n && seatNs.length ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => g.commit((st) => aiSetCount(st, n, seeded(Date.now())))}>
                {n} 人
              </button>
            ))}
          </div>
          <p className="dim">角色由网页随机配一套均衡的，平板上不会显示。</p>
          {aiMissing(s).length > 0 && (
            <p className="dim">
              这局一定不会出现（要靠真人说书人判断，AI 带不了）：{aiMissing(s).map(roleName).join('、')}。可以告诉大家。
            </p>
          )}
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
        <button className="btn btn-primary btn-block" disabled={room.busy || !seatNs.length || missing.length > 0} onClick={room.code ? start : room.open}>
          {!seatNs.length ? '先选人数' : !room.code ? '开房间（大家扫码入座）' : missing.length ? `还没入座：${missing.map(seatName).join('、')}` : '开始：把身份发到每个人手机上'}
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
  // 夜里这一步网页没有处理办法（bug）：报出来，不悄悄跳过
  const unknown = s.phase === 'night' && !aiPlan(s, { spyRows });
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
            {ai.stage === 'vote' && ai.vote && `　${voteGoal(ai.vote.need, ai.results)}　现在 ${handVotes(ai)} 票`}
            {voter && `　轮到 ${seatName(voter)}`}
          </p>
        )}
        {ai?.say && <p className="ai-say">{ai.say}</p>}
        {s.phase === 'day' && ai?.dawn && !ai.say?.includes(ai.dawn) && <p className="muted">今天天亮时：{ai.dawn}</p>}
        {s.phase === 'night' && <p className="muted">{unread.length ? `还在等 ${unread.length} 个人点手机。` : '网页在处理……'}</p>}
        <div className="ai-seats">
          {s.seats.map((x) => {
            const hand = ai?.vote?.hands?.[x.n];
            // 死活按公开进度显示：夜里死的人天亮才公布，不能先出现在桌上
            const alive = ai ? ai.alive.includes(x.n) : x.alive;
            return (
              <div key={x.n} className={`ai-seat${alive ? '' : ' dead'}${voter === x.n ? ' turn' : ''}${hand ? ' up' : ''}`}>
                <b>{seatName(x.n)}</b>
                <small>{name(x.n) || ''}</small>
                <small>
                  {ai?.banshee === x.n ? '报丧女妖 · 提名两次、算两票' : alive ? '' : (ai?.ghost ?? []).includes(x.n) ? '已死 · 还有一票' : '已死 · 没有票了'}
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
          {stuck && s.phase === 'night' && !unknown && (
            <button className="btn btn-ghost btn-sm" onClick={() => (skip.current = true)}>
              等太久了：跳过（替他随便选、当他看过了）
            </button>
          )}
        </div>
        {unknown && (
          <div className="card card-warn stack" style={{ gap: 8 }}>
            <p>网页不知道夜里这一步（{SLOT_TITLE[currentSlot(s)] ?? currentSlot(s)}）该怎么处理，这是网页的 bug。点下面跳过这一步继续玩，结束后告诉开发者。</p>
            <button className="btn btn-outline btn-block" onClick={() => (skip.current = true)}>
              跳过这一步
            </button>
          </div>
        )}
      </div>
      <NightPhones s={s} />
    </main>
  );
}

/* ---------------- 后台主持：每半秒调一次 aiStep，每次只做一件事 ---------------- */

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
    const { g, room, now, unread } = latest.current;
    aiStep({ s: g.s, room, now, unread, commit: g.commit, say, skip, mark: mark.current })
      .catch((e) => console.error('AI 说书人出错', e))
      .finally(() => (busy.current = false));
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
}
