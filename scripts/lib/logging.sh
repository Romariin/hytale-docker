#!/bin/bash
# =============================================================================
# Logging utilities
# =============================================================================

# Colors
readonly C_RESET="\033[0m"
readonly C_BOLD="\033[1m"
readonly C_DIM="\033[2m"
readonly C_BLUE="\033[34m"
readonly C_GREEN="\033[32m"
readonly C_YELLOW="\033[33m"
readonly C_RED="\033[31m"
readonly C_CYAN="\033[36m"

# Logging functions
log_info()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_BLUE}INFO${C_RESET}  $*"; }
log_warn()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_YELLOW}WARN${C_RESET}  $*" >&2; }
log_error()   { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_RED}ERROR${C_RESET} $*" >&2; }
log_success() { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_GREEN}OK${C_RESET}    $*"; }
log_step()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_CYAN}►${C_RESET}     $*"; }

# Section header
print_header() {
    local title="$1"
    local subtitle="${2:-}"
    echo ""
    echo -e "${C_BOLD}${C_CYAN}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_BOLD}  ${title}${C_RESET}"
    [[ -n "${subtitle}" ]] && echo -e "  ${C_DIM}${subtitle}${C_RESET}"
    echo -e "${C_BOLD}${C_CYAN}═══════════════════════════════════════════════════════════${C_RESET}"
    echo ""
}

print_divider() {
    echo -e "${C_DIM}───────────────────────────────────────────────────────────${C_RESET}"
}
