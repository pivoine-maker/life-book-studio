import type { CompleteLifeBook, LifeAnchorImage, LifeAnchorPack, LifeBookPage, LifeBookRunSnapshot, LifeSelectedDecision } from "@short-drama/domain";
import { createId, nowIso } from "@short-drama/domain";
import { concatenateVideos } from "@short-drama/media";
import { lifeBookTextModel, lifeImageModel, lifeVideoModel } from "@short-drama/model-adapters";
import { getLifeBookRunStore } from "@short-drama/storage";
import { pickDailyLifeCandidate } from "./daily-life-seeds";
import { renderLifeBookHtml } from "./life-book-html";

const CINEMATIC_STYLE_BIBLE = [
  "真人电影剧照风格，live-action cinematic still, photorealistic human faces, not illustration, not anime, not 2D cartoon, not 3D render",
  "同一部电影的统一摄影语言：35mm film still, anamorphic lens, shallow depth of field, natural skin texture, realistic fabric, cinematic lighting, film grain, teal-orange restrained color grading",
  "画幅和质感一致：epic biographical drama, premium streaming series, realistic production design, no text, no watermark",
].join("; ");
const ANCHOR_NEGATIVE = "anime, manga, cartoon, 2d illustration, 3d render, cgi, pixar, game art, plastic skin, doll face, text, watermark, logo, distorted face, extra fingers, modern objects, low quality, inconsistent style";

function logPipeline(message: string): void {
  console.log(`[life-book-pipeline] ${new Date().toISOString()} ${message}`);
}

function imageUrl(runId: string, artifactId: string): string {
  return `/api/life-book-runs/${runId}/artifacts/${artifactId}`;
}

function artifactUrl(runId: string, artifactId: string): string {
  return `/api/life-book-runs/${runId}/artifacts/${artifactId}`;
}

function anchorPrompt(snapshot: LifeBookRunSnapshot): LifeAnchorImage {
  const persona = snapshot.persona;
  const visualBible = [CINEMATIC_STYLE_BIBLE, persona.visualStyle, persona.visualAnchor, persona.era, persona.identity, persona.socialClass].join("; ");
  return {
    anchorId: createId("book_anchor"),
    label: "综合角色锚点",
    description: "真人电影感角色锚点：少年、青年、中年、晚年四个年龄段，同一演员脸型和气质。",
    prompt: `${visualBible}. Create one photorealistic live-action cinematic character reference sheet for the same protagonist at four life ages: youth, young adult, middle age, old age. Same actor identity across all ages, consistent facial structure, eyes, nose, jawline, body type, hair logic, signature accessory and costume logic. Real human skin texture, realistic wardrobe, neutral studio background, cinematic lighting, 35mm film still quality. No text, no labels, no watermark, not illustration, not anime, not 3D render.`,
    negativePrompt: ANCHOR_NEGATIVE,
    status: "pending",
  };
}

async function generateAnchorPack(snapshot: LifeBookRunSnapshot): Promise<LifeBookRunSnapshot> {
  if (snapshot.anchorPack?.anchors.some((anchor) => anchor.status === "generated" && anchor.artifactId)) return snapshot;
  logPipeline(`anchor_start runId=${snapshot.runId}`);
  const store = getLifeBookRunStore();
  const createdAt = nowIso();
  const anchor = anchorPrompt(snapshot);
  const result = await lifeImageModel.generateLifeAnchorImage({
    label: anchor.label,
    description: anchor.description,
    prompt: anchor.prompt,
    negativePrompt: anchor.negativePrompt,
    pageIndex: 1,
  });
  const artifact = await store.writeArtifact({ runId: snapshot.runId, fileStem: "anchor-main", ext: result.ext, contentType: result.contentType, bytes: result.bytes });
  const generatedAnchor: LifeAnchorImage = {
    ...anchor,
    artifactId: artifact.artifactId,
    imageUrl: imageUrl(snapshot.runId, artifact.artifactId),
    status: result.isPlaceholder ? "failed" : "generated",
    error: result.error,
  };
  const anchorPack: LifeAnchorPack = {
    packId: createId("book_anchor_pack"),
    status: generatedAnchor.status === "generated" ? "generated" : "failed",
    characterName: snapshot.persona.title,
    visualBible: [CINEMATIC_STYLE_BIBLE, snapshot.persona.visualStyle, snapshot.persona.visualAnchor, snapshot.persona.era, "所有故事页必须像同一部真人电影里的连续剧照，保持同一摄影风格、同一色彩分级、同一镜头语言、同一主角脸型发型身形配饰和时代服饰逻辑。严禁在不同页面间切换成动漫、插画、3D、游戏CG或不同画风。"].join("; "),
    anchors: [generatedAnchor],
    createdAt,
    updatedAt: nowIso(),
    error: generatedAnchor.error,
  };
  logPipeline(`anchor_done runId=${snapshot.runId} status=${anchorPack.status}`);
  return store.saveRun({ ...snapshot, anchorPack, updatedAt: nowIso() });
}

