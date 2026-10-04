import { useMemo, useState, type ReactNode } from 'react';
import { ROLES, ROLE_LIST, TEAM_NAME, roleName, type RoleId } from '../engine/roles';
import { balance, recommend } from '../engine/balance';
import { aliveNeighbors, believedRole, demonSeat, isPoisoned, malfunction } from '../engine/core';
import {
  completeSlot, currentSlot, minionSeats, previewImp, shouldRun, slotActor, slotsFor, type SlotPayload,
} from '../engine/flow';
import {
  chefCount, empathCount, fortuneChoices, legalNumbers, mayorBounceChoices, numberChoices, pairChoices,
  pairVerdict, revealChoices, revealVerdict, starpassChoices, type PairInfo, type PairKind,
} from '../engine/info';
import { SLOT_TITLE, dawnLines, librarianZeroLines, slotLines } from '../engine/scripts';
import type { GameState, Seat, SlotId } from '../engine/types';
import { stepRng, type Game } from '../store';
import { BottomBar, ChoicePanel, DoBox, SayBox, SeatPicker, roleCard, useUi } from './common';
import { GrimoirePanel } from './Grimoire';
import { Icon } from './icons';

interface StepProps {
  g: Game;
  s: GameState;
  actor: Seat;
}

export function NightScreen({ g }: { g: Game }) {
  const s = g.s;
  const slot = currentSlot(s);
  const actor = slotActor(s, slot);
  const order = slotsFor(s.night);
  const cur = s.ns!.slot;
  const visible = order.map((sl, i) => ({ sl, i })).filter(({ sl, i }) => i === cur || shouldRun(s, sl));
  const pos = visible.findIndex((x) => x.i === cur) + 1;

  return (
    <main className="main split">
      <div className="side">
        <GrimoirePanel s={s} />
      </div>
      <div className="stack" key={`${s.night}-${cur}`}>
        <div className="step-head">
          <span className="kicker">
            第 {s.night} 夜 · 第 {pos} 步 / 共约 {visible.length} 步
          </span>
          <div className="progress">
            {visible.map((x) => (
              <i key={x.i} className={x.i <= cur ? 'on' : ''} />
            ))}
          </div>
          <h2 style={{ marginTop: 6 }}>{SLOT_TITLE[slot]}</h2>
          {actor && <ActorLine s={s} actor={actor} slot={slot} />}
        </div>
        <SlotBody g={g} s={s} slot={slot} actor={actor} />
      </div>
    </main>
  );
}

