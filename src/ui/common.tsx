import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ROLES, TEAM_NAME, isEvilTeam, roleName, type Team } from '../engine/roles';
import { balance, leanTag, whyPrefix, type Choice } from '../engine/balance';
import { believedRole, isEvil, isPoisoned, keepsAbility, philoDrunk, seatOf, seatName } from '../engine/core';
import type { GameState } from '../engine/types';
import { Icon } from './icons';
import { Emblem } from './Emblem';

/* ---------------- 桌面：圆桌上要标出的人、当前的选人格子 ---------------- */

/** 当前步骤的选人格子，让 iPad 左边的圆桌也能直接点人 */
export interface PickerBridge {
  selected: number[];
  disabled: number[];
  tap: (n: number) => void;
}

export interface TableState {
  /** 这一步要说书人用手指向的人 */
  point: number[];
  setPoint: (seats: number[]) => void;
  picker: PickerBridge | null;
  register: (id: string, b: PickerBridge | null) => void;
}

export const TableCtx = createContext<TableState>({ point: [], setPoint: () => {}, picker: null, register: () => {} });
/** 弹出面板里的选人格子不接到圆桌上（圆桌被面板盖住了） */
export const InSheetCtx = createContext(false);

export function useTableState(): TableState {
  const [point, setPoint] = useState<number[]>([]);
  const [pickers, setPickers] = useState<{ id: string; b: PickerBridge }[]>([]);
  const register = useCallback((id: string, b: PickerBridge | null) => {
    setPickers((ps) => {
      const rest = ps.filter((p) => p.id !== id);
      return b ? [...rest, { id, b }] : rest;
    });
  }, []);
  return { point, setPoint, picker: pickers.length ? pickers[pickers.length - 1].b : null, register };
}

/** 步骤里要说书人指向的人：圆桌和迷你魔典上标出来，离开这一步自动清掉 */
export function usePoint(seats: number[]) {
  const { setPoint } = useContext(TableCtx);
  const key = seats.join(',');
  useEffect(() => {
    setPoint(key ? key.split(',').map(Number) : []);
    return () => setPoint([]);
  }, [key, setPoint]);
}

/* ---------------- 全局浮层控制 ---------------- */

export interface CardContent {
  title?: string;
  big: string[];
  team?: Team;
  /** 旅行者的阵营由说书人定，覆盖按角色类型推出来的阵营 */
  alignment?: 'good' | 'evil';
  /** 卡片最下面的一句重点（例如邪恶旅行者得知恶魔是谁） */
  note?: string;
  ability?: string;
}

export interface Ui {
  showCard(c: CardContent, onDone?: () => void): void;
  openSpy(): void;
  toast(msg: string): void;
}
export const UiCtx = createContext<Ui>(null!);
export const useUi = () => useContext(UiCtx);

/* ---------------- 布局小件 ---------------- */

/** 新的一屏至少停 1 秒才接受底部按钮的点击：连点时第二下不会把下一步也点掉 */
export const MIN_PAGE_MS = 1000;

export function BottomBar({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), MIN_PAGE_MS);
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className={`bottombar${wide ? ' wide' : ''}${ready ? '' : ' cooling'}`}
      onClickCapture={(e) => {
        if (ready) return;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div className="inner">{children}</div>
    </div>
  );
}