function pageTitleWithChapter(chapterTitle: string, pageTitle: string): string {
  const parts = pageTitle.split("｜").filter(Boolean);
  if (parts[0] === chapterTitle) return pageTitle;
  if (pageTitle === chapterTitle) return chapterTitle;
  return `${chapterTitle}｜${pageTitle}`;
}

function allScriptPages(snapshot: LifeBookRunSnapshot): LifeBookPage[] {
  return snapshot.script?.chapters.flatMap((chapter) => chapter.pages.map((page) => ({ ...page, title: pageTitleWithChapter(chapter.title, page.title) }))) ?? [];
}

async function renderPage(snapshot: LifeBookRunSnapshot, page: LifeBookPage, index: number): Promise<LifeBookPage> {
  if (page.imageArtifactId && !page.isPlaceholder) return page;
  logPipeline(`image_start runId=${snapshot.runId} page=${index + 1} title="${page.title}"`);
  const store = getLifeBookRunStore();
  const referenceImages = [];
  for (const anchor of snapshot.anchorPack?.anchors.filter((item) => item.artifactId) ?? []) {
    const bytes = await store.readArtifactBytes(snapshot.runId, anchor.artifactId!);
    const artifact = await store.readArtifact(snapshot.runId, anchor.artifactId!);
    if (bytes && artifact) {
      referenceImages.push({ artifactId: anchor.artifactId!, imageUrl: anchor.imageUrl, label: anchor.label, bytes, contentType: artifact.contentType });
    }
  }
  const started = Date.now();
  const unifiedPrompt = [
    `PAGE STORY BEAT: ${page.sceneText}`,
    `PAGE CAPTION: ${page.caption}`,
    `PAGE-SPECIFIC VISUAL PROMPT: ${page.imagePrompt}`,
    "The image must clearly depict this exact story beat. Prioritize concrete plot action, location, character interaction, props, facial expressions, body language, and consequence. Do not make a generic portrait or generic atmosphere shot.",
    "Vary composition according to the story: wide establishing shot, tense two-shot, crowded confrontation, intimate close-up, symbolic object insert, or aftermath scene as appropriate.",
    CINEMATIC_STYLE_BIBLE,
    "This image must look like a live-action film still from the same movie as every other page. Keep one consistent cinematic visual grammar across the whole book.",
    "Use the anchor reference only as actor identity reference. Match protagonist face, age progression, hair logic, body type, costume logic, signature accessory, but do not copy the anchor pose or composition.",
  ].filter(Boolean).join("\n");
  const result = await lifeImageModel.generateLifeBookPage({
    title: page.title,
    caption: page.caption,
    prompt: unifiedPrompt,
    negativePrompt: page.negativePrompt,
    pageIndex: index + 1,
    visualBible: snapshot.anchorPack?.visualBible,
    referenceImages,
  });
  const artifact = await store.writeArtifact({ runId: snapshot.runId, fileStem: `book-page-${index + 1}`, ext: result.ext, contentType: result.contentType, bytes: result.bytes });
  logPipeline(`image_done runId=${snapshot.runId} page=${index + 1} placeholder=${Boolean(result.isPlaceholder)} elapsedSec=${Math.round((Date.now() - started) / 1000)}`);
  return {
    ...page,
    imageArtifactId: artifact.artifactId,
    imageUrl: imageUrl(snapshot.runId, artifact.artifactId),
    generationStatus: result.isPlaceholder ? "failed" : "generated",
    generationAttempts: 1,
    generationError: result.error ? `${result.error} (${Math.round((Date.now() - started) / 1000)}s)` : undefined,
    imageKind: result.isPlaceholder ? "placeholder" : "storybook",
    isPlaceholder: Boolean(result.isPlaceholder),
    referenceAnchorIds: snapshot.anchorPack?.anchors.map((a) => a.anchorId),
  };
}

