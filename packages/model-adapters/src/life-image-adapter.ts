import { Buffer } from "node:buffer";

export interface LifeImageReference {
  artifactId: string;
  imageUrl?: string;
  bytes?: Uint8Array;
  contentType?: string;
  label?: string;
}

export interface LifePageImageResult {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
  modelAlias: string;
  inputSummary: string;
  isPlaceholder?: boolean;
  error?: string;
}

const DEFAULT_IMAGE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_IMAGE_MODEL = "ep-20260608153225-r6dhc";
const DEFAULT_NEGATIVE = "anime, manga, cartoon, 2d illustration, 3d render, cgi, pixar, game art, plastic skin, doll face, inconsistent art style, painterly, watercolor, comic panel, text, watermark, logo, low quality, distorted face, extra fingers";

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function imageModelConfig() {
  const apiKey = readEnv("AI_IMAGE_API_KEY");
  return {
    apiKey,
    provider: readEnv("AI_IMAGE_PROVIDER") || "openai-compatible-image",
    baseUrl: readEnv("AI_IMAGE_BASE_URL") || DEFAULT_IMAGE_BASE_URL,
    model: readEnv("AI_IMAGE_MODEL") || DEFAULT_IMAGE_MODEL,
    size: readEnv("AI_IMAGE_SIZE") || "2K",
    timeoutMs: Number.parseInt(readEnv("AI_IMAGE_TIMEOUT_MS") || "600000", 10),
  };
}

function extFromContentType(contentType: string): string {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("svg")) return "svg";
  return "bin";
}

function parseDataUrl(value: string): { bytes: Uint8Array; contentType: string; ext: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Unsupported data URL image response");
  const contentType = match[1];
  return { bytes: new Uint8Array(Buffer.from(match[2], "base64")), contentType, ext: extFromContentType(contentType) };
}

async function downloadRemoteImage(url: string): Promise<{ bytes: Uint8Array; contentType: string; ext: string }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download generated image: ${response.status}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType, ext: extFromContentType(contentType) };
}

function extractGeneratedImage(payload: unknown): string {
  const item = (payload as { data?: Array<{ url?: string; b64_json?: string; image?: string }> }).data?.[0];
  if (!item) throw new Error("Image model returned no image data");
  if (typeof item.url === "string" && item.url.trim()) return item.url.trim();
  if (typeof item.image === "string" && item.image.trim()) return item.image.trim();
  if (typeof item.b64_json === "string" && item.b64_json.trim()) return `data:image/png;base64,${item.b64_json.trim()}`;
  throw new Error("Image model returned no downloadable image payload");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    let message = text || "Image model request failed";
    try {
      const data = JSON.parse(text) as { error?: { message?: string }; message?: string };
      message = data.error?.message || data.message || message;
    } catch {
      // noop
    }
    throw new Error(message);
  }
  if (!text) throw new Error("Image model returned empty response body");
  return JSON.parse(text) as unknown;
}

function isRetryableImageError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("资源池资源不足") || message.includes("rate") || message.includes("429") || message.includes("timeout") || message.includes("timed out");
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrapText(value: string, max = 26): string[] {
  const text = value.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += max) lines.push(text.slice(index, index + max));
  return lines.slice(0, 6);
}

function placeholderImage(input: { title: string; caption: string; prompt: string; pageIndex: number; error?: string }): LifePageImageResult {
  const hue = (input.pageIndex * 47) % 360;
  const lines = wrapText(input.caption || input.prompt);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600" viewBox="0 0 1200 1600">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="hsl(${hue}, 46%, 18%)"/><stop offset="55%" stop-color="hsl(${(hue + 38) % 360}, 38%, 12%)"/><stop offset="100%" stop-color="#080b12"/></linearGradient></defs>
  <rect width="1200" height="1600" fill="url(#bg)"/>
  <rect x="86" y="86" width="1028" height="1428" rx="34" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.24)" stroke-width="3"/>
  <circle cx="600" cy="520" r="118" fill="rgba(245,222,179,0.24)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
  <path d="M380 780 C455 635 745 635 820 780 L880 1040 L320 1040 Z" fill="rgba(245,222,179,0.2)" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
  <text x="600" y="170" text-anchor="middle" font-family="serif" font-size="48" font-weight="700" fill="#fff7ed">${escapeXml(input.title)}</text>
  <text x="600" y="235" text-anchor="middle" font-family="sans-serif" font-size="24" fill="rgba(255,247,237,0.7)">Life Agent Storybook · Page ${input.pageIndex}</text>
  ${lines.map((line, index) => `<text x="600" y="${1190 + index * 48}" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#fff7ed">${escapeXml(line)}</text>`).join("\n  ")}
  <text x="600" y="1450" text-anchor="middle" font-family="monospace" font-size="20" fill="rgba(255,247,237,0.42)">${escapeXml((input.error || input.prompt).slice(0, 92))}</text>
