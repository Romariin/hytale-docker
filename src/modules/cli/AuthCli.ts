import type { ILogger } from "../../types";
import type { Config } from "../core/Config";
import type { TokenStore, OAuthClient, ProfileManager, SessionManager, AuthService } from "../auth";

type Command = "login" | "refresh" | "session" | "profile" | "status" | "export" | "logout";

/**
 * Authentication CLI
 */
export class AuthCli {
  constructor(
    private readonly logger: ILogger,
    private readonly config: Config,
    private readonly tokenStore: TokenStore,
    private readonly oauthClient: OAuthClient,
    private readonly profileManager: ProfileManager,
    private readonly sessionManager: SessionManager,
    private readonly authService: AuthService,
  ) {}

  async run(argv: string[]): Promise<void> {
    const args = argv.slice(2);
    const command = args.shift() as Command | undefined;
    const options = this.parseOptions(args);

    if (options.help || !command) {
      this.printUsage();
      return;
    }

    switch (command) {
      case "login":
        return this.login();
      case "refresh":
        return this.refresh();
      case "session":
        return this.session(options.json);
      case "profile":
        return this.profile(args, options.json);
      case "status":
        return this.authService.printStatus();
      case "export":
        return this.export(options.json);
      case "logout":
        return this.logout();
      default:
        this.logger.error(`Unknown command: ${command}`);
        this.printUsage();
    }
  }

  private parseOptions(args: string[]): { help: boolean; json: boolean } {
    const options = { help: false, json: false };
    for (let i = args.length - 1; i >= 0; i--) {
      if (args[i] === "-h" || args[i] === "--help") {
        options.help = true;
        args.splice(i, 1);
      } else if (args[i] === "--json") {
        options.json = true;
        args.splice(i, 1);
      }
    }
    return options;
  }

  private printUsage(): void {
    console.log(`
Hytale Authentication CLI

Usage: hytale-auth <command> [options]

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
  -h, --help          Show help
  --json              Output JSON (session/export)
`);
  }

  private async login(): Promise<void> {
    console.log("\nHytale Device Code Authentication\n");
    const device = await this.oauthClient.requestDeviceCode();
    await this.oauthClient.pollForToken(device);
    this.logger.success("Authentication complete!");
    console.log("\nNext: hytale-auth session\n");
  }

  private async refresh(): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found. Run 'login' first.");
      process.exit(1);
    }

    // Refresh OAuth tokens
    const refreshedOAuth = await this.oauthClient.refreshToken(oauth.refreshToken);
    this.logger.success("OAuth tokens refreshed");

    // Try to refresh session if it exists
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

  private async session(json: boolean): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found. Run 'login' first.");
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

  private async profile(args: string[], json: boolean): Promise<void> {
    const sub = args[0] ?? "list";

    if (sub === "list") {
      let profiles = await this.tokenStore.loadProfiles();
      if (!profiles) {
        const oauth = await this.tokenStore.loadOAuthTokens();
        if (!oauth) {
          this.logger.error("No OAuth tokens. Run 'login' first.");
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
        this.logger.error("No profiles cached. Run 'profile list' first.");
        process.exit(1);
      }
      const selected = await this.profileManager.setSelection(profiles, selector);
      if (json) console.log(JSON.stringify(selected, null, 2));
      return;
    }

    this.logger.error(`Unknown: profile ${sub}`);
  }

  private async export(json: boolean): Promise<void> {
    const oauth = await this.tokenStore.loadOAuthTokens();
    if (!oauth) {
      this.logger.error("No OAuth tokens found");
      process.exit(1);
    }

    const session = await this.tokenStore.loadSessionTokens();
    const selected = await this.tokenStore.loadSelectedProfile();

    if (json) {
      console.log(
        JSON.stringify({
          HYTALE_SERVER_SESSION_TOKEN: session?.sessionToken ?? "",
          HYTALE_SERVER_IDENTITY_TOKEN: session?.identityToken ?? "",
          PROFILE_UUID: selected?.uuid ?? "",
        }, null, 2),
      );
    } else {
      console.log(`export HYTALE_SERVER_SESSION_TOKEN="${session?.sessionToken ?? ""}"`);
      console.log(`export HYTALE_SERVER_IDENTITY_TOKEN="${session?.identityToken ?? ""}"`);
      if (selected) console.log(`export PROFILE_UUID="${selected.uuid}"`);
    }
  }

  private async logout(): Promise<void> {
    this.logger.step("Clearing all tokens");
    await this.authService.terminateSession();
    await this.tokenStore.clearAll();
    this.logger.success("All tokens cleared");
  }
}
