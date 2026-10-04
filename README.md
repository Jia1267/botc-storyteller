# 钟楼说书人

血染钟楼（暗流涌动）说书人助手。只给说书人用：输入人数 → 一键配板 → 网页一步一屏带你发身份、跑夜晚、管白天，直到宣布胜负和复盘。

**网址：https://jia1267.github.io/botc-storyteller/**（手机/平板浏览器打开即可）

需求清单见 [需求清单.md](需求清单.md)。

## 开发

```bash
npm install
npm run dev     # 本地预览
npm test        # 规则引擎测试
npm run build   # 打包到 dist/
```

推送到 `main` 后，GitHub Actions 会自动测试、打包并发布到 GitHub Pages。

## 结构

- `src/engine/` 规则引擎（纯函数，和界面无关）：角色、配板、夜晚顺序、信息计算、平衡推荐、胜负判定
- `src/ui/` 界面
- `src/store.ts` 存档与撤销（浏览器本地存储）

角色能力说明是自己写的，没有照搬官方文字；没有使用官方美术。
