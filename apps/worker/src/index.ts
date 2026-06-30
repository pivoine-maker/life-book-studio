import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createAutonomousDailyLifeBook, renderLifeBookHtmlForRun, renderLifeBookMarkdown } from "@short-drama/pipeline";
import { getLifeBookRunStore } from "@short-drama/storage";
import { sendFeishuBotMessage, uploadHtmlWithLarkCli, uploadMarkdownWithLarkCli, uploadVideoWithLarkCli } from "./feishu";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const WORKER_ROOT = path.resolve(path.dirname(CURRENT_FILE), "..");
const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const DAILY_RUN_HOUR = 20;

async function loadWorkerEnv() {
  const envFiles = [
    path.resolve(WORKER_ROOT, "../../apps/web/.env.local"),
    path.join(WORKER_ROOT, ".env.local"),
  ];
  for (const filePath of envFiles) {
    try {
      const raw = await readFile(filePath, "utf8");
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const [key, ...rest] = trimmed.split("=");
        process.env[key] ||= rest.join("=");
      }
    } catch {
      // optional
    }
  }
}

function shanghaiDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHANGHAI_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function shanghaiClockParts(date = new Date()): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function shanghaiTimeToDate(input: { year: number; month: number; day: number; hour: number; minute?: number; second?: number }): Date {
  const utcGuess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute || 0, input.second || 0);
  const shanghai = shanghaiClockParts(new Date(utcGuess));
  const offsetMs = Date.UTC(shanghai.year, shanghai.month - 1, shanghai.day, shanghai.hour, shanghai.minute, shanghai.second) - utcGuess;
  return new Date(utcGuess - offsetMs);
}

function nextDailyRunDate(now = new Date()): Date {
  const current = shanghaiClockParts(now);
  const todayRun = shanghaiTimeToDate({ year: current.year, month: current.month, day: current.day, hour: DAILY_RUN_HOUR });
  if (todayRun.getTime() > now.getTime()) return todayRun;
  return new Date(todayRun.getTime() + 24 * 60 * 60 * 1000);
}

function startDailyScheduler() {
  let running = false;
  const scheduleNext = () => {
    const nextRun = nextDailyRunDate();
    const delay = nextRun.getTime() - Date.now();
    console.log(`[worker] next daily-life-book run at ${nextRun.toLocaleString("zh-CN", { timeZone: SHANGHAI_TIME_ZONE, hour12: false })} ${SHANGHAI_TIME_ZONE}`);
    setTimeout(async () => {
      if (running) {
        console.warn("[worker] previous daily-life-book run is still running; skip this tick");
        scheduleNext();
        return;
      }
      running = true;
      try {
        await runDailyLifeBook({ dateKey: shanghaiDateKey() });
      } catch (error) {
        console.error("[worker] daily-life-book failed", error);
      } finally {
        running = false;
        scheduleNext();
      }
    }, delay);
  };
  scheduleNext();
}

async function publishLifeBookRun(runId: string) {
  const snapshot = await getLifeBookRunStore().readRun(runId);
  if (!snapshot) throw new Error(`Life book run not found: ${runId}`);
  const { html } = await renderLifeBookHtmlForRun(snapshot.runId);
  const title = snapshot.script?.title || snapshot.persona.title;
  const markdown = renderLifeBookMarkdown(snapshot);
  const mdUpload = await uploadMarkdownWithLarkCli({ title, markdown });
  const htmlUpload = await uploadHtmlWithLarkCli({ title, html });
  const finalVideoArtifact = snapshot.videoJob?.finalVideoArtifactId ? await getLifeBookRunStore().readArtifact(snapshot.runId, snapshot.videoJob.finalVideoArtifactId) : null;
  const videoUpload = finalVideoArtifact ? await uploadVideoWithLarkCli({ title: `${title}-完整成片`, localPath: finalVideoArtifact.localPath }) : undefined;
  await sendFeishuBotMessage({
    title: `今晚的人生副本：${snapshot.persona.title}`,
    text: [
      `Agent 已替你过完另一段人生。`,
      snapshot.script?.logline || snapshot.persona.coreTension,
      `Run ID：${snapshot.runId}`,
      snapshot.renderJob ? `页面：${snapshot.renderJob.generatedPages}/${snapshot.renderJob.totalPages}` : "",
      snapshot.videoJob ? `视频：${snapshot.videoJob.generatedClips}/${snapshot.videoJob.totalClips}` : "",
      mdUpload.url ? `\nMarkdown 云文档：${mdUpload.url}` : "",
      htmlUpload.url ? `HTML 文件：${htmlUpload.url}` : "",
      videoUpload?.url ? `完整成片：${videoUpload.url}` : "",
    ].filter(Boolean).join("\n"),
  });
  console.log(`[daily-life-book] published ${snapshot.runId} title=${title} pages=${snapshot.renderJob?.generatedPages ?? 0}/${snapshot.renderJob?.totalPages ?? 0} videos=${snapshot.videoJob?.generatedClips ?? 0}/${snapshot.videoJob?.totalClips ?? 0} md=${mdUpload.url || mdUpload.fileToken || "uploaded"} html=${htmlUpload.url || htmlUpload.fileToken || "uploaded"} video=${videoUpload?.url || videoUpload?.fileToken || "none"}`);
  return { runId: snapshot.runId, title, persona: snapshot.persona, renderJob: snapshot.renderJob, videoJob: snapshot.videoJob, md: mdUpload, html: htmlUpload, video: videoUpload };
}

async function runDailyLifeBook(input?: { dateKey?: string; seedText?: string; testMode?: boolean }) {
  const dateKey = input?.dateKey || shanghaiDateKey();
  console.log(`[daily-life-book] start ${dateKey}`);
  let snapshot = await createAutonomousDailyLifeBook({ dateKey, seedText: input?.seedText, maxQuestions: input?.testMode ? 1 : undefined });
  if (input?.testMode && snapshot.script) {
    snapshot = { ...snapshot, script: { ...snapshot.script, chapters: snapshot.script.chapters.slice(0, 1), fullText: snapshot.script.chapters[0]?.fullText || snapshot.script.fullText } };
  }
  const result = await publishLifeBookRun(snapshot.runId);
  console.log(`[daily-life-book] done ${snapshot.runId}`);
  return result;
}

async function main() {
  await loadWorkerEnv();
  const publishRunIndex = process.argv.indexOf("--publish-run");
  if (publishRunIndex >= 0) {
    const runId = process.argv[publishRunIndex + 1];
    if (!runId) throw new Error("--publish-run requires a runId");
    console.log(await publishLifeBookRun(runId));
    return;
  }
  if (process.argv.includes("--test") || process.argv.includes("--full-test") || process.argv.includes("--run-once")) {
    const seedIndex = process.argv.indexOf("--seed");
    const seedText = seedIndex >= 0 ? process.argv[seedIndex + 1] : undefined;
    const fullTest = process.argv.includes("--full-test");
    const runOnce = process.argv.includes("--run-once");
    console.log(await runDailyLifeBook({ dateKey: runOnce ? shanghaiDateKey() : `${fullTest ? "full" : "test"}-${Date.now()}`, seedText: runOnce || fullTest ? seedText : seedText || "00年代北京Java程序员的一生：用技术、金钱或文字反写命运", testMode: !runOnce && !fullTest }));
    return;
  }
  startDailyScheduler();
  console.log("[worker] started local scheduler");
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
