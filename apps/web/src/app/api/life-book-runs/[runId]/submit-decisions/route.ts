import { NextResponse } from "next/server";
import { submitLifeBookDecisions } from "@short-drama/pipeline";
import type { LifeSelectedDecision } from "@short-drama/domain";

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const body = (await request.json().catch(() => ({}))) as { selectedDecisions?: LifeSelectedDecision[] };
  try {
    const snapshot = await submitLifeBookDecisions(runId, body.selectedDecisions || []);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
