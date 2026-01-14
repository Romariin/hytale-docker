#!/bin/bash
# =============================================================================
# Hytale Authentication CLI
# Standalone tool for obtaining and managing Hytale OAuth tokens
# =============================================================================

set -euo pipefail

# -----------------------------------------------------------------------------
# Load modules
# -----------------------------------------------------------------------------
# When installed to /usr/local/bin, lib is at /server/scripts/lib
if [[ -d "/server/scripts/lib" ]]; then
    LIB_DIR="/server/scripts/lib"
else
    LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"
fi

# Minimal logging (if not already defined)
if ! type log_info &>/dev/null; then
    C_RESET="\033[0m"
    C_BOLD="\033[1m"
    C_DIM="\033[2m"
    C_BLUE="\033[34m"
    C_GREEN="\033[32m"
    C_YELLOW="\033[33m"
    C_RED="\033[31m"
    C_CYAN="\033[36m"
    
    log_info()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_BLUE}INFO${C_RESET}  $*"; }
    log_warn()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_YELLOW}WARN${C_RESET}  $*" >&2; }
    log_error()   { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_RED}ERROR${C_RESET} $*" >&2; }
    log_success() { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_GREEN}OK${C_RESET}    $*"; }
    log_step()    { echo -e "${C_DIM}$(date '+%H:%M:%S')${C_RESET} ${C_CYAN}►${C_RESET}     $*"; }
fi

# Source OAuth module
source "${LIB_DIR}/oauth.sh"

# -----------------------------------------------------------------------------
# Usage
# -----------------------------------------------------------------------------
usage() {
    cat <<EOF
Hytale Authentication CLI

Usage: $(basename "$0") <command> [options]

Commands:
    login               Start device code authentication flow
    refresh             Refresh OAuth tokens
    session             Create a new game session
    profile list        List available game profiles
    profile select <n>  Select profile by number or UUID
    status              Show current token status
    export              Export tokens as environment variables
    logout              Clear all stored tokens

Options:
    -h, --help      Show this help message
    -q, --quiet     Suppress output (exit code only)
    --json          Output in JSON format (for session/export)

Examples:
    # First-time authentication
    $(basename "$0") login

    # List and select a profile
    $(basename "$0") profile list
    $(basename "$0") profile select 1

    # Create game session (after login + profile selection)
    $(basename "$0") session

    # Export tokens for use with server
    eval \$($(basename "$0") export)

    # Check token status
    $(basename "$0") status

Environment Variables:
    HYTALE_TOKEN_DIR          Override token storage directory
                              Default: ~/.config/hytale/tokens
    AUTOSELECT_GAME_PROFILE   Auto-select first profile if multiple (default: true)

EOF
    exit 0
}

# -----------------------------------------------------------------------------
# Commands
# -----------------------------------------------------------------------------
cmd_login() {
    echo ""
    echo -e "${C_BOLD}Hytale Device Code Authentication${C_RESET}"
    echo "==================================="
    echo ""
    
    if ! request_device_code; then
        exit 1
    fi
    
    if ! poll_for_token; then
        exit 1
    fi
    
    log_success "Authentication complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Run '$(basename "$0") session' to create a game session"
    echo "  2. Run '$(basename "$0") export' to get environment variables"
    echo ""
}

cmd_refresh() {
    if ! load_oauth_tokens; then
        log_error "No OAuth tokens found. Run 'login' first."
        exit 1
    fi
    
    if refresh_oauth_token; then
        log_success "Tokens refreshed successfully"
    else
        log_error "Token refresh failed"
        exit 1
    fi
}

cmd_session() {
    local json_output="${JSON_OUTPUT:-false}"
    
    if ! load_oauth_tokens; then
        log_error "No OAuth tokens found. Run 'login' first."
        exit 1
    fi
    
    # Refresh if needed
    if oauth_token_needs_refresh; then
        log_step "Refreshing OAuth token..."
        refresh_oauth_token || { log_error "Token refresh failed"; exit 1; }
    fi
    
    # Get profiles
    if ! get_profiles; then
        log_error "Failed to get profiles"
        exit 1
    fi
    
    # Create session
    if ! create_game_session; then
        log_error "Failed to create game session"
        exit 1
    fi
    
    if [[ "${json_output}" == "true" ]]; then
        cat "${SESSION_TOKEN_FILE}"
    else
        log_success "Game session created!"
        echo ""
        echo "Session tokens are stored in: ${SESSION_TOKEN_FILE}"
        echo ""
        echo "Use these with the server:"
        echo "  --session-token \"\${HYTALE_SERVER_SESSION_TOKEN}\""
        echo "  --identity-token \"\${HYTALE_SERVER_IDENTITY_TOKEN}\""
        echo ""
    fi
}

cmd_status() {
    print_token_status
}

