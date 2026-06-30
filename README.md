# Life Book Studio

Life Book Studio keeps one product line: generate a complete alternate-life storybook, render it with images and optional video, then publish the daily result through the Worker.

## What remains

- `apps/web` — Next.js UI for `/book-life` and Life Book API routes.
- `apps/worker` — local daily scheduler and one-shot runner for the full auto-publish chain.
- `packages/domain` — Life Book domain types plus shared life primitives.
- `packages/storage` — filesystem store for Life Book runs and artifacts.
- `packages/model-adapters` — Life Book text, life image, and video adapters.
- `packages/pipeline` — Life Book generation, rendering, exports, and daily seed orchestration.
- `packages/media` — ffmpeg helpers for concatenating generated page videos.

Short-drama project workspace and interactive Life Game source routes/components have been removed from the active source tree. Existing `.env`, `data`, logs, `.next`, and `dist` outputs are intentionally left untouched.

## Main flows

### Web Life Book flow

1. Open `/book-life`.
2. Create a Life Book run from an optional seed.
3. The text model generates persona, initial state, and a life-decision questionnaire.
4. The user selects one option per question.
5. The text model writes the full script and visual page beats.
6. Rendering creates a protagonist anchor image and then all page images.
7. The UI polls the run snapshot and can download the run JSON.

### Worker daily publishing flow

`apps/worker/src/index.ts` runs the full autonomous chain:

1. Pick a deterministic daily seed for Asia/Shanghai date.
2. Generate the questionnaire.
3. Auto-select decisions.
4. Generate the full script.
5. Render images.
6. Unless `LIFE_BOOK_SKIP_VIDEO=true`, render per-page videos and concatenate the final video.
7. Render Markdown and HTML exports.
8. Upload Markdown/HTML/video with `lark-cli`.
9. Send a Feishu bot notification.

## Commands

```bash
pnpm install
pnpm dev:web
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

- Text model: `LIFE_TEXT_API_KEY`, `LIFE_MODEL_API_KEY`, `MODELHUB_API_KEY`, `TEXT_API_KEY`, `LIFE_TEXT_BASE_URL`, `LIFE_TEXT_MODEL`.
- Image model: `LIFE_IMAGE_API_KEY`, `LIFE_IMAGE_BASE_URL`, `LIFE_IMAGE_MODEL`, `LIFE_IMAGE_CONCURRENCY`.
- Video model: `LIFE_VIDEO_API_KEY`, `VIDEO_API_KEY`, `ARK_API_KEY`, `LIFE_VIDEO_MODEL`, `LIFE_VIDEO_CONCURRENCY`, `LIFE_BOOK_SKIP_VIDEO`.
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
