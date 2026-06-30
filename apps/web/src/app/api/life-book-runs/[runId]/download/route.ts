import { NextResponse } from "next/server";
import { getLifeBookRun } from "@short-drama/pipeline";

export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const snapshot = await getLifeBookRun(runId);
    return new NextResponse(JSON.stringify(snapshot, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${runId}.json"` },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 404 });
  }
}
