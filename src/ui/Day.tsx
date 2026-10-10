import { useMemo, useState, type ReactNode } from 'react';
import { FABLED, ROLES, roleName } from '../engine/roles';
import { balance, recommend, type Choice } from '../engine/balance';
import {
  actorFor, aliveCount, aliveVoters, demonSeat, hasAbility, isDemonSeat, isEvil, isTraveller, lilMonsta, malfunction, scriptOf, seatOf, teamOf,
  vortoxActive, seatName,
} from '../engine/core';
import {
  LEVIATHAN_DAYS, advocateSaves, alsaahirCorrect, alsaahirGuess, execute, fearPreview, fearmongerAsk, fearmongerNominates, finishDay, goblinAsk,
  harpyPunish, nominateVirgin, previewSlayer, previewVirgin, setCannibalFake, setDemonVoted, savantVisit, scapegoatFor, setDuchessVisitors,
  slayerShoot, markUsed,
} from '../engine/flow';
import { activeTravellers, beggarLearns, exile, gunslingerPreview, gunslingerShoot, leave } from '../engine/travellers';
import { harpyPunishChoices, killPreview, scarletCanTakeOver } from '../engine/info';
import { AMNESIAC_ANSWERS, artistMode, fishermanChoices, savantChoices } from '../engine/daytime';
import type { GameState, Seat } from '../engine/types';
import { dayStartLines, endLines, executionLines, nominationLines } from '../engine/scripts';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, DoBox, SayBox, SeatPicker, Sheet, useUi } from './common';
import { GrimoirePanel } from './Grimoire';
import { KlutzPrompt, PixiePrompt, promptPending } from './Prompts';
import { TimerDisplay } from './Timer';
import { AddTravellerSheet, ExileSheet } from './Travellers';

const toggleStyle = (g: Game) => () => g.tweak((st) => (st.style = st.style === 'simple' ? 'atmo' : 'simple'));

/** 红唇女郎白天接任后，一直挂在白天页面最上面 */
function SwNotice({ s }: { s: GameState }) {
  const lil = lilMonsta(s) && s.babysitterLocked && s.babysitter;
  if (s.pendingNewDemon === null && !lil) return null;
  const old = s.seats.find(
    (x) => !x.alive && x.death?.when === 'day' && x.death.night === s.night && (ROLES[x.role].team === 'demon' || (lilMonsta(s) && ROLES[x.role].team === 'minion')),
  );
  const said = old ? `${seatName(old.n)} ${s.executed === old.n ? '被处决了' : '死了'}` : '';
  const sw = lil ? s.babysitter! : s.pendingNewDemon!;
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>
        红唇女郎（{seatName(sw)}）{lil ? '接手照看小怪宝' : '接任恶魔'}，游戏继续
      </b>
      {said && <p>公开只说「{said}」。</p>}
      <p>
        不要宣布游戏结束，也不要提红唇女郎。
        {lil ? '今晚爪牙们醒来时，告诉他们由她照看。' : `今晚会叫醒她，告诉她现在是${roleName(seatOf(s, sw).role)}。`}
      </p>
    </div>
  );
}

/** 处决/射杀恶魔前的提醒：红唇女郎会不会接任 */
function demonDeathWarning(s: GameState, n: number, verb: '被处决了' | '死了') {
  if (!isDemonSeat(s, n)) return null;
  // 不会真的死（魔鬼代言人、茶艺师、弄臣）或僵怖第一次假死：另有提示
  const x = seatOf(s, n);
  if ((verb === '被处决了' && advocateSaves(s, n)) || !killPreview(s, n).dies || (x.role === 'zombuul' && !s.zombuulFake && !x.used && !malfunction(s, n))) return null;
  const sw = scarletCanTakeOver(s);
  const who = lilMonsta(s) ? '照看小怪宝的人' : '恶魔';
  if (!sw) return <div className="card"><p>{seatName(n)} 是{who}：他死后善良获胜。</p></div>;
  return (
    <div className="card card-warn stack" style={{ gap: 6 }}>
      <b style={{ color: 'var(--warn)' }}>
        红唇女郎（{seatName(sw.n)}）会{lilMonsta(s) ? '接手照看小怪宝' : '接任恶魔'}，游戏继续
      </b>
      <p>公开只说「{seatName(n)} {verb}」。不要宣布游戏结束，也不要提红唇女郎。</p>
    </div>
  );
}

type Panel = 'virgin' | 'slayer' | 'exec' | 'artist' | 'fisherman' | 'savant' | 'amnesiac' | 'mutant' | 'duchess' | 'fear' | 'alsaahir' | null;

