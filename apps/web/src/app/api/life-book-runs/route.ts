import { NextResponse } from "next/server";
import { createLifeBookRun } from "@short-drama/pipeline";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { seedText?: string };
  try {
    const snapshot = await createLifeBookRun(body.seedText);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
