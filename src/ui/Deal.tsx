import { useState } from 'react';
import { DrunkEdit, LunaticEdit, MarionetteEdit } from './Setup';
import { ROLES, TEAM_NAME, roleName } from '../engine/roles';
import { believedRole, lilMonsta, seatName } from '../engine/core';
import { dealNext } from '../engine/flow';
import { evilTravellerInfo } from '../engine/travellers';
import type { Game } from '../store';
import { BottomBar, useUi } from './common';
import { Icon } from './icons';

export function DealScreen({ g }: { g: Game }) {
  const s = g.s;
  const ui = useUi();
  const seat = s.seats[s.dealIndex];
  const shown = believedRole(s, seat);
  // 酒鬼、疯子看到的是假身份
  const fake = shown !== seat.role;
  const [edit, setEdit] = useState(false);

  const tv = seat.traveller;
  const show = () =>
    ui.showCard(
      tv
        ? {
            title: '你的身份（旅行者）', big: [roleName(seat.role)], team: 'traveller', alignment: tv.alignment, ability: ROLES[seat.role].ability,
            note: tv.alignment === 'evil' ? `你是邪恶的。${evilTravellerInfo(s)}` : undefined,
          }
        : {
            title: '你的身份', big: [roleName(shown)], team: ROLES[shown].team, ability: ROLES[shown].ability,
            // 赏金猎人的邪恶镇民：角色是镇民，阵营是邪恶
            ...(seat.alignment === 'evil' && !fake ? { alignment: 'evil' as const, note: '你是邪恶阵营的！你不知道其他邪恶玩家是谁，他们也不知道你。' } : {}),
          },
      () => g.commit((st) => dealNext(st)),
    );

  return (
    <main className="main" key={s.dealIndex}>
      <div className="stack">
        <div className="step-head">
          <span className="kicker">
            发身份 · {s.dealIndex + 1} / {s.seats.length}
          </span>
          <div className="progress">
            {s.seats.map((x, i) => (
              <i key={x.n} className={i <= s.dealIndex ? 'on' : ''} />
            ))}
          </div>
          <h2 style={{ marginTop: 8 }}>请 {seatName(seat.n)} 过来</h2>
        </div>
        <div className="do">
          <div className="lbl">你要做</div>
          <ol>
            <li>
              把 <b>{seatName(seat.n)}</b> 单独叫到一边，别让其他人看到屏幕。
            </li>
            <li>点下面的「给他看」，把手机举给他看。</li>
            <li>他看完自己点「看完了」，然后叫下一位。</li>
          </ol>
        </div>
        {fake ? (
          <div className="card card-warn stack" style={{ gap: 8 }}>
            <div className="row" style={{ color: 'var(--warn)' }}>
              <Icon name="alert" /> <b>他是{roleName(seat.role)}</b>
            </div>
            <p>
              {seatName(seat.n)} 的真实身份是【{roleName(seat.role)}】，但他会看到自己是{' '}
              <b className={seat.role === 'lunatic' ? 'evil' : 'good'}>【{roleName(shown)}】</b>。
            </p>
            <p>
              千万别说漏。
              {seat.role === 'lunatic'
                ? `他夜里选的人不会死，${lilMonsta(s) ? '爪牙们' : '真恶魔'}会被告知他是谁、选了谁。`
                : seat.role === 'marionette'
                  ? `他其实是邪恶的爪牙，但他不知道。第一晚恶魔会被告知他是谁；之后夜里按【${roleName(shown)}】叫醒他，信息可以是假的。`
                  : `之后夜里也按【${roleName(shown)}】叫醒他。`}
            </p>
            {seat.role === 'lunatic' && lilMonsta(s) && <p className="dim">小怪宝在场，按你们的规矩给他看涡流。</p>}
            <button className="btn btn-outline btn-sm" onClick={() => setEdit(true)}>
              换一个假身份
            </button>
          </div>
        ) : (
          <p className="dim">
            他的身份：{roleName(seat.role)}（{TEAM_NAME[ROLES[seat.role].team]}{tv ? `，${tv.alignment === 'evil' ? '邪恶' : '善良'}` : ''}{seat.alignment === 'evil' ? '，邪恶阵营' : ''}）
            {tv?.alignment === 'evil' && '。卡片上会告诉他恶魔是谁。'}
            {seat.alignment === 'evil' && '。赏金猎人在场：他是邪恶的镇民，卡片上会告诉他。'}
          </p>
        )}
        {s.dealIndex === s.seats.length - 1 && <p className="dim">这是最后一位，看完后直接入夜。</p>}
      </div>
      {edit && seat.role === 'drunk' && <DrunkEdit g={g} onClose={() => setEdit(false)} />}
      {edit && seat.role === 'lunatic' && <LunaticEdit g={g} onClose={() => setEdit(false)} />}
      {edit && seat.role === 'marionette' && <MarionetteEdit g={g} onClose={() => setEdit(false)} />}
      <BottomBar>
        <button className="btn btn-primary btn-block" onClick={show}>
          <Icon name="eye" /> {fake ? `我知道了，给他看【${roleName(shown)}】` : '给他看'}
        </button>
      </BottomBar>
    </main>
  );
}
