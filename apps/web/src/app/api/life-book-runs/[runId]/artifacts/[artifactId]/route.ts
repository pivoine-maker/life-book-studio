import { NextResponse } from "next/server";
import { getLifeBookRunStore } from "@short-drama/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string; artifactId: string }> }) {
  const { runId, artifactId } = await params;
  const store = getLifeBookRunStore();
  const artifact = await store.readArtifact(runId, artifactId);
  const bytes = await store.readArtifactBytes(runId, artifactId);
  if (!artifact || !bytes) return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": artifact.contentType } });
}
