import { describe, expect, it } from 'vitest';
import { SCRIPT_LIST } from './editions';
import { FIRST_ORDER, OTHER_ORDER, nightsFor } from './nightOrder';

describe('角色对象：按角色表自动排出整晚流程', () => {
  // 原来六个剧本的夜晚顺序是手写的：自动排出来的步骤必须一个不多、一个不少
  for (const sc of SCRIPT_LIST.filter((x) => x.id !== 'sv')) {
    it(`${sc.name}：自动排出的步骤和手写的一样全`, () => {
      const auto = nightsFor(sc.roles, sc.fabled);
      expect([...auto.firstNight].sort()).toEqual([...sc.firstNight].sort());
      expect([...auto.otherNights].sort()).toEqual([...sc.otherNights].sort());
    });
  }

  it('梦殒春宵按官方顺序：哲学家最早，数学家最后', () => {
    const sv = SCRIPT_LIST.find((x) => x.id === 'sv')!;
    expect(sv.firstNight).toEqual([
      'dusk', 'apprentice', 'barista', 'bureaucrat', 'thief', 'philosopher', 'minionInfo', 'demonInfo', 'snakecharmer', 'eviltwin', 'witch', 'cerenovus',
      'clockmaker', 'dreamer', 'seamstress', 'mathematician', 'dawn',
    ]);
    expect(sv.otherNights).toEqual([
      'dusk', 'cacklejack', 'barista', 'bureaucrat', 'thief', 'harlot', 'bonecollector', 'apprentice', 'philosopher', 'snakecharmer', 'witch',
      'cerenovus', 'pithag', 'fanggu', 'nodashii', 'vortox',
      'vigormortis', 'barber', 'sweetheart', 'sage', 'dreamer', 'flowergirl', 'towncrier', 'oracle', 'seamstress', 'juggler',
      'mathematician', 'dawn',
    ]);
  });

  it('全局顺序里每个步骤只出现一次', () => {
    expect(new Set(FIRST_ORDER).size).toBe(FIRST_ORDER.length);
    expect(new Set(OTHER_ORDER).size).toBe(OTHER_ORDER.length);
  });
});
