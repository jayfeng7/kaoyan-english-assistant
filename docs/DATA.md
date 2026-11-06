# 本地题库与内容版权

## 1. 为什么默认不带题库

`data/exams/`、`data/essay-bank/` 和 `public/essay-materials/` 中的历年真题、题目描述、参考答案、解析和配图，可能受第三方版权保护。项目代码的 MIT 许可证不能覆盖这些内容，因此：

- 开源发行包默认不包含题库和配图；
- 应用在空题库下仍可运行，题库选择器会提示暂无内容；
- 部署者只能在确认来源和授权后，自行导入本地数据；
- 本文档不提供下载真题的脚本，也不构成任何转载授权。

## 2. 目录约定

```text
data/
├── exams/
│   ├── english1/
│   │   └── 2025.json        # ExamBankItem[]
│   └── english2/
│       └── 2025.json
└── essay-bank/
    ├── english1/
    │   └── 2025.json        # EssayBankItem[]
    └── english2/
        └── 2025.json

public/
└── essay-materials/
    └── english1-2025-big.jpg
```

- 文件名必须是四位年份 `.json`。
- `english1` 目录中的 `type` 必须是 `english1`，`english2` 同理。
- 每个文件是一个数组，不允许重复 ID。
- 作文题目若包含配图，`materialImage` 使用 `/essay-materials/...` 公共路径，并把图片放入 `public/essay-materials/`。

完整字段定义以 `types/index.ts`、`lib/schemas/exam.ts`、`lib/schemas/essay-bank.ts` 为准。下面的示例仅用于说明结构，不是真题。

### 阅读题示例

```json
[
  {
    "id": "english1-2025-text1",
    "type": "english1",
    "year": 2025,
    "section": "Text 1",
    "title": "Synthetic practice passage",
    "passage": "This is an original synthetic passage for local schema testing only.",
    "questions": [
      {
        "id": "english1-2025-text1-q1",
        "question": "What is the main idea of the passage?",
        "options": ["A. Option one", "B. Option two", "C. Option three", "D. Option four"],
        "answer": "A",
        "analysis": "Synthetic explanation."
      }
    ]
  }
]
```

### 作文题示例

```json
[
  {
    "id": "english1-2025-big",
    "type": "english1",
    "composition": "big",
    "year": 2025,
    "title": "Synthetic writing task",
    "directions": "Write an essay of 160-200 words based on the synthetic prompt. (20 points)",
    "materialImage": "/essay-materials/synthetic-2025-big.jpg",
    "materialDescription": "A synthetic chart showing a gradual increase from 2020 to 2025.",
    "reviewed": true
  }
]
```

`reviewed` 为 `false` 的作文题不会出现在用户列表，可用于保留草稿。

## 3. 检查数据

```bash
pnpm data:check
```

该脚本做结构层面的基础检查：JSON 可解析、必填字段、ID 唯一、年份/目录匹配、选项与答案格式、作文配图是否存在。它不是内容校对，也不能验证版权。

运行时仍会由 Zod Schema 做权威校验。数据错误时接口会返回通用内部错误，不向客户端泄露文件内容。

## 4. 加入版本控制的风险

当前 `.gitignore` 已默认忽略题库 JSON 和作文配图，避免误提交。但**忽略规则不会移除 Git 历史中已经存在的文件**。

公开发布时：

1. 不要直接公开包含题库历史的旧仓库；
2. 使用 `pnpm release:source` 生成干净目录；
3. 在全新目录执行 `git init`；
4. 检查 `git status` 和发行清单，再推送。

## 5. 来源与准确性

若维护者在本地整理了数据：

- 保留来源、抓取时间、校对状态和文件哈希；
- 不把“网页可访问”误认为“获得转载授权”；
- 把 AI 校对、结构校验、教师盲评区分开；
- 不把来源不明的解析当作官方答案；
- 收到权利人异议时，应立即停止公开分发并删除相关内容。

## 6. 公开发行时的推荐做法

- 只发布代码、合成演示文本和原创示例数据；
- 真实题库通过部署者自己的本地导入使用；
- 不提供真实题目截图作为 README 演示；
- 不在 Issue/PR 中附真题原文或学生材料；
- 在 README 与 `NOTICE.md` 中明确代码许可和内容许可的边界。
