# Life Book Studio

Life Book Studio keeps one product line: generate a complete alternate-life storybook, render it with images and optional video, then publish the daily result through the Worker.

## What remains

- `apps/worker` — local daily scheduler and one-shot runner for the full auto-publish chain.
- `apps/web` — legacy Next.js UI/API workspace kept only for compatibility with shared run storage; the public product flow is the Worker daily publishing chain.
- `packages/domain` — Life Book domain types plus shared life primitives.
- `packages/storage` — filesystem store for Life Book runs and artifacts.
- `packages/model-adapters` — Life Book text, life image, and video adapters.
- `packages/pipeline` — Life Book generation, rendering, exports, and daily seed orchestration.
- `packages/media` — ffmpeg helpers for concatenating generated page videos.

Short-drama project workspace and interactive Life Game source routes/components have been removed from the active source tree. Existing `.env`, `data`, logs, `.next`, and `dist` outputs are intentionally left untouched.

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