/** 台词风格（简洁/氛围）只在菜单里切换一次，不在每张台词卡上重复 */
export function SayBox({ lines, title = '你要说' }: { lines: string[]; title?: string }) {
  if (!lines.length) return null;
  return (
    <div className="say">
      <div className="lbl">
        <span>{title}</span>
      </div>
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

export function DoBox({ items, title = '你要做' }: { items: ReactNode[]; title?: string }) {
  const xs = items.filter(Boolean);
  if (!xs.length) return null;
  return (
    <div className="do">
      <div className="lbl">{title}</div>
      <ol>
        {xs.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ol>
    </div>
  );
}

export function LeanTag({ lean }: { lean: number }) {
  const cls = lean > 0 ? 'tag-good' : lean < 0 ? 'tag-evil' : 'tag-mid';
  return <span className={`tag ${cls}`}>{leanTag(lean)}</span>;
}

export function TeamChip({ team }: { team: Team }) {
  return <span className={`chip ${isEvilTeam(team) ? 'chip-evil' : 'chip-good'}`}>{TEAM_NAME[team]}</span>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), MIN_PAGE_MS);
    return () => clearTimeout(t);
  }, []);
  useEscape(onClose, box);
  // 挂到 body 上：魔典栏是 sticky 的，面板放在里面会被底部按钮压住，按钮还能被点到
  return createPortal(
    <div className="scrim" onClick={() => ready && onClose()}>
      <div
        ref={box}
        tabIndex={-1}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onClickCapture={(e) => {
          // 弹出面板也至少停 1 秒：连点时第二下不会点到面板里的按钮（关闭按钮除外）
          if (ready || (e.target as HTMLElement).closest('[aria-label="关闭"]')) return;
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        <div className="shead">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <InSheetCtx.Provider value={true}>{children}</InSheetCtx.Provider>
      </div>
    </div>,
    document.body,
  );
}

/** 弹出层：按 Esc 关闭，打开时把焦点移进来 */
export function useEscape(onClose: () => void, box: RefObject<HTMLElement | null>) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
    const h = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [box]);
}

