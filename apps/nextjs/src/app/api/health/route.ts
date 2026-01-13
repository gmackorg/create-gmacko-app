import { NextResponse } from "next/server";

import { db } from "@gmacko/db/client";

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: CheckResult;
    memory: CheckResult;
  };
}

interface CheckResult {
  status: "pass" | "fail" | "warn";
  message?: string;
  responseTime?: number;
}

const startTime = Date.now();

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await db.execute("SELECT 1");
    return {
      status: "pass",
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: "fail",
      message:
        error instanceof Error ? error.message : "Database connection failed",
      responseTime: Date.now() - start,
    };
  }
}

function checkMemory(): CheckResult {
  const used = process.memoryUsage();
  const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
  const percentUsed = (used.heapUsed / used.heapTotal) * 100;

  if (percentUsed > 90) {
    return {
      status: "fail",
      message: `High memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${percentUsed.toFixed(1)}%)`,
    };
  }

  if (percentUsed > 75) {
    return {
      status: "warn",
      message: `Elevated memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB (${percentUsed.toFixed(1)}%)`,
    };
  }

  return {
    status: "pass",
    message: `${heapUsedMB}MB / ${heapTotalMB}MB (${percentUsed.toFixed(1)}%)`,
  };
}

function determineOverallStatus(
  checks: HealthStatus["checks"],
): HealthStatus["status"] {
  const results = Object.values(checks);

  if (results.some((c) => c.status === "fail")) {
    return "unhealthy";
  }

  if (results.some((c) => c.status === "warn")) {
    return "degraded";
  }

  return "healthy";
}

export async function GET() {
  const [database, memory] = await Promise.all([
    checkDatabase(),
    Promise.resolve(checkMemory()),
  ]);

  const checks = { database, memory };
  const status = determineOverallStatus(checks);

  const health: HealthStatus = {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.0.0",
    uptime: Math.round((Date.now() - startTime) / 1000),
    checks,
  };

  const httpStatus =
    status === "healthy" ? 200 : status === "degraded" ? 200 : 503;

  return NextResponse.json(health, { status: httpStatus });
}
