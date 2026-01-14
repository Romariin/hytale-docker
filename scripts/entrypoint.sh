#!/bin/bash
# =============================================================================
# Hytale Server Docker Entrypoint
# =============================================================================

set -euo pipefail

# =============================================================================
# Load modules
# =============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/config.sh"
source "${SCRIPT_DIR}/lib/logging.sh"
source "${SCRIPT_DIR}/lib/preflight.sh"
source "${SCRIPT_DIR}/lib/download.sh"
source "${SCRIPT_DIR}/lib/oauth.sh"
source "${SCRIPT_DIR}/lib/server.sh"

# =============================================================================
# Signal Handler
# =============================================================================
cleanup() {
    log_info "Shutting down..."
    cleanup_auth
    [[ -n "${SERVER_PID:-}" ]] && kill -TERM "${SERVER_PID}" 2>/dev/null
    [[ -n "${STDIN_PID:-}" ]] && kill "${STDIN_PID}" 2>/dev/null
    exec 3>&- 2>/dev/null
    rm -f "${SERVER_INPUT}"
    exit 0
}
trap cleanup SIGTERM SIGINT SIGQUIT

# =============================================================================
# Main
# =============================================================================
main() {
    print_header "Hytale-Docker" "Docs: https://hytale.romarin.dev/docs/quick-start"
    
    preflight_checks
    
    # Authenticate - tokens will be used by both downloader and server
    log_step "Authenticating with Hytale..."
    ensure_downloader_auth || log_warn "Pre-auth failed, downloader will prompt"
    
    # Download server files (uses OAuth token)
    if [[ -f "${SERVER_JAR}" ]] && [[ -f "${ASSETS_ZIP}" ]] && [[ "${FORCE_UPDATE:-false}" != "true" ]]; then
        log_success "Server files cached"
    else
        download_server || {
            [[ -f "${SERVER_JAR}" ]] && log_warn "Using cached files" || exit 1
        }
    fi
    
    # Create game session for the server
    log_step "Creating game session..."
    if load_oauth_tokens 2>/dev/null; then
        if ! get_profiles; then
            log_warn "Failed to fetch profiles"
        elif [[ -z "${PROFILE_UUID:-}" ]]; then
            # Profile selection required - wait for user
            log_warn "Waiting for profile selection..."
            log_info "Run: docker exec -it hytale-server hytale-auth profile select <n>"
            
            # Wait for profile selection (check every 5 seconds)
            while [[ -z "${PROFILE_UUID:-}" ]]; do
                sleep 5
                load_selected_profile 2>/dev/null || true
            done
            log_success "Profile selected: ${PROFILE_USERNAME}"
        fi
        
        if [[ -n "${PROFILE_UUID:-}" ]]; then
            create_game_session || log_warn "Session creation failed"
        fi
    fi
    
    # Setup I/O and start server
    setup_server_io
    start_server
    start_auth_monitor
    
    # Wait for server to exit
    wait ${SERVER_PID} 2>/dev/null
    exit_code=$?
    
    cleanup
    exit "${exit_code}"
}

main "$@"
