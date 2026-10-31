import { describe, expect, it } from 'vitest';
import { seeded } from '../engine/rng';
import { gotKey, isRoomCode, metaSeats, msgStatus, newRoomCode, roomLink, roomPath, seatLabel, sortMsgs } from './protocol';

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

  it('座位：没写座位表就是 1..人数；旅行者叫"旅1"', () => {
    expect(metaSeats({ count: 3, title: '', phase: 'lobby', createdAt: 0 })).toEqual([1, 2, 3]);
    expect(metaSeats({ count: 3, seatNs: [1, 2, 101], title: '', phase: 'lobby', createdAt: 0 })).toEqual([1, 2, 101]);
    expect(seatLabel(3)).toBe('3 号');
    expect(seatLabel(101)).toBe('旅1');
  });

  it('身份卡状态：没发 → 发出 → 送达 → 已看', () => {
    expect(msgStatus({}, 3, undefined)).toBe('none');
    expect(msgStatus({}, 3, 'm1')).toBe('sent');
    expect(msgStatus({ 3: { [gotKey('m1')]: 1 } }, 3, 'm1')).toBe('got');
    expect(msgStatus({ 3: { [gotKey('m1')]: 1, m1: 2 } }, 3, 'm1')).toBe('read');
    expect(msgStatus({ 4: { m1: 2 } }, 3, 'm1')).toBe('sent');
  });
});
