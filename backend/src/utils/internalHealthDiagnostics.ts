import { execSync } from "child_process";

let resolvedGitCommit: string | null | undefined;
export const startupTimestamp = new Date().toISOString();

export const getInternalApiKeyMetadata = () => {
  const internalApiKey = process.env.INTERNAL_API_KEY?.trim();

  return {
    internalApiKeyLoaded: Boolean(internalApiKey),
    internalApiKeyLength: internalApiKey?.length || 0,
  };
};

export const getGitCommit = () => {
  if (resolvedGitCommit !== undefined) {
    return resolvedGitCommit;
  }

  const envGitCommit =
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    process.env.SOURCE_VERSION;

  if (envGitCommit?.trim()) {
    resolvedGitCommit = envGitCommit.trim();
    return resolvedGitCommit;
  }

  try {
    resolvedGitCommit = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    resolvedGitCommit = null;
  }

  return resolvedGitCommit;
};

export const getBuildTimestamp = () =>
  process.env.BUILD_TIMESTAMP?.trim() ||
  process.env.BUILD_TIME?.trim() ||
  process.env.RENDER_BUILD_TIMESTAMP?.trim() ||
  null;

export const getServiceName = () =>
  process.env.RENDER_SERVICE_NAME?.trim() ||
  process.env.SERVICE_NAME?.trim() ||
  process.env.npm_package_name?.trim() ||
  "backend";

export const getDeploymentMetadata = () => ({
  applicationStartTime: startupTimestamp,
  renderInstanceId:
    process.env.RENDER_INSTANCE_ID?.trim() ||
    process.env.RENDER_INSTANCE?.trim() ||
    process.env.HOSTNAME?.trim() ||
    null,
  renderServiceName:
    process.env.RENDER_SERVICE_NAME?.trim() ||
    process.env.RENDER_SERVICE_ID?.trim() ||
    null,
  gitCommit: getGitCommit(),
  buildTimestamp: getBuildTimestamp(),
  nodeVersion: process.version,
});
