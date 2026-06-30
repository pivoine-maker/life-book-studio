import { NextResponse } from "next/server";
import { renderLifeBook } from "@short-drama/pipeline";

export async function POST(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  try {
    const snapshot = await renderLifeBook(runId);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
