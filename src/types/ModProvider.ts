/**
 * Unified mod provider type system
 * Supports CurseForge and Modtale providers
 */

export type ProviderType = "curseforge" | "modtale";

/**
 * A mod entry from configuration (CF_MODS or MT_MODS)
 */
export interface ModEntry {
  provider: ProviderType;
  projectId: string; // String to support both numeric (CF) and UUID (Modtale)
  version?: string; // fileId (CF) or semver (Modtale), undefined = latest
}

/**
 * Information about a mod from the provider API
 */
export interface ModInfo {
  provider: ProviderType;
  id: string;
  name: string;
  slug: string;
  summary?: string;
  downloadCount?: number;
  latestVersions: VersionInfo[];
}

/**
 * Information about a specific mod version/file
 */
export interface VersionInfo {
  id: string; // fileId or version number
  displayName: string;
  fileName: string;
  downloadUrl: string | null;
  releaseDate: string;
  fileSize: number;
}

/**
 * A mod that has been installed to /server/mods/
 */
export interface InstalledMod {
  provider: ProviderType;
  projectId: string;
  version: string;
  fileName: string;
  installedAt: string;
}

/**
 * Manifest file tracking installed mods for a specific provider
 * Stored at /server/mods/.{provider}-manifest.json
 */
export interface ModsManifest {
  provider: ProviderType;
  lastSync: string;
  mods: InstalledMod[];
}
