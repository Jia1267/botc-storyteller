import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, roleName, type RoleId } from '../engine/roles';
import { balance, recommend } from '../engine/balance';
import {
  aliveNeighbors, believedRole, demonSeat, isEvil, isPoisoned, lilMonsta, malfunction, mustLie, scriptOf,
} from '../engine/core';
import {
  completeSlot, currentSlot, effectiveSlot, minionSeats, previewImp, shouldRun, slotActor, slotsFor, type SlotPayload,
} from '../engine/flow';
import {
  balloonistChoices, chambermaidChoices, chambermaidCount, chefCount, duchessChoices, duchessCount, empathCount,
  fortuneChoices, legalNumbers, lilKillChoices, mayorBounceChoices, numberChoices, pairChoices, pairVerdict, pixieChoices,
  revealChoices, revealVerdict, starpassChoices, widowInformChoices, type PairInfo, type PairKind,
} from '../engine/info';
import { SLOT_TITLE, dawnLines, librarianZeroLines, slotLines } from '../engine/scripts';
import type { GameState, Seat, SlotId } from '../engine/types';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, DoBox, SayBox, SeatPicker, roleCard, useUi } from './common';
import { GrimoirePanel } from './Grimoire';
import { Icon } from './icons';
import { KlutzPrompt, PixiePrompt, promptPending } from './Prompts';

interface StepProps {
  g: Game;
  s: GameState;
  actor: Seat;
}

export function NightScreen({ g }: { g: Game }) {
  const s = g.s;
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const order = slotsFor(s);
  const cur = s.ns!.slot;
  const visible = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => i === cur || shouldRun(s, sl));
  const pos = visible.findIndex((x) => x.i === cur) + 1;
  const eff = effectiveSlot(s, slot);

  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack" key={`${s.night}-${cur}-${actor?.n ?? 0}`}>
        <div className="step-head">
          <span className="kicker">
            第 {s.night} 夜 · 第 {pos} 步 / 共约 {visible.length} 步
          </span>
          <div className="progress">
            {visible.map((x) => (
              <i key={x.i} className={x.i <= cur ? 'on' : ''} />
            ))}
          </div>
          <h2 style={{ marginTop: 6 }}>
            {SLOT_TITLE[slot]}
            {slot === 'amnesiac' && s.amnesiacAbility ? `（像${roleName(s.amnesiacAbility)}）` : ''}
          </h2>
          {actor && !(slot === 'lunatic' && s.night === 1) && <ActorLine s={s} actor={actor} slot={eff} />}
        </div>
        <SlotBody g={g} s={s} slot={eff} actor={actor} />
      </div>
    </main>
  );
}

function ActorLine({ s, actor, slot }: { s: GameState; actor: Seat; slot: SlotId }) {
  const flags: ReactNode[] = [];
  if (actor.role === 'drunk') flags.push(<span key="d" className="chip chip-warn">其实是酒鬼：能力无效，可以给假信息</span>);
  if (isPoisoned(s, actor.n)) flags.push(<span key="p" className="chip chip-poison">中毒：能力无效，可以给假信息</span>);
  if (mustLie(s, slot as RoleId) && ROLES[slot as RoleId]) flags.push(<span key="v" className="chip chip-evil">涡流在场：只能给假信息</span>);
  if (!actor.alive) flags.push(<span key="x" className="chip">今晚刚死</span>);
  const why =
    actor.role === 'drunk'
      ? `（他以为自己是${roleName(believedRole(s, actor))}）`
      : actor.role === 'lunatic'
        ? `（疯子，他以为自己是${roleName(believedRole(s, actor))}）`
        : actor.role === 'cannibal'
          ? `（食人族，现在拥有${roleName(slot as RoleId)}的能力）`
          : actor.role === 'pixie' && slot !== 'pixie'
            ? `（小精灵，获得了${roleName(slot as RoleId)}的能力）`
            : actor.role === 'amnesiac'
              ? `（失忆者，他不知道自己的能力）`
              : '';
  return (
    <>
      <div className="who">
        {slot === 'widow' ? '寡妇是' : '叫醒'} <b>{actor.n}号</b>
        {why}
        {slot === 'scarletwoman' && '（红唇女郎，白天已接任恶魔）'}
      </div>
      {flags.length > 0 && <div className="chips">{flags}</div>}
    </>
  );
}

const wake = (n: number) => (
  <>
    轻拍 <b>{n}号</b> 的肩膀，让他睁眼。
  </>
);
const sleep = '让他闭眼。';
const seatsText = (ns: number[]) => ns.map((n) => `${n}号`).join('、');

function useDone(g: Game) {
  return (p: SlotPayload) => g.commit((st) => completeSlot(st, p));
}