</svg>`;
  return {
    bytes: new Uint8Array(Buffer.from(svg, "utf8")),
    contentType: "image/svg+xml",
    ext: "svg",
    modelAlias: "Life Image Placeholder",
    inputSummary: input.prompt.slice(0, 120),
    isPlaceholder: true,
    error: input.error,
  };
}

function compactPrompt(prompt: string, maxLength: number): string {
  return prompt.replace(/\s+/g, " ").slice(0, maxLength);
}

function imageExtFromContentType(contentType?: string): string {
  if (!contentType) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("webp")) return "webp";
  if (contentType.includes("png")) return "png";
  return "png";
}

function bytesToDataUrl(bytes: Uint8Array, contentType = "image/png"): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export class LifeImageModelAdapter {
  async generateLifeAnchorImage(input: {
    label: string;
    description: string;
    prompt: string;
    negativePrompt?: string;
    pageIndex: number;
  }): Promise<LifePageImageResult> {
    return this.generateImage({
      title: input.label,
      caption: input.description,
      prompt: [input.prompt, "photorealistic live-action cinematic character reference sheet, same actor identity, realistic human skin, consistent costume, 35mm film still, no text, no watermark, not anime, not illustration, not 3D render"].join("\n"),
      negativePrompt: input.negativePrompt,
      pageIndex: input.pageIndex,
    });
  }

  async generateLifeBookPage(input: {
    title: string;
    caption: string;
    prompt: string;
    negativePrompt?: string;
    pageIndex: number;
    visualBible?: string;
    referenceImages?: LifeImageReference[];
  }): Promise<LifePageImageResult> {
    const referenceNote = input.referenceImages?.length
      ? `Use the attached reference image(s) only as strict actor identity reference, not as composition reference. Keep the same protagonist face, body type, hair logic, costume logic, signature accessory, and live-action cinematic style: ${input.referenceImages.map((item) => item.label || item.artifactId).join(", ")}. The new image must follow the page-specific story scene, not repeat the anchor sheet pose. Do not change to illustration/anime/3D/cartoon.`
      : "";
    return this.generateImage({
      title: input.title,
      caption: input.caption,
      prompt: [input.visualBible, referenceNote, input.prompt].filter(Boolean).join("\n"),
      negativePrompt: input.negativePrompt,
      pageIndex: input.pageIndex,
      referenceImages: input.referenceImages,
    });
  }

  private async generateImage(input: {
    title: string;
    caption: string;
    prompt: string;
    negativePrompt?: string;
    pageIndex: number;
    referenceImages?: LifeImageReference[];
  }): Promise<LifePageImageResult> {
    const config = imageModelConfig();
    if (!config.apiKey) return placeholderImage(input);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const prompt = [compactPrompt(input.prompt, 5000), `Avoid: ${input.negativePrompt || DEFAULT_NEGATIVE}`].join("\n");
      const references = input.referenceImages?.filter((item) => item.bytes?.length) ?? [];
      const payload = await this.callImageWithRetry(config, prompt, references, controller.signal);
      const generated = extractGeneratedImage(payload);
      const image = generated.startsWith("data:") ? parseDataUrl(generated) : await downloadRemoteImage(generated);
      return { ...image, modelAlias: config.model, inputSummary: input.prompt.slice(0, 120), isPlaceholder: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (process.env.LIFE_IMAGE_FALLBACK_ON_ERROR !== "false") return placeholderImage({ ...input, error: message });
      if (error instanceof Error && error.name === "AbortError") throw new Error(`Life image model request timed out after ${config.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async callImageWithRetry(
    config: ReturnType<typeof imageModelConfig>,
    prompt: string,
    references: LifeImageReference[],
    signal: AbortSignal
  ): Promise<unknown> {
    const maxAttempts = Number.parseInt(process.env.LIFE_IMAGE_MAX_ATTEMPTS || "4", 10);
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = config.provider === "ark-seedream"
          ? await this.callArkSeedream(config, prompt, references, signal)
          : references.length
            ? await this.callImageEdit(config, prompt, references, signal)
            : await this.callImageGeneration(config, prompt, signal);
        return await readJsonResponse(response);
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const editEmptyBody = references.length && message.includes("empty response body");
        if (editEmptyBody) {
          references = [];
          continue;
        }
        if (!isRetryableImageError(error) || attempt >= maxAttempts) throw error;
        await sleep(Math.min(60_000, 2000 * 2 ** (attempt - 1)));
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async callArkSeedream(
    config: ReturnType<typeof imageModelConfig>,
    prompt: string,
    references: LifeImageReference[],
    signal: AbortSignal
  ): Promise<Response> {
    const imageUrls = references
      .filter((item) => item.bytes?.length)
      .slice(0, 14)
      .map((item) => bytesToDataUrl(item.bytes!, item.contentType || "image/png"));
    const body: Record<string, unknown> = {
      model: config.model,
      prompt,
      size: config.size || "2K",
      response_format: "url",
      watermark: false,
    };
    if (imageUrls.length) body.image_urls = imageUrls;
    return fetch(`${normalizeBaseUrl(config.baseUrl)}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
      signal,
    });
  }

  private async callImageGeneration(config: ReturnType<typeof imageModelConfig>, prompt: string, signal: AbortSignal): Promise<Response> {
    return fetch(`${normalizeBaseUrl(config.baseUrl)}/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": config.apiKey!, Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, prompt, ...(config.size ? { size: config.size } : {}) }),
      signal,
    });
  }

  private async callImageEdit(
    config: ReturnType<typeof imageModelConfig>,
    prompt: string,
    references: LifeImageReference[],
    signal: AbortSignal
  ): Promise<Response> {
    const form = new FormData();
    form.append("model", config.model);
    form.append("prompt", prompt);
    if (config.size) form.append("size", config.size);
    references.forEach((reference, index) => {
      const ext = imageExtFromContentType(reference.contentType);
      const bytes = reference.bytes!;
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: reference.contentType || "image/png" });
      form.append("image[]", blob, `${reference.label || reference.artifactId || `reference-${index}`}.${ext}`);
    });
    return fetch(`${normalizeBaseUrl(config.baseUrl)}/images/edits`, {
      method: "POST",
      headers: { "api-key": config.apiKey!, Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal,
    });
  }
}

export const lifeImageModel = new LifeImageModelAdapter();
