// AI 说书人局：玩家手机上的白天——看倒计时和平板念的话，提名、发言结束、轮到自己时举手、不再提名、宣称猎手开枪、宣称戏法师猜。
import { useEffect, useRef, useState } from 'react';
import { aiAct, roomError, watchOffset } from '../../room/api';
import { handVotes, seatLabel, type AiActs, type AiPublic, type SeatInfo } from '../../room/protocol';
import { Icon } from '../icons';

const STAGE: Record<AiPublic['stage'], string> = {
  wait: '准备中',
  night: '夜晚：有消息会自动弹出来',
  private: '私聊时间',
  public: '公聊时间',
  nominate: '提名时间',
  speech1: '提名者发言',
  speech2: '被提名者辩护',
  vote: '投票',
  result: '今天的处决',
};

/** 服务器时间（和平板同一个钟） */
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

export function AiDay({ code, seat, ai, seats }: { code: string; seat: number; ai: AiPublic; seats: Record<string, SeatInfo> }) {
  const now = useServerNow();
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'nom' | 'slay' | 'minions' | 'demons' | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  // 宣称戏法师：先点爪牙，再点恶魔（都可以点好几个）
  const [guess, setGuess] = useState<{ minions: number[]; demons: number[] }>({ minions: [], demons: [] });
  // 自己今天做过什么只记在本机（数据库里的操作只有平板读得到）
  // 存在本机：刷新、锁屏回来，"今天不再提名"、举手这些还在
  const key = `botc-ai-mine-${code}-${seat}`;
  const [mine, setMine] = useState<{ day: number; nom?: number; noMore?: boolean; shot?: boolean; guessed?: boolean; hand?: Record<number, boolean> }>(() => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '') ?? { day: ai.day };
    } catch {
      return { day: ai.day };
    }
  });
  const me = mine.day === ai.day ? mine : { day: ai.day };
  const set = (x: Partial<typeof mine>) => {
    const next = { ...me, ...x, day: ai.day };
    setMine(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* 存不了只是刷新后按钮状态不在 */
    }
  };
  const act = <K extends keyof AiActs>(k: K, v: AiActs[K] | null) => aiAct(code, seat, k, v).catch((e) => setErr(roomError(e)));

  const alive = ai.alive.includes(seat);
  // 报丧女妖能力生效：死了也能提名，每天两次，投票算两票
  const banshee = ai.banshee === seat;
  const times = (ai.nominators ?? []).filter((n) => n === seat).length;
  const nominated = times >= (banshee ? 2 : 1);
  const claims = ai.claims ?? [];
  // 我的提名：已经轮到过了 / 被别人抢先提名了同一个人（作废）/ 还在排队
  const myNomDone = me.nom !== undefined && ((ai.results ?? []).some((r) => r.by === seat && r.target === me.nom) || (ai.nom?.by === seat && ai.nom.target === me.nom));
  const myNomLost = me.nom !== undefined && !myNomDone && (ai.nominees ?? []).includes(me.nom);
  const myNomQueued = me.nom !== undefined && !myNomDone && !myNomLost && !nominated;
  const withdraw = () => {
    set({ nom: undefined });
    act('nom', null);
  };
  const left = ai.until ? ai.until - now : 0;
  const name = (n: number) => `${seatLabel(n)}${n === seat ? '（你）' : seats[n]?.name ? `（${seats[n].name}）` : ''}`;
  const voter = ai.stage === 'vote' && ai.vote ? ai.vote.order[ai.vote.at] : null;
  const nom = ai.nom;
  const voters = ai.alive.length + (ai.banshee !== undefined && !ai.alive.includes(ai.banshee) ? 1 : 0);
  const ghost = ai.ghost ?? [];
  const everyone = [...new Set([...ai.alive, ...ghost, ...(ai.spent ?? [])])].sort((a, b) => a - b);

  // 换了阶段就收起选人面板
  useEffect(() => {
    setMode(null);
    setPick(null);
    setGuess({ minions: [], demons: [] });
  }, [ai.stage, ai.day]);
  // 轮到自己举手：手机震一下（抬头聊天时也不会错过）
  const myTurn = voter === seat;
  useEffect(() => {
    if (myTurn) navigator.vibrate?.(200);
  }, [myTurn, nom?.i]);

  const grid = (allowed: (n: number) => boolean) => (
    <div className="role-grid">
      {everyone.map((n) => (
        <button key={n} className="role-chip" disabled={!allowed(n)} style={pick === n ? { boxShadow: '0 0 0 2px var(--gold) inset' } : allowed(n) ? undefined : { opacity: 0.4 }} onClick={() => setPick(n)}>
          {seatLabel(n)}
          <small>{[n === seat ? '你' : seats[n]?.name, !ai.alive.includes(n) && '已死'].filter(Boolean).join(' · ')}</small>
        </button>
      ))}
    </div>
  );

  return (
    <div className="card stack ai-phone" style={{ gap: 10 }}>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
        <b>
          第 {ai.day} {ai.stage === 'night' ? '夜' : '天'} ·{' '}
          {/* 之前就死了的人：夜里通常收不到任何东西，别让他以为手机坏了 */}
          {ai.stage === 'night' && !alive ? '夜晚：你已经死了，今晚多半没有你的事（有事会自动弹出来）' : STAGE[ai.stage]}
        </b>
        {ai.until && (ai.stage === 'private' || ai.stage === 'public' || ai.stage === 'vote') && <b className="ai-clock-sm">{mmss(left)}</b>}
      </div>
      {ai.say && <p className="ai-say-sm">{ai.say}</p>}
      {ai.stage !== 'night' && ai.dawn && !ai.say?.includes(ai.dawn) && <p className="dim">今天天亮时：{ai.dawn}</p>}

      {/* 我的提名在排队 / 作废了：任何时候都看得到，排队时能撤回 */}
      {myNomQueued && ai.stage !== 'nominate' && ai.stage !== 'result' && (
        <div className="card stack" style={{ gap: 6 }}>
          <p>你提名了 {name(me.nom!)}，在排队：这一轮结束后就轮到你。</p>
          <button className="btn btn-ghost btn-sm" onClick={withdraw}>
            撤回我的提名
          </button>
        </div>
      )}
      {myNomLost && ai.stage !== 'result' && (
        <div className="card card-warn stack" style={{ gap: 6 }}>
          <p>你提名的 {name(me.nom!)} 已经被别人先提名了（每人每天只能被提名一次），你的提名作废。{ai.stage === 'nominate' ? '可以重新提名。' : '等提名时间再选一次。'}</p>
          <button className="btn btn-ghost btn-sm" onClick={withdraw}>
            知道了
          </button>
        </div>
      )}

      {/* 发言 */}
      {(ai.stage === 'speech1' || ai.stage === 'speech2') && nom && (
        <>
          <p>
            {name(nom.by)} 提名了 {name(nom.target)}。
          </p>
          {(ai.stage === 'speech1' ? nom.by : nom.target) === seat ? (
            <button className="btn btn-primary btn-block" onClick={() => act('spoke', { day: ai.day, i: nom.i })}>
              我说完了：发言结束
            </button>
          ) : (
            <p className="dim">{ai.stage === 'speech1' ? `${seatLabel(nom.by)}在说明理由` : `${seatLabel(nom.target)}在辩护`}，说完他会点"发言结束"。</p>
          )}
        </>
      )}

      {/* 投票 */}
      {ai.stage === 'vote' && nom && ai.vote && (
        <>
          <p>
            {name(nom.by)} 提名了 {name(nom.target)}，需要 {ai.vote.need} 票。现在 {handVotes(ai)} 票。
          </p>
          {voter === seat ? (
            !alive && !ghost.includes(seat) ? (
              <p className="card card-warn">轮到你了，但你已经死了、那一票也用掉了。</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <b>轮到你了：{mmss(left)} 内决定</b>
                {banshee ? <p className="dim">你是报丧女妖：举手算两票。</p> : !alive && <p className="dim">你已经死了：举手会用掉你整局唯一的一票。</p>}
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className={`btn grow ${me.hand?.[nom.i] ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      set({ hand: { ...me.hand, [nom.i]: true } });
                      act('hand', { day: ai.day, i: nom.i, up: true });
                    }}
                  >
                    ✋ 举手
                  </button>
                  <button
                    className={`btn grow ${me.hand?.[nom.i] === false ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => {
                      set({ hand: { ...me.hand, [nom.i]: false } });
                      act('hand', { day: ai.day, i: nom.i, up: false });
                    }}
                  >
                    不举
                  </button>
                </div>
              </div>
            )
          ) : (
            <p className="dim">{voter ? `现在轮到 ${seatLabel(voter)}。` : ''}按顺时针轮流，轮到你时这里会出现"举手"。</p>
          )}
        </>
      )}

      {/* 提名 */}
      {ai.stage === 'nominate' &&
        (!alive && !banshee ? (
          <p className="dim">你已经死了，不能提名。{ghost.includes(seat) ? '你还有一次投票。' : '你的那一票已经用掉了。'}</p>
        ) : nominated ? (
          <p className="dim">你今天已经提名过{banshee ? '两次' : ''}了。</p>
        ) : mode === 'nom' ? (
          <div className="stack" style={{ gap: 8 }}>
            <b>你要提名谁？（今天被提名过的人不能再被提名）</b>
            {grid((n) => !(ai.nominees ?? []).includes(n))}
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setMode(null)}>
                算了
              </button>
              <button
                className="btn btn-primary grow"
                disabled={pick === null}
                onClick={() => {
                  if (pick === null) return;
                  set({ nom: pick, noMore: false });
                  act('nom', { day: ai.day, target: pick, at: now });
                  setMode(null);
                }}
              >
                {pick === null ? '点一个人' : `提名 ${name(pick)}`}
              </button>
            </div>
          </div>
        ) : myNomQueued ? (
          <div className="stack" style={{ gap: 6 }}>
            <p className="dim">你提名了 {name(me.nom!)}，等平板念出来……（有人比你先提名的话，等他们这轮投完就轮到你）</p>
            <button className="btn btn-ghost btn-sm" onClick={withdraw}>
              撤回，重新选
            </button>
          </div>
        ) : myNomLost ? null : (
          <>
            {banshee && <p className="dim">你是报丧女妖：今天还能提名 {2 - times} 次（死了也能），投票时举手算两票。</p>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary grow" onClick={() => setMode('nom')}>
              提名
            </button>
            <button
              className={`btn grow ${me.noMore ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => {
                set({ noMore: !me.noMore });
                act('nomore', me.noMore ? 0 : ai.day);
              }}
            >
              {me.noMore ? '已点"今天不再提名"（点一下撤回）' : '今天不再提名'}
            </button>
          </div>
          </>
        ))}
      {ai.stage === 'nominate' && (
        <p className="dim">
          {(ai.noMore ?? []).length} / {voters} 人已经提名过或点了"今天不再提名"；到齐了，今天的提名就结束。
        </p>
      )}

      {/* 宣称猎手开枪 */}
      {claims.includes('slayer') && alive && ai.stage !== 'night' && ai.stage !== 'vote' && ai.stage !== 'result' && !(ai.shots ?? []).includes(seat) && !me.shot && (
        <details className="more">
          <summary>
            <Icon name="chevronDown" size={18} /> 宣称自己是猎手并开枪
          </summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <p className="dim">谁都可以宣称。只有真的猎手打中恶魔，恶魔才会死；否则什么都不会发生。每人每天只能开一次。</p>
            {mode === 'slay' ? (
              <>
                {grid((n) => n !== seat && ai.alive.includes(n))}
                <button
                  className="btn btn-danger btn-block"
                  disabled={pick === null}
                  onClick={() => {
                    if (pick === null) return;
                    set({ shot: true });
                    act('slay', { day: ai.day, target: pick });
                    setMode(null);
                  }}
                >
                  {pick === null ? '点你要开枪的人' : `向 ${name(pick)} 开枪`}
                </button>
              </>
            ) : (
              <button className="btn btn-outline btn-block" onClick={() => setMode('slay')}>
                我要开枪
              </button>
            )}
          </div>
        </details>
      )}

      {/* 宣称戏法师公开猜 */}
      {claims.includes('alsaahir') && alive && ai.stage !== 'night' && ai.stage !== 'vote' && ai.stage !== 'result' && !(ai.guesses ?? []).includes(seat) && !me.guessed && (
        <details className="more">
          <summary>
            <Icon name="chevronDown" size={18} /> 宣称自己是戏法师，公开猜爪牙和恶魔
          </summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <p className="dim">谁都可以宣称。只有真的戏法师把所有爪牙和恶魔都猜对（死了的也算），善良才直接获胜；否则什么都不会发生。每人每天只能猜一次。</p>
            {mode === 'minions' || mode === 'demons' ? (
              <>
                <b>{mode === 'minions' ? '第 1 步：点你认为是爪牙的人（可以点好几个，没有就不点）' : '第 2 步：点你认为是恶魔的人'}</b>
                <div className="role-grid">
                  {everyone.map((n) => {
                    const on = guess[mode].includes(n);
                    const other = mode === 'minions' ? guess.demons : guess.minions;
                    return (
                      <button
                        key={n}
                        className="role-chip"
                        disabled={other.includes(n)}
                        style={on ? { boxShadow: '0 0 0 2px var(--gold) inset' } : other.includes(n) ? { opacity: 0.4 } : undefined}
                        onClick={() => setGuess({ ...guess, [mode]: on ? guess[mode].filter((x) => x !== n) : [...guess[mode], n] })}
                      >
                        {seatLabel(n)}
                        <small>{[n === seat ? '你' : seats[n]?.name, !ai.alive.includes(n) && '已死'].filter(Boolean).join(' · ')}</small>
                      </button>
                    );
                  })}
                </div>
                {mode === 'minions' ? (
                  <button className="btn btn-outline btn-block" onClick={() => setMode('demons')}>
                    {guess.minions.length ? `爪牙：${guess.minions.map(seatLabel).join('、')}。下一步：点恶魔` : '没有爪牙。下一步：点恶魔'}
                  </button>
                ) : (
                  <div className="row" style={{ gap: 8 }}>
                    <button className="btn btn-ghost" onClick={() => setMode('minions')}>
                      上一步
                    </button>
                    <button
                      className="btn btn-danger grow"
                      disabled={!guess.demons.length}
                      onClick={() => {
                        set({ guessed: true });
                        act('guess', { day: ai.day, minions: guess.minions, demons: guess.demons });
                        setMode(null);
                      }}
                    >
                      {guess.demons.length ? `公开猜：爪牙 ${guess.minions.map(seatLabel).join('、') || '没有'}，恶魔 ${guess.demons.map(seatLabel).join('、')}` : '点你认为是恶魔的人'}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button className="btn btn-outline btn-block" onClick={() => setMode('minions')}>
                我要猜
              </button>
            )}
          </div>
        </details>
      )}

      {ai.results && ai.results.length > 0 && (
        <div className="stack" style={{ gap: 2 }}>
          <b>今天的提名</b>
          {ai.results.map((r, i) => (
            <p key={i} className="dim">
              {seatLabel(r.by)} → {seatLabel(r.target)}：{r.votes} 票，{r.text}
            </p>
          ))}
        </div>
      )}
      {err && <p className="card card-warn">{err}</p>}
    </div>
  );
}
