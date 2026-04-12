import { NextResponse } from "next/server";

/**
 * Lightweight uptime probe for smoke tests and monitors (no secrets).
 */
export function GET() {
  return NextResponse.json({ ok: true, service: "medminder-ai" });
}
