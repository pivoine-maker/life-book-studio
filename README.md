# Life Book Studio

Life Book Studio 是一个“人生副本故事书”自动生成器：每天选择一个命运设定，让大模型替你完成角色、时代、关键抉择、完整一生剧本、分镜画面、可选视频和发布文档。它不是简单的故事续写，而是把“如果我出生在另一种身份、另一个时代、另一条命运线里，会怎样活完一生？”变成一本可以阅读、收藏和分享的视觉故事书。

项目核心是一个可自动运行的创作流水线：文本模型负责搭建人生分岔与完整传记，图像模型负责生成角色锚点和故事页插图，视频模型可进一步把页面串成短片，Worker 则把每天的成品导出为 Markdown / HTML / 视频并发布出去。你可以把它当成一个 AI 叙事实验室，也可以把它改造成每日内容栏目、互动故事产品或个人化的“平行人生”生成器。

## Main flow

### Worker daily publishing flow

`apps/worker/src/index.ts` runs the full autonomous chain:

1. Pick a deterministic daily seed for Asia/Shanghai date.
2. Generate the questionnaire.
3. Auto-select decisions.
4. Generate the full script.
5. Render images.
6. If `LIFE_BOOK_ENABLE_VIDEO` is not set to `false`, render per-page videos and concatenate the final video.
7. Render Markdown and HTML exports.
8. Upload Markdown/HTML/video with `lark-cli`.
9. Send a Feishu bot notification.

## Commands

```bash
pnpm install
pnpm dev:worker
pnpm -r typecheck
pnpm -r run --if-present build
pnpm --filter worker daily:run
pnpm --filter worker daily:test
pnpm --filter worker full:test
```

Use `daily:run` for the real scheduled-task equivalent. It publishes to Feishu if the required environment and `lark-cli` are configured.

## Environment

The Worker loads environment variables from:

1. `apps/web/.env.local`
2. `apps/worker/.env.local`

Important variables include:

- Text model: `AI_TEXT_API_KEY`, `AI_TEXT_BASE_URL`, `AI_TEXT_API_VERSION`, `AI_TEXT_MODEL`, `AI_TEXT_MAX_TOKENS`, `AI_TEXT_TIMEOUT_MS`.
- Image model: `AI_IMAGE_API_KEY`, `AI_IMAGE_BASE_URL`, `AI_IMAGE_MODEL`, `AI_IMAGE_SIZE`, `AI_IMAGE_CONCURRENCY`, `AI_IMAGE_TIMEOUT_MS`.
- Video model: `AI_VIDEO_API_KEY`, `AI_VIDEO_BASE_URL`, `AI_VIDEO_MODEL`, `AI_VIDEO_MODEL_ALIAS`, `AI_VIDEO_CONCURRENCY`, `AI_VIDEO_DURATION`, `AI_VIDEO_TIMEOUT_MS`, `LIFE_BOOK_ENABLE_VIDEO`.
- Feishu publish: `FEISHU_FOLDER_TOKEN`, `FEISHU_PARENT_NODE`, `FEISHU_USER_OPEN_ID`, `FEISHU_CHAT_ID`, `FEISHU_SEND_AS`.
- Storage override: `SHORT_DRAMA_DATA_DIR`.

## Data layout

By default, Life Book runs are stored under:

```text
data/life-book-runs/:runId/
├── snapshot.json
└── artifacts/
    ├── :artifactId.json
    ├── generated images
    └── generated videos
```
