import { NextResponse } from "next/server";
import { getLifeBookRun } from "@short-drama/pipeline";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const snapshot = await getLifeBookRun(runId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