export function DayScreen({ g }: { g: Game }) {
  const s = g.s;
  const [panel, setPanel] = useState<Panel>(null);
  if (s.executed !== undefined || s.winner) return <DayResult g={g} />;

  const alive = aliveVoters(s);
  const tAlive = alive - aliveCount(s);
  const need = Math.ceil(alive / 2);
  const butler = s.seats.find((x) => x.role === 'butler' && x.alive);
  const virgin = actorFor(s, 'virgin');
  const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive);
  const fm = s.seats.find((x) => x.role === 'fearmonger' && x.alive);
  const close = () => setPanel(null);

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
        <KlutzPrompt g={g} />
        <PixiePrompt g={g} />
        <CannibalNotice g={g} />
        <SecretNotices s={s} />
        {lev && (
          <div className="card card-warn">
            <p>
              <b>利维坦在场</b>：今天是第 {s.night} 天，第 {LEVIATHAN_DAYS} 天结束时邪恶获胜。已处决善良玩家 {s.goodExecutions} 人，再处决{' '}
              {Math.max(0, 2 - s.goodExecutions)} 个善良玩家邪恶就获胜。
            </p>
          </div>
        )}
        {vortoxActive(s) && (
          <div className="card card-evil">
            <p>
              <b>涡流在场</b>：今天必须处决一个人，否则邪恶直接获胜（只有你知道，别说出来）。
            </p>
          </div>
        )}
        {fm && s.fearTarget && <p className="dim">恐惧之灵（{seatName(fm.n)}）现在的目标：{seatName(s.fearTarget)}。只有你知道。</p>}
        <SayBox lines={dayStartLines(s.night, s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
        <div className="card">
          <h3>讨论计时</h3>
          <TimerDisplay />
          <p className="dim center" style={{ marginTop: 6 }}>
            右上角的眼睛按钮可以一键盖屏，只显示计时器。
          </p>
        </div>
        <DayAbilities s={s} open={setPanel} />
        <TravellerDay g={g} />
        <SayBox lines={nominationLines(s.style)} title="讨论结束后说" />
        <HarpyCard g={g} />
        <div className="card">
          <h3>投票规则（你来数票）</h3>
          <p>
            现在存活 <b>{alive}</b> 人{tAlive > 0 && `（含旅行者 ${tAlive} 人）`} → 处决至少需要 <b className="answer" style={{ fontSize: 22 }}>{need}</b> 票
          </p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }} className="muted">
            <li>从被提名者开始，顺时针一个一个数举手的人。</li>
            <li>票数 ≥ {need}，而且比今天之前的最高票还多，他就成为"待处决"的人。</li>
            <li>和最高票打平：两个人都不处决。</li>
            <li>每人每天只能提名一次、只能被提名一次。死人不能提名。</li>
            <li>死人整局只剩一次投票，用掉就不能再投。</li>
            <li>所有提名结束后，"待处决"的人被处决。也可以一个都不处决。</li>
            {tAlive > 0 && <li>旅行者可以提名、投票，但不能被提名处决，只能放逐（见上面"旅行者"）。</li>}
          </ul>
        </div>
        <FlowergirlCard g={g} />
        <VoteMods s={s} />
        {butler && s.butlerMaster && (
          <div className="card card-warn">
            <p>
              管家 {seatName(butler.n)} 只有在主人 <b>{seatName(s.butlerMaster)}</b> 举手时才能举手投票。
            </p>
          </div>
        )}
      </div>
      {panel === 'virgin' && virgin && <VirginSheet g={g} virginN={virgin.n} onClose={close} />}
      {panel === 'slayer' && <SlayerSheet g={g} onClose={close} />}
      {panel === 'exec' && <ExecSheet g={g} onClose={close} />}
      {panel === 'artist' && <ArtistSheet g={g} onClose={close} />}
      {panel === 'fisherman' && <FishermanSheet g={g} onClose={close} />}
      {panel === 'savant' && <SavantSheet g={g} onClose={close} />}
      {panel === 'amnesiac' && <AmnesiacSheet g={g} onClose={close} />}
      {panel === 'mutant' && <MutantSheet g={g} onClose={close} />}
      {panel === 'duchess' && <DuchessSheet g={g} onClose={close} />}
      {panel === 'fear' && <FearSheet g={g} onClose={close} />}
      {panel === 'alsaahir' && <AlsaahirSheet g={g} onClose={close} />}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => setPanel('exec')}>
          所有提名结束，录入处决结果
        </button>
      </BottomBar>
    </main>
  );
}

