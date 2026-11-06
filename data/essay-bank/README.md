# 作文题库（可选）

按考试类型和年份放置 JSON：

```text
english1/2025.json
english2/2025.json
```

每个文件是 `EssayBankItem[]`，只有 `reviewed: true` 的题目会展示。配图放在 `public/essay-materials/`，`materialImage` 使用对应公共路径。

公开源代码发行包不包含真实作文题或配图。字段、导入和版权说明见 [`../../docs/DATA.md`](../../docs/DATA.md)。
