import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ROLES, TEAM_NAME, isEvilTeam, roleName, type Team } from '../engine/roles';
import { balance, leanTag, whyPrefix, type Choice } from '../engine/balance';
import { believedRole, isEvil, isPoisoned, seatOf, seatName } from '../engine/core';
import type { GameState } from '../engine/types';
import { Icon } from './icons';

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

export function BottomBar({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`bottombar${wide ? ' wide' : ''}`}>
      <div className="inner">{children}</div>
    </div>
  );
}

export function SayBox({ lines, title = '你要说', s, onStyle }: { lines: string[]; title?: string; s?: GameState; onStyle?: () => void }) {
  if (!lines.length) return null;
  return (
    <div className="say">
      <div className="lbl">
        <span>{title}</span>
        {s && onStyle && (
          <button className="btn-sm" style={{ background: 'none', border: 0, color: 'var(--text-3)', cursor: 'pointer', minHeight: 32 }} onClick={onStyle}>
            {s.style === 'simple' ? '换成氛围台词' : '换成简洁台词'}
          </button>
        )}
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
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="shead">
          <h3>{title}</h3>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** 两次点击才生效的危险按钮 */
export function ConfirmButton({ label, confirmLabel, onConfirm, className = 'btn btn-danger btn-block' }: { label: string; confirmLabel: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className={className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirmLabel : label}
    </button>
  );
}

/* ---------------- 座位选择 ---------------- */

export function SeatPicker({
  s, selected, max, onChange, disabled = [], label,
}: {
  s: GameState;
  selected: number[];
  max: number;
  onChange: (v: number[]) => void;
  disabled?: number[];
  label?: string;
}) {
  const tap = (n: number) => {
    if (selected.includes(n)) onChange(selected.filter((x) => x !== n));
    else if (max === 1) onChange([n]);
    else if (selected.length < max) onChange([...selected, n]);
  };
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
            <span className="num">{seatName(x.n).replace('号', '')}</span>
            <span className="nm">{ROLES[x.role].short}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 推荐给法 ---------------- */

/**
 * 显示推荐选项（附理由），可以展开换成别的给法，或者手动指定。
 * sel === -1 表示手动模式，manual 里放手动输入的界面。
 */
export function ChoicePanel<T>({
  s, choices, sel, rec, onSel, manual, manualLabel = '都不合适，手动指定', defaultOpen = false, moreLabel = '换一种给法',
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
}) {
  const score = balance(s).score;
  const cur = sel >= 0 ? choices[sel] : null;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {cur ? (
        <div className="recbox">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="dim">{sel === rec ? '网页推荐' : '你改成了'}</span>
            <LeanTag lean={cur.lean} />
          </div>
          <div className="answer">{cur.label}</div>
          <div className="why">
            {sel === rec && choices.length > 1 ? whyPrefix(score, choices.length, cur.lean) : ''}
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
        <details className="more" open={defaultOpen || undefined}>
          <summary>
            <Icon name="chevronDown" size={18} /> {moreLabel}（{choices.length}
            {manual ? ' + 手动' : ''}）
          </summary>
          <div className="choices" style={{ marginTop: 8 }}>
            {choices.map((c, i) => (
              <button key={c.key + i} className={`choice${i === sel ? ' sel' : ''}`} onClick={() => onSel(i)}>
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
              <button className={`choice${sel === -1 ? ' sel' : ''}`} onClick={() => onSel(-1)}>
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

export function BalanceMeter({ s, detail = false }: { s: GameState; detail?: boolean }) {
  const b = balance(s);
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
      {detail && (
        <ul>
          {b.parts.map((p) => (
            <li key={p.name}>
              {p.name}（{p.value > 0 ? '+' : ''}
              {Math.round(p.value)}）：{p.text}
            </li>
          ))}
        </ul>
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

export function seatMarks(s: GameState, n: number): Mark[] {
  const x = seatOf(s, n);
  const out: Mark[] = [];
  if (x.traveller) out.push({ key: 'trav', short: x.traveller.alignment === 'evil' ? '恶' : '善', text: `旅行者，阵营：${x.traveller.alignment === 'evil' ? '邪恶' : '善良'}`, cls: x.traveller.alignment === 'evil' ? 'm-evil' : undefined });
  if (s.voteMods[n]) out.push({ key: 'vote', short: s.voteMods[n] > 0 ? '×3' : '负', text: `今天他的票算 ${s.voteMods[n]} 票` });
  if (x.role === 'drunk') out.push({ key: 'drunk', short: '醉', text: `酒鬼：以为自己是【${roleName(believedRole(s, x))}】`, cls: 'm-drunk' });
  if (x.role === 'lunatic') out.push({ key: 'lunatic', short: '疯', text: `疯子：以为自己是【${roleName(believedRole(s, x))}】`, cls: 'm-drunk' });
  if (isPoisoned(s, n))
    out.push({
      key: 'poison', short: '毒', cls: 'm-poison',
      text: s.widowPoison === n ? '被寡妇下毒（寡妇活着就一直中毒）' : x.role === 'cannibal' && s.cannibalPoisoned ? '食人族吃到邪恶，中毒中' : '中毒中（今晚和明天白天）',
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
  return (
    <div className="showcard" role="dialog" aria-label="给玩家看">
      {c.title && <div className="ttl">{c.title}</div>}
      <div className={`big${c.big.length > 1 ? ' many' : ''}`}>
        {c.big.map((b) => (
          <div key={b}>{b}</div>
        ))}
      </div>
      {c.team && (() => {
        const evil = c.alignment ? c.alignment === 'evil' : isEvilTeam(c.team);
        return (
          <div className="team" style={{ color: evil ? 'var(--evil)' : 'var(--good)', borderColor: 'currentColor' }}>
            {TEAM_NAME[c.team]} · {evil ? '邪恶阵营' : '善良阵营'}
          </div>
        );
      })()}
      {c.ability && <div className="ab">{c.ability}</div>}
      {c.note && (
        <div className="ab" style={{ color: 'var(--evil)', fontWeight: 700 }}>
          {c.note}
        </div>
      )}
      <button className="btn btn-ghost btn-block done" onClick={onDone}>
        看完了
      </button>
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
