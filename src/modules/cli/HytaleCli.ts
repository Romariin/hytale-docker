import { existsSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import type { ILogger } from "../../types";
import type { Config } from "../core/Config";
import type { TokenStore, OAuthClient, ProfileManager, SessionManager, AuthService } from "../auth";
import { CurseForgeManager } from "../server/CurseForgeManager";
import type { UpdateManager } from "../server/UpdateManager";

const IPC_SOCKET_PATH = "/tmp/hytale.sock";
const PENDING_UPDATE_FILE = "/server/.pending_update";

type MainCommand = "auth" | "cmd" | "mods" | "update" | "help";
type AuthSubCommand = "login" | "refresh" | "session" | "profile" | "status" | "export" | "logout";
type ModsSubCommand = "list" | "update";

interface ParsedArgs {
  help: boolean;
  json: boolean;
  args: string[];
}

/**
 * Unified Hytale CLI
 */
export class HytaleCli {
  constructor(
    private readonly logger: ILogger,
    private readonly config: Config,
    private readonly tokenStore: TokenStore,
    private readonly oauthClient: OAuthClient,
    private readonly profileManager: ProfileManager,
    private readonly sessionManager: SessionManager,
    private readonly authService: AuthService,
    private readonly updateManager?: UpdateManager,
  ) {}

  async run(argv: string[]): Promise<void> {
    const args = argv.slice(2);
    const mainCommand = args.shift() as MainCommand | undefined;
    const parsed = this.parseOptions(args);

    if (parsed.help && !mainCommand) {
      this.printMainUsage();
      return;
    }

    if (!mainCommand || mainCommand === "help") {
      this.printMainUsage();
      return;
    }

    switch (mainCommand) {
      case "auth":
        return this.handleAuth(parsed);
      case "cmd":
        return this.handleCmd(parsed);
      case "mods":
        return this.handleMods(parsed);
      case "update":
        return this.handleUpdate(parsed);
      default:
        this.logger.error(`Unknown command: ${mainCommand}`);
        this.printMainUsage();
    }
  }

  private parseOptions(args: string[]): ParsedArgs {
    const options: ParsedArgs = { help: false, json: false, args: [...args] };
    for (let i = options.args.length - 1; i >= 0; i--) {
      if (options.args[i] === "-h" || options.args[i] === "--help") {
        options.help = true;
        options.args.splice(i, 1);
      } else if (options.args[i] === "--json") {
        options.json = true;
        options.args.splice(i, 1);
      }
    }
    return options;
  }

  private printMainUsage(): void {
    console.log(`
Hytale Server CLI

Usage: hytale <command> [subcommand] [options]

Commands:
  auth    Authentication management (login, tokens, profiles)
  cmd     Send commands to running server
  mods    CurseForge mod management
  update  Schedule or check server/downloader updates

Options:
  -h, --help    Show help

Examples:
  hytale auth login
  hytale auth profile list
  hytale cmd /help
  hytale mods list
  hytale update check
  hytale update schedule
`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH
  // ─────────────────────────────────────────────────────────────────────────

  private async handleAuth(parsed: ParsedArgs): Promise<void> {
    const subCommand = parsed.args.shift() as AuthSubCommand | undefined;

    if (parsed.help || !subCommand) {
      this.printAuthUsage();
      return;
    }

    switch (subCommand) {
      case "login":
        return this.authLogin();
      case "refresh":
        return this.authRefresh();
      case "session":
        return this.authSession(parsed.json);
      case "profile":
        return this.authProfile(parsed.args, parsed.json);
      case "status":
        return this.authService.printStatus();
      case "export":
        return this.authExport(parsed.json);
      case "logout":
        return this.authLogout();
      default:
        this.logger.error(`Unknown auth command: ${subCommand}`);
        this.printAuthUsage();
    }
  }

  private printAuthUsage(): void {
    console.log(`
Hytale Auth Commands

Usage: hytale auth <command> [options]

Commands:
  login               Start device code authentication
  refresh             Refresh OAuth AND session tokens
  session             Create a new game session
  profile list        List available profiles
  profile select <n>  Select profile by number or UUID
  status              Show token status
  export              Export tokens as env vars
  logout              Clear all tokens

Options:
  --json              Output JSON (session/export)
`);
  }

  private async authLogin(): Promise<void> {
    console.log("\nHytale Device Code Authentication\n");
    const device = await this.oauthClient.requestDeviceCode();
    await this.oauthClient.pollForToken(device);
    this.logger.success("Authentication complete!");
    console.log("\nNext: hytale auth session\n");
  }

  private async authRefresh(): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found. Run 'hytale auth login' first.");
      process.exit(1);
    }

    const refreshedOAuth = await this.oauthClient.refreshToken(oauth.refreshToken);
    this.logger.success("OAuth tokens refreshed");

    const session = await this.tokenStore.loadSessionTokens();
    if (session) {
      this.logger.step("Refreshing game session...");
      const refreshedSession = await this.sessionManager.refresh(session.sessionToken);

      if (refreshedSession) {
        this.logger.success("Session tokens refreshed");
      } else {
        this.logger.warn("Session refresh failed, creating new session...");
        const profiles = await this.oauthClient.getProfiles(refreshedOAuth.accessToken);
        const selected = await this.profileManager.select(profiles);
        if (selected) {
          await this.sessionManager.create(selected.uuid, refreshedOAuth.accessToken);
          this.logger.success("New session created");
        }
      }
    } else {
      this.logger.info("No session to refresh");
    }
  }

  private async authSession(json: boolean): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found. Run 'hytale auth login' first.");
      process.exit(1);
    }

    const profiles = await this.oauthClient.getProfiles(oauth.accessToken);
    const selected = await this.profileManager.select(profiles);
    if (!selected) return;

    const session = await this.sessionManager.create(selected.uuid, oauth.accessToken);

    if (json) {
      console.log(JSON.stringify(session, null, 2));
    } else {
      this.logger.success("Game session created!");
    }
  }

  private async authProfile(args: string[], json: boolean): Promise<void> {
    const sub = args[0] ?? "list";

    if (sub === "list") {
      let profiles = await this.tokenStore.loadProfiles();
      if (!profiles) {
        const oauth = await this.tokenStore.loadOAuthTokens();
        if (!oauth) {
          this.logger.error("No OAuth tokens. Run 'hytale auth login' first.");
          process.exit(1);
        }
        profiles = await this.oauthClient.getProfiles(oauth.accessToken);
      }

      const selected = await this.tokenStore.loadSelectedProfile();
      console.log("\nAvailable Profiles:\n" + "─".repeat(39));
      for (const line of this.profileManager.formatList(profiles, selected?.uuid)) {
        console.log(line);
      }
      console.log(`\n${selected ? `Selected: ${selected.username}` : "No profile selected"}\n`);
      return;
    }

    if (sub === "select") {
      const selector = args[1];
      if (!selector) {
        this.logger.error("Specify profile number or UUID");
        process.exit(1);
      }
      const profiles = await this.tokenStore.loadProfiles();
      if (!profiles) {
        this.logger.error("No profiles cached. Run 'hytale auth profile list' first.");
        process.exit(1);
      }
      const selected = await this.profileManager.setSelection(profiles, selector);
      if (json) console.log(JSON.stringify(selected, null, 2));
      return;
    }

    this.logger.error(`Unknown: profile ${sub}`);
  }

  private async authExport(json: boolean): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found");
      process.exit(1);
    }

    const session = await this.tokenStore.loadSessionTokens();
    const selected = await this.tokenStore.loadSelectedProfile();

    if (json) {
      console.log(
        JSON.stringify(
          {
            HYTALE_SERVER_SESSION_TOKEN: session?.sessionToken ?? "",
            HYTALE_SERVER_IDENTITY_TOKEN: session?.identityToken ?? "",
            PROFILE_UUID: selected?.uuid ?? "",
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`export HYTALE_SERVER_SESSION_TOKEN="${session?.sessionToken ?? ""}"`);
      console.log(`export HYTALE_SERVER_IDENTITY_TOKEN="${session?.identityToken ?? ""}"`);
      if (selected) console.log(`export PROFILE_UUID="${selected.uuid}"`);
    }
  }

  private async authLogout(): Promise<void> {
    this.logger.step("Clearing all tokens");
    await this.authService.terminateSession();
    await this.tokenStore.clearAll();
    this.logger.success("All tokens cleared");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CMD
  // ─────────────────────────────────────────────────────────────────────────

  private async handleCmd(parsed: ParsedArgs): Promise<void> {
    if (parsed.help) {
      this.printCmdUsage();
      return;
    }

    if (parsed.args.length === 0) {
      this.printCmdUsage();
      return;
    }

    if (!existsSync(IPC_SOCKET_PATH)) {
      this.logger.error("Server not running");
      process.exit(1);
    }

    const command = parsed.args.join(" ");

    try {
      await new Promise<void>((resolve, reject) => {
        Bun.connect({
          unix: IPC_SOCKET_PATH,
          socket: {
            data(_socket, data) {
              const response = Buffer.from(data).toString();
              if (response.trim()) {
                console.log(response);
              }
            },
            open(socket) {
              socket.write(command);
              setTimeout(() => {
                socket.end();
                resolve();
              }, 500);
            },
            close() {
              resolve();
            },
            error(_socket, error) {
              reject(error);
            },
          },
        });
      });
    } catch (error) {
      this.logger.error(`Failed to connect: ${(error as Error).message}`);
      process.exit(1);
    }
  }

  private printCmdUsage(): void {
    console.log(`
Hytale Server Commands

Usage: hytale cmd <command>

Sends a command to the running Hytale server.

Examples:
  hytale cmd /help
  hytale cmd /list
  hytale cmd /stop
`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────────────────

  private async handleUpdate(parsed: ParsedArgs): Promise<void> {
    const subCommand = parsed.args.shift() as "schedule" | "cancel" | "status" | "check" | undefined;

    if (parsed.help || !subCommand) {
      this.printUpdateUsage();
      return;
    }

    switch (subCommand) {
      case "schedule":
        return this.updateSchedule();
      case "cancel":
        return this.updateCancel();
      case "status":
        return this.updateStatus();
      case "check":
        return this.updateCheck(parsed.json);
      default:
        this.logger.error(`Unknown update command: ${subCommand}`);
        this.printUpdateUsage();
    }
  }

  private printUpdateUsage(): void {
    console.log(`
Hytale Server Update

Usage: hytale update <command>

Commands:
  check       Check if updates are available for downloader and server
  schedule    Schedule an update for the next container restart
  cancel      Cancel a scheduled update
  status      Check if an update is scheduled

Options:
  --json      Output JSON (check command)

Note: If AUTO_UPDATE=true, updates happen automatically.
      Use this to manually trigger updates when AUTO_UPDATE=false.

Examples:
  hytale update check
  hytale update check --json
  hytale update schedule
  hytale update status
  hytale update cancel
`);
  }

  private async updateSchedule(): Promise<void> {
    if (this.config.autoUpdate) {
      this.logger.info("AUTO_UPDATE is enabled - updates happen automatically");
      return;
    }

    await writeFile(PENDING_UPDATE_FILE, new Date().toISOString());
    this.logger.success("Update scheduled for next container restart");
    this.logger.info("Restart the container to apply the update");
  }

  private async updateCancel(): Promise<void> {
    if (!existsSync(PENDING_UPDATE_FILE)) {
      this.logger.info("No update scheduled");
      return;
    }

    await unlink(PENDING_UPDATE_FILE);
    this.logger.success("Scheduled update cancelled");
  }

  private async updateStatus(): Promise<void> {
    if (this.config.autoUpdate) {
      this.logger.info("AUTO_UPDATE=true - updates happen automatically on startup");
      return;
    }

    if (existsSync(PENDING_UPDATE_FILE)) {
      const { readFile } = await import("node:fs/promises");
      const scheduledAt = await readFile(PENDING_UPDATE_FILE, "utf-8");
      this.logger.info(`Update scheduled at: ${scheduledAt}`);
      this.logger.info("Restart the container to apply the update");
    } else {
      this.logger.info("No update scheduled");
      this.logger.info("Run 'hytale update schedule' to schedule an update");
    }
  }

  private async updateCheck(json: boolean): Promise<void> {
    if (!this.updateManager) {
      this.logger.error("Update checking is not available in this environment");
      process.exit(1);
    }

    this.logger.step("Checking for updates...");

    const [downloaderResult, serverResult] = await Promise.all([
      this.updateManager.checkDownloaderUpdate(),
      this.updateManager.checkServerUpdate(),
    ]);

    if (json) {
      console.log(
        JSON.stringify(
          {
            downloader: downloaderResult,
            server: serverResult,
            hasUpdates: downloaderResult.updateAvailable || serverResult.updateAvailable,
          },
          null,
          2,
        ),
      );
      return;
    }

    // Human-readable output
    console.log("\nUpdate Status:\n" + "─".repeat(50));

    // Downloader
    if (downloaderResult.updateAvailable) {
      this.logger.warn(
        `⚠️  Downloader: ${downloaderResult.currentVersion ?? "not installed"} → ${downloaderResult.latestVersion}`,
      );
    } else {
      this.logger.success(`✅ Downloader: ${downloaderResult.currentVersion ?? "not installed"} (up to date)`);
    }

    // Server
    if (serverResult.updateAvailable) {
      this.logger.warn(
        `⚠️  Server: ${serverResult.currentVersion ?? "not installed"} → ${serverResult.latestVersion}`,
      );
    } else {
      this.logger.success(`✅ Server: ${serverResult.currentVersion ?? "not installed"} (up to date)`);
    }

    console.log("");

    if (downloaderResult.updateAvailable || serverResult.updateAvailable) {
      if (this.config.autoUpdate) {
        this.logger.info("AUTO_UPDATE=true - updates will apply on next restart");
      } else {
        this.logger.info("Run 'hytale update schedule' to schedule the update");
        this.logger.info("Or set AUTO_UPDATE=true to enable automatic updates");
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODS
  // ─────────────────────────────────────────────────────────────────────────

  private async handleMods(parsed: ParsedArgs): Promise<void> {
    const subCommand = parsed.args.shift() as ModsSubCommand | undefined;

    if (parsed.help || !subCommand) {
      this.printModsUsage();
      return;
    }

    switch (subCommand) {
      case "list":
        return this.modsList();
      case "update":
        return this.modsUpdate(parsed.args);
      default:
        this.logger.error(`Unknown mods command: ${subCommand}`);
        this.printModsUsage();
    }
  }

  private printModsUsage(): void {
    console.log(`
Hytale CurseForge Mods

Usage: hytale mods <command>

Commands:
  list                  List installed CurseForge mods
  update <projectId>    Force update a specific mod to latest version

Environment:
  CF_API_KEY    CurseForge API key (required)
  CF_MODS       Comma-separated mod list in docker-compose.yml

Examples:
  hytale mods list
  hytale mods update 123456
`);
  }

  private getCurseForgeManager(): CurseForgeManager {
    if (!this.config.cfApiKey) {
      this.logger.error("CF_API_KEY environment variable not set");
      process.exit(1);
    }
    return new CurseForgeManager(this.logger, this.config.cfApiKey);
  }

  private async modsList(): Promise<void> {
    const { readFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");

    const manifestPath = "/server/mods/.curseforge-manifest.json";

    if (!existsSync(manifestPath)) {
      this.logger.info("No CurseForge mods installed");
      return;
    }

    try {
      const content = await readFile(manifestPath, "utf-8");
      const manifest = JSON.parse(content) as { mods: Array<{ projectId: number; fileId: number; fileName: string; installedAt: string }> };

      if (manifest.mods.length === 0) {
        this.logger.info("No CurseForge mods installed");
        return;
      }

      console.log("\nInstalled CurseForge Mods:\n" + "─".repeat(50));
      for (const mod of manifest.mods) {
        console.log(`  ${mod.projectId}:${mod.fileId} → ${mod.fileName}`);
      }
      console.log("");
    } catch {
      this.logger.error("Failed to read mod manifest");
    }
  }

  private async modsUpdate(args: string[]): Promise<void> {
    const projectIdStr = args[0];
    if (!projectIdStr) {
      this.logger.error("Specify a project ID to update");
      process.exit(1);
    }

    const projectId = Number.parseInt(projectIdStr, 10);
    if (Number.isNaN(projectId)) {
      this.logger.error("Invalid project ID");
      process.exit(1);
    }

    const cfManager = this.getCurseForgeManager();

    // Force update by syncing with fileId set to null (latest)
    await cfManager.updateMod(projectId);
  }
}
