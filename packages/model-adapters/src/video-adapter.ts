import { Buffer } from "node:buffer";

export interface LifeVideoGenerationInput {
  title: string;
  sceneText: string;
  caption: string;
  imagePrompt?: string;
  voiceoverText: string;
  firstFrame: {
    bytes: Uint8Array;
    contentType: string;
  };
  pageIndex: number;
  visualBible?: string;
}

export interface LifeVideoGenerationResult {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  modelAlias: string;
  inputSummary: string;
  taskId?: string;
  remoteUrl?: string;
}

export interface VideoModelAdapterPlaceholder {
  configured: boolean;
  modelAlias?: string;
  provider?: string;
  baseUrl?: string;
}

const DEFAULT_VIDEO_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks";
const DEFAULT_VIDEO_MODEL = "ep-20260623214512-tg2hs";
const DEFAULT_VIDEO_DURATION = 15;
const DEFAULT_VIDEO_RATIO = "16:9";
const DEFAULT_VIDEO_RESOLUTION = "720p";
const TERMINAL_SUCCESS = new Set(["succeeded", "success", "completed", "done"]);
const TERMINAL_FAILED = new Set(["failed", "error", "cancelled", "canceled", "rejected"]);

function logVideoStage(message: string): void {
  console.log(`[life-book-video] ${new Date().toISOString()} ${message}`);
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readBoolEnv(defaultValue: boolean, ...keys: string[]): boolean {
  const value = readEnv(...keys);
  if (!value) return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readIntEnv(defaultValue: number, ...keys: string[]): number {
  const value = readEnv(...keys);
  if (!value) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function videoModelConfig() {
  return {
    apiKey: readEnv("AI_VIDEO_API_KEY"),
    provider: readEnv("AI_VIDEO_PROVIDER") || "openai-compatible-video",
    baseUrl: readEnv("AI_VIDEO_BASE_URL") || DEFAULT_VIDEO_BASE_URL,
    model: readEnv("AI_VIDEO_MODEL") || DEFAULT_VIDEO_MODEL,
    alias: readEnv("AI_VIDEO_MODEL_ALIAS") || "Video model",
    duration: readIntEnv(DEFAULT_VIDEO_DURATION, "AI_VIDEO_DURATION"),
    ratio: readEnv("AI_VIDEO_RATIO") || DEFAULT_VIDEO_RATIO,
    resolution: readEnv("AI_VIDEO_RESOLUTION") || DEFAULT_VIDEO_RESOLUTION,
    watermark: readBoolEnv(false, "AI_VIDEO_WATERMARK"),
    generateAudio: readBoolEnv(true, "AI_VIDEO_GENERATE_AUDIO"),
    timeoutMs: readIntEnv(30 * 60 * 1000, "AI_VIDEO_TIMEOUT_MS"),
    pollIntervalMs: readIntEnv(10_000, "AI_VIDEO_POLL_INTERVAL_MS"),
  };
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function dataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function compact(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function fieldFromScene(scene: string, label: string): string {
  const match = scene.match(new RegExp(`${label}：([^。]+)`));
  return match?.[1]?.trim() || "";
}

function buildShotPlan(input: LifeVideoGenerationInput, duration: number): string {
  const scene = input.sceneText || input.caption;
  const location = fieldFromScene(scene, "地点") || "首帧所示主要场景";
  const time = fieldFromScene(scene, "时间") || "剧情当前时刻";
  const characters = fieldFromScene(scene, "人物") || "首帧中的主要人物";
  const action = fieldFromScene(scene, "动作") || compact(scene, 260);
  const conflict = fieldFromScene(scene, "冲突") || "人物内心和外部处境的压力";
  const props = fieldFromScene(scene, "关键道具") || "首帧中可见的关键道具与环境细节";
  const emotion = fieldFromScene(scene, "情绪张力") || "克制、真实、有命运感的情绪推进";
  const consequence = fieldFromScene(scene, "剧情后果") || "这一刻推动人物命运进入下一阶段";
  const firstCut = Math.max(3, Math.round(duration * 0.27));
  const secondCut = Math.max(firstCut + 3, Math.round(duration * 0.55));
  const thirdCut = Math.max(secondCut + 3, Math.round(duration * 0.8));
  return [
    `镜头01｜00:00-00:${String(firstCut).padStart(2, "0")}｜镜头运动：从首帧构图极慢推近，保持人物和场景连续｜机位：平视中景或中近景｜人物主体：${characters}｜场景：${time}，${location}｜道具：${props}｜表演/动作：人物先保持首帧姿态，再出现细微呼吸、眼神和手部动作。`,
    `镜头02｜00:${String(firstCut).padStart(2, "0")}-00:${String(secondCut).padStart(2, "0")}｜镜头运动：轻微横移或跟随人物手部动作｜机位：中近景切到关键道具特写｜人物主体：${characters}｜场景：${location}｜道具：${props}｜表演/动作：${action}`,
    `镜头03｜00:${String(secondCut).padStart(2, "0")}-00:${String(thirdCut).padStart(2, "0")}｜镜头运动：缓慢拉近到面部或关系位置，突出冲突｜机位：近景/肩后镜头/双人关系镜头｜人物主体：${characters}｜场景：${location}｜道具：${props}｜表演/动作：呈现${conflict}，情绪是${emotion}。`,
    `镜头04｜00:${String(thirdCut).padStart(2, "0")}-00:${String(duration).padStart(2, "0")}｜镜头运动：轻微后撤或定格式收束，留下余韵｜机位：稳定中景或环境远景｜人物主体：${characters}｜场景：${location}｜道具：${props}｜表演/动作：以一个安静但明确的动作收尾，指向${consequence}。`,
  ].join("\n");
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const parts = [`${error.name}: ${error.message}`];
  let cause = error.cause;
  while (cause) {
    if (cause instanceof Error) {
      const codeValue = (cause as { code?: unknown }).code;
      const code = typeof codeValue === "string" ? ` code=${codeValue}` : "";
      parts.push(`caused by ${cause.name}${code}: ${cause.message}`);
      cause = cause.cause;
    } else {
      parts.push(`caused by ${String(cause)}`);
      break;
    }
  }
  return parts.join("; ");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || "Video model request failed";
    try {
      const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = data.error?.message || data.message || message;
    } catch {
      // noop
    }
    throw new Error(`Video model request failed with HTTP ${response.status} ${response.statusText}: ${message}`);
  }
  if (!text) throw new Error("Video model returned empty response body");
  return JSON.parse(text) as unknown;
}

function taskIdFromPayload(payload: unknown): string {
  const data = payload as { id?: string; task_id?: string; data?: { id?: string; task_id?: string } };
  const taskId = data.task_id || data.id || data.data?.task_id || data.data?.id;
  if (!taskId) throw new Error(`Video model create task response did not include task id: ${JSON.stringify(payload).slice(0, 500)}`);
  return taskId;
}

function statusFromPayload(payload: unknown): string | undefined {
  const data = payload as { status?: string; data?: { status?: string }; task?: { status?: string } };
  return (data.status || data.data?.status || data.task?.status)?.toLowerCase();
}

function errorFromPayload(payload: unknown): string | undefined {
  const data = payload as { error?: unknown; message?: string; data?: { error?: unknown; message?: string } };
  const error = data.error || data.data?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") return JSON.stringify(error);
  return data.message || data.data?.message;
}

function findUrl(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return /^https?:\/\//.test(value) ? value : undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    for (const key of ["url", "video_url", "videoUrl", "content_url", "contentUrl", "download_url", "downloadUrl"]) {
      const candidate = findUrl(object[key]);
      if (candidate) return candidate;
    }
    for (const nested of Object.values(object)) {
      const candidate = findUrl(nested);
      if (candidate) return candidate;
    }
  }
  return undefined;
}

function buildPrompt(input: LifeVideoGenerationInput, duration: number): string {
  return [
    "任务：基于首帧人生故事图生成一个连续的视频片段。必须使用首帧作为第一帧，保持人物身份、服装、时代背景、地点、美术风格和摄影质感一致。",
    `时长：${duration}秒。不要字幕，不要屏幕文字，不要水印。必须生成自然中文画外音/旁白，旁白文案见下。旁白只读这一句，不要扩写，不要追加总结语，不要说“命运从此转向/开始改变”等套话；语速自然，必须在视频结束前完整读完。`,
    "视频风格：真人电影传记片，live-action cinematic biographical drama, photorealistic human faces, 35mm film still, coherent camera movement, realistic lighting, natural motion, subtle film grain, premium streaming series look.",
    "镜头调度：从首帧的构图自然起势，采用克制但有叙事推进的运动，例如缓慢推近、轻微横移、跟随人物动作、环境细节切换、表情微变化和关键道具特写；不要突兀变脸、不要换主角、不要跳切到无关场景。",
    "一致性要求：同一部电影的连续镜头；保持主角脸型、年龄段、发型、体态、服饰、道具、场景光线和色彩分级一致；避免动漫、插画、3D、CGI、游戏感。",
    `专业影视分镜：\n${buildShotPlan(input, duration)}`,
    input.imagePrompt ? `视觉参考：${compact(input.imagePrompt, 700)}` : "",
    input.visualBible ? `全片视觉圣经：${compact(input.visualBible, 900)}` : "",
    `画外音旁白（必须逐字作为音频朗读，不要做成字幕；只读这句，读完即停）：${input.voiceoverText}`,
  ].filter(Boolean).join("\n");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadVideo(url: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download generated video: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "video/mp4";
  const ext = contentType.includes("quicktime") ? "mov" : "mp4";
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType, ext };
}

export function getVideoAdapterPlaceholder(): VideoModelAdapterPlaceholder {
  const config = videoModelConfig();
  return {
    configured: Boolean(config.model && config.baseUrl && config.apiKey),
    modelAlias: config.alias,
    provider: config.provider,
    baseUrl: config.baseUrl,
  };
}

export class LifeVideoModelAdapter {
  async generateLifeBookPageVideo(input: LifeVideoGenerationInput): Promise<LifeVideoGenerationResult> {
    const config = videoModelConfig();
    if (!config.apiKey) throw new Error("AI_VIDEO_API_KEY is required for life book video generation");
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const started = Date.now();
      logVideoStage(`create_start page=${input.pageIndex} model=${config.model} duration=${config.duration}`);
      const createPayload = {
        model: config.model,
        content: [
          { type: "text", text: buildPrompt(input, config.duration) },
          { type: "image_url", image_url: { url: dataUrl(input.firstFrame.bytes, input.firstFrame.contentType) }, role: "first_frame" },
        ],
        duration: config.duration,
        generate_audio: config.generateAudio,
        ratio: config.ratio,
        resolution: config.resolution,
        watermark: config.watermark,
      };
      const createResponse = await fetch(config.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(createPayload),
        signal: controller.signal,
      });
      const createResult = await readJsonResponse(createResponse);
      const taskId = taskIdFromPayload(createResult);
      logVideoStage(`create_done page=${input.pageIndex} taskId=${taskId} elapsedSec=${Math.round((Date.now() - started) / 1000)}`);
      const result = await this.pollTask(config, taskId, controller.signal);
      const remoteUrl = findUrl(result);
      if (!remoteUrl) throw new Error(`Video model task completed without video URL: ${JSON.stringify(result).slice(0, 800)}`);
      logVideoStage(`download_start page=${input.pageIndex} taskId=${taskId}`);
      const video = await downloadVideo(remoteUrl);
      logVideoStage(`done page=${input.pageIndex} taskId=${taskId} bytes=${video.bytes.length} elapsedSec=${Math.round((Date.now() - started) / 1000)}`);
      return { ...video, modelAlias: config.alias, inputSummary: input.sceneText.slice(0, 120), taskId, remoteUrl };
    } catch (error) {
      logVideoStage(`failed page=${input.pageIndex} error=${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.name === "AbortError") throw new Error(`Life video model request timed out after ${config.timeoutMs}ms`);
      if (error instanceof TypeError && error.message === "fetch failed") throw new Error(`Life video model fetch failed: ${describeError(error)}`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async pollTask(config: ReturnType<typeof videoModelConfig>, taskId: string, signal: AbortSignal): Promise<unknown> {
    const queryUrl = `${normalizeBaseUrl(config.baseUrl)}/${encodeURIComponent(taskId)}`;
    while (true) {
      await sleep(config.pollIntervalMs);
      const response = await fetch(queryUrl, { method: "GET", headers: { Authorization: `Bearer ${config.apiKey}` }, signal });
      const payload = await readJsonResponse(response);
      const status = statusFromPayload(payload);
      logVideoStage(`poll taskId=${taskId} status=${status || "unknown"}`);
      if (status && TERMINAL_SUCCESS.has(status)) return payload;
      if (status && TERMINAL_FAILED.has(status)) throw new Error(`Video model task ${taskId} failed: ${errorFromPayload(payload) || JSON.stringify(payload).slice(0, 800)}`);
    }
  }
}

export const lifeVideoModel = new LifeVideoModelAdapter();
