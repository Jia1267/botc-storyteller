import { useState } from 'react';
import { roleName } from '../engine/roles';
import { isEvil, isPoisoned, seatOf, seatName } from '../engine/core';
import { klutzChoose, klutzNeedsChoice, moonchildChoose, moonchildNeedsChoice, pixieMad, pixieNeedsCheck } from '../engine/flow';
import type { Game } from '../store';
import { SayBox, SeatPicker } from './common';

/** 还有没处理的提示（呆瓜选人、小精灵疯狂判定）时，不能进入下一阶段 */
export const promptPending = (s: Game['s']) => !!klutzNeedsChoice(s) || !!pixieNeedsCheck(s) || !!moonchildNeedsChoice(s);

/** 呆瓜死了：让他公开选一名存活玩家 */
export function KlutzPrompt({ g }: { g: Game }) {
  const s = g.s;
  const k = klutzNeedsChoice(s);
  const [t, setT] = useState<number[]>([]);
  if (!k) return null;
  const dead = s.seats.filter((x) => !x.alive).map((x) => x.n);
  const poisoned = isPoisoned(s, k.n);
  const evil = t.length ? isEvil(seatOf(s, t[0])) : false;
  return (
    <div className="card card-warn stack" style={{ gap: 10 }}>
      <b style={{ color: 'var(--warn)' }}>呆瓜（{seatName(k.n)}）死了：让他马上公开选一名存活玩家</b>
      <p className="dim">选到邪恶玩家，善良阵营直接落败。{poisoned ? '他中毒了：选到谁都不会触发。' : ''}</p>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[...dead, k.n]} label="他选了谁？" />
      {t.length > 0 && <SayBox title="公开宣布" lines={[!poisoned && evil ? `${seatName(t[0])} 是邪恶的，善良阵营落败！` : '什么都没有发生，游戏继续。']} />}
      <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => g.commit((st) => klutzChoose(st, t[0]))}>
        确认
      </button>
    </div>
  );
}

/** 小精灵：他看到的那个角色的玩家死了，判断他是否一直疯狂 */
export function PixiePrompt({ g }: { g: Game }) {
  const s = g.s;
  const p = pixieNeedsCheck(s);
  if (!p || !s.pixieRole) return null;
  const r = roleName(s.pixieRole);
  return (
    <div className="card card-warn stack" style={{ gap: 10 }}>
      <b style={{ color: 'var(--warn)' }}>小精灵（{seatName(p.n)}）看到的【{r}】那名玩家死了</b>
      <p>到目前为止，小精灵是不是一直公开、努力地坚持自己就是{r}（疯狂）？</p>
      <p className="dim">是：他从现在起获得{r}的能力（他自己不会被告知）。否：什么都不会发生。</p>
      <div className="row">
        <button className="btn btn-primary grow" onClick={() => g.commit((st) => pixieMad(st, true))}>
          是，他做到了
        </button>
        <button className="btn btn-outline grow" onClick={() => g.commit((st) => pixieMad(st, false))}>
          没有
        </button>
      </div>
    </div>
  );
}

/** 月之子死了：让他公开选一名存活玩家（善良的话当晚死） */
export function MoonchildPrompt({ g }: { g: Game }) {
  const s = g.s;
  const m = moonchildNeedsChoice(s);
  const [t, setT] = useState<number[]>([]);
  if (!m) return null;
  const dead = s.seats.filter((x) => !x.alive).map((x) => x.n);
  const good = t.length ? !isEvil(seatOf(s, t[0])) : false;
  return (
    <div className="card card-warn stack" style={{ gap: 10 }}>
      <b style={{ color: 'var(--warn)' }}>月之子（{seatName(m.n)}）死了：让他公开选一名存活玩家</b>
      <p className="dim">他可以先和大家商量一下。选中的人如果是善良的，今晚死亡。不要说出那人的阵营。</p>
      <SeatPicker s={s} selected={t} max={1} onChange={setT} disabled={[...dead, m.n]} label="他选了谁？" />
      {t.length > 0 && <p className="dim">{good ? `${seatName(t[0])} 是善良的：今晚会死（只有你知道）。` : `${seatName(t[0])} 是邪恶的：什么都不会发生。`}</p>}
      <button className="btn btn-primary btn-block" disabled={!t.length} onClick={() => g.commit((st) => moonchildChoose(st, t[0]))}>
        记下他的选择
      </button>
    </div>
  );
}
