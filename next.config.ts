import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();
const packageVersion = (JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8")) as { version?: string }).version || "0.0.0";
const schemaVersion = readdirSync(join(projectRoot, "supabase", "migrations")).filter(file => file.endsWith(".sql")).sort().at(-1)?.replace(/\.sql$/, "") || "unknown";
let gitCommit = process.env.VERCEL_GIT_COMMIT_SHA || "unknown";
if (gitCommit === "unknown") {
  try { gitCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).trim(); }
  catch {}
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: packageVersion,
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_ENV: process.env.VERCEL_ENV || process.env.NODE_ENV || "development",
    NEXT_PUBLIC_SCHEMA_VERSION: schemaVersion,
  },
};

export default nextConfig;
