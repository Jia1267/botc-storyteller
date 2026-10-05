import { useMemo, useState } from 'react';
import { balance, recommend, type Choice } from '../engine/balance';
import { actorFor, aliveCount, seatOf } from '../engine/core';
import { execute, finishDay, nominateVirgin, previewSlayer, previewVirgin, slayerShoot } from '../engine/flow';
import { scarletCanTakeOver } from '../engine/info';
import type { GameState } from '../engine/types';
import { dayStartLines, endLines, executionLines, nominationLines } from '../engine/scripts';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, DoBox, SayBox, SeatPicker, Sheet, useUi } from './common';
import { GrimoirePanel } from './Grimoire';
import { TimerDisplay } from './Timer';

const toggleStyle = (g: Game) => () => g.tweak((st) => (st.style = st.style === 'simple' ? 'atmo' : 'simple'));

/** 红唇女郎白天接任后，一直挂在白天页面最上面 */
function SwNotice({ s }: { s: GameState }) {
  if (s.pendingNewDemon === null) return null;
  const old = s.seats.find((x) => x.role === 'imp' && !x.alive && x.death?.when === 'day' && x.death.night === s.night);
  const said = old ? `${old.n}号 ${s.executed === old.n ? '被处决了' : '死了'}` : '';
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>红唇女郎（{s.pendingNewDemon}号）接任恶魔，游戏继续</b>
      {said && <p>公开只说「{said}」。</p>}
      <p>不要宣布游戏结束，也不要提红唇女郎。今晚会叫醒她，告诉她现在是小恶魔。</p>
    </div>
  );
}

/** 处决/射杀恶魔前的提醒：红唇女郎会不会接任 */
function demonDeathWarning(s: GameState, n: number, verb: '被处决了' | '死了') {
  if (seatOf(s, n).role !== 'imp') return null;
  const sw = scarletCanTakeOver(s);
  if (!sw) return <div className="card"><p>{n}号 是恶魔：他死后善良获胜。</p></div>;
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>红唇女郎（{sw.n}号）会接任恶魔，游戏继续</b>
      <p>公开只说「{n}号 {verb}」。不要宣布游戏结束，也不要提红唇女郎。</p>
    </div>
  );
}

export function DayScreen({ g }: { g: Game }) {
  const s = g.s;
  const [panel, setPanel] = useState<'virgin' | 'slayer' | 'exec' | null>(null);
  if (s.executed !== undefined || s.winner) return <DayResult g={g} />;

  const alive = aliveCount(s);
  const need = Math.ceil(alive / 2);
  const butler = s.seats.find((x) => x.role === 'butler' && x.alive);
  const virgin = actorFor(s, 'virgin');
  const showVirgin = virgin && virgin.alive && !virgin.used;

  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack">
        <div className="step-head">
          <span className="kicker">白天</span>
          <h2>第 {s.night} 天</h2>
        </div>
        <SwNotice s={s} />
        <SayBox lines={dayStartLines(s.night, s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
        <div className="card">
          <h3>讨论计时</h3>
          <TimerDisplay />
          <p className="dim center" style={{ marginTop: 6 }}>
            右上角的眼睛按钮可以一键盖屏，只显示计时器。
          </p>
        </div>
        <SayBox lines={nominationLines(s.style)} title="讨论结束后说" />
        <div className="card">
          <h3>投票规则（你来数票）</h3>
          <p>
            现在存活 <b>{alive}</b> 人 → 处决至少需要 <b className="answer" style={{ fontSize: 22 }}>{need}</b> 票
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="muted">
            <li>从被提名者开始，顺时针一个一个数举手的人。</li>
            <li>票数 ≥ {need}，而且比今天之前的最高票还多，他就成为"待处决"的人。</li>
            <li>和最高票打平：两个人都不处决。</li>
            <li>每人每天只能提名一次、只能被提名一次。死人不能提名。</li>
            <li>死人整局只剩一次投票，用掉就不能再投。</li>
            <li>所有提名结束后，"待处决"的人被处决。也可以一个都不处决。</li>
          </ul>
        </div>
        {butler && s.butlerMaster && (
          <div className="card card-warn">
            <p>
              管家 {butler.n}号 只有在主人 <b>{s.butlerMaster}号</b> 举手时才能举手投票。
            </p>
          </div>
        )}
        <div className="card">
          <h3>白天突发情况</h3>
          <div className="stack" style={{ gap: 8 }}>
            {showVirgin && (
              <button className="btn btn-ghost btn-block" onClick={() => setPanel('virgin')}>
                有人提名了 {virgin!.n}号（{virgin!.role === 'drunk' ? '以为自己是贞洁者的酒鬼' : '贞洁者'}）
              </button>
            )}
            <button className="btn btn-ghost btn-block" onClick={() => setPanel('slayer')}>
              有人宣称自己是猎手并开枪
            </button>
          </div>
        </div>
      </div>
      {panel === 'virgin' && virgin && <VirginSheet g={g} virginN={virgin.n} onClose={() => setPanel(null)} />}
      {panel === 'slayer' && <SlayerSheet g={g} onClose={() => setPanel(null)} />}
      {panel === 'exec' && <ExecSheet g={g} onClose={() => setPanel(null)} />}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => setPanel('exec')}>
          所有提名结束，录入处决结果
        </button>
      </BottomBar>
    </main>
  );
}

function ExecSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const [t, setT] = useState<number[]>([]);
  return (
    <Sheet title="今天的处决结果" onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={setT} label="谁被处决了？" />
        {t.length > 0 && seatOf(s, t[0]).role === 'saint' && <p className="evil">注意：{t[0]}号 是圣徒。</p>}
        {t.length > 0 && seatOf(s, t[0]).alive && demonDeathWarning(s, t[0], '被处决了')}
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => g.commit((st) => execute(st, t[0]))}>
          {t.length ? `处决 ${t[0]}号` : '先点出被处决的人'}
        </button>
        <button className="btn btn-outline btn-block" onClick={() => g.commit((st) => execute(st, null))}>
          今天没人被处决
        </button>
      </div>
    </Sheet>
  );
}

function DayResult({ g }: { g: Game }) {
  const s = g.s;
  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack">
        <div className="step-head">
          <span className="kicker">第 {s.night} 天 · 结束</span>
          <h2>{s.winner ? '游戏结束' : '白天结束'}</h2>
        </div>
        <SwNotice s={s} />
        {s.executed !== undefined && <SayBox lines={executionLines(s.executed, s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />}
        {s.winner ? (
          <>
            <div className={`card ${s.winner === 'good' ? '' : 'card-evil'}`}>
              <h3>{s.winner === 'good' ? '善良' : '邪恶'}阵营获胜</h3>
              <p>{s.winReason}</p>
            </div>
            <SayBox lines={endLines(s.winner, s.style)} title="对所有人说" />
          </>
        ) : (
          <DoBox items={['宣布完处决结果，准备入夜。']} />
        )}
      </div>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => g.commit((st) => finishDay(st))}>
          {s.winner ? '宣布结果，查看复盘' : '入夜'}
        </button>
      </BottomBar>
    </main>
  );
}

function twistChoices(kind: 'spyTownsfolk' | 'recluseDemon'): Choice<boolean>[] {
  if (kind === 'spyTownsfolk')
    return [
      { key: 'yes', label: '把间谍当成镇民：他被处决', value: true, lean: 1, truth: true, twist: true, reason: '邪恶少一个爪牙，帮善良。' },
      { key: 'no', label: '不当成镇民：什么都不发生', value: false, lean: -1, truth: true, reason: '间谍活下来，帮邪恶。' },
    ];
  return [
    { key: 'yes', label: '把陌客当成恶魔：陌客死亡', value: true, lean: -1, truth: true, twist: true, reason: '好人白白少一个人，帮邪恶。' },
    { key: 'no', label: '不当成恶魔：什么都不发生', value: false, lean: 1, truth: true, reason: '陌客活下来，帮善良。' },
  ];
}

function TwistPick({ g, kind, onValue }: { g: Game; kind: 'spyTownsfolk' | 'recluseDemon'; onValue: (v: boolean) => void }) {
  const s = g.s;
  const choices = useMemo(() => twistChoices(kind), [kind]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 7)), [choices, s]);
  const [sel, setSel] = useState(rec);
  return (
    <ChoicePanel
      s={s}
      choices={choices}
      sel={sel}
      rec={rec}
      onSel={(i) => {
        if (i < 0) return;
        setSel(i);
        onValue(choices[i].value);
      }}
    />
  );
}

function VirginSheet({ g, virginN, onClose }: { g: Game; virginN: number; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const pv = t.length ? previewVirgin(s, virginN, t[0]) : null;
  const [twist, setTwist] = useState<boolean | null>(null);
  const twistVal = twist ?? (pv?.askTwist ? twistChoices(pv.askTwist)[recommend(twistChoices(pv.askTwist), balance(s).score, stepRng(s, 7))].value : false);
  const fires = pv ? pv.applies || (!!pv.askTwist && twistVal) : false;
  return (
    <Sheet title={`${virginN}号 被提名了`} onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setTwist(null); }} disabled={[virginN]} label="是谁提名的？" />
        {pv && <div className="card"><p>{pv.reason}</p></div>}
        {pv?.askTwist && <TwistPick key={t[0]} g={g} kind={pv.askTwist} onValue={setTwist} />}
        {pv && (
          <SayBox
            title="公开宣布"
            lines={fires ? [`${t[0]}号 被处决了。`] : ['提名有效，继续进行投票。']}
          />
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => nominateVirgin(st, virginN, t[0], twistVal));
            ui.toast(fires ? `${t[0]}号 被立刻处决` : '贞洁者能力未触发，继续投票');
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

function SlayerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [shooter, setShooter] = useState<number[]>([]);
  const [target, setTarget] = useState<number[]>([]);
  const pv = shooter.length && target.length ? previewSlayer(s, shooter[0], target[0]) : null;
  const [twist, setTwist] = useState<boolean | null>(null);
  const twistVal = twist ?? (pv?.askTwist ? twistChoices(pv.askTwist)[recommend(twistChoices(pv.askTwist), balance(s).score, stepRng(s, 7))].value : false);
  const hit = pv ? pv.applies || (!!pv.askTwist && twistVal) : false;
  return (
    <Sheet title="猎手开枪" onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={shooter} max={1} onChange={(v) => { setShooter(v); setTwist(null); }} label="谁开的枪？" />
        <SeatPicker s={s} selected={target} max={1} onChange={(v) => { setTarget(v); setTwist(null); }} label="他向谁开枪？" />
        {pv && <div className="card"><p>{pv.reason}</p></div>}
        {pv?.swTakeover && demonDeathWarning(s, target[0], '死了')}
        {pv?.askTwist && <TwistPick key={`${shooter[0]}-${target[0]}`} g={g} kind={pv.askTwist} onValue={setTwist} />}
        {pv && <SayBox title="公开宣布" lines={hit ? [`${target[0]}号 死了。`] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => slayerShoot(st, shooter[0], target[0], twistVal));
            ui.toast(!hit ? '什么都没有发生' : pv?.swTakeover ? `${target[0]}号 死亡，红唇女郎接任，游戏继续` : `${target[0]}号 死亡`);
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}
