import type { Paths, RuntimeEnv } from "../../types";

const SERVER_DIR = "/server";

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Runtime configuration from environment variables
 */
export class Config {
  readonly paths: Paths;
  readonly javaOpts: string;
  readonly serverPort: number;
  readonly patchline: string;
  readonly forceUpdate: boolean;
  readonly autoUpdate: boolean;
  readonly useAotCache: boolean;
  readonly disableSentry: boolean;
  readonly autoRefreshTokens: boolean;
  readonly autoSelectProfile: boolean;
  readonly extraArgs: string;
  // CurseForge mod support
  readonly cfApiKey: string | null;
  readonly cfMods: string;

  constructor(env: RuntimeEnv = process.env) {
    const tokenDir = env.HYTALE_TOKEN_DIR ?? `${SERVER_DIR}/.hytale/tokens`;

    this.paths = {
      SERVER_DIR,
      SERVER_JAR: `${SERVER_DIR}/Server/HytaleServer.jar`,
      ASSETS_ZIP: `${SERVER_DIR}/Assets.zip`,
      VERSION_FILE: `${SERVER_DIR}/.downloader_version`,
      VERSION_INFO_FILE: `${SERVER_DIR}/.version_info`,
      HYTALE_DOWNLOADER: "/usr/local/bin/hytale-downloader",
      SERVER_INPUT: "/tmp/server_input",
      SERVER_OUTPUT: "/tmp/server_output.log",
      TOKEN_DIR: tokenDir,
      OAUTH_TOKEN_FILE: `${tokenDir}/oauth_tokens.json`,
      SESSION_TOKEN_FILE: `${tokenDir}/session_tokens.json`,
      PROFILE_CACHE_FILE: `${tokenDir}/profiles.json`,
      SELECTED_PROFILE_FILE: `${tokenDir}/selected_profile.json`,
      DOWNLOADER_CREDENTIALS_FILE: `${SERVER_DIR}/.cache/.hytale-downloader-credentials.json`,
    };

    this.javaOpts = env.JAVA_OPTS ?? "-Xms4G -Xmx8G";
    this.serverPort = parseNumber(env.SERVER_PORT, 5520);
    this.patchline = env.PATCHLINE ?? "release";
    this.forceUpdate = parseBool(env.FORCE_UPDATE, false);
    this.autoUpdate = parseBool(env.AUTO_UPDATE, false);
    this.useAotCache = parseBool(env.USE_AOT_CACHE, true);
    this.disableSentry = parseBool(env.DISABLE_SENTRY, false);
    this.autoRefreshTokens = parseBool(env.AUTO_REFRESH_TOKENS, true);
    this.autoSelectProfile = parseBool(env.AUTOSELECT_GAME_PROFILE, true);
    this.extraArgs = env.EXTRA_ARGS ?? "";
    // CurseForge mod support
    this.cfApiKey = env.CF_API_KEY ?? null;
    this.cfMods = env.CF_MODS ?? "";
  }
}