/** 两次点击才生效的危险按钮 */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-danger btn-block' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armedAt, setArmedAt] = useState<number | null>(null);
  useEffect(() => {
    if (armedAt === null) return;
    const t = setTimeout(() => setArmedAt(null), 3000);
    return () => clearTimeout(t);
  }, [armedAt]);
  const armed = armedAt !== null;
  return (
    <button
      className={`${className}${armed ? ' armed' : ''}`}
      // 第二下要隔开半秒才算：手指一抖连点两下不会直接生效
      onClick={() => (!armed ? setArmedAt(Date.now()) : Date.now() - armedAt >= 500 && onConfirm())}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ---------------- 座位选择 ---------------- */

export function SeatPicker({
  s, selected, max, onChange, disabled = [], label, ordered = false, collapse,
}: {
  s: GameState;
  selected: number[];
  max: number;
  onChange: (v: number[]) => void;
  disabled?: number[];
  label?: string;
  /** 选中的格子角上标第几个（按顺序点的场合） */
  ordered?: boolean;
  /** 选满之后收成一行"他指了 3号、6号 [改]"，这里给前面那几个字 */
  collapse?: string;
}) {
  const [editing, setEditing] = useState(false);
  const pick = (v: number[]) => {
    onChange(v);
    if (v.length === max) setEditing(false);
  };
  const tap = (n: number) => {
    if (selected.includes(n)) pick(selected.filter((x) => x !== n));
    else if (max === 1) pick([n]);
    else if (selected.length < max) pick([...selected, n]);
  };
  // 接到圆桌上：iPad 左边的圆桌点人等于点这里的格子
  const { register } = useContext(TableCtx);
  const inSheet = useContext(InSheetCtx);
  const id = useId();
  const tapRef = useRef(tap);
  tapRef.current = tap;
  const selKey = selected.join(',');
  const disKey = disabled.join(',');
  useEffect(() => {
    if (inSheet) return;
    register(id, { selected: selKey ? selKey.split(',').map(Number) : [], disabled: disKey ? disKey.split(',').map(Number) : [], tap: (n) => tapRef.current(n) });
    return () => register(id, null);
  }, [inSheet, register, id, selKey, disKey]);
  if (collapse && max > 0 && selected.length === max && !editing)
    return (
      <div className="picked">
        <span>
          {collapse} <b>{selected.map(seatName).join('、')}</b>
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
          改
        </button>
      </div>
    );
  return (
    <div className="stack" style={{ gap: 8 }}>
      {label && <div className="dim">{label}</div>}
      <div className="seat-grid">
        {s.seats.filter((x) => !x.left).map((x) => (
          <button
            key={x.n}
            className={`seat-btn${selected.includes(x.n) ? ' sel' : ''}${x.alive ? '' : ' dead'}${isEvil(x) ? ' evil-r' : ''}`}
            disabled={disabled.includes(x.n)}
            aria-pressed={selected.includes(x.n)}
            aria-label={`${seatName(x.n)} ${roleName(x.role)}${x.alive ? '' : ' 已死亡'}`}
            onClick={() => tap(x.n)}
          >
            {ordered && selected.includes(x.n) && <span className="ord">{selected.indexOf(x.n) + 1}</span>}
            <span className="num">{seatName(x.n).replace('号', '')}</span>
            <span className="nm">{ROLES[x.role].short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 两个选项二选一（他要用 / 他不用 之类），两栏等宽 */
export function TwoChoice({ value, onChange, yes, no, label }: { value: boolean | null; onChange: (v: boolean) => void; yes: string; no: string; label?: string }) {
  return (
    <div className="seg two" role="radiogroup" aria-label={label}>
      <button role="radio" aria-checked={value === true} className={value === true ? 'on' : ''} onClick={() => onChange(true)}>
        {yes}
      </button>
      <button role="radio" aria-checked={value === false} className={value === false ? 'on' : ''} onClick={() => onChange(false)}>
        {no}
      </button>
    </div>
  );
}

/* ---------------- 推荐给法 ---------------- */

/**
 * 显示推荐选项（附理由），可以展开换成别的给法，或者手动指定。
 * sel === -1 表示手动模式，manual 里放手动输入的界面。
 */
export function ChoicePanel<T>({
  s, choices, sel, rec, onSel, manual, manualLabel = '都不合适，手动指定', defaultOpen = false, moreLabel = '换一种给法', pickedLabel = '你改成了',
}: {
  s: GameState;
  choices: Choice<T>[];
  sel: number;
  rec: number;
  onSel: (i: number) => void;
  manual?: ReactNode;
  manualLabel?: string;
  /** 一打开就把所有选项展开 */
  defaultOpen?: boolean;
  moreLabel?: string;
  /** 当前选项不是推荐时的标签 */
  pickedLabel?: string;
}) {
  const score = balance(s).score;
  const cur = sel >= 0 ? choices[sel] : null;
  const more = useRef<HTMLDetailsElement>(null);
  // 选好之后把展开的选项收起来，免得把下面的内容挤出屏幕
  const pick = (i: number) => {
    onSel(i);
    if (!defaultOpen && more.current) more.current.open = false;
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      {cur ? (
        <div className="recbox">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="dim">{sel === rec ? '网页推荐' : pickedLabel}</span>
            <LeanTag lean={cur.lean} />
          </div>
          <div className="answer">{cur.label}</div>
          <div className="why">
            {sel === rec && choices.length > 1 ? whyPrefix(score, choices.map((c) => c.lean), cur.lean) : ''}
            {cur.reason}
            {!cur.truth && ' 【这是假信息】'}
          </div>
        </div>
      ) : (
        <div className="recbox">
          <span className="dim">手动指定</span>
          {manual}
        </div>
      )}
      {(choices.length > 1 || manual) && (
        <details className="more" ref={more} open={defaultOpen || undefined}>
          <summary>
            <Icon name="chevronDown" size={18} /> {moreLabel}（{choices.length}
            {manual ? ' + 手动' : ''}）
          </summary>
          <div className="choices" style={{ marginTop: 8 }}>
            {choices.map((c, i) => (
              <button key={c.key + i} className={`choice${i === sel ? ' sel' : ''}`} onClick={() => pick(i)}>
                <div className="top">
                  <span className="lab">{c.label}</span>
                  <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    {i === rec && <span className="tag tag-rec">推荐</span>}
                    <LeanTag lean={c.lean} />
                  </span>
                </div>
                <span className="why">
                  {c.reason}
                  {!c.truth && ' 【假信息】'}
                </span>
              </button>
            ))}
            {manual && (
              <button className={`choice${sel === -1 ? ' sel' : ''}`} onClick={() => pick(-1)}>
                <span className="lab">{manualLabel}</span>
              </button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

/* ---------------- 局势条 ---------------- */

export function BalanceMeter({ s, detail = false, expandable = false }: { s: GameState; detail?: boolean; expandable?: boolean }) {
  const b = balance(s);
  const parts = (
    <ul>
      {b.parts.map((p) => (
        <li key={p.name}>
          {p.name}（{p.value > 0 ? '+' : ''}
          {Math.round(p.value)}）：{p.text}
        </li>
      ))}
    </ul>
  );
  const pos = 50 + b.score / 2;
  const cls = b.score >= 12 ? 'good' : b.score <= -12 ? 'evil' : '';
  return (
    <div className="meter" aria-label={`局势：${b.label}，${b.score}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="dim">局势</span>
        <span className={`lbl ${cls}`}>
          {b.label}（{b.score > 0 ? '+' : ''}
          {b.score}）
        </span>
      </div>
      <div className="bar">
        <i style={{ left: `${pos}%` }} />
      </div>
      <div className="ends">
        <span>邪恶优势</span>
        <span>善良优势</span>
      </div>
      {detail
        ? parts
        : expandable && (
            <details className="more">
              <summary>
                <Icon name="chevronDown" size={16} /> 看局势分项
              </summary>
              {parts}
            </details>
          )}
    </div>
  );
}

/* ---------------- 座位状态 ---------------- */

export interface Mark {
  key: string;
  short: string;
  text: string;
  cls?: string;
}

/** 醉酒原因：why 记的是让他醉的角色（或"选了莽夫"） */
export const drunkWhy = (why: string) => (why === '选了莽夫' || why.startsWith('哲学家') ? why : `被${why}弄醉`);

export function seatMarks(s: GameState, n: number): Mark[] {
  const x = seatOf(s, n);
  const out: Mark[] = [];
  if (x.traveller) out.push({ key: 'trav', short: x.traveller.alignment === 'evil' ? '恶' : '善', text: `旅行者，阵营：${x.traveller.alignment === 'evil' ? '邪恶' : '善良'}`, cls: x.traveller.alignment === 'evil' ? 'm-evil' : undefined });
  if (s.voteMods[n]) out.push({ key: 'vote', short: s.voteMods[n] > 0 ? '×3' : '负', text: `今天他的票算 ${s.voteMods[n]} 票` });
  if (x.role === 'drunk') out.push({ key: 'drunk', short: '醉', text: `酒鬼：以为自己是【${roleName(believedRole(s, x))}】`, cls: 'm-drunk' });
  if (x.role === 'lunatic') out.push({ key: 'lunatic', short: '疯', text: `疯子：以为自己是【${roleName(believedRole(s, x))}】`, cls: 'm-drunk' });
  if (x.role === 'marionette') out.push({ key: 'mario', short: '偶', text: `提线木偶：以为自己是【${roleName(believedRole(s, x))}】`, cls: 'm-evil' });
  if (!x.traveller && x.alignment) out.push({ key: 'align', short: x.alignment === 'evil' ? '恶' : '善', text: `阵营是${x.alignment === 'evil' ? '邪恶' : '善良'}的（和角色类型不同）`, cls: x.alignment === 'evil' ? 'm-evil' : undefined });
  if (x.role === 'alchemist' && s.alchemistAbility) out.push({ key: 'alch', short: '炼', text: `拥有【${roleName(s.alchemistAbility)}】的能力` });
  if (x.role === 'zombuul' && s.zombuulFake) out.push({ key: 'zfake', short: '假', text: '僵怖假死中：大家以为他死了，其实还活着', cls: 'm-evil' });
  if (s.sweetheartDrunk === n) out.push({ key: 'swd', short: '醉', text: '被心上人弄醉：一直醉酒', cls: 'm-drunk' });
  if (s.advocate && s.advocate.ok && s.advocate.night === s.night && s.advocate.seat === n) out.push({ key: 'adv', short: '辩', text: '魔鬼代言人保护：明天被处决不会死' });
  if (s.harpy && !s.harpy.done && s.harpy.night === s.night && s.harpy.mad === n) out.push({ key: 'harpy', short: '狂', text: `要疯狂地证明 ${seatName(s.harpy.second)} 是邪恶的（鹰身女妖）` });
  if (s.bountyKnown[s.bountyKnown.length - 1] === n) out.push({ key: 'bounty', short: '赏', text: '赏金猎人现在盯着的邪恶玩家' });
  if (s.bansheeActive === n) out.push({ key: 'banshee', short: '妖', text: '报丧女妖能力生效：每天提名两次、投票算两票' });
  const td = s.tempDrunk.find((d) => d.seat === n && d.from <= s.night && s.night <= d.to);
  if (td) out.push({ key: 'tdrunk', short: '醉', text: `${td.to >= 999 ? '一直醉酒' : `醉酒到第 ${td.to} 天黄昏`}（${drunkWhy(td.why)}）`, cls: 'm-drunk' });
  if (s.philoDrunk === n && philoDrunk(s, n)) out.push({ key: 'phd', short: '醉', text: '哲学家拿了他的能力：醉酒，直到哲学家死亡或失灵', cls: 'm-drunk' });
  if (s.twin === n && s.seats.some((y) => y.role === 'eviltwin')) out.push({ key: 'twin', short: '双', text: '镜像双子的善良双子：他被处决邪恶直接获胜' });
  if (s.witchCurse && s.witchCurse.seat === n && s.witchCurse.night === s.night) out.push({ key: 'curse', short: '咒', text: '被女巫诅咒：这一天提名就会死', cls: 'm-evil' });
  if (s.cereMad && s.cereMad.seat === n && s.cereMad.night === s.night) out.push({ key: 'cere', short: '狂', text: `要疯狂地证明自己是${roleName(s.cereMad.role)}（洗脑师）` });
  if (!x.alive && keepsAbility(s, n)) out.push({ key: 'vigor', short: '留', text: '被亡骨魔杀死：能力还在，夜里照常叫醒', cls: 'm-evil' });
  if (s.grandchild === n && s.seats.some((y) => y.role === 'grandmother' && y.alive)) out.push({ key: 'gc', short: '孙', text: '祖母的孙子：被恶魔杀死时祖母也死' });
  if (s.phase === 'night' && s.ns?.innkeeper?.includes(n)) out.push({ key: 'inn', short: '护', text: '今晚受旅店老板保护' });
  if (x.role === 'po' && s.poCharged) out.push({ key: 'po', short: '蓄', text: '珀上次没选人：下次要选三个', cls: 'm-evil' });
  if (isPoisoned(s, n))
    out.push({
      key: 'poison', short: '毒', cls: 'm-poison',
      text:
        s.widowPoison === n
          ? '被寡妇下毒（寡妇活着就一直中毒）'
          : x.role === 'cannibal' && s.cannibalPoisoned
            ? '食人族吃到邪恶，中毒中'
            : s.stPoison?.seat === n && s.stPoison.night === s.night
              ? '被说书人用投毒者能力下毒（今晚和明天白天）'
              : s.pukkaPoison === n
                ? '被普卡毒了：下一次普卡行动时死亡'
                : s.snakePoisoned.includes(n)
                  ? '被舞蛇人换下来：一直中毒'
                  : s.vigor.some((v) => v.poisoned === n)
                    ? '被亡骨魔杀死的爪牙毒了（亡骨魔活着就一直中毒）'
                    : s.seats.some((y) => y.role === 'nodashii' && y.alive) && !(s.poison?.seat === n && s.poison.night === s.night)
                      ? '诺-达鲺的邻居镇民：诺-达鲺活着就一直中毒'
                      : '中毒中（今晚和明天白天）',
    });
  if (s.babysitter === n && s.demonChar === 'lilmonsta') out.push({ key: 'baby', short: '宝', text: '正在照看小怪宝（算作恶魔）', cls: 'm-evil' });
  if (s.fearTarget === n && s.seats.some((y) => y.role === 'fearmonger' && y.alive)) out.push({ key: 'fear', short: '惧', text: '恐惧之灵的目标', cls: 'm-evil' });
  if (s.gained[n]) out.push({ key: 'gained', short: '获', text: `现在拥有【${roleName(s.gained[n])}】的能力` });
  if (x.role === 'amnesiac' && s.amnesiacAbility) out.push({ key: 'amn', short: '忆', text: `失忆者的能力：像${roleName(s.amnesiacAbility)}一样` });
  if (s.widowInformed === n) out.push({ key: 'wknow', short: '知', text: '知道寡妇在场' });
  if (s.phase === 'night' && s.ns?.monk === n) out.push({ key: 'monk', short: '护', text: '今晚受僧侣保护' });
  if (s.butlerMaster === n && s.seats.some((y) => y.role === 'butler' && y.alive)) out.push({ key: 'master', short: '主', text: '管家的主人' });
  if (s.redHerring === n && s.seats.some((y) => y.role === 'fortuneteller')) out.push({ key: 'rh', short: '扰', text: '占卜师的干扰项' });
  if (x.used) out.push({ key: 'used', short: '用', text: '一次性能力已用' });
  if (x.role !== x.startRole) out.push({ key: 'became', short: '变', text: `原本是【${roleName(x.startRole)}】`, cls: 'm-evil' });
  return out;
}

/* ---------------- 给玩家看的大字卡 ---------------- */

export function ShowCard({ c, onDone }: { c: CardContent; onDone: () => void }) {
  // 卡片也至少停 1 秒：连点"给他看"时第二下不会直接点到"看完了"
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), MIN_PAGE_MS);
    return () => clearTimeout(t);
  }, []);
  // 带阵营的身份卡：上面一个阵营徽记，背景一点阵营色的光
  const side = c.team ? ((c.alignment ? c.alignment === 'evil' : isEvilTeam(c.team)) ? 'evil' : 'good') : null;
  return (
    <div className={`showcard${side ? ` v3${side === 'evil' ? ' win-evil' : ''}` : ''}`} role="dialog" aria-label="给玩家看">
      {c.title && <div className="ttl">{c.title}</div>}
      {side && <Emblem team={side} />}
      <div className={`big${c.big.length > 1 ? ' many' : ''}`}>
        {c.big.map((b) => (
          <div key={b}>{b}</div>
        ))}
      </div>
      {c.team && side && (
        <div className="team">
          {TEAM_NAME[c.team]} · {side === 'evil' ? '邪恶阵营' : '善良阵营'}
        </div>
      )}
      {c.ability && <div className="ab">{c.ability}</div>}
      {c.note && (
        <div className="ab" style={{ color: 'var(--evil)', fontWeight: 700 }}>
          {c.note}
        </div>
      )}
      <button className="btn btn-ghost btn-block done" style={ready ? undefined : { opacity: 0.6 }} onClick={() => ready && onDone()}>
        看完了
      </button>
      {side && <p className="legal">钟楼说书人 · 非官方桌游辅助工具</p>}
    </div>
  );
}

/** 角色 → 大字卡 */
export const roleCard = (r: keyof typeof ROLES, title: string, withAbility = false): CardContent => ({
  title,
  big: [roleName(r)],
  team: withAbility ? ROLES[r].team : undefined,
  ability: withAbility ? ROLES[r].ability : undefined,
});