async function runLimited<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function imageConcurrency(): number {
  const value = Number.parseInt(process.env.AI_IMAGE_CONCURRENCY || "2", 10);
  return Number.isFinite(value) && value > 0 ? value : 2;
}

function videoConcurrency(): number {
  const value = Number.parseInt(process.env.AI_VIDEO_CONCURRENCY || "1", 10);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function sceneField(scene: string, label: string): string {
  const match = scene.match(new RegExp(`${label}：([^。]+)`));
  return match?.[1]?.trim() || "";
}

function cleanNarration(value: string): string {
  return value
    .replace(/地点：|时间：|人物：|动作：|冲突：|关键道具：|情绪张力：|剧情后果：/g, "")
    .replace(/命运.*?(转向|开始|改变|改写)。?/g, "")
    .replace(/从此.*?。?/g, "")
    .replace(/\s+/g, " ")
    .replace(/[；;，,、]+$/g, "")
    .trim();
}

function shortSentence(value: string, maxLength = 34): string {
  const cleaned = cleanNarration(value).replace(/[。！？].*$/g, "");
  if (cleaned.length <= maxLength) return `${cleaned}。`;
  return `${cleaned.slice(0, maxLength).replace(/[；;，,、]+$/g, "")}。`;
}

function voiceoverText(page: LifeBookPage): string {
  const scene = (page.sceneText || page.caption || page.title).replace(/\s+/g, " ").trim();
  const action = cleanNarration(sceneField(scene, "动作"));
  const conflict = cleanNarration(sceneField(scene, "冲突"));
  const caption = cleanNarration(page.caption || "");
  const fallback = cleanNarration(scene || page.title);
  const mainEvent = action || caption || fallback;
  const detail = conflict && !mainEvent.includes(conflict) ? conflict : "";
  return shortSentence([mainEvent, detail].filter(Boolean).join("，"));
}

async function renderVideoPage(snapshot: LifeBookRunSnapshot, page: LifeBookPage, index: number): Promise<LifeBookPage> {
  if (page.videoArtifactId && page.videoStatus === "generated") return { ...page, videoError: undefined };
  if (!page.imageArtifactId || page.isPlaceholder || page.generationStatus === "failed") {
    const reason = page.isPlaceholder ? "Story image is placeholder" : "Generated story image is required before video generation";
    logPipeline(`video_skipped runId=${snapshot.runId} page=${index + 1} reason="${reason}"`);
    return { ...page, videoStatus: "skipped", videoError: reason };
  }
  const started = Date.now();
  logPipeline(`video_start runId=${snapshot.runId} page=${index + 1} title="${page.title}"`);
  const store = getLifeBookRunStore();
  const imageBytes = await store.readArtifactBytes(snapshot.runId, page.imageArtifactId);
  const imageArtifact = await store.readArtifact(snapshot.runId, page.imageArtifactId);
  if (!imageBytes || !imageArtifact) return { ...page, videoStatus: "failed", videoError: "Story image artifact was not found" };
  const narration = page.voiceoverText || voiceoverText(page);
  try {
    const result = await lifeVideoModel.generateLifeBookPageVideo({
      title: page.title,
      sceneText: page.sceneText,
      caption: page.caption,
      imagePrompt: page.imagePrompt,
      voiceoverText: narration,
      firstFrame: { bytes: imageBytes, contentType: imageArtifact.contentType },
      pageIndex: index + 1,
      visualBible: snapshot.anchorPack?.visualBible,
    });
    const artifact = await store.writeArtifact({ runId: snapshot.runId, fileStem: `book-video-page-${index + 1}`, ext: result.ext, contentType: result.contentType, bytes: result.bytes });
    logPipeline(`video_done runId=${snapshot.runId} page=${index + 1} taskId=${result.taskId || ""} elapsedSec=${Math.round((Date.now() - started) / 1000)}`);
    return {
      ...page,
      videoArtifactId: artifact.artifactId,
      videoUrl: artifactUrl(snapshot.runId, artifact.artifactId),
      videoStatus: "generated",
      videoError: undefined,
      videoTaskId: result.taskId,
      videoRemoteUrl: result.remoteUrl,
      voiceoverText: narration,
    };
  } catch (error) {
    logPipeline(`video_failed runId=${snapshot.runId} page=${index + 1} elapsedSec=${Math.round((Date.now() - started) / 1000)} error=${error instanceof Error ? error.message : String(error)}`);
    return { ...page, videoStatus: "failed", videoError: error instanceof Error ? error.message : String(error), voiceoverText: narration };
  }
}

function rebuildScriptWithRenderedPages(snapshot: LifeBookRunSnapshot, renderedPages: LifeBookPage[]): LifeBookRunSnapshot {
  if (!snapshot.script) return snapshot;
  let cursor = 0;
  const chapters = snapshot.script.chapters.map((chapter) => {
    const pages = renderedPages.slice(cursor, cursor + chapter.pages.length).map((page, index) => ({ ...page, pageIndex: index + 1 }));
    cursor += chapter.pages.length;
    return { ...chapter, pages };
  });
  const book: CompleteLifeBook = {
    title: snapshot.script.title,
    pages: renderedPages,
    updatedAt: nowIso(),
  };
  return { ...snapshot, script: { ...snapshot.script, chapters }, book };
}

export async function renderLifeBookVideos(runId: string): Promise<LifeBookRunSnapshot> {
  const store = getLifeBookRunStore();
  let snapshot = await store.readRun(runId);
  if (!snapshot) throw new Error("Life book run not found");
  if (!snapshot.script) throw new Error("Complete script is required before video generation");
  if (snapshot.videoJob?.status === "generating") {
    logPipeline(`videos_resume runId=${runId} previousGenerated=${snapshot.videoJob.generatedClips}/${snapshot.videoJob.totalClips}`);
  }
  const pages = allScriptPages(snapshot);
  logPipeline(`videos_start runId=${runId} clips=${pages.length}`);
  const startedAt = nowIso();
  snapshot = await store.saveRun({
    ...snapshot,
    videoJob: {
      status: "generating",
      totalClips: pages.length,
      generatedClips: pages.filter((p) => p.videoStatus === "generated" && p.videoArtifactId).length,
      skippedClips: pages.filter((p) => p.videoStatus === "skipped").length,
      failedClips: pages.filter((p) => p.videoStatus === "failed").length,
      startedAt,
      updatedAt: startedAt,
    },
    updatedAt: startedAt,
  });
  try {
    const rendered: LifeBookPage[] = [...pages];
    await runLimited(pages, videoConcurrency(), async (page, index) => {
      const output = await renderVideoPage(snapshot!, page, index);
      rendered[index] = output;
      const latest = (await store.readRun(runId)) ?? snapshot!;
      const partial = rebuildScriptWithRenderedPages(latest, rendered);
      snapshot = await store.saveRun({
        ...partial,
        videoJob: {
          status: "generating",
          totalClips: pages.length,
          generatedClips: rendered.filter((p) => p.videoStatus === "generated" && p.videoArtifactId).length,
          skippedClips: rendered.filter((p) => p.videoStatus === "skipped").length,
          failedClips: rendered.filter((p) => p.videoStatus === "failed").length,
          startedAt,
          updatedAt: nowIso(),
        },
        updatedAt: nowIso(),
      });
      return output;
    });
    const failed = rendered.filter((page) => page.videoStatus === "failed");
    const skipped = rendered.filter((page) => page.videoStatus === "skipped");
    const successful = rendered.filter((page) => page.videoStatus === "generated" && page.videoArtifactId);
    if (!successful.length) throw new Error(`No generated video clips to concatenate. failed=${failed.length} skipped=${skipped.length}`);
    logPipeline(`videos_concat_start runId=${runId} clips=${successful.length} skipped=${skipped.length} failed=${failed.length}`);
    const videoPaths = [];
    for (const page of successful) {
      const artifact = page.videoArtifactId ? await store.readArtifact(runId, page.videoArtifactId) : null;
      if (artifact) videoPaths.push(artifact.localPath);
    }
    const finalVideo = await concatenateVideos({ videoPaths });
    const finalArtifact = await store.writeArtifact({ runId, fileStem: "life-book-full-video", ext: finalVideo.ext, contentType: finalVideo.contentType, bytes: finalVideo.bytes });
    const latest = (await store.readRun(runId)) ?? snapshot!;
    const finalSnapshot = rebuildScriptWithRenderedPages(latest, rendered);
    logPipeline(`videos_done runId=${runId} finalArtifact=${finalArtifact.artifactId}`);
    return store.saveRun({
      ...finalSnapshot,
      videoJob: {
        status: "completed",
        totalClips: pages.length,
        generatedClips: successful.length,
        skippedClips: skipped.length,
        failedClips: failed.length,
        startedAt,
        updatedAt: nowIso(),
        finalVideoArtifactId: finalArtifact.artifactId,
        finalVideoUrl: artifactUrl(runId, finalArtifact.artifactId),
        error: failed.length ? `${failed.length} video clips failed and were omitted: ${failed.map((page) => page.videoError).filter(Boolean).slice(0, 3).join("; ")}` : undefined,
      },
      updatedAt: nowIso(),
    });
  } catch (error) {
    logPipeline(`videos_failed runId=${runId} error=${error instanceof Error ? error.message : String(error)}`);
    return store.saveRun({
      ...snapshot,
      videoJob: {
        status: "failed",
        totalClips: pages.length,
        generatedClips: snapshot.videoJob?.generatedClips ?? 0,
        skippedClips: snapshot.videoJob?.skippedClips ?? 0,
        failedClips: snapshot.videoJob?.failedClips ?? 0,
        startedAt,
        updatedAt: nowIso(),
        error: error instanceof Error ? error.message : String(error),
      },
      updatedAt: nowIso(),
    });
  }
}

export async function createLifeBookRun(seedText?: string): Promise<LifeBookRunSnapshot> {
  const store = getLifeBookRunStore();
  const runId = store.createRunId();
  logPipeline(`create_run start runId=${runId}`);
  const result = await lifeBookTextModel.generateSeed(seedText);
  const now = nowIso();
  logPipeline(`create_run done runId=${runId} title="${result.output.persona.title}" questions=${result.output.questionnaire.length}`);
  return store.saveRun({
    runId,
    status: "questionnaire_ready",
    persona: result.output.persona,
    initialState: result.output.initialState,
    questionnaire: result.output.questionnaire,
    selectedDecisions: [],
    renderJob: { status: "idle", totalPages: 0, generatedPages: 0, updatedAt: now },
    createdAt: now,
    updatedAt: now,
  });
}

export async function submitLifeBookDecisions(runId: string, selectedDecisions: LifeSelectedDecision[]): Promise<LifeBookRunSnapshot> {
  const store = getLifeBookRunStore();
  const snapshot = await store.readRun(runId);
  if (!snapshot) throw new Error("Life book run not found");
  logPipeline(`submit_decisions start runId=${runId} selected=${selectedDecisions.length}`);
  const writing = await store.saveRun({ ...snapshot, status: "writing", selectedDecisions, updatedAt: nowIso() });
  const result = await lifeBookTextModel.generateScript({ persona: writing.persona, initialState: writing.initialState, questionnaire: writing.questionnaire, selectedDecisions });
  const totalPages = result.output.chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0);
  logPipeline(`submit_decisions done runId=${runId} chapters=${result.output.chapters.length} pages=${totalPages} chars=${result.output.fullText.length}`);
  return store.saveRun({ ...writing, status: "script_ready", script: result.output, renderJob: { status: "idle", totalPages, generatedPages: 0, updatedAt: nowIso() }, updatedAt: nowIso() });
}

