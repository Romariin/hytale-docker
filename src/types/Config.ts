/**
 * Runtime environment variables from Docker/shell
 */
export interface RuntimeEnv {
  JAVA_OPTS?: string;
  SERVER_PORT?: string;
  PATCHLINE?: string;
  FORCE_UPDATE?: string;
  AUTO_UPDATE?: string;
  USE_AOT_CACHE?: string;
  DISABLE_SENTRY?: string;
  AUTO_REFRESH_TOKENS?: string;
  AUTOSELECT_GAME_PROFILE?: string;
  EXTRA_ARGS?: string;
  TZ?: string;
  HYTALE_TOKEN_DIR?: string;
  // CurseForge mod support
  CF_API_KEY?: string;
  CF_MODS?: string;
}

/**
 * File system paths used by the runtime
 */
export interface Paths {
  readonly SERVER_DIR: string;
  readonly SERVER_JAR: string;
  readonly ASSETS_ZIP: string;
  readonly VERSION_FILE: string;
  readonly VERSION_INFO_FILE: string;
  readonly HYTALE_DOWNLOADER: string;
  readonly SERVER_INPUT: string;
  readonly SERVER_OUTPUT: string;
  readonly TOKEN_DIR: string;
  readonly OAUTH_TOKEN_FILE: string;
  readonly SESSION_TOKEN_FILE: string;
  readonly PROFILE_CACHE_FILE: string;
  readonly SELECTED_PROFILE_FILE: string;
  readonly DOWNLOADER_CREDENTIALS_FILE: string;
}
