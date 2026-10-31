import { ROLES, roleName } from '../engine/roles';
import { believedRole } from '../engine/core';
import { evilTravellerInfo } from '../engine/travellers';
import type { GameState, Seat } from '../engine/types';
import type { CardContent } from './common';

/** 发身份时给这个人看的卡：酒鬼、疯子、提线木偶看到的是假身份；邪恶旅行者会被告知恶魔是谁 */
export function dealCard(s: GameState, seat: Seat): CardContent {
  const tv = seat.traveller;
  if (tv)
    return {
      title: '你的身份（旅行者）', big: [roleName(seat.role)], team: 'traveller', alignment: tv.alignment, ability: ROLES[seat.role].ability,
      note: tv.alignment === 'evil' ? `你是邪恶的。${evilTravellerInfo(s)}` : undefined,
    };
  const shown = believedRole(s, seat);
  const fake = shown !== seat.role;
  return {
    title: '你的身份', big: [roleName(shown)], team: ROLES[shown].team, ability: ROLES[shown].ability,
    // 赏金猎人的邪恶镇民：角色是镇民，阵营是邪恶
    ...(seat.alignment === 'evil' && !fake ? { alignment: 'evil' as const, note: '你是邪恶阵营的！你不知道其他邪恶玩家是谁，他们也不知道你。' } : {}),
  };
}

/** 看到的不是自己真实身份的人（发身份前提醒说书人别说漏） */
export function fakeShown(s: GameState): { n: number; role: string; shown: string }[] {
  return s.seats
    .filter((x) => !x.traveller && believedRole(s, x) !== x.role)
    .map((x) => ({ n: x.n, role: roleName(x.role), shown: roleName(believedRole(s, x)) }));
}
