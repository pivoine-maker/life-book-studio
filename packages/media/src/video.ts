import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DownloadedMedia {
  localPath: string;
  contentType?: string;
}

export interface ConcatenatedVideo {
  bytes: Uint8Array;
  contentType: string;
  ext: string;
}

export async function downloadRemoteFile(url: string): Promise<DownloadedMedia> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const ext = contentType.includes("mp4") ? "mp4" : contentType.includes("mpeg") ? "mp3" : "bin";
  const dir = await mkdtemp(path.join(os.tmpdir(), "life-book-media-"));
  const localPath = path.join(dir, `download.${ext}`);
  await writeFile(localPath, new Uint8Array(await response.arrayBuffer()));
  return { localPath, contentType };
}

function escapeConcatPath(filePath: string): string {
  return filePath.replaceAll("'", "'\\''");
}

export async function concatenateVideos(input: { videoPaths: string[] }): Promise<ConcatenatedVideo> {
  if (!input.videoPaths.length) throw new Error("No video clips to concatenate");
  const dir = await mkdtemp(path.join(os.tmpdir(), "life-book-concat-"));
  const listPath = path.join(dir, "clips.txt");
  const normalized: string[] = [];
  for (let index = 0; index < input.videoPaths.length; index += 1) {
    const outputPath = path.join(dir, `clip-${String(index + 1).padStart(3, "0")}.mp4`);
    await execFileAsync("ffmpeg", ["-y", "-i", input.videoPaths[index], "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1", "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-shortest", outputPath], { maxBuffer: 10 * 1024 * 1024 });
    normalized.push(outputPath);
  }
  await writeFile(listPath, normalized.map((item) => `file '${escapeConcatPath(item)}'`).join("\n"), "utf8");
  const outputPath = path.join(dir, "life-book-full-video.mp4");
  await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath], { maxBuffer: 10 * 1024 * 1024 });
  return { bytes: new Uint8Array(await readFile(outputPath)), contentType: "video/mp4", ext: "mp4" };
}