/** 白天随时可能有人来找你：按剧本和场上角色列出按钮 */
function DayAbilities({ s, open }: { s: GameState; open: (p: Panel) => void }) {
  const items: ReactNode[] = [];
  const btn = (key: Panel, label: string) => (
    <button key={key} className="btn btn-ghost btn-block" onClick={() => open(key)}>
      {label}
    </button>
  );
  const holder = (r: Parameters<typeof actorFor>[1]) => s.seats.find((x) => x.alive && hasAbility(s, x, r));
  const fm = s.seats.find((x) => x.alive && x.role === 'fearmonger');
  if (fm) items.push(btn('fear', s.fearNominated ? `恐惧之灵（${seatName(fm.n)}）今天提名了 ${seatName(s.fearNominated)}（改）` : `恐惧之灵（${seatName(fm.n)}）提名了一名玩家`));
  const virgin = actorFor(s, 'virgin');
  if (virgin && virgin.alive && !virgin.used) items.push(btn('virgin', `有人提名了 ${seatName(virgin.n)}（${virgin.role === 'virgin' ? '贞洁者' : `有贞洁者能力的${roleName(virgin.role)}`}）`));
  if (s.script === 'tb' || holder('slayer')) items.push(btn('slayer', '有人宣称自己是猎手并开枪'));
  const artist = holder('artist');
  if (artist && !artist.used) items.push(btn('artist', `艺术家（${seatName(artist.n)}）来问是非题`));
  const fisher = holder('fisherman');
  if (fisher && !fisher.used) items.push(btn('fisherman', `渔夫（${seatName(fisher.n)}）来要建议`));
  const savant = holder('savant');
  if (savant && s.savantDay !== s.night) items.push(btn('savant', `博学者（${seatName(savant.n)}）来要今天的两条信息`));
  const amn = s.seats.find((x) => x.alive && x.role === 'amnesiac');
  if (amn) items.push(btn('amnesiac', `失忆者（${seatName(amn.n)}）来猜自己的能力`));
  const als = holder('alsaahir');
  if (als && s.alsaahirDay !== s.night) items.push(btn('alsaahir', `戏法师（${seatName(als.n)}）要公开猜谁是爪牙和恶魔`));
  const mutant = s.seats.find((x) => x.alive && x.role === 'mutant');
  if (mutant) items.push(btn('mutant', `畸形秀演员（${seatName(mutant.n)}）说自己是外来者了`));
  if (s.fabled.includes('duchess')) items.push(btn('duchess', s.duchessVisitors.length ? `公爵夫人的拜访者：${s.duchessVisitors.map((n) => `${seatName(n)}`).join('、')}（改）` : '有人来拜访公爵夫人'));
  if (!items.length) return null;
  return (
    <div className="card">
      <h3>白天有人来找你 / 突发情况</h3>
      <div className="stack" style={{ gap: 8 }}>
        {items}
      </div>
    </div>
  );
}

/** 替罪羊代替同阵营的人被处决：照常处决不算干预（中立），换人才有倾向 */
function scapegoatChoices(s: GameState, n: number, sg: number): Choice<boolean>[] {
  const evil = isEvil(seatOf(s, n));
  const demon = evil && isDemonSeat(s, n);
  return [
    { key: 'no', label: `照常处决 ${seatName(n)}`, value: false, lean: 0, truth: true, standard: true, reason: '按正常流程走，不额外干预。' },
    {
      key: 'sg', label: `让替罪羊（${seatName(sg)}）代替他被处决`, value: true, lean: evil ? (demon ? -2 : -1) : 1, truth: true,
      reason: evil ? (demon ? '恶魔逃过一劫，大帮邪恶。' : '邪恶玩家逃过一劫，帮邪恶。') : '有能力的善良玩家活下来，死的是旅行者，帮善良。',
    },
  ];
}

function ExecSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const [t, setT] = useState<number[]>([]);
  const [fear, setFear] = useState(false);
  const [goblin, setGoblin] = useState(false);
  const [sgSel, setSgSel] = useState<number | null>(null);
  const n = t[0];
  const sg = n ? scapegoatFor(s, n) : undefined;
  const sgChoices = useMemo(() => (n && sg ? scapegoatChoices(s, n, sg.n) : null), [s, n, sg]);
  const sgRec = useMemo(() => (sgChoices ? recommend(sgChoices, balance(s).score, stepRng(s, 71)) : 0), [sgChoices, s]);
  const subst = sgChoices ? sgChoices[sgSel ?? sgRec].value : false;
  // 真正被处决的人（替罪羊顶替时是他）
  const e = subst && sg ? sg.n : n;
  const st = e ? seatOf(s, e) : undefined;
  const lev = s.seats.find((x) => x.role === 'leviathan' && x.alive && !malfunction(s, x.n));
  const reset = () => { setFear(false); setGoblin(false); };
  return (
    <Sheet title="今天的处决结果" onClose={onClose}>
      <div className="stack">
        <SeatPicker
          s={s}
          selected={t}
          max={1}
          onChange={(v) => { setT(v); setSgSel(null); reset(); }}
          disabled={s.seats.filter(isTraveller).map((x) => x.n)}
          label="谁被处决了？"
        />
        {s.seats.some((x) => isTraveller(x) && !x.left) && <p className="dim">旅行者不能被处决，只能放逐。</p>}
        {sgChoices && (
          <div className="card card-warn stack" style={{ gap: 8 }}>
            <b>替罪羊（{seatName(sg!.n)}）和 {seatName(n)} 同阵营：你可以让替罪羊代替他被处决</b>
            <ChoicePanel s={s} choices={sgChoices} sel={sgSel ?? sgRec} rec={sgRec} onSel={(i) => { if (i >= 0) { setSgSel(i); reset(); } }} moreLabel="看另一个选择" />
          </div>
        )}
        {st?.role === 'saint' && <p className="evil">注意：{seatName(e)} 是圣徒。</p>}
        {st && e && <ExecGuard s={s} n={e} />}
        {st?.alive && demonDeathWarning(s, e, '被处决了')}
        {st && lev && !isEvil(st) && (
          <p className="evil">利维坦在场：这是第 {s.goodExecutions + 1} 个被处决的善良玩家{s.goodExecutions + 1 >= 2 ? '，处决后邪恶直接获胜！' : '。'}</p>
        )}
        {e && fearmongerAsk(s, e) && s.fearNominated === e && (
          <div className="card card-evil">
            <b>{seatName(e)} 是恐惧之灵提名的、也是他的目标：处决后{isEvil(seatOf(s, e)) ? '邪恶' : '善良'}阵营直接落败。</b>
          </div>
        )}
        {e && fearmongerAsk(s, e) && s.fearNominated !== e && (
          <Toggle
            on={fear}
            set={setFear}
            label={`${seatName(e)} 是恐惧之灵的目标，但你没记下今天恐惧之灵提名了谁：是恐惧之灵提名的他吗？`}
            hint={`是的话，${seatName(e)} 所在的阵营直接落败。`}
          />
        )}
        {e && goblinAsk(s, e) && (
          <Toggle on={goblin} set={setGoblin} label={`${seatName(e)} 是哥布林：他被提名时公开说了自己是哥布林吗？`} hint="说了的话，邪恶直接获胜。" />
        )}
        <button
          className="btn btn-primary btn-block"
          disabled={!n}
          onClick={() => g.commit((x) => execute(x, n, '被处决', { fearmongerNominated: x.fearNominated === e || fear, goblinClaimed: goblin, scapegoat: subst }))}
        >
          {n ? `处决 ${seatName(e)}` : '先点出被处决的人'}
        </button>
        {vortoxActive(s) && <p className="evil">涡流在场：今天没人被处决的话，邪恶直接获胜。</p>}
        <button className="btn btn-outline btn-block" onClick={() => g.commit((x) => execute(x, null))}>
          今天没人被处决
        </button>
      </div>
    </Sheet>
  );
}

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b>{label}</b>
      <p className="dim">{hint}</p>
      <div className="seg" role="radiogroup">
        <button className={on ? 'on' : ''} onClick={() => set(true)} aria-pressed={on}>
          是
        </button>
        <button className={!on ? 'on' : ''} onClick={() => set(false)} aria-pressed={!on}>
          不是
        </button>
      </div>
    </div>
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
        {s.executed !== undefined && (
          <SayBox lines={executionLines(s.executed, s.style, s.executed !== null && seatOf(s, s.executed).alive)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
        )}
        {s.executed && s.zombuulFake && seatOf(s, s.executed).role === 'zombuul' && (
          <p className="dim">{seatName(s.executed)} 是僵怖，这是假死：照常宣布他死了，但他其实还活着（只有你知道）。</p>
        )}
        {!s.winner && <CannibalNotice g={g} />}
        <KlutzPrompt g={g} />
        <PixiePrompt g={g} />
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
        <button className="btn btn-primary btn-block" disabled={!s.winner && promptPending(s)} onClick={() => g.commit((st) => finishDay(st))}>
          {s.winner ? '宣布结果，查看复盘' : promptPending(s) ? '先处理上面的提示' : '入夜'}
        </button>
      </BottomBar>
    </main>
  );
}

