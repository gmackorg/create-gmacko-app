import { NextResponse } from "next/server";

import { db } from "@gmacko/db/client";

/**
 * Readiness probe endpoint for Kubernetes
 *
 * Returns 200 if the service is ready to accept traffic.
 * Returns 503 if dependencies (like database) are not available.
 */
export async function GET() {
  try {
    // Check database connectivity
    await db.execute("SELECT 1");

    return NextResponse.json(
      { status: "ready", timestamp: new Date().toISOString() },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "not_ready",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 503 },
    );
  }
}
