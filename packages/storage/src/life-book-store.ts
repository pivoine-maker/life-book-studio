import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createId, nowIso, type LifeBookRunSnapshot } from "@short-drama/domain";
import { sha256OfBytes } from "./manifests";

const CURRENT_FILE = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = path.resolve(path.dirname(CURRENT_FILE), "../../..");

export interface LifeBookArtifactRecord {
  artifactId: string;
  runId: string;
  fileName: string;
  contentType: string;
  localPath: string;
  ext: string;
  createdAt: string;
  sha256: string;
}

function storageRoot(): string {
  return process.env.SHORT_DRAMA_DATA_DIR || path.join(PACKAGE_ROOT, "data");
}

function runsRoot(): string {
  return path.join(storageRoot(), "life-book-runs");
}

function runDir(runId: string): string {
  return path.join(runsRoot(), runId);
}

function snapshotPath(runId: string): string {
  return path.join(runDir(runId), "snapshot.json");
}

function artifactsDir(runId: string): string {
  return path.join(runDir(runId), "artifacts");
}

function artifactMetaPath(runId: string, artifactId: string): string {
  return path.join(artifactsDir(runId), `${artifactId}.json`);
}

async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export class LifeBookRunFsStore {
  createRunId(): string {
    return createId("life_book");
  }

  async listRuns(): Promise<LifeBookRunSnapshot[]> {
    try {
      const dirents = await readdir(runsRoot(), { withFileTypes: true });
      const snapshots = await Promise.all(dirents.filter((entry) => entry.isDirectory()).map((entry) => this.readRun(entry.name)));
      return snapshots.filter((item): item is LifeBookRunSnapshot => Boolean(item)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    } catch {
      return [];
    }
  }

  async readRun(runId: string): Promise<LifeBookRunSnapshot | null> {
    return readJson<LifeBookRunSnapshot>(snapshotPath(runId));
  }

  async saveRun(snapshot: LifeBookRunSnapshot): Promise<LifeBookRunSnapshot> {
    await writeJson(snapshotPath(snapshot.runId), snapshot);
    return snapshot;
  }

  async writeArtifact(input: { runId: string; fileStem: string; ext: string; contentType: string; bytes: Uint8Array }): Promise<LifeBookArtifactRecord> {
    const artifactId = createId("life_book_artifact");
    const safeStem = input.fileStem.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "book-page";
    const fileName = `${safeStem}-${artifactId}.${input.ext}`;
    const fullPath = path.join(artifactsDir(input.runId), fileName);
    await ensureDir(path.dirname(fullPath));
    await writeFile(fullPath, input.bytes);
    const artifact: LifeBookArtifactRecord = {
      artifactId,
      runId: input.runId,
      fileName,
      contentType: input.contentType,
      localPath: fullPath,
      ext: input.ext,
      createdAt: nowIso(),
      sha256: sha256OfBytes(input.bytes),
    };
    await writeJson(artifactMetaPath(input.runId, artifactId), artifact);
    return artifact;
  }

  async readArtifact(runId: string, artifactId: string): Promise<LifeBookArtifactRecord | null> {
    return readJson<LifeBookArtifactRecord>(artifactMetaPath(runId, artifactId));
  }

  async readArtifactBytes(runId: string, artifactId: string): Promise<Uint8Array | null> {
    const artifact = await this.readArtifact(runId, artifactId);
    if (!artifact) return null;
    return new Uint8Array(await readFile(artifact.localPath));
  }
}

let singleton: LifeBookRunFsStore | null = null;

export function getLifeBookRunStore(): LifeBookRunFsStore {
  if (!singleton) singleton = new LifeBookRunFsStore();
  return singleton;
}
