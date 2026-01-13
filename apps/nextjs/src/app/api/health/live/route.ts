import { NextResponse } from "next/server";

/**
 * Liveness probe endpoint for Kubernetes
 *
 * Returns 200 if the process is running.
 * Used to determine if the container should be restarted.
 */
export async function GET() {
  return NextResponse.json(
    { status: "alive", timestamp: new Date().toISOString() },
    { status: 200 },
  );
}