cmd_export() {
    local json_output="${JSON_OUTPUT:-false}"
    
    if ! load_oauth_tokens; then
        log_error "No OAuth tokens found" >&2
        exit 1
    fi
    
    if ! load_session_tokens; then
        log_warn "No session tokens found. Run 'session' command." >&2
    fi
    
    if [[ "${json_output}" == "true" ]]; then
        cat <<EOF
{
    "HYTALE_SERVER_SESSION_TOKEN": "${HYTALE_SERVER_SESSION_TOKEN:-}",
    "HYTALE_SERVER_IDENTITY_TOKEN": "${HYTALE_SERVER_IDENTITY_TOKEN:-}",
    "OAUTH_ACCESS_TOKEN": "${OAUTH_ACCESS_TOKEN:-}",
    "OAUTH_REFRESH_TOKEN": "${OAUTH_REFRESH_TOKEN:-}",
    "PROFILE_UUID": "${PROFILE_UUID:-}"
}
EOF
    else
        # Output as shell export commands
        echo "export HYTALE_SERVER_SESSION_TOKEN=\"${HYTALE_SERVER_SESSION_TOKEN:-}\""
        echo "export HYTALE_SERVER_IDENTITY_TOKEN=\"${HYTALE_SERVER_IDENTITY_TOKEN:-}\""
        [[ -n "${PROFILE_UUID:-}" ]] && echo "export PROFILE_UUID=\"${PROFILE_UUID}\""
    fi
}

cmd_logout() {
    log_step "Clearing all stored tokens"
    
    # Terminate active session if possible
    if load_session_tokens; then
        terminate_session 2>/dev/null || true
    fi
    
    # Remove token files
    rm -f "${OAUTH_TOKEN_FILE}" "${SESSION_TOKEN_FILE}" "${PROFILE_CACHE_FILE}" "${SELECTED_PROFILE_FILE}" 2>/dev/null || true
    
    log_success "All tokens cleared"
}

cmd_profile() {
    local subcommand="${1:-list}"
    shift || true
    
    case "${subcommand}" in
        list)
            cmd_profile_list
            ;;
        select)
            cmd_profile_select "$@"
            ;;
        *)
            log_error "Unknown profile subcommand: ${subcommand}"
            echo "Usage: $(basename "$0") profile [list|select <n>]"
            exit 1
            ;;
    esac
}

cmd_profile_list() {
    # Ensure we have profiles cached
    if [[ ! -f "${PROFILE_CACHE_FILE}" ]]; then
        if ! load_oauth_tokens; then
            log_error "No OAuth tokens found. Run 'login' first."
            exit 1
        fi
        
        # Fetch profiles
        local access_token="${OAUTH_ACCESS_TOKEN}"
        local response
        response=$(curl -sS -X GET "${ACCOUNT_PROFILES_URL}" \
            -H "Authorization: Bearer ${access_token}" \
            -H "Accept: application/json" \
            2>&1)
        
        echo "${response}" > "${PROFILE_CACHE_FILE}"
        chmod 600 "${PROFILE_CACHE_FILE}"
    fi
    
    echo ""
    echo -e "${C_BOLD}Available Profiles:${C_RESET}"
    echo -e "${C_DIM}───────────────────────────────────────${C_RESET}"
    list_profiles_formatted
    echo ""
    
    if load_selected_profile; then
        echo -e "${C_DIM}Currently selected: ${PROFILE_USERNAME}${C_RESET}"
    else
        echo -e "${C_DIM}No profile selected yet${C_RESET}"
    fi
    echo ""
}

cmd_profile_select() {
    local selector="${1:-}"
    
    if [[ -z "${selector}" ]]; then
        log_error "Please specify a profile number or UUID"
        echo "Usage: $(basename "$0") profile select <number|uuid>"
        exit 1
    fi
    
    # Ensure we have profiles cached
    if [[ ! -f "${PROFILE_CACHE_FILE}" ]]; then
        cmd_profile_list >/dev/null
    fi
    
    if set_profile_selection "${selector}"; then
        echo ""
        echo "To create a game session with this profile, run:"
        echo "  $(basename "$0") session"
        echo ""
    else
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    local command="${1:-}"
    shift || true
    
    # Override token directory if specified
    if [[ -n "${HYTALE_TOKEN_DIR:-}" ]]; then
        TOKEN_DIR="${HYTALE_TOKEN_DIR}"
        OAUTH_TOKEN_FILE="${TOKEN_DIR}/oauth_tokens.json"
        SESSION_TOKEN_FILE="${TOKEN_DIR}/session_tokens.json"
        PROFILE_CACHE_FILE="${TOKEN_DIR}/profiles.json"
    fi
    
    # Parse global options
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                usage
                ;;
            -q|--quiet)
                exec >/dev/null
                shift
                ;;
            --json)
                JSON_OUTPUT="true"
                shift
                ;;
            *)
                break
                ;;
        esac
    done
    
    case "${command}" in
        login)
            cmd_login
            ;;
        refresh)
            cmd_refresh
            ;;
        session)
            cmd_session
            ;;
        profile)
            cmd_profile "$@"
            ;;
        status)
            cmd_status
            ;;
        export)
            cmd_export
            ;;
        logout)
            cmd_logout
            ;;
        -h|--help|"")
            usage
            ;;
        *)
            log_error "Unknown command: ${command}"
            echo "Run '$(basename "$0") --help' for usage"
            exit 1
            ;;
    esac
}

main "$@"
