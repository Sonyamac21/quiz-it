export type PlatformBuildInfo = {
  version: string;
  commit: string;
  builtAt: string;
  environment: string;
  schemaVersion: string;
};

export const BUILD_INFO: PlatformBuildInfo = Object.freeze({
  version: process.env.NEXT_PUBLIC_BUILD_VERSION || "0.1.0",
  commit: process.env.NEXT_PUBLIC_GIT_COMMIT || "unknown",
  builtAt: process.env.NEXT_PUBLIC_BUILD_DATE || "unknown",
  environment: process.env.NEXT_PUBLIC_BUILD_ENV || "development",
  schemaVersion: process.env.NEXT_PUBLIC_SCHEMA_VERSION || "unknown",
});