export async function renderLifeBook(runId: string): Promise<LifeBookRunSnapshot> {
  const store = getLifeBookRunStore();
  let snapshot = await store.readRun(runId);
  if (!snapshot) throw new Error("Life book run not found");
  if (!snapshot.script) throw new Error("Complete script is required before rendering");
  if (snapshot.renderJob?.status === "rendering") return snapshot;
  const startedAt = nowIso();
  logPipeline(`render_start runId=${runId} pages=${allScriptPages(snapshot).length}`);
  snapshot = await store.saveRun({ ...snapshot, status: "rendering", renderJob: { status: "rendering", totalPages: allScriptPages(snapshot).length, generatedPages: 0, startedAt, updatedAt: startedAt }, updatedAt: startedAt });
  try {
    snapshot = await generateAnchorPack(snapshot);
    const pages = allScriptPages(snapshot);
    const rendered: LifeBookPage[] = [...pages];
    let finished = 0;
    await runLimited(pages, imageConcurrency(), async (page, index) => {
      const output = await renderPage(snapshot!, page, index);
      rendered[index] = output;
      finished += 1;
      const latest = (await store.readRun(runId)) ?? snapshot!;
      const partial = rebuildScriptWithRenderedPages(latest, rendered);
      snapshot = await store.saveRun({
        ...partial,
        status: "rendering",
        renderJob: { status: "rendering", totalPages: pages.length, generatedPages: rendered.filter((p) => p.imageArtifactId && !p.isPlaceholder).length, startedAt, updatedAt: nowIso() },
        updatedAt: nowIso(),
      });
      return output;
    });
    logPipeline(`render_done runId=${runId} generated=${rendered.filter((p) => p.imageArtifactId && !p.isPlaceholder).length}/${pages.length}`);
    return store.saveRun({ ...snapshot, status: "completed", renderJob: { status: "completed", totalPages: pages.length, generatedPages: rendered.filter((p) => p.imageArtifactId && !p.isPlaceholder).length, startedAt, updatedAt: nowIso() }, updatedAt: nowIso() });
  } catch (error) {
    logPipeline(`render_failed runId=${runId} error=${error instanceof Error ? error.message : String(error)}`);
    return store.saveRun({ ...snapshot, status: "failed", renderJob: { status: "failed", totalPages: allScriptPages(snapshot).length, generatedPages: snapshot.renderJob?.generatedPages ?? 0, startedAt, updatedAt: nowIso(), error: error instanceof Error ? error.message : String(error) }, updatedAt: nowIso() });
  }
}

