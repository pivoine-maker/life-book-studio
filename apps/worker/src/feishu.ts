import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FeishuUploadResult {
  fileToken?: string;
  url?: string;
  raw: unknown;
}

function safeName(value: string, ext: string): string {
  return `${value.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80)}.${ext}`;
}

function parseUpload(raw: Record<string, unknown>, kind: "file" | "docx"): Pick<FeishuUploadResult, "fileToken" | "url"> {
  const data = (raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown>;
  const token = String(data.file_token || data.token || data.obj_token || data.url || "");
  return {
    fileToken: token && !token.startsWith("http") ? token : undefined,
    url: typeof data.url === "string" ? data.url : token.startsWith("http") ? token : token ? `https://bytedance.larkoffice.com/${kind}/${token}` : undefined,
  };
}

export async function uploadMarkdownWithLarkCli(input: { title: string; markdown: string }): Promise<FeishuUploadResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "life-book-md-"));
  const file = path.join(dir, safeName(input.title, "md"));
  await writeFile(file, input.markdown, "utf8");
  const args = ["markdown", "+create", "--file", path.basename(file), "--name", path.basename(file), "--format", "json"];
  const folder = process.env.FEISHU_FOLDER_TOKEN?.trim() || process.env.FEISHU_PARENT_NODE?.trim();
  if (folder && folder !== "root") args.push("--folder-token", folder);
  const { stdout } = await execFileAsync("lark-cli", args, { cwd: dir, maxBuffer: 10 * 1024 * 1024 });
  const raw = stdout.trim() ? JSON.parse(stdout) as Record<string, unknown> : {};
  return { ...parseUpload(raw, "file"), raw };
}

export async function uploadHtmlWithLarkCli(input: { title: string; html: string }): Promise<FeishuUploadResult> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "life-book-html-"));
  const file = path.join(dir, safeName(input.title, "html"));
  await writeFile(file, input.html, "utf8");
  const args = ["drive", "+upload", "--file", path.basename(file), "--name", path.basename(file), "--format", "json"];
  const folder = process.env.FEISHU_FOLDER_TOKEN?.trim() || process.env.FEISHU_PARENT_NODE?.trim();
  if (folder && folder !== "root") args.push("--folder-token", folder);
  const { stdout } = await execFileAsync("lark-cli", args, { cwd: dir, maxBuffer: 10 * 1024 * 1024 });
  const raw = stdout.trim() ? JSON.parse(stdout) as Record<string, unknown> : {};
  return { ...parseUpload(raw, "file"), raw };
}

export async function uploadVideoWithLarkCli(input: { title: string; localPath: string }): Promise<FeishuUploadResult> {
  const args = ["drive", "+upload", "--file", path.basename(input.localPath), "--name", safeName(input.title, "mp4"), "--format", "json"];
  const folder = process.env.FEISHU_FOLDER_TOKEN?.trim() || process.env.FEISHU_PARENT_NODE?.trim();
  if (folder && folder !== "root") args.push("--folder-token", folder);
  const { stdout } = await execFileAsync("lark-cli", args, { cwd: path.dirname(input.localPath), maxBuffer: 10 * 1024 * 1024 });
  const raw = stdout.trim() ? JSON.parse(stdout) as Record<string, unknown> : {};
  return { ...parseUpload(raw, "file"), raw };
}

export async function sendFeishuBotMessage(input: { title: string; text: string; url?: string }): Promise<void> {
  const content = input.url ? `${input.text}\n\n[点击阅读完整故事书](${input.url})` : input.text;
  const userId = process.env.FEISHU_USER_OPEN_ID?.trim();
  const chatId = process.env.FEISHU_CHAT_ID?.trim();
  const args = ["im", "+messages-send", "--as", process.env.FEISHU_SEND_AS || "bot", "--markdown", content, "--format", "json"];
  if (userId) args.push("--user-id", userId);
  else if (chatId) args.push("--chat-id", chatId);
  else return;
  await execFileAsync("lark-cli", args, { maxBuffer: 10 * 1024 * 1024 });
}
