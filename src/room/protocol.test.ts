import { describe, expect, it } from 'vitest';
import { seeded } from '../engine/rng';
import {
  gotKey, hashUnit, idleMsgId, isNightMsg, isRoomCode, metaSeats, msgStatus, newRoomCode, nightMsgId, pickKey, pickOf, roomLink, roomPath, sameBody, seatLabel, sortMsgs, tallyMvp,
} from './protocol';

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

  it('夜里的消息 id：同一晚同一步同一人同一条是固定的；能认出是哪一晚的', () => {
    expect(nightMsgId(2, 5, 3, 'pick')).toBe('N2-5-3-pick');
    expect(idleMsgId(2, 101)).toBe('N2-idle-101');
    expect(isNightMsg('N2-5-3-pick', 2)).toBe(true);
    expect(isNightMsg('N12-5-3-pick', 1)).toBe(false);
    expect(isNightMsg('-Nabc', 1)).toBe(false);
  });

  it('他在手机上选的人：存的是数组，没选是 undefined', () => {
    expect(pickOf({ 3: { [pickKey('a')]: [5, 7] } }, 3, 'a')).toEqual([5, 7]);
    expect(pickOf({ 3: { a: 1 } }, 3, 'a')).toBeUndefined();
    expect(pickOf({}, 3, 'a')).toBeUndefined();
  });

  it('消息内容比较：数据库去掉的空字段、键的顺序不算改动', () => {
    const sent = { card: { title: 'x', big: ['3 号'], lines: ['a'] }, ask: { count: 1, seats: [1, 2, 3], disabled: [] } };
    const back = { ask: { seats: [1, 2, 3], count: 1 }, card: { lines: ['a'], big: ['3 号'], title: 'x', note: undefined } };
    expect(sameBody(back, sent)).toBe(true);
    expect(sameBody(back, { ...sent, card: { ...sent.card, big: ['4 号'] } })).toBe(false);
    expect(sameBody(undefined, sent)).toBe(false);
  });

  it('MVP：每人一票，投自己、投不在这局的座位不算；只数票数', () => {
    const acks = { 1: { mvp: 3 }, 2: { mvp: 3 }, 3: { mvp: 3 }, 4: { mvp: 9 }, 5: { mvp: 1, m1: 5 }, 6: { m1: 2 } };
    expect(tallyMvp(acks, [1, 2, 3, 4, 5, 6])).toEqual({ mvp: { 3: 2, 1: 1 }, voters: 3 });
    expect(tallyMvp({}, [1, 2])).toEqual({ mvp: {}, voters: 0 });
  });

  it('随机分到哪一步：同样的输入结果一样，落在 0..1', () => {
    expect(hashUnit('ABCD|1|3|x')).toBe(hashUnit('ABCD|1|3|x'));
    const xs = Array.from({ length: 200 }, (_, i) => hashUnit(`ABCD|1|${i}|x`));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    // 不会全挤在一头
    expect(xs.filter((x) => x < 0.5).length).toBeGreaterThan(60);
    expect(xs.filter((x) => x >= 0.5).length).toBeGreaterThan(60);
  });
});