/* ---------------- 白天的私下拜访 ---------------- */

function holderOf(s: GameState, r: Parameters<typeof actorFor>[1]): Seat | undefined {
  return s.seats.find((x) => x.alive && hasAbility(s, x, r));
}

function ArtistSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = holderOf(s, 'artist')!;
  const m = artistMode(s, a.n);
  return (
    <Sheet title={`艺术家（${seatName(a.n)}）的是非题`} onClose={onClose}>
      <div className="stack">
        <p>他私下问你一个能用"是/否"回答的问题。整局只能问一次。</p>
        <div className={`card ${m.mode === 'truth' ? '' : 'card-warn'}`}>
          <b>{m.text}</b>
        </div>
        <p className="dim">不确定答案就点右上角的书本图标看魔典。</p>
        <button className="btn btn-primary btn-block" onClick={() => { g.commit((st) => markUsed(st, a.n, `艺术家（${seatName(a.n)}）问了是非题（${m.mode === 'truth' ? '如实回答' : m.mode === 'lie' ? '涡流：回答假的' : '中毒：可真可假'}）`)); onClose(); }}>
          我回答完了（记下他已经用过）
        </button>
      </div>
    </Sheet>
  );
}

function FishermanSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const f = holderOf(s, 'fisherman')!;
  const choices = useMemo(() => fishermanChoices(s, f.n, stepRng(s, 41)), [s, f.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 42)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <Sheet title={`渔夫（${seatName(f.n)}）的建议`} onClose={onClose}>
      <div className="stack">
        <p className="dim">整局一次。私下告诉他一条帮他获胜的建议。</p>
        {choices.length > 0 && <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />}
        {c && <SayBox title="小声说" lines={[c.label]} />}
        <button className="btn btn-primary btn-block" onClick={() => { g.commit((st) => markUsed(st, f.n, `渔夫（${seatName(f.n)}）得到建议：${c?.label ?? '（说书人自己说的）'}`)); onClose(); }}>
          说完了（记下他已经用过）
        </button>
      </div>
    </Sheet>
  );
}

function SavantSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const v = holderOf(s, 'savant')!;
  const choices = useMemo(() => savantChoices(s, v.n, stepRng(s, 51)), [s, v.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 52)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <Sheet title={`博学者（${seatName(v.n)}）今天的两条信息`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次。两条一真一假，不告诉他哪条是真的。</p>
        <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        {c && <SayBox title="小声说" lines={[`第一条：${c.value[0]}。`, `第二条：${c.value[1]}。`]} />}
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => { g.commit((st) => savantVisit(st, v.n, c!.value)); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

function AmnesiacSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = s.seats.find((x) => x.alive && x.role === 'amnesiac')!;
  const ab = s.amnesiacAbility;
  const [ans, setAns] = useState<string | null>(null);
  return (
    <Sheet title={`失忆者（${seatName(a.n)}）来猜能力`} onClose={onClose}>
      <div className="stack">
        <div className="card">
          <b>他真正的能力：{ab ? `像${roleName(ab)}一样` : '（没定）'}</b>
          {ab && <p className="dim">{ROLES[ab].ability}</p>}
        </div>
        <p>听他猜完，按接近程度回答他：</p>
        <div className="role-grid">
          {AMNESIAC_ANSWERS.map((x) => (
            <button key={x} className="role-chip" style={ans === x ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setAns(x)}>
              {x}
            </button>
          ))}
        </div>
        {malfunction(s, a.n) && <p className="dim">他中毒了：可以随便回答。</p>}
        <button className="btn btn-primary btn-block" disabled={!ans} onClick={() => { g.commit((st) => logDay(st, `失忆者（${seatName(a.n)}）猜能力，回答：${ans}`)); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

const logDay = (s: GameState, text: string) => s.log.push({ night: s.night, phase: 'day', text });

function MutantSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const m = s.seats.find((x) => x.alive && x.role === 'mutant')!;
  return (
    <Sheet title={`畸形秀演员（${seatName(m.n)}）疯狂了`} onClose={onClose}>
      <div className="stack">
        <p>他公开说自己是外来者，就算"疯狂"了。你可以现在处决他（算今天的处决，今天的提名到此结束），也可以放过他。</p>
        {malfunction(s, m.n) && <p className="dim">他中毒了：能力无效，建议放过。</p>}
        <SayBox title="如果处决，公开宣布" lines={[`${seatName(m.n)} 被处决了。`]} />
        <button className="btn btn-danger btn-block" onClick={() => { g.commit((st) => execute(st, m.n, '疯狂地说自己是外来者，被处决')); onClose(); }}>
          处决他
        </button>
        <button className="btn btn-outline btn-block" onClick={onClose}>
          放过他
        </button>
      </div>
    </Sheet>
  );
}

function DuchessSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const [v, setV] = useState<number[]>(s.duchessVisitors);
  return (
    <Sheet title={FABLED.duchess.name} onClose={onClose}>
      <div className="stack">
        <p className="dim">{FABLED.duchess.ability}</p>
        <SeatPicker s={s} selected={v} max={3} onChange={setV} label="今天谁来拜访了（最多 3 人）？" />
        <button className="btn btn-primary btn-block" disabled={!v.length} onClick={() => { g.commit((st) => setDuchessVisitors(st, v)); onClose(); }}>
          记下拜访者（今晚会告诉他们）
        </button>
      </div>
    </Sheet>
  );
}

/** 恐惧之灵提名了某人：当场告诉你是不是他的目标 */
function FearSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const fm = s.seats.find((x) => x.alive && x.role === 'fearmonger')!;
  const [t, setT] = useState<number[]>(s.fearNominated ? [s.fearNominated] : []);
  const pv = t.length ? fearPreview(s, t[0]) : null;
  return (
    <Sheet title={`恐惧之灵（${seatName(fm.n)}）提名了谁？`} onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[fm.n]} label="被提名的人" />
        {pv && (
          <div className={`card ${pv.lethal ? 'card-evil' : ''}`}>
            <b>{pv.text}</b>
          </div>
        )}
        {pv?.lethal && <p className="dim">记下来以后，处决时网页会自动结算，不用再问你。</p>}
        <button
          className="btn btn-primary btn-block"
          disabled={!t.length}
          onClick={() => {
            g.commit((st) => fearmongerNominates(st, t[0]));
            onClose();
          }}
        >
          记下来，继续投票
        </button>
      </div>
    </Sheet>
  );
}

/** 食人族今天换了能力：吃到邪恶时显示网页给的假能力，可以手动换 */
function CannibalNotice({ g }: { g: Game }) {
  const s = g.s;
  const [open, setOpen] = useState(false);
  const c = s.seats.find((x) => x.alive && x.role === 'cannibal');
  const ate = s.lastExecution && s.lastExecution.night === s.night ? seatOf(s, s.lastExecution.seat) : null;
  if (!c || !s.gained[c.n] || (!ate && !s.cannibalPoisoned)) return null;
  const cur = s.gained[c.n];
  const night = new Set<string>(scriptOf(s).otherNights);
  const firstOnly = new Set<string>(scriptOf(s).firstNight.filter((x) => !night.has(x)));
  const options = scriptOf(s).roles.filter((r) => ROLES[r].team === 'townsfolk' && r !== 'cannibal');
  return (
    <div className={`card ${s.cannibalPoisoned ? 'card-warn' : ''} stack`} style={{ gap: 8 }}>
      {s.cannibalPoisoned ? (
        <>
          <b>食人族（{seatName(c.n)}）吃到了邪恶玩家：他中毒了</b>
          <p>
            网页给他的假能力：<b className="good">【{roleName(cur)}】</b>。之后按这个能力叫醒他，给的信息可以是假的，直到下一个善良玩家被处决死亡。
          </p>
          <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>
            换一个假能力
          </button>
        </>
      ) : (
        <p>
          食人族（{seatName(c.n)}）现在拥有<b className="good">【{roleName(cur)}】</b>的能力（他自己不会被告知）。
        </p>
      )}
      {open && (
        <Sheet title="食人族的假能力" onClose={() => setOpen(false)}>
          <div className="choices">
            {options.map((r) => (
              <button
                key={r}
                className={`choice${r === cur ? ' sel' : ''}`}
                onClick={() => {
                  g.commit((st) => setCannibalFake(st, r));
                  setOpen(false);
                }}
              >
                <span className="lab">{roleName(r)}</span>
                <span className="why">
                  {night.has(r)
                    ? '之后每晚会按这个能力叫醒他，给假信息。'
                    : firstOnly.has(r)
                      ? '只在第一晚行动：之后不会再叫醒他，他会以为自己没事做。'
                      : '白天能力：他来找你时，按中毒给假信息。'}
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ---------------- 贞洁者 / 猎手 ---------------- */

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
    <Sheet title={`${seatName(virginN)} 被提名了`} onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={(v) => { setT(v); setTwist(null); }} disabled={[virginN]} label="是谁提名的？" />
        {pv && <div className="card"><p>{pv.reason}</p></div>}
        {pv?.askTwist && <TwistPick key={t[0]} g={g} kind={pv.askTwist} onValue={setTwist} />}
        {pv && <SayBox title="公开宣布" lines={fires ? [`${seatName(t[0])} 被处决了。`] : ['提名有效，继续进行投票。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => nominateVirgin(st, virginN, t[0], twistVal));
            ui.toast(fires ? `${seatName(t[0])} 被立刻处决` : '贞洁者能力未触发，继续投票');
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
        {pv && <SayBox title="公开宣布" lines={hit ? [`${seatName(target[0])} 死了。`] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => slayerShoot(st, shooter[0], target[0], twistVal));
            ui.toast(!hit ? '什么都没有发生' : pv?.swTakeover ? `${seatName(target[0])} 死亡，红唇女郎接任，游戏继续` : `${seatName(target[0])} 死亡`);
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 旅行者 ---------------- */

/** 官员/窃贼昨晚选的人：今天数票时加减 */
function VoteMods({ s }: { s: GameState }) {
  const xs = Object.entries(s.voteMods);
  if (!xs.length) return null;
  return (
    <div className="card card-warn">
      <p>
        <b>今天数票时注意（只有你知道）：</b>
        {xs.map(([n, v]) => `${seatName(+n)} 举手算${v < 0 ? `负 ${-v}` : ` ${v} `}票`).join('；')}。
      </p>
    </div>
  );
}

type TPanel = 'join' | 'exile' | 'leave' | 'gun' | 'beggar' | null;

/** 白天的旅行者：中途加入、放逐、离场、枪手、乞丐 */
function TravellerDay({ g }: { g: Game }) {
  const s = g.s;
  const ui = useUi();
  const [p, setP] = useState<TPanel>(null);
  const close = () => setP(null);
  const ts = activeTravellers(s);
  const alive = ts.filter((x) => x.alive);
  const gun = alive.find((x) => x.role === 'gunslinger');
  const beggar = alive.find((x) => x.role === 'beggar');
  const btn = (key: TPanel, label: string) => (
    <button key={key} className="btn btn-ghost btn-block" onClick={() => setP(key)}>
      {label}
    </button>
  );
  return (
    <div className="card">
      <h3>旅行者</h3>
      {ts.length > 0 && (
        <p className="dim" style={{ marginBottom: 8 }}>
          {ts.map((x) => `${seatName(x.n)} ${roleName(x.role)}（${x.traveller!.alignment === 'evil' ? '邪恶' : '善良'}${x.alive ? '' : '，已死'}）`).join('；')}
        </p>
      )}
      <div className="stack" style={{ gap: 8 }}>
        {btn('join', '有人中途加入（当旅行者）')}
        {alive.length > 0 && btn('exile', '有人提议放逐旅行者')}
        {gun && s.gunslingerDay !== s.night && btn('gun', `枪手（${seatName(gun.n)}）在第一次投票后开枪`)}
        {beggar && btn('beggar', `有死人把投票标记给了乞丐（${seatName(beggar.n)}）`)}
        {ts.length > 0 && btn('leave', '旅行者要提前离开')}
      </div>
      {p === 'join' && <AddTravellerSheet g={g} onClose={close} />}
      {p === 'exile' && (
        <ExileSheet
          g={g}
          onClose={close}
          onExile={(n) => {
            g.commit((st) => exile(st, n));
            ui.toast(`${seatName(n)} 被放逐`);
            close();
          }}
        />
      )}
      {p === 'gun' && gun && <GunSheet g={g} gunN={gun.n} onClose={close} />}
      {p === 'beggar' && beggar && <BeggarSheet g={g} beggarN={beggar.n} onClose={close} />}
      {p === 'leave' && <LeaveSheet g={g} onClose={close} />}
    </div>
  );
}

function GunSheet({ g, gunN, onClose }: { g: Game; gunN: number; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const pv = t.length ? gunslingerPreview(s, gunN, t[0]) : null;
  return (
    <Sheet title={`枪手（${seatName(gunN)}）开枪`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次：今天第一次投票数完票后，他可以选一名刚才举手投了票的人，那个人死亡。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[gunN]} label="他向谁开枪？（必须是刚才投了票的人）" />
        {pv && <div className="card"><p>{pv.text}</p></div>}
        {pv?.hits && demonDeathWarning(s, t[0], '死了')}
        {pv && <SayBox title="公开宣布" lines={pv.hits ? [`${seatName(t[0])} 死了。`] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!pv}
          onClick={() => {
            g.commit((st) => gunslingerShoot(st, gunN, t[0]));
            ui.toast(pv!.hits ? `${seatName(t[0])} 死亡` : '什么都没有发生');
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}

function BeggarSheet({ g, beggarN, onClose }: { g: Game; beggarN: number; onClose: () => void }) {
  const s = g.s;
  const [t, setT] = useState<number[]>([]);
  const d = t.length ? seatOf(s, t[0]) : null;
  const twist = d && (d.role === 'spy' || d.role === 'recluse');
  return (
    <Sheet title={`乞丐（${seatName(beggarN)}）拿到了投票标记`} onClose={onClose}>
      <div className="stack">
        <p className="dim">乞丐只能用别人给的投票标记投票。死人把自己的投票标记给他，就用掉了自己最后一票；乞丐会私下得知这个死人的阵营。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => x.alive).map((x) => x.n)} label="哪个死人给的？" />
        {d && <SayBox title="小声告诉乞丐" lines={[`${seatName(d.n)} 是${isEvil(d) ? '邪恶' : '善良'}的。`]} />}
        {twist && <p className="dim">他是{roleName(d!.role)}：也可以说成另一个阵营。</p>}
        <button className="btn btn-primary btn-block" disabled={!d} onClick={() => { g.commit((st) => { beggarLearns(st, beggarN, d!.n); }); onClose(); }}>
          说完了
        </button>
      </div>
    </Sheet>
  );
}

function LeaveSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  return (
    <Sheet title="旅行者提前离开" onClose={onClose}>
      <div className="stack">
        <p className="dim">旅行者随时可以走，不影响游戏。他离开后不再参与投票，放逐所需票数也会少算他一个。</p>
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={s.seats.filter((x) => !x.traveller).map((x) => x.n)} label="谁要走？" />
        {t.length > 0 && <SayBox title="公开宣布" lines={[`${seatName(t[0])} 离开了游戏。`]} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!t.length}
          onClick={() => {
            g.commit((st) => leave(st, t[0]));
            ui.toast(`${seatName(t[0])} 已离开`);
            onClose();
          }}
        >
          确认离开
        </button>
      </div>
    </Sheet>
  );
}

/* ---------------- 残阳高照 / 王不见王 ---------------- */

/** 处决某人前：他会不会真的死（魔鬼代言人、茶艺师、弄臣、僵怖） */
function ExecGuard({ s, n }: { s: GameState; n: number }) {
  const x = seatOf(s, n);
  if (advocateSaves(s, n))
    return (
      <div className="card card-warn">
        <b>{seatName(n)} 昨晚受魔鬼代言人保护：被处决但不会死。</b>
        <p className="dim">公开只说「{seatName(n)} 被处决了，但他没有死」。</p>
      </div>
    );
  if (!x.alive && !(x.role === 'zombuul' && s.zombuulFake)) return null;
  const pv = killPreview(s, n);
  if (pv.dies && x.role !== 'zombuul') return null;
  return (
    <div className="card card-warn">
      <p>{pv.text}</p>
    </div>
  );
}

/** 只有说书人知道的提醒：魔鬼代言人保护、僵怖假死、报丧女妖 */
function SecretNotices({ s }: { s: GameState }) {
  const out: ReactNode[] = [];
  const adv = s.advocate;
  if (adv && adv.ok && adv.night === s.night && advocateSaves(s, adv.seat))
    out.push(<p key="adv">魔鬼代言人昨晚保护了 <b>{seatName(adv.seat)}</b>：今天处决他不会死（只有你知道）。</p>);
  const z = s.zombuulFake ? s.seats.find((x) => x.role === 'zombuul') : undefined;
  if (z) out.push(<p key="z">僵怖（<b>{seatName(z.n)}</b>）在假死：大家以为他死了，其实还活着。他不能提名，只剩一次投票。</p>);
  if (s.bansheeActive)
    out.push(<p key="b">报丧女妖（<b>{seatName(s.bansheeActive)}</b>）能力生效：每天可以提名两次（死了也行），每次投票举双手算两票。</p>);
  if (s.sweetheartDrunk) out.push(<p key="sw">{seatName(s.sweetheartDrunk)} 被心上人弄醉了：他的能力无效。</p>);
  const h = s.harpy;
  if (h && !h.done && h.night === s.night)
    out.push(
      <p key="harpy">
        鹰身女妖：今天留意 <b>{seatName(h.mad)}</b> 有没有努力证明 {seatName(h.second)} 是邪恶的。提名结束前，在下面投票区旁边判断。
      </p>,
    );
  if (!out.length) return null;
  return <div className="card stack" style={{ gap: 6 }}>{out}</div>;
}

/** 卖花女孩：白天记下恶魔有没有投票，晚上要告诉她 */
function FlowergirlCard({ g }: { g: Game }) {
  const s = g.s;
  const fg = s.seats.find((x) => x.alive && hasAbility(s, x, 'flowergirl'));
  const d = demonSeat(s);
  if (!fg || !d) return null;
  const voted = s.demonVotedDay === s.night;
  return (
    <div className="card stack" style={{ gap: 8 }}>
      <p>
        <b>卖花女孩在场</b>：投票时留意恶魔（{seatName(d.n)}）有没有举手，今晚要告诉她。
      </p>
      <button className={`btn btn-block ${voted ? 'btn-primary' : 'btn-outline'}`} onClick={() => g.commit((st) => setDemonVoted(st, !voted))}>
        {voted ? '已记下：恶魔今天投过票（点一下取消）' : '恶魔投票了，点这里记一下'}
      </button>
    </div>
  );
}

/** 鹰身女妖：今天由说书人判断第一个人有没有做到疯狂 */
function HarpyCard({ g }: { g: Game }) {
  const s = g.s;
  const h = s.harpy;
  const [fail, setFail] = useState(false);
  const choices = useMemo(() => (h && !h.done ? harpyPunishChoices(s) : []), [s, h]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 81)), [choices, s]);
  const [sel, setSel] = useState<number | null>(null);
  if (!h || h.night !== s.night || h.done || s.winner) return null;
  const c = choices[sel ?? rec];
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b style={{ color: 'var(--warn)' }}>
        鹰身女妖：{seatName(h.mad)} 今天要疯狂地证明 {seatName(h.second)} 是邪恶的
      </b>
      <p className="dim">
        <b>提名结束前再判断</b>：讨论和提名时看他有没有努力让大家相信。没做到的话，你可以让他们之中一人或两人死亡（当场公开宣布）。
      </p>
      {!fail ? (
        <div className="row">
          <button className="btn btn-outline grow" onClick={() => g.commit((st) => harpyPunish(st, []))}>
            他做到了
          </button>
          <button className="btn btn-primary grow" onClick={() => setFail(true)}>
            他没做到
          </button>
        </div>
      ) : (
        <>
          <ChoicePanel s={s} choices={choices} sel={sel ?? rec} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换一种处罚" />
          {c && <SayBox title="公开宣布" lines={c.value.length ? [`${c.value.map((n) => seatName(n)).join('、')} 死了。`] : ['什么都没有发生。']} />}
          {c && c.value.some((n) => isDemonSeat(s, n)) && demonDeathWarning(s, c.value.find((n) => isDemonSeat(s, n))!, '死了')}
          <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && g.commit((st) => harpyPunish(st, c.value))}>
            确认
          </button>
        </>
      )}
    </div>
  );
}

/** 戏法师：公开猜所有爪牙和恶魔 */
function AlsaahirSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const a = holderOf(s, 'alsaahir')!;
  const [m, setM] = useState<number[]>([]);
  const [d, setD] = useState<number[]>([]);
  const [override, setOverride] = useState<boolean | null>(null);
  const correct = alsaahirCorrect(s, m, d);
  const verdict = override ?? correct;
  const bad = malfunction(s, a.n);
  const real = (t: 'minion' | 'demon') => s.seats.filter((x) => !x.traveller && teamOf(x.role) === t).map((x) => seatName(x.n)).join('、') || '无';
  const twist = s.seats.some((x) => x.role === 'spy' || x.role === 'recluse');
  return (
    <Sheet title={`戏法师（${seatName(a.n)}）公开猜测`} onClose={onClose}>
      <div className="stack">
        <p className="dim">每天一次。他要说出所有爪牙和恶魔（死了的也算）。全部说对，善良直接获胜；说错什么都不会发生。</p>
        <SeatPicker s={s} selected={m} max={4} onChange={(v) => { setM(v); setOverride(null); }} label="他说哪些人是爪牙？" />
        <SeatPicker s={s} selected={d} max={1} onChange={(v) => { setD(v); setOverride(null); }} label="他说谁是恶魔？" />
        <div className={`card${verdict ? ' card-warn' : ''}`}>
          <p>
            真实情况：爪牙 {real('minion')}；恶魔 {real('demon')}。
          </p>
          <b>{d.length ? (correct ? '他全部说对了。' : '他没有全部说对。') : '先点出他说的人。'}</b>
        </div>
        {twist && d.length > 0 && (
          <div className="stack" style={{ gap: 6 }}>
            <p className="dim">场上有间谍/陌客：间谍可以不算爪牙，陌客可以被当成爪牙或恶魔。你可以改判：</p>
            <div className="seg" role="radiogroup">
              <button className={verdict ? 'on' : ''} onClick={() => setOverride(true)} aria-pressed={verdict}>
                算他猜对
              </button>
              <button className={!verdict ? 'on' : ''} onClick={() => setOverride(false)} aria-pressed={!verdict}>
                算他猜错
              </button>
            </div>
          </div>
        )}
        {bad && <p className="dim">他中毒/醉酒：猜对也没用。</p>}
        {d.length > 0 && <SayBox title="公开宣布" lines={verdict && !bad ? ['戏法师猜对了！善良阵营获胜！'] : ['什么都没有发生。']} />}
        <button
          className="btn btn-primary btn-block"
          disabled={!d.length}
          onClick={() => {
            g.commit((st) => alsaahirGuess(st, a.n, m, d, verdict));
            onClose();
          }}
        >
          确认
        </button>
      </div>
    </Sheet>
  );
}
