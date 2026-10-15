import { useId } from 'react';

/*
 * 原创图形（不用任何官方美术）：
 * 善良 = 一圈光芒里亮着的蜡烛；邪恶 = 月蚀吞掉了灯，只剩熄灭的蜡烛和一缕烟；
 * 品牌记号 = 一圈座位，中间一支蜡烛。坐标都在 64×64 里，结果图（画布）也用这几条路径。
 */
export const EMBLEM = {
  rays: 'M32 2.5v5.5M32 56v5.5M2.5 32H8M56 32h5.5M11.1 11.1l3.9 3.9M49 49l3.9 3.9M52.9 11.1 49 15M15 49l-3.9 3.9',
  flame: 'M33.3 15c1.2 4.8 4.9 7.3 4.9 12.6 0 3.7-2.8 6.5-6.2 6.5s-6.2-2.8-6.2-6.5c0-3.4 2.5-5.6 4-8.2.4 2.1 1.3 3.2 2.5 3.7.6-2.6.8-5.3 1-8.1z',
  smoke: 'M32 34.5c-2.4-2.4 2.4-4.3 0-6.9s2.4-4.5 0-7.1',
  wick: 'M32 35.2v1.3',
  markFlame: 'M33.4 15.5c1.3 5 5.1 7.6 5.1 13.2 0 3.9-2.9 6.8-6.5 6.8s-6.5-2.9-6.5-6.8c0-3.6 2.6-5.9 4.2-8.6.4 2.2 1.4 3.4 2.6 3.9.7-2.7.9-5.6 1.1-8.5z',
};

export function Emblem({ team, size = 112 }: { team: 'good' | 'evil'; size?: number }) {
  const id = useId();
  if (team === 'good')
    return (
      <svg className="emblem" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
        <circle cx="32" cy="32" r="22.5" strokeWidth="2.4" />
        <path d={EMBLEM.rays} strokeWidth="2.4" />
        <path d={EMBLEM.flame} fill="currentColor" stroke="none" />
        <ellipse cx="32" cy="29.6" rx="2.1" ry="3.1" fill="#000" opacity=".45" stroke="none" />
        <rect x="28.6" y="36" width="6.8" height="12.5" rx="1.5" fill="currentColor" stroke="none" opacity=".72" />
      </svg>
    );
  return (
    <svg className="emblem" width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="64" height="64" fill="#fff" />
          <circle cx="39" cy="26" r="20.5" fill="#000" />
        </mask>
      </defs>
      <circle cx="32" cy="32" r="25" fill="currentColor" stroke="none" mask={`url(#${id})`} />
      <g transform="translate(6 -6)">
        <path d={EMBLEM.smoke} strokeWidth="1.9" opacity=".85" />
        <path d={EMBLEM.wick} strokeWidth="1.6" opacity=".9" />
        <rect x="28.6" y="36.5" width="6.8" height="11.5" rx="1.5" fill="currentColor" stroke="none" opacity=".72" />
      </g>
    </svg>
  );
}