function ActorLine({ s, actor, slot }: { s: GameState; actor: Seat; slot: SlotId }) {
  const flags: ReactNode[] = [];
  if (actor.role === 'drunk') flags.push(<span key="d" className="chip chip-warn">其实是酒鬼：能力无效，可以给假信息</span>);
  if (isPoisoned(s, actor.n)) flags.push(<span key="p" className="chip chip-poison">今晚中毒：能力无效，可以给假信息</span>);
  if (!actor.alive) flags.push(<span key="x" className="chip">今晚刚死</span>);
  return (
    <>
      <div className="who">
        叫醒 <b>{actor.n}号</b>
        {actor.role === 'drunk' && `（他以为自己是${roleName(believedRole(s, actor))}）`}
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

function useDone(g: Game) {
  return (p: SlotPayload) => g.commit((st) => completeSlot(st, p));
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
      return <ImpStep g={g} s={s} actor={actor!} />;
    case 'ravenkeeper':
    case 'undertaker':
      return <RevealStep g={g} s={s} actor={actor!} kind={slot} />;
  }
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
  const ms = minions.map((x) => `${x.n}号`).join('、');
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
  const ms = minionSeats(s).map((x) => `${x.n}号`).join('、');
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
  return (
    <>
      <SayBox lines={dawnLines(deaths, s.style)} title="对所有人说" s={s} onStyle={toggleStyle(g)} />
      <DoBox items={['宣布死讯时只说谁死了，不要说是怎么死的。', deaths.length ? '让死去的玩家知道：死人还能说话，但不能提名，整局只剩一次投票。' : null]} />
      {s.winner && (
        <div className={`card ${s.winner === 'good' ? '' : 'card-evil'}`}>
          <h3>游戏结束</h3>
          <p>
            {s.winner === 'good' ? '善良' : '邪恶'}阵营获胜：{s.winReason}
          </p>
        </div>
      )}
      <BottomBar wide>
        <button className="btn btn-primary btn-block" onClick={() => done({ kind: 'none' })}>
          {s.winner ? '宣布结果' : '进入白天'}
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 选一个人：投毒者 / 僧侣 / 管家 ---------------- */

function TargetStep({ g, s, actor, slot }: StepProps & { slot: 'poisoner' | 'monk' | 'butler' }) {
  const done = useDone(g);
  const [t, setT] = useState<number[]>([]);
  const notSelf = slot !== 'poisoner';
  const bad = malfunction(s, actor.n);
  const note =
    slot === 'poisoner'
      ? '被毒的人今晚和明天白天能力失效，网页会自动提醒你给他假信息。'
      : slot === 'monk'
        ? bad
          ? '他的保护今晚无效（中毒/酒鬼）。照常让他选，别露馅。'
          : '被保护的人今晚不会被恶魔杀死。'
        : '明天白天提醒自己：只有主人投票时，管家才能投票。';
  return (
    <>
      <DoBox items={[wake(actor.n), `让他用手指向一名玩家${notSelf ? '（不能指自己）' : ''}，你在下面点出同一个人。`, sleep]} />
      <SayBox lines={slotLines(slot, s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={notSelf ? [actor.n] : []} label="他指了谁？" />
      <p className="dim">{note}</p>
      <Tips role={believedRole(s, actor)} drunk={actor.role === 'drunk'} />
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
  const healthy = !malfunction(s, actor.n);

  const manualInfo: PairInfo | null =
    mRole === 'zero' ? { role: null, seats: null } : mRole && mSeats.length === 2 ? { role: mRole, seats: [Math.min(...mSeats), Math.max(...mSeats)] as [number, number] } : null;
  const verdict = manualInfo ? pairVerdict(s, kind, actor.n, manualInfo) : null;
  const illegal = sel === -1 && healthy && verdict === 'false';
  const value = sel >= 0 ? choices[sel]?.value : manualInfo;
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';

  const teamRoles = ROLE_LIST.filter((r) => r.team === KIND_TEAM[kind]).map((r) => r.id);
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
      {illegal && <p className="evil">他没有中毒也不是酒鬼，必须给真信息。这样给不合规。</p>}
      {verdict === 'false' && !healthy && <p className="dim">这是假信息（他中毒/是酒鬼，可以给）。</p>}
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
        <button
          className="btn btn-primary grow"
          disabled={!value || illegal}
          onClick={() => value && done({ kind: 'pair', info: value, truth, twist })}
        >
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
  const healthy = !malfunction(s, actor.n);
  const legal = legalNumbers(s, kind, actor.n);
  const base = kind === 'chef' ? chefCount(s) : empathCount(s, actor.n);
  const value = sel >= 0 ? choices[sel].value : mNum;
  const truth = sel >= 0 ? choices[sel].truth : mNum !== null && legal.includes(mNum);
  const twist = sel >= 0 ? !!choices[sel].twist : truth && mNum !== base;
  const nb = aliveNeighbors(s, actor.n);

  const manual = (
    <div className="big-num-grid">
      {[0, 1, 2, 3, 4].map((n) => (
        <button key={n} className={`btn ${mNum === n ? 'btn-primary' : 'btn-ghost'}`} disabled={healthy && !legal.includes(n)} onClick={() => setMNum(n)}>
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
        <FortuneAnswer key={[...picks].sort().join()} g={g} s={s} actor={actor} picks={picks as [number, number]} />
      ) : (
        <>
          <Tips role="fortuneteller" drunk={actor.role === 'drunk'} />
          <BottomBar wide>
            <button className="btn btn-primary btn-block" disabled>
              先点出他指的两个人
            </button>
          </BottomBar>
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
  return (
    <>
      <DoBox items={[wake(actor.n), '点「给他看」：你现在是小恶魔。', '马上进入恶魔这一步（他今晚就可以杀人）。']} />
      <SayBox lines={slotLines('scarletwoman', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <BottomBar wide>
        <CardButton onClick={() => ui.showCard(roleCard('imp', '你现在是', true))} />
        <button className="btn btn-primary grow" onClick={() => done({ kind: 'none' })}>
          完成，下一步
        </button>
      </BottomBar>
    </>
  );
}

/* ---------------- 小恶魔 ---------------- */

function ImpStep({ g, s, actor }: StepProps) {
  const [t, setT] = useState<number[]>([]);
  return (
    <>
      <DoBox items={[wake(actor.n), '让他用手指向一名玩家（可以指自己），你在下面点出来。']} />
      <SayBox lines={slotLines('imp', s.style)} title="小声说" s={s} onStyle={toggleStyle(g)} />
      <SeatPicker s={s} selected={t} max={1} onChange={setT} label="他要杀谁？" />
      {t.length ? (
        <ImpOutcome key={t[0]} g={g} s={s} actor={actor} target={t[0]} />
      ) : (
        <>
          <Tips role="imp" />
          <BottomBar wide>
            <button className="btn btn-primary btn-block" disabled>
              先点出他指的人
            </button>
          </BottomBar>
        </>
      )}
    </>
  );
}

function ImpOutcome({ g, s, actor, target }: StepProps & { target: number }) {
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

  const items: ReactNode[] = [sleep];
  if (pv.kind === 'starpass' && picked)
    items.push(
      <>
        轻拍 <b>{picked}号</b>，让他睁眼。
      </>,
      '点「给他看」：你现在是小恶魔。',
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
          <div className="dim">{pv.kind === 'mayor' ? '谁替镇长死？' : '谁变成新的小恶魔？'}</div>
          <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} />
        </>
      )}
      <DoBox items={items} />
      <Tips role="imp" />
      <BottomBar wide>
        {pv.kind === 'starpass' && picked && <CardButton onClick={() => ui.showCard(roleCard('imp', '你现在是', true))} />}
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
        <RevealAnswer key={subject} g={g} s={s} actor={actor} kind={kind} subject={subject} />
      ) : (
        <BottomBar wide>
          <button className="btn btn-primary btn-block" disabled>
            先点出他指的人
          </button>
        </BottomBar>
      )}
    </>
  );
}

function RevealAnswer({ g, s, actor, kind, subject }: StepProps & { kind: 'ravenkeeper' | 'undertaker'; subject: number }) {
  const done = useDone(g);
  const ui = useUi();
  const choices = useMemo(() => revealChoices(s, actor.n, subject, stepRng(s, subject)), [s, actor.n, subject]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, subject + 1)), [choices, s, subject]);
  const [sel, setSel] = useState(rec);
  const [mRole, setMRole] = useState<RoleId | null>(null);
  const healthy = !malfunction(s, actor.n);
  const verdict = mRole ? revealVerdict(s, subject, mRole) : null;
  const illegal = sel === -1 && healthy && verdict === 'false';
  const value = sel >= 0 ? choices[sel].value : mRole;
  const truth = sel >= 0 ? choices[sel].truth : verdict !== 'false';
  const twist = sel >= 0 ? !!choices[sel].twist : verdict === 'twist';

  const manual = (
    <div className="stack" style={{ gap: 8 }}>
      {(['townsfolk', 'outsider', 'minion', 'demon'] as const).map((t) => (
        <div key={t}>
          <div className="dim">{TEAM_NAME[t]}</div>
          <div className="role-grid">
            {ROLE_LIST.filter((r) => r.team === t).map((r) => (
              <button key={r.id} className={`role-chip${t === 'minion' || t === 'demon' ? ' evil-c' : ''}`} style={mRole === r.id ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setMRole(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      ))}
      {illegal && <p className="evil">他没有中毒也不是酒鬼，必须给真信息。这样给不合规。</p>}
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
