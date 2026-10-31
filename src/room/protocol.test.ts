import { describe, expect, it } from 'vitest';
import { seeded } from '../engine/rng';
import { isRoomCode, newRoomCode, roomLink, roomPath, sortMsgs } from './protocol';

describe('房间', () => {
  it('房间号是 4 个大写字母，不含 I、O', () => {
    const rng = seeded(1);
    for (let i = 0; i < 200; i++) {
      const c = newRoomCode(rng);
      expect(isRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[IO]/);
    }
    expect(isRoomCode('abcd')).toBe(false);
    expect(isRoomCode('ABC')).toBe(false);
    expect(isRoomCode(null)).toBe(false);
  });

  it('链接带房间号；数据路径按房间分开', () => {
    expect(roomLink('ABCD', { origin: 'https://jia1267.github.io', pathname: '/botc-storyteller/' })).toBe('https://jia1267.github.io/botc-storyteller/?room=ABCD');
    expect(roomPath('ABCD', 'priv', 3, 'msgs')).toBe('rooms/ABCD/priv/3/msgs');
  });

  it('消息按发出的先后一条一条给玩家看', () => {
    const m = (id: string, sentAt: number) => ({ id, sentAt, card: { big: [id] } });
    expect(sortMsgs({ b: m('b', 20), a: m('a', 10), c: m('c', 20) }).map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(sortMsgs(null)).toEqual([]);
  });
});