export async function createAutonomousDailyLifeBook(input?: { dateKey?: string; seedText?: string; maxQuestions?: number }): Promise<LifeBookRunSnapshot> {
  const seedText = input?.seedText || pickDailyLifeCandidate({ dateKey: input?.dateKey });
  let created = await createLifeBookRun(seedText);
  if (input?.maxQuestions && input.maxQuestions > 0) {
    const store = getLifeBookRunStore();
    created = await store.saveRun({ ...created, questionnaire: created.questionnaire.slice(0, input.maxQuestions), updatedAt: nowIso() });
  }
  const selectedDecisions = (await lifeBookTextModel.generateAutonomousDecisions({ persona: created.persona, questionnaire: created.questionnaire })).output;
  const scripted = await submitLifeBookDecisions(created.runId, selectedDecisions);
  const rendered = await renderLifeBook(scripted.runId);
  if ((process.env.LIFE_BOOK_ENABLE_VIDEO || "").toLowerCase() === "false") return rendered;
  return renderLifeBookVideos(rendered.runId);
}

export async function renderLifeBookHtmlForRun(runId: string): Promise<{ snapshot: LifeBookRunSnapshot; html: string }> {
  const store = getLifeBookRunStore();
  const snapshot = await getLifeBookRun(runId);
  const html = await renderLifeBookHtml(snapshot, async (artifactId) => (await store.readArtifact(runId, artifactId))?.localPath);
  return { snapshot, html };
}

export async function getLifeBookRun(runId: string): Promise<LifeBookRunSnapshot> {
  const snapshot = await getLifeBookRunStore().readRun(runId);
  if (!snapshot) throw new Error("Life book run not found");
  return snapshot;
}
