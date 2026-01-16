/**
 * Credentials file format for hytale-downloader
 */
export interface DownloaderCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/**
 * Version tracking information
 */
export interface VersionInfo {
  currentVersion: string;
  currentPatchline: string;
  lastUpdate: string;
}

/**
 * Result of checking for updates
 */
export interface UpdateCheckResult {
  currentVersion: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
}
