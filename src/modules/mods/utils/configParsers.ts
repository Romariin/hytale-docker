import type { ModEntry } from "../../../types/ModProvider";

/**
 * Parse CurseForge mods configuration string
 * Format: "projectId,projectId:fileId"
 * Example: "123456,789012:456789"
 *
 * @param config CF_MODS environment variable value
 * @returns Array of CurseForge mod entries
 */
export function parseCurseForgeConfig(config: string): ModEntry[] {
  if (!config.trim()) {
    return [];
  }

  return config.split(",").map((entry) => {
    const trimmed = entry.trim();
    const [projectId, fileId] = trimmed.split(":");

    // Validate project ID is numeric
    const projectIdNum = Number.parseInt(projectId, 10);
    if (Number.isNaN(projectIdNum)) {
      throw new Error(`Invalid CurseForge project ID: ${projectId}`);
    }

    // Validate file ID if provided
    if (fileId) {
      const fileIdNum = Number.parseInt(fileId, 10);
      if (Number.isNaN(fileIdNum)) {
        throw new Error(`Invalid CurseForge file ID: ${fileId}`);
      }
    }

    return {
      provider: "curseforge",
      projectId: projectId, // Keep as string
      version: fileId, // undefined if not specified
    };
  });
}

/**
 * Parse Modtale mods configuration string
 * Format: "uuid,uuid:version"
 * Example: "550e8400-e29b-41d4-a716-446655440000,650e8400-e29b-41d4-a716-446655440001:1.2.3"
 *
 * @param config MT_MODS environment variable value
 * @returns Array of Modtale mod entries
 */
export function parseModtaleConfig(config: string): ModEntry[] {
  if (!config.trim()) {
    return [];
  }

  return config.split(",").map((entry) => {
    const trimmed = entry.trim();
    const [projectId, version] = trimmed.split(":");

    // Basic UUID validation (simple check for UUID format)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(projectId)) {
      throw new Error(`Invalid Modtale project ID (expected UUID): ${projectId}`);
    }

    // Basic semantic version validation if version is provided
    if (version) {
      const semverPattern = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/;
      if (!semverPattern.test(version)) {
        throw new Error(`Invalid Modtale version (expected semver): ${version}`);
      }
    }

    return {
      provider: "modtale",
      projectId,
      version, // undefined = latest
    };
  });
}
