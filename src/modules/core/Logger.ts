import type { ILogger } from "../../types";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

/**
 * Colored console logger
 */
export class Logger implements ILogger {
  info(message: string): void {
    console.log(`${DIM}${timestamp()}${RESET} ${BLUE}INFO${RESET}  ${message}`);
  }

  warn(message: string): void {
    console.warn(`${DIM}${timestamp()}${RESET} ${YELLOW}WARN${RESET}  ${message}`);
  }

  error(message: string): void {
    console.error(`${DIM}${timestamp()}${RESET} ${RED}ERROR${RESET} ${message}`);
  }

  success(message: string): void {
    console.log(`${DIM}${timestamp()}${RESET} ${GREEN}OK${RESET}    ${message}`);
  }

  step(message: string): void {
    console.log(`${DIM}${timestamp()}${RESET} ${CYAN}►${RESET}     ${message}`);
  }

  header(title: string, subtitle?: string): void {
    const line = "═".repeat(59);
    console.log("");
    console.log(`${BOLD}${CYAN}${line}${RESET}`);
    console.log(`${BOLD}  ${title}${RESET}`);
    if (subtitle) {
      console.log(`  ${DIM}${subtitle}${RESET}`);
    }
    console.log(`${BOLD}${CYAN}${line}${RESET}`);
    console.log("");
  }

  divider(): void {
    console.log(`${DIM}${"─".repeat(59)}${RESET}`);
  }
}