/** 选完人以后，结果那一段出现在下面：自动滚过去，免得手机上没看到就点了"完成" */
function Reveal({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    // 页面在后台时平滑滚动不会播放，直接跳过去
    const instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.hidden;
    ref.current?.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'start' });
  }, [enabled]);
  return (
    <div ref={ref} className="stack" style={{ scrollMarginTop: 72 }}>
      {children}
    </div>
  );
}
const toggleStyle = (g: Game) => () => g.tweak((st) => (st.style = st.style === 'simple' ? 'atmo' : 'simple'));

function Tips({ role, drunk }: { role: RoleId; drunk?: boolean }) {
  return (
    <details className="more">
      <summary>
        <Icon name="chevronDown" size={18} /> 这个角色怎么处理（疑难规则）
      </summary>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }} className="muted">
        {drunk && <li>他其实是酒鬼：照常叫醒、照常让他操作，但能力不生效，给他的信息可以是假的。</li>}
        {ROLES[role].tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

function CardButton({ onClick, label = '给他看' }: { onClick: () => void; label?: string }) {
  return (
    <button className="btn btn-ghost" onClick={onClick}>
      <Icon name="eye" /> {label}
    </button>
  );
}

function Pending({ text }: { text: string }) {
  return (
    <BottomBar wide>
      <button className="btn btn-primary btn-block" disabled>
        {text}
      </button>
    </BottomBar>
  );
}

function SlotBody({ g, s, slot, actor }: { g: Game; s: GameState; slot: SlotId; actor?: Seat }) {
  switch (slot) {
    case 'dusk':
      return <DuskStep g={g} s={s} />;
    case 'minionInfo':
      return <MinionInfoStep g={g} s={s} />;
    case 'demonInfo':
      return <DemonInfoStep g={g} s={s} />;
    case 'dawn':
      return <DawnStep g={g} s={s} />;
    case 'poisoner':
    case 'monk':
    case 'butler':
    case 'fearmonger':
      return <TargetStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'washerwoman':
    case 'librarian':
    case 'investigator':
      return <PairStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'chef':
    case 'empath':
      return <NumberStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'fortuneteller':
      return <FortuneStep g={g} s={s} actor={actor!} />;
    case 'spy':
      return <SpyStep g={g} s={s} actor={actor!} />;
    case 'scarletwoman':
      return <NewDemonStep g={g} s={s} actor={actor!} />;
    case 'imp':
    case 'vortox':
      return <ImpStep g={g} s={s} actor={actor!} slot={slot} />;
    case 'ravenkeeper':
    case 'undertaker':
      return <RevealStep g={g} s={s} actor={actor!} kind={slot} />;
    case 'lunatic':
      return <LunaticStep g={g} s={s} actor={actor!} />;
    case 'lilmonsta':
      return <LilMonstaStep g={g} s={s} />;
    case 'widow':
      return <WidowStep g={g} s={s} actor={actor!} />;
    case 'pixie':
      return <PixieStep g={g} s={s} actor={actor!} />;
    case 'chambermaid':
      return <ChambermaidStep g={g} s={s} actor={actor!} />;
    case 'duchess':
      return <DuchessStep g={g} s={s} />;
    case 'balloonist':
      return <BalloonStep g={g} s={s} actor={actor!} />;
    default:
      return <SkipStep g={g} />;
  }
}

/** 兜底：理论上不会出现，出现了也能继续 */
function SkipStep({ g }: { g: Game }) {
  const done = useDone(g);
  return (
    <>
      <p className="dim">这一步没有需要做的事。</p>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 入夜 / 互认 / 天亮 ---------------- */

function DuskStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  return (
    <>
      <SayBox lines={slotLines('dusk', s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
      <DoBox
        items={[
          '等所有人都闭上眼睛、低下头。',
          '接下来按网页顺序，一个一个轻拍肩膀叫醒。不要出声叫名字。',
          s.night === 1 ? '第一晚恶魔不杀人。' : null,
        ]}
      />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          所有人都闭眼了
        </button>
      </BottomBar>
    </>
  );
}

function MinionInfoStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const minions = minionSeats(s);
  const ms = seatsText(minions.map((x) => x.n));
  const one = minions.length === 1;
  const d = demonSeat(s)!;
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍爪牙 <b>{ms}</b> 的肩膀，让{one ? '他' : '他们'}睁眼。
          </>,
          <>
            用手指向恶魔：<b>{d.n}号</b>。
          </>,
          one ? '等他看清，再让他闭眼。' : '等他们互相看清彼此，再让他们闭眼。',
        ]}
      />
      <SayBox lines={slotLines('minionInfo', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="dim">7 人及以上才有这一步。恶魔这时还闭着眼。</p>
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function DemonInfoStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const ui = useUi();
  const ms = seatsText(minionSeats(s).map((x) => x.n));
  const d = demonSeat(s)!;
  return (
    <>
      <DoBox
        items={[
          wake(d.n),
          <>
            用手依次指向爪牙：<b>{ms}</b>。
          </>,
          '点「给他看伪装」，把手机举给他看。',
          sleep,
        ]}
      />
      <SayBox lines={slotLines('demonInfo', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="muted">伪装角色：{s.bluffs.map(roleName).join('、')}</p>
      <BottomBar wide>
        <CardButton label="给他看伪装" onClick={() => ui.showCard({ title: '这三个角色不在场，你可以伪装成他们', big: s.bluffs.map(roleName) })} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function DawnStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const deaths = s.ns!.deaths;
  const lev = s.seats.some((x) => x.role === 'leviathan' && x.alive);
  return (
    <>
      <SayBox
        lines={dawnLines(deaths, s.style, { fear: s.fearAnnounce, leviathanDay: lev ? s.night : undefined })}
        title="对所有人说"
        s={s}
        onStyle={toggleStyle(g)}
      />
      <DoBox
        items={[
          '宣布死讯时只说谁死了，不要说是怎么死的。',
          deaths.length ? '让死去的玩家知道：死人还能说话，但不能提名，整局只剩一次投票。' : null,
          s.fearAnnounce ? '恐惧之灵换了新目标：只宣布"有新目标"，不说是谁。' : null,
        ]}
      />
      <KlutzPrompt g={g} />
      <PixiePrompt g={g} />
      {s.winner && (
        <div className={`card ${s.winner === 'good' ? '' : 'card-evil'}`}>
          <h3>游戏结束</h3>
          <p>
            {s.winner === 'good' ? '善良' : '邪恶'}阵营获胜：{s.winReason}
          </p>
        </div>
      )}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!s.winner && promptPending(s)} onClick={() => done({ kind: 'none' })}>
          {s.winner ? '宣布结果' : promptPending(s) ? '先处理上面的提示' : '进入白天'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 选一个人：投毒者 / 僧侣 / 管家 / 恐惧之灵 ---------------- */

function TargetStep({ g, s, actor, slot }: StepProps & { slot: 'poisoner' | 'monk' | 'butler' | 'fearmonger' }) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const notSelf = slot === 'monk' || slot === 'butler';
  const bad = malfunction(s, actor.n);
  const note =
    slot === 'poisoner'
      ? '被毒的人今晚和明天白天能力失效，网页会自动提醒你给他假信息。'
      : slot === 'monk'
        ? bad
          ? '他的保护今晚无效（中毒/酒鬼）。照常让他选，别露馅。'
          : '被保护的人今晚不会被恶魔杀死。'
        : slot === 'fearmonger'
          ? `现在的目标：${s.fearTarget ? `${s.fearTarget}号` : '还没有'}。选了新目标，天亮时要公开宣布"恐惧之灵选择了一名新的目标"。`
          : '明天白天提醒自己：只有主人投票时，管家才能投票。';
  return (
    <>
      <DoBox items={[wake(actor.n), `让他用手指向一名玩家${notSelf ? '（不能指自己）' : ''}，你在下面点出同一个人。`, sleep]} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={notSelf ? [actor.n] : []} label="他指了谁？" />
      <p className="dim">{note}</p>
      <Tips role={slot === 'fearmonger' ? 'fearmonger' : believedRole(s, actor)} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? `确认：${t[0]}号，下一步` : '先点出他指的人'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 洗衣妇 / 图书管理员 / 调查员 ---------------- */

const KIND_TEAM = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' } as const;

function PairStep({ g, s, actor, kind }: StepProps & { kind: PairKind }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => pairChoices(s, kind, actor.n, stepRng(s)), [s, kind, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [mRole, setMRole] = useState<RoleId | 'zero' | null>(null);
  const [mSeats, setMSeats] = useState<number[]>([]);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;

  const manualInfo: PairInfo | null =
    mRole === 'zero' ? { role: null, seats: null } : mRole && mSeats.length === 2 ? { role: mRole, seats: [Math.min(...mSeats), Math.max(...mSeats)] as [number, number] } : null;
  const verdict = manualInfo ? pairVerdict(s, kind, actor.n, manualInfo) : null;
  const illegal = sel === -1 && ((healthy && verdict === 'false') || (lie && verdict !== null && verdict !== 'false'));
  const value = sel >= 0 ? choices[sel]?.value : manualInfo;
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';

  const teamRoles = scriptOf(s).roles.filter((r) => ROLES[r].team === KIND_TEAM[kind]);
  const manual = (
    <div className="stack" style={{ gap: 10 }}>
      <div className="role-grid">
        {kind === 'librarian' && (
          <button className="role-chip" style={mRole === 'zero' ? { borderColor: 'var(--gold)' } : undefined} onClick={() => setMRole('zero')}>
            比 0（没有外来者）
          </button>
        )}
        {teamRoles.map((r) => (
          <button key={r} className={`role-chip${KIND_TEAM[kind] === 'minion' ? ' evil-c' : ''}`} style={mRole === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setMRole(r)}>
            {roleName(r)}
          </button>
        ))}
      </div>
      {mRole !== 'zero' && <SeatPicker s={s} selected={mSeats} max={2} onChange={setMSeats} disabled={[actor.n]} label="指向哪两个人？" />}
      {illegal && <p className="evil">{lie ? '涡流在场，必须给假信息。这样给是真的。' : '他没有中毒也不是酒鬼，必须给真信息。这样给不合规。'}</p>}
      {verdict === 'false' && !healthy && <p className="dim">这是假信息（他中毒/是酒鬼/涡流在场，可以给）。</p>}
    </div>
  );

  const items: ReactNode[] = [wake(actor.n)];
  if (value && value.role && value.seats) {
    items.push(
      <>
        点「给他看」展示 <b>【{roleName(value.role)}】</b>。
      </>,
      <>
        用手指向 <b>{value.seats[0]}号</b> 和 <b>{value.seats[1]}号</b>。
      </>,
    );
  } else if (value) items.push('比出 0（握拳）：场上没有外来者。');
  items.push(sleep);

  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} />
      <DoBox items={items} />
      <SayBox lines={value && value.role === null ? librarianZeroLines(s.style) : slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {value?.role && <CardButton onClick={() => ui.showCard(roleCard(value.role!, '这两人中有一人是'))} />}
        <button className="btn btn-primary grow" disabled={!value || illegal} onClick={() => value && done({ kind: 'pair', info: value, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 厨师 / 共情者 ---------------- */

function NumberStep({ g, s, actor, kind }: StepProps & { kind: 'chef' | 'empath' }) {
  const done = useDone(g);
  const choices = useMemo(() => numberChoices(s, kind, actor.n), [s, kind, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const [mNum, setMNum] = useState<number | null>(null);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const legal = legalNumbers(s, kind, actor.n);
  const base = kind === 'chef' ? chefCount(s) : empathCount(s, actor.n);
  const value = sel >= 0 ? choices[sel].value : mNum;
  const truth = sel >= 0 ? choices[sel].truth : mNum !== null && legal.includes(mNum);
  const twist = sel >= 0 ? !!choices[sel].twist : truth && mNum !== base;
  const nb = aliveNeighbors(s, actor.n);

  const manual = (
    <div className="big-num-grid">
      {[0, 1, 2, 3, 4].map((n) => (
        <button
          key={n}
          className={`btn ${mNum === n ? 'btn-primary' : 'btn-ghost'}`}
          disabled={healthy ? !legal.includes(n) : lie ? legal.includes(n) : false}
          onClick={() => setMNum(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );

  return (
    <>
      {kind === 'empath' && (
        <p className="muted">
          他两边最近的存活玩家：{nb.map((n) => `${n}号（${roleName(s.seats[n - 1].role)}）`).join('、')}
        </p>
      )}
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} manualLabel="手动选数字" />
      <DoBox
        items={[
          wake(actor.n),
          value !== null && value !== undefined ? (
            <>
              伸出 <b>{value}</b> 根手指{value === 0 ? '（握拳）' : ''}。
            </>
          ) : null,
          sleep,
        ]}
      />
      <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={value === null || value === undefined} onClick={() => done({ kind: 'number', num: value!, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 占卜师 ---------------- */

function FortuneStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '让他用手指向两名玩家，你在下面点出这两个人。']} />
      <SayBox lines={slotLines('fortuneteller', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} label="他指了哪两个人？" />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <FortuneAnswer g={g} s={s} actor={actor} picks={picks as [number, number]} />
        </Reveal>
      ) : (
        <>
          <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
          <Pending text="先点出他指的两个人" />
        </>
      )}
    </>
  );
}

function FortuneAnswer({ g, s, actor, picks }: StepProps & { picks: [number, number] }) {
  const done = useDone(g);
  const choices = useMemo(() => fortuneChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 31 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[c.value ? <><b>点头</b>：有恶魔。</> : <><b>摇头</b>：没有恶魔。</>, sleep]} />
      <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'fortune', picks, yes: c.value, truth: c.truth, twist: c.twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 间谍 / 新恶魔 ---------------- */

function SpyStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  return (
    <>
      <DoBox items={[wake(actor.n), '点「给间谍看」，把手机交给他。', '他看完会点「看完了」，收回手机。', sleep]} />
      <SayBox lines={slotLines('spy', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="dim">间谍看到的是只读魔典：只有座位、角色和状态，没有你的提示，也碰不到任何操作。</p>
      <Tips role="spy" />
      <BottomBar wide>
        <CardButton label="给间谍看" onClick={ui.openSpy} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

function NewDemonStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const r = actor.role;
  return (
    <>
      <DoBox items={[wake(actor.n), `点「给他看」：你现在是${roleName(r)}。`, '马上进入恶魔这一步（他今晚就可以杀人）。']} />
      <SayBox lines={slotLines('scarletwoman', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard(roleCard(r, '你现在是', true))} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 恶魔杀人：小恶魔 / 涡流 ---------------- */

function ImpStep({ g, s, actor, slot }: StepProps & { slot: 'imp' | 'vortox' }) {
  const [t, setT] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '让他用手指向一名玩家（可以指自己），你在下面点出来。']} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他要杀谁？" />
      {t.length ? (
        <Reveal key={t[0]}>
          <ImpOutcome g={g} s={s} actor={actor} target={t[0]} slot={slot} />
        </Reveal>
      ) : (
        <>
          <Tips role={slot} />
          <Pending text="先点出他指的人" />
        </>
      )}
    </>
  );
}

function ImpOutcome({ g, s, actor, target, slot }: StepProps & { target: number; slot: 'imp' | 'vortox' }) {
  const done = useDone(g);
  const ui = useUi();
  const pv = previewImp(s, target);
  const choices = useMemo(
    () => (pv.kind === 'mayor' ? mayorBounceChoices(s, target, stepRng(s, target)) : pv.kind === 'starpass' ? starpassChoices(s, actor.n) : []),
    [s, target, actor.n, pv.kind],
  );
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 1)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const picked = choices[sel]?.value;
  const dname = roleName(actor.role);

  const items: ReactNode[] = [sleep];
  if (pv.kind === 'starpass' && picked)
    items.push(
      <>
        轻拍 <b>{picked}号</b>，让他睁眼。
      </>,
      `点「给他看」：你现在是${dname}。`,
      '让他闭眼。',
    );
  items.push('天亮时再统一宣布死讯。');

  const pay: SlotPayload =
    pv.kind === 'mayor' ? { kind: 'imp', target, bounce: picked } : pv.kind === 'starpass' ? { kind: 'imp', target, starpassTo: picked } : { kind: 'imp', target };

  return (
    <>
      <div className={`card${pv.kind === 'kill' || pv.kind === 'starpass' || pv.kind === 'suicide' ? ' card-evil' : ''}`}>
        <p>{pv.reason}</p>
      </div>
      {choices.length > 0 && (
        <>
          <div className="dim">{pv.kind === 'mayor' ? '谁替镇长死？' : `谁变成新的${dname}？`}</div>
          <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        </>
      )}
      <DoBox items={items} />
      <Tips role={slot} />
      <BottomBar wide>
        {pv.kind === 'starpass' && picked && <CardButton onClick={() => ui.showCard(roleCard(actor.role, '你现在是', true))} />}
        <button className="btn btn-primary grow" onClick={() => done(pay)}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 守鸦人 / 送葬者 ---------------- */

function RevealStep({ g, s, actor, kind }: StepProps & { kind: 'ravenkeeper' | 'undertaker' }) {
  const [pick, setPick] = useState<number[]>(kind === 'undertaker' && s.lastExecution ? [s.lastExecution.seat] : []);
  const subject = pick[0];
  return (
    <>
      {kind === 'ravenkeeper' ? (
        <>
          <DoBox items={[wake(actor.n), '让他用手指向一名玩家，你在下面点出来。']} />
          <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
          <SeatPicker s={s} selected={pick} max={1} onChange={setPick} label="他想看谁的角色？" />
        </>
      ) : (
        <p className="muted">
          今天被处决的是 <b>{subject}号</b>（{roleName(s.seats[subject - 1].role)}）。
        </p>
      )}
      {subject ? (
        <Reveal key={subject} enabled={kind === 'ravenkeeper'}>
          <RevealAnswer g={g} s={s} actor={actor} kind={kind} subject={subject} />
        </Reveal>
      ) : (
        <Pending text="先点出他指的人" />
      )}
    </>
  );
}

function RevealAnswer({ g, s, actor, kind, subject }: StepProps & { kind: 'ravenkeeper' | 'undertaker'; subject: number }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => revealChoices(s, actor.n, subject, stepRng(s, subject), kind), [s, actor.n, subject, kind]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, subject + 1)), [choices, s, subject]);
  const [sel, setSel] = useState(rec);
  const [mRole, setMRole] = useState<RoleId | null>(null);
  const lie = mustLie(s, kind);
  const healthy = !malfunction(s, actor.n) && !lie;
  const verdict = mRole ? revealVerdict(s, subject, mRole) : null;
  const illegal = sel === -1 && ((healthy && verdict === 'false') || (lie && verdict !== null && verdict !== 'false'));
  const value = sel >= 0 ? choices[sel].value : mRole;
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';

  const manual = (
    <div className="stack" style={{ gap: 8 }}>
      {(['townsfolk', 'outsider', 'minion', 'demon'] as const).map((t) => (
        <div key={t}>
          <div className="dim">{TEAM_NAME[t]}</div>
          <div className="role-grid">
            {scriptOf(s)
              .roles.filter((r) => ROLES[r].team === t)
              .map((r) => (
                <button key={r} className={`role-chip${t === 'minion' || t === 'demon' ? ' evil-c' : ''}`} style={mRole === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setMRole(r)}>
                  {roleName(r)}
                </button>
              ))}
          </div>
        </div>
      ))}
      {illegal && <p className="evil">{lie ? '涡流在场，必须给假信息。' : '他没有中毒也不是酒鬼，必须给真信息。这样给不合规。'}</p>}
    </div>
  );

  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={setSel} manual={manual} />
      <DoBox items={[kind === 'undertaker' ? wake(actor.n) : null, '点「给他看」展示角色。', sleep]} />
      {kind === 'undertaker' && <SayBox lines={slotLines(kind, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />}
      <Tips role={kind} drunk={actor.role === 'drunk'} />
      <BottomBar wide>
        {value && <CardButton onClick={() => ui.showCard(roleCard(value, kind === 'undertaker' ? '今天被处决的玩家是' : '这名玩家的角色是'))} />}
        <button className="btn btn-primary grow" disabled={!value || illegal} onClick={() => value && done({ kind: 'reveal', pick: subject, role: value, truth, twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 疯子 ---------------- */

function LunaticStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const d = demonSeat(s);
  const fake = s.lunaticFake ? roleName(s.lunaticFake) : '恶魔';

  // 第一晚：只是告诉真恶魔谁是疯子
  if (s.night === 1) {
    return (
      <>
        <p className="muted">
          5–6 人局恶魔不知道队友，但疯子的能力让真恶魔知道疯子是谁。疯子本人这一步不用醒。
        </p>
        <DoBox
          items={[
            d ? wake(d.n) : '叫醒真恶魔。',
            <>
              用手指向 <b>{actor.n}号</b>，点「给他看」：这名玩家是疯子。
            </>,
            sleep,
          ]}
        />
        <BottomBar wide>
          <CardButton onClick={() => ui.showCard({ title: '这名玩家是', big: ['疯子'] })} />
          <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
            完成，下一步
          </button>
        </BottomBar>
      </>
    );
  }

  const informed: ReactNode[] = !t.length
    ? []
    : lilMonsta(s)
      ? [`等会儿在"小怪宝"那一步告诉爪牙们：疯子是 ${actor.n}号，今晚他选了 ${t[0]}号。`]
      : d
        ? [
            wake(d.n),
            <>
              用手指向 <b>{actor.n}号</b>（疯子），再指向 <b>{t[0]}号</b>（疯子选的人）。
            </>,
            sleep,
          ]
        : [];

  return (
    <>
      <DoBox items={[wake(actor.n), `他以为自己是${fake}：让他指一名玩家，你在下面点出来（这个人不会死）。`, sleep]} />
      <SayBox lines={slotLines('lunatic', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="疯子指了谁？" />
      {informed.length > 0 && (
        <Reveal key={t[0]}>
          <DoBox title="然后告诉真恶魔" items={informed} />
        </Reveal>
      )}
      <Tips role="lunatic" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => done({ kind: 'target', target: t[0] })}>
          {t.length ? '完成，下一步' : '先点出疯子指的人'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 小怪宝：爪牙选照看者，说书人定谁死 ---------------- */

function LilMonstaStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const minions = s.seats.filter((x) => x.alive && ROLES[x.role].team === 'minion');
  const locked = s.babysitterLocked && s.babysitter ? [s.babysitter] : null;
  // 每晚都要重新问爪牙，不默认填昨晚的人
  const [bs, setBs] = useState<number[]>(locked ?? []);
  const last = s.night > 1 && s.babysitter && !locked ? s.babysitter : null;
  const lunatic = s.seats.find((x) => x.role === 'lunatic' && x.alive);
  const nonMinions = s.seats.filter((x) => !minions.includes(x)).map((x) => x.n);
  return (
    <>
      <DoBox
        items={[
          <>
            轻拍所有爪牙 <b>{seatsText(minions.map((x) => x.n))}</b> 的肩膀，让他们睁眼。
          </>,
          locked ? (
            <>
              告诉他们：小怪宝今晚由 <b>{locked[0]}号</b>（红唇女郎）照看。
            </>
          ) : last ? (
            <>
              今晚要<b>重新问</b>他们由谁照看小怪宝（只能是爪牙，可以换人；昨晚是 {last}号）。你在下面点出来。
            </>
          ) : (
            '让他们商量，指出由谁照看小怪宝（只能是爪牙）。你在下面点出来。'
          ),
          lunatic ? (
            <>
              指向 <b>{lunatic.n}号</b>，告诉他们：这名玩家是疯子{s.ns?.lunaticPick ? `，今晚他选了 ${s.ns.lunaticPick}号` : ''}。
            </>
          ) : null,
          '让他们闭眼。',
        ]}
      />
      <SayBox lines={slotLines('lilmonsta', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      {!locked && <SeatPicker s={s} selected={bs} max={1} onChange={setBs} disabled={nonMinions} label="谁照看小怪宝？" />}
      {s.night > 1 && bs.length > 0 ? (
        <LilKill key={bs[0]} g={g} s={s} babysitter={bs[0]} />
      ) : (
        <>
          <Tips role="lilmonsta" />
          {bs.length ? (
            <BottomBar wide>
              <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'lilmonsta', babysitter: bs[0] })}>
                完成，下一步
              </button>
            </BottomBar>
          ) : (
            <Pending text="先点出照看者" />
          )}
        </>
      )}
    </>
  );
}

function LilKill({ g, s, babysitter }: { g: Game; s: GameState; babysitter: number }) {
  const done = useDone(g);
  const view = useMemo(() => ({ ...s, babysitter }), [s, babysitter]);
  const choices = useMemo(() => lilKillChoices(view, stepRng(s, babysitter)), [view, s, babysitter]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, babysitter + 2)), [choices, s, babysitter]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const kill = sel >= 0 ? choices[sel]?.value : manual[0];
  const blocked = s.seats.filter((x) => !x.alive || x.n === babysitter).map((x) => x.n);
  return (
    <>
      <div className="dim">每晚（第一晚除外）由你决定谁死，不能是照看者：</div>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} disabled={blocked} label="你决定谁死？" />}
        manualLabel="自己选"
      />
      <DoBox items={['不需要叫醒任何人。', '天亮时统一宣布死讯。']} />
      <Tips role="lilmonsta" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!kill} onClick={() => kill && done({ kind: 'lilmonsta', babysitter, kill })}>
          {kill ? `完成：${babysitter}号 照看，${kill}号 死亡` : '先选今晚谁死'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 寡妇 ---------------- */

/** 寡妇分两屏：先让她看魔典下毒，再单独一屏告诉一名善良玩家"寡妇在场" */
function WidowStep({ g, s, actor }: StepProps) {
  const ui = useUi();
  const [t, setT] = useState<number[]>([]);
  const [inform, setInform] = useState(false);
  const goto = (v: boolean) => {
    setInform(v);
    window.scrollTo(0, 0);
  };
  if (inform && t.length) return <WidowInform g={g} s={s} actor={actor} target={t[0]} onBack={() => goto(false)} />;
  return (
    <>
      <DoBox
        items={[
          wake(actor.n),
          '点「给寡妇看魔典」，把只读魔典给她看。',
          '她看完后指一名玩家：这个人中毒（寡妇活着就一直中毒）。你在下面点出来。',
          `让寡妇（${actor.n}号）闭眼。`,
          <>
            <b>还没完：</b>下一屏要再叫醒一名善良玩家，告诉他"寡妇在场"。
          </>,
        ]}
      />
      <SayBox lines={slotLines('widow', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <button className="btn btn-ghost btn-block" onClick={ui.openSpy}>
        <Icon name="eye" /> 给寡妇看魔典
      </button>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="她毒了谁？" />
      <Tips role="widow" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => goto(true)}>
          {t.length ? '下一步：告诉一名善良玩家' : '先点出她毒的人'}
        </button>
      </BottomBar>
    </>
  );
}

function WidowInform({ g, s, actor, target, onBack }: StepProps & { target: number; onBack: () => void }) {
  const done = useDone(g);
  const ui = useUi();
  const view = useMemo(() => ({ ...s, widowPoison: target }), [s, target]);
  const choices = useMemo(() => widowInformChoices(view, stepRng(s, target)), [view, s, target]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, target + 3)), [choices, s, target]);
  const [sel, setSel] = useState(rec);
  const [manual, setManual] = useState<number[]>([]);
  const who = sel >= 0 ? choices[sel]?.value : manual[0];
  const evilSeats = s.seats.filter((x) => isEvil(x) || !x.alive).map((x) => x.n);
  return (
    <>
      <div className="card card-warn stack" style={{ gap: 6 }}>
        <b style={{ color: 'var(--warn)' }}>寡妇（{actor.n}号）毒了 {target}号。现在告诉一名善良玩家：寡妇在场</b>
        <p className="dim">规则要求：寡妇在场时，一定要有一名善良玩家知道。不说他是谁中的毒。</p>
      </div>
      <div className="dim">告诉谁？</div>
      <ChoicePanel
        s={s}
        choices={choices}
        sel={sel}
        rec={rec}
        onSel={setSel}
        manual={<SeatPicker s={s} selected={manual} max={1} onChange={setManual} disabled={evilSeats} label="告诉谁？" />}
        manualLabel="自己选"
      />
      <DoBox
        items={[
          `确认寡妇（${actor.n}号）已经闭眼。`,
          who ? wake(who) : '叫醒你选的那名善良玩家。',
          '点「给他看」：寡妇在场。',
          sleep,
        ]}
      />
      <SayBox title="小声说" lines={['寡妇在场。']} />
      <button className="btn btn-outline btn-sm" onClick={onBack}>
        返回改她毒的人
      </button>
      <Tips role="widow" />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard({ title: '这个角色在场', big: ['寡妇'] })} />
        <button className="btn btn-primary grow" disabled={!who} onClick={() => done({ kind: 'widow', target, informed: who ?? null })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 小精灵 ---------------- */

function PixieStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => pixieChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), c ? <>点「给他看」：<b>【{roleName(c.value)}】</b>在场。</> : null, sleep]} />
      <SayBox lines={slotLines('pixie', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="pixie" />
      <BottomBar wide>
        {c && <CardButton onClick={() => ui.showCard(roleCard(c.value, '这个镇民角色在场'))} />}
        <button className="btn btn-primary grow" disabled={!c} onClick={() => c && done({ kind: 'role', role: c.value, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 侍女 ---------------- */

function ChambermaidStep({ g, s, actor }: StepProps) {
  const [picks, setPicks] = useState<number[]>([]);
  const blocked = s.seats.filter((x) => !x.alive || x.n === actor.n).map((x) => x.n);
  return (
    <>
      <DoBox items={[wake(actor.n), '让她指两名存活玩家（不能指自己），你在下面点出来。']} />
      <SayBox lines={slotLines('chambermaid', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <p className="dim">今晚因为自己的能力醒来过的人：{s.ns?.woke.length ? seatsText(s.ns.woke) : '还没有'}</p>
      <SeatPicker s={s} selected={picks} max={2} onChange={setPicks} disabled={blocked} label="她指了哪两个人？" />
      {picks.length === 2 ? (
        <Reveal key={[...picks].sort().join()}>
          <ChambermaidAnswer g={g} s={s} actor={actor} picks={picks} />
        </Reveal>
      ) : (
        <>
          <Tips role="chambermaid" />
          <Pending text="先点出她指的两个人" />
        </>
      )}
    </>
  );
}

function ChambermaidAnswer({ g, s, actor, picks }: StepProps & { picks: number[] }) {
  const done = useDone(g);
  const choices = useMemo(() => chambermaidChoices(s, actor.n, picks), [s, actor.n, picks]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, picks[0] * 13 + picks[1])), [choices, s, picks]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <p className="muted">真实答案：{chambermaidCount(s, picks)}</p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[c ? <>伸出 <b>{c.value}</b> 根手指{c.value === 0 ? '（握拳）' : ''}。</> : null, sleep]} />
      <Tips role="chambermaid" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && done({ kind: 'number', num: c.value, truth: c.truth, twist: c.twist })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 公爵夫人的拜访者 ---------------- */

function DuchessStep({ g, s }: { g: Game; s: GameState }) {
  const done = useDone(g);
  const choices = useMemo(() => duchessChoices(s, stepRng(s)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  const real = duchessCount(s);
  return (
    <>
      <p className="muted">
        今天的拜访者：{seatsText(s.duchessVisitors)}。其中邪恶的有 <b>{real}</b> 个。每人得知这个数，但其中一人拿到假数字。
      </p>
      {choices.length > 0 && <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />}
      <DoBox
        items={s.duchessVisitors.flatMap((n) => [
          <>
            轻拍 <b>{n}号</b>，伸出 <b>{c && c.value.falseFor === n ? c.value.falseNum : real}</b> 根手指，然后让他闭眼。
          </>,
        ])}
      />
      <SayBox lines={slotLines('duchess', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done(c ? { kind: 'duchess', falseFor: c.value.falseFor, falseNum: c.value.falseNum } : { kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 气球驾驶员 ---------------- */

function BalloonStep({ g, s, actor }: StepProps) {
  const done = useDone(g);
  const choices = useMemo(() => balloonistChoices(s, actor.n, stepRng(s)), [s, actor.n]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 1)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const c = choices[sel];
  return (
    <>
      <p className="dim">
        已经给过的类型：{s.balloonShown.length ? s.balloonShown.map((t) => TEAM_NAME[t]).join('、') : '还没有'}
      </p>
      <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
      <DoBox items={[wake(actor.n), c ? <>用手指向 <b>{c.value.seat}号</b>。</> : null, sleep]} />
      <SayBox lines={slotLines('balloonist', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <Tips role="balloonist" />
      <BottomBar wide>
        <button className="btn btn-primary btn-block" disabled={!c} onClick={() => c && done({ kind: 'balloon', seat: c.value.seat, team: c.value.team, truth: c.truth })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

