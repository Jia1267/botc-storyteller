import { useMemo, useState } from 'react';
import { ROLES, TRAVELLER_ROLES, roleName, type RoleId } from '../engine/roles';
import { balance, recommend } from '../engine/balance';
import { circleOrder, seatName, seatOf } from '../engine/core';
import { addTraveller, alignmentChoices, evilTravellerInfo, exileThreshold } from '../engine/travellers';
import { isEvil, malfunction } from '../engine/core';
import { stepRng, type Game } from '../store';
import { ChoicePanel, SayBox, SeatPicker, Sheet, useUi } from './common';

/**
 * 加一名旅行者：选角色 → 坐在谁旁边 → 阵营（按局势推荐）→ 给他看身份。
 * 开局时（setup）加的人会在发身份时一起发卡；中途加入的人当场给他看。
 */
export function AddTravellerSheet({ g, onClose }: { g: Game; onClose: () => void }) {
  const s = g.s;
  const ui = useUi();
  const [role, setRole] = useState<RoleId | null>(null);
  const [after, setAfter] = useState<number[]>([]);
  const choices = useMemo(() => alignmentChoices(stepRng(s, 61)), [s]);
  const rec = useMemo(() => recommend(choices, balance(s).score, stepRng(s, 62)), [choices, s]);
  const [sel, setSel] = useState(rec);
  const alignment = choices[sel]?.value ?? 'good';
  const [amigo, setAmigo] = useState<number[]>([]);
  const midGame = s.phase !== 'setup';
  const order = circleOrder(s);
  const nextOf = (n: number) => order[(order.indexOf(n) + 1) % order.length];

  const newN = 101 + s.seats.filter((x) => x.traveller).length;
  const add = () => {
    if (!role || !after.length) return;
    g.commit((st) => {
      addTraveller(st, role, after[0], alignment);
      if (role === 'gnome' && amigo.length) st.gnomeAmigo = amigo[0];
    });
    onClose();
    if (midGame)
      ui.showCard(
        {
          title: '你的身份（旅行者）', big: [roleName(role)], team: 'traveller', alignment, ability: ROLES[role].ability,
          note: alignment === 'evil' ? `你是邪恶的。${evilTravellerInfo(s)}` : undefined,
        },
        () => ui.toast(`${seatName(newN)} 已加入`),
      );
  };

  return (
    <Sheet title={midGame ? '有人中途加入（旅行者）' : '多出来的人当旅行者'} onClose={onClose}>
      <div className="stack">
        <p className="dim">
          旅行者不占配板人数，不能被处决，只能被放逐。所有人都知道他是哪个旅行者，但不知道他的阵营。
        </p>
        <div className="dim">1. 他当哪个旅行者？（让他自己选）</div>
        <div className="role-grid compact">
          {TRAVELLER_ROLES.map((r) => (
            <button key={r} className="role-chip" style={role === r ? { boxShadow: '0 0 0 2px var(--gold) inset' } : undefined} onClick={() => setRole(r)}>
              {roleName(r)}
            </button>
          ))}
        </div>
        {role && <p className="muted">{ROLES[role].ability}</p>}
        <SeatPicker s={s} selected={after} max={1} onChange={setAfter} label="2. 他坐在谁的顺时针下一位？（点他左手边那个人）" />
        {after.length > 0 && (
          <p className="dim">
            他会坐在 {seatName(after[0])} 和 {seatName(nextOf(after[0]))} 之间，叫"{seatName(101 + s.seats.filter((x) => x.traveller).length)}"。原来的座位号都不变。
          </p>
        )}
        <div className="dim">3. 他的阵营（网页按局势推荐，可以改）</div>
        <ChoicePanel s={s} choices={choices} sel={sel} rec={rec} onSel={(i) => i >= 0 && setSel(i)} moreLabel="换阵营" />
        {role === 'gnome' && (
          <SeatPicker
            s={s}
            selected={amigo}
            max={1}
            onChange={setAmigo}
            disabled={s.seats.filter((x) => x.traveller || isEvil(x) !== (alignment === 'evil')).map((x) => x.n)}
            label="4. 侏儒的伙伴：选一个和他同阵营的人，开局公开宣布"
          />
        )}
        {midGame && role && (
          <SayBox
            title="公开宣布"
            lines={[
              `有一位旅行者加入了游戏，他是【${roleName(role)}】。`,
              '旅行者不能被处决，只能被放逐：任何人都可以发起，需要所有玩家（包括死人）至少一半同意。',
            ]}
          />
        )}
        {role === 'gnome' && amigo.length > 0 && <SayBox title="公开宣布" lines={[`侏儒和 ${seatName(amigo[0])} 是同一阵营。`]} />}
        <button className="btn btn-primary btn-block" disabled={!role || !after.length || (role === 'gnome' && !amigo.length)} onClick={add}>
          {midGame ? '加入，并给他看身份' : '加入（发身份时一起给他看）'}
        </button>
      </div>
    </Sheet>
  );
}

/** 放逐旅行者 */
export function ExileSheet({ g, onClose, onExile }: { g: Game; onClose: () => void; onExile: (n: number) => void }) {
  const s = g.s;
  const [t, setT] = useState<number[]>([]);
  const notTravellers = s.seats.filter((x) => !x.traveller || !x.alive).map((x) => x.n);
  const need = exileThreshold(s);
  const [funny, setFunny] = useState<boolean | null>(null);
  const deviant = t.length > 0 && seatOf(s, t[0]).role === 'deviant' && !malfunction(s, t[0]);
  return (
    <Sheet title="放逐旅行者" onClose={onClose}>
      <div className="stack">
        <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={notTravellers} label="放逐谁？" />
        <div className="card">
          <p>
            需要至少 <b className="answer" style={{ fontSize: 22 }}>{need}</b> 人举手支持（全体玩家含死人，共 {s.seats.filter((x) => !x.left).length} 人的一半）。
          </p>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="muted">
            <li>任何人都可以发起放逐，死人也可以举手支持，而且不消耗他最后那一票。</li>
            <li>一天可以放逐任意次，不占当天的处决。</li>
            <li>任何能力都不能影响放逐（例如替罪羊、贞洁者都不触发）。</li>
          </ul>
        </div>
        {deviant && <TwoChoiceInline value={funny} onChange={setFunny} />}
        {t.length > 0 && (
          <SayBox title="够票的话公开宣布" lines={deviant && funny ? [`${seatName(t[0])} 是怪咖，他今天很搞笑：放逐失败。`] : [`${seatName(t[0])}（${roleName(seatOf(s, t[0]).role)}）被放逐了。`]} />
        )}
        <button className="btn btn-danger btn-block" disabled={!t.length || (deviant && funny === null)} onClick={() => (deviant && funny ? onClose() : onExile(t[0]))}>
          {deviant && funny ? '怪咖今天很搞笑：不放逐' : '够票了，放逐'}
        </button>
        <button className="btn btn-outline btn-block" onClick={onClose}>
          票不够，算了
        </button>
      </div>
    </Sheet>
  );
}

/** 怪咖：今天搞笑了吗 */
function TwoChoiceInline({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="card card-warn stack" style={{ gap: 8 }}>
      <b>他是怪咖：他今天很搞笑吗？</b>
      <p className="dim">搞笑的话他不会被放逐。</p>
      <div className="row">
        <button className={`btn grow ${value === true ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange(true)}>很搞笑</button>
        <button className={`btn grow ${value === false ? 'btn-primary' : 'btn-outline'}`} onClick={() => onChange(false)}>不搞笑</button>
      </div>
    </div>
  );
}
