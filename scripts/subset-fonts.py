"""把思源宋体（Noto Serif SC）裁成只含网页里用到的字，放进 src/assets/fonts/。

用法（源字体在 https://github.com/notofonts/noto-cjk 的 Serif/SubsetOTF/SC/ 下）：
    python scripts/subset-fonts.py <NotoSerifSC-SemiBold.otf> <NotoSerifSC-Black.otf>

网页里加了新文字后重跑一次；src/fonts.test.ts 会在有字不在字体里时报错提醒。
需要：pip install fonttools brotli
"""
import sys
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'fonts'


def used_chars() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))  # ASCII 全带上，数字、字母随时会用到
    files = [ROOT / 'index.html', *ROOT.joinpath('src').rglob('*')]
    for f in files:
        if f.is_file() and f.suffix in {'.ts', '.tsx', '.css', '.html'}:
            chars.update(ch for ch in f.read_text(encoding='utf-8') if ord(ch) >= 0x80)
    return ''.join(sorted(chars))


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    text = used_chars()
    OUT.mkdir(parents=True, exist_ok=True)
    # 测试用：记下字体里有哪些非 ASCII 字
    (OUT / 'chars.txt').write_text(''.join(ch for ch in text if ord(ch) >= 0x80), encoding='utf-8')
    for src, weight in ((sys.argv[1], 600), (sys.argv[2], 900)):
        out = OUT / f'noto-serif-sc-{weight}.woff2'
        subset.main([src, f'--text={text}', '--flavor=woff2', '--no-hinting', '--desubroutinize', f'--output-file={out}'])
        print(f'{out.name}: {out.stat().st_size // 1024} KB')
    print(f'{len(text)} 个字')


if __name__ == '__main__':
    main()
