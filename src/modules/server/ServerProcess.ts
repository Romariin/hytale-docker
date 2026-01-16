import { existsSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import type { Subprocess } from "bun";
import type { ILogger, Paths, LaunchOptions, ServerHandle } from "../../types";
import type { Config } from "../core/Config";

const IPC_SOCKET_PATH = "/tmp/hytale.sock";

/**
 * Server process management with Unix socket IPC
 */
export class ServerProcess {
  private proc: Subprocess<"pipe", "pipe", "pipe"> | null = null;
  private socketServer: ReturnType<typeof Bun.listen> | null = null;
  private outputBuffer: string[] = [];

  constructor(
    private readonly logger: ILogger,
    private readonly config: Config,
    private readonly paths: Paths,
  ) {}

  buildOptions(sessionToken?: string, identityToken?: string, ownerUuid?: string): LaunchOptions {
    const aotPath = `${this.paths.SERVER_DIR}/Server/HytaleServer.aot`;
    return {
      javaOpts: this.config.javaOpts,
      serverJar: this.paths.SERVER_JAR,
      assetsZip: this.paths.ASSETS_ZIP,
      serverPort: this.config.serverPort,
      sessionToken,
      identityToken,
      ownerUuid,
      disableSentry: this.config.disableSentry,
      extraArgs: this.config.extraArgs,
      aotCachePath: this.config.useAotCache && existsSync(aotPath) ? aotPath : undefined,
    };
  }

  start(options: LaunchOptions): ServerHandle {
    const args = this.buildArgs(options);

    this.logger.step(`Launching server on port ${options.serverPort}`);
    this.logger.info(`Memory: ${options.javaOpts}`);
    this.logger.divider();
    console.log("");

    this.proc = Bun.spawn(["java", ...args], {
      cwd: this.paths.SERVER_DIR,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Stream stdout
    this.streamOutput(this.proc.stdout);
    this.streamOutput(this.proc.stderr);

    // Start Unix socket for hytale-cmd
    this.startSocketServer();

    return {
      pid: this.proc.pid,
      kill: () => {
        this.stopSocketServer();
        this.proc?.kill();
      },
      wait: () => this.proc!.exited,
    };
  }

  /**
   * Start Unix socket server for command IPC
   */
  private startSocketServer(): void {
    // Clean up old socket synchronously
    try {
      Bun.spawnSync(["rm", "-f", IPC_SOCKET_PATH]);
    } catch {
      // ignore
    }

    const self = this;

    try {
      this.socketServer = Bun.listen({
        unix: IPC_SOCKET_PATH,
        socket: {
          data(socket, data) {
            const command = Buffer.from(data).toString().trim();
            if (command && self.proc) {
              self.proc.stdin.write(`${command}\n`);
              // Send back recent output after a short delay
              setTimeout(() => {
                const recent = self.outputBuffer.slice(-20).join("\n");
                socket.write(recent);
                socket.end();
              }, 300);
            }
          },
          open() {},
          close() {},
          error(socket, error) {
            self.logger.warn(`Socket error: ${error.message}`);
          },
        },
      });

      this.logger.info(`IPC socket listening at ${IPC_SOCKET_PATH}`);
    } catch (error) {
      this.logger.error(`Failed to start IPC socket: ${(error as Error).message}`);
    }
  }

  private stopSocketServer(): void {
    this.socketServer?.stop();
    try {
      Bun.spawnSync(["rm", "-f", IPC_SOCKET_PATH]);
    } catch {
      // ignore
    }
  }

  /**
   * Send a command to the server stdin
   */
  async sendCommand(command: string): Promise<string> {
    if (!this.proc) throw new Error("Server not running");

    const linesBefore = this.outputBuffer.length;
    this.proc.stdin.write(`${command}\n`);

    await Bun.sleep(500);

    return this.outputBuffer.slice(linesBefore).join("\n");
  }

  private async streamOutput(stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      process.stdout.write(text);

      // Buffer for command responses
      for (const line of text.split("\n")) {
        if (line.trim()) this.outputBuffer.push(line);
      }

      // Keep buffer reasonable
      if (this.outputBuffer.length > 1000) {
        this.outputBuffer = this.outputBuffer.slice(-500);
      }

      // Also write to log file
      await appendFile(this.paths.SERVER_OUTPUT, text).catch(() => {});
    }
  }

  private buildArgs(options: LaunchOptions): string[] {
    const args: string[] = [];

    args.push(...options.javaOpts.split(" ").filter(Boolean));

    if (options.aotCachePath) {
      args.push(`-XX:AOTCache=${options.aotCachePath}`);
    }

    args.push("-jar", options.serverJar);
    args.push("--assets", options.assetsZip);
    args.push("--bind", `0.0.0.0:${options.serverPort}`);

    if (options.sessionToken) args.push("--session-token", options.sessionToken);
    if (options.identityToken) args.push("--identity-token", options.identityToken);
    if (options.ownerUuid) args.push("--owner-uuid", options.ownerUuid);
    if (options.disableSentry) args.push("--disable-sentry");
    if (options.extraArgs) args.push(...options.extraArgs.split(" ").filter(Boolean));

    return args;
  }
}
