#!/bin/bash
# =============================================================================
# Hytale OAuth2 Authentication Module
# Implements RFC 8628 Device Code Flow for Hytale Server Authentication
# Based on: https://support.hytale.com/hc/en-us/articles/45328341414043
# =============================================================================

# -----------------------------------------------------------------------------
# OAuth2 Configuration (from official docs)
# -----------------------------------------------------------------------------
readonly OAUTH_CLIENT_ID="hytale-server"
readonly OAUTH_SCOPES="openid offline auth:server"

# Endpoints
readonly OAUTH_DEVICE_AUTH_URL="https://oauth.accounts.hytale.com/oauth2/device/auth"
readonly OAUTH_TOKEN_URL="https://oauth.accounts.hytale.com/oauth2/token"
readonly ACCOUNT_PROFILES_URL="https://account-data.hytale.com/my-account/get-profiles"
readonly SESSION_NEW_URL="https://sessions.hytale.com/game-session/new"
readonly SESSION_REFRESH_URL="https://sessions.hytale.com/game-session/refresh"
readonly SESSION_DELETE_URL="https://sessions.hytale.com/game-session"

# Token storage paths
readonly TOKEN_DIR="${HOME}/.config/hytale/tokens"
readonly OAUTH_TOKEN_FILE="${TOKEN_DIR}/oauth_tokens.json"
readonly SESSION_TOKEN_FILE="${TOKEN_DIR}/session_tokens.json"
readonly PROFILE_CACHE_FILE="${TOKEN_DIR}/profiles.json"
readonly SELECTED_PROFILE_FILE="${TOKEN_DIR}/selected_profile.json"

# Token lifetimes (seconds)
readonly ACCESS_TOKEN_LIFETIME=3600      # 1 hour
readonly REFRESH_TOKEN_LIFETIME=2592000  # 30 days
readonly SESSION_TOKEN_LIFETIME=3600     # 1 hour
readonly REFRESH_BEFORE_EXPIRY=300       # Refresh 5 minutes before expiry

# -----------------------------------------------------------------------------
# Initialize token storage
# -----------------------------------------------------------------------------
init_token_storage() {
    mkdir -p "${TOKEN_DIR}"
    chmod 700 "${TOKEN_DIR}"
}

# -----------------------------------------------------------------------------
# Device Code Flow - Step 1: Request device code
# -----------------------------------------------------------------------------
request_device_code() {
    log_step "Requesting device authorization code"
    
    local response
    response=$(curl -sS -X POST "${OAUTH_DEVICE_AUTH_URL}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${OAUTH_CLIENT_ID}" \
        -d "scope=${OAUTH_SCOPES}" \
        2>&1)
    
    local curl_exit=$?
    if [[ $curl_exit -ne 0 ]]; then
        log_error "Failed to request device code: ${response}"
        return 1
    fi
    
    # Parse response
    local device_code user_code verification_uri verification_uri_complete expires_in interval
    device_code=$(echo "${response}" | jq -r '.device_code // empty')
    user_code=$(echo "${response}" | jq -r '.user_code // empty')
    verification_uri=$(echo "${response}" | jq -r '.verification_uri // empty')
    verification_uri_complete=$(echo "${response}" | jq -r '.verification_uri_complete // empty')
    expires_in=$(echo "${response}" | jq -r '.expires_in // 900')
    interval=$(echo "${response}" | jq -r '.interval // 5')
    
    if [[ -z "${device_code}" ]] || [[ -z "${user_code}" ]]; then
        log_error "Invalid device code response: ${response}"
        return 1
    fi
    
    # Export for use in polling
    export DEVICE_CODE="${device_code}"
    export DEVICE_CODE_EXPIRES_IN="${expires_in}"
    export DEVICE_CODE_INTERVAL="${interval}"
    
    # Display authorization prompt
    echo ""
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_BOLD}  DEVICE AUTHORIZATION REQUIRED${C_RESET}"
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "  ${C_BOLD}Visit:${C_RESET} ${C_CYAN}${verification_uri}${C_RESET}"
    echo -e "  ${C_BOLD}Code:${C_RESET}  ${C_CYAN}${user_code}${C_RESET}"
    echo ""
    echo -e "  ${C_DIM}Or open directly:${C_RESET}"
    echo -e "  ${C_CYAN}${verification_uri_complete}${C_RESET}"
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "  ${C_DIM}Code expires in ${expires_in} seconds${C_RESET}"
    echo ""
    
    return 0
}

# -----------------------------------------------------------------------------
# Device Code Flow - Step 2: Poll for token
# -----------------------------------------------------------------------------
poll_for_token() {
    local device_code="${DEVICE_CODE}"
    local expires_in="${DEVICE_CODE_EXPIRES_IN:-900}"
    local interval="${DEVICE_CODE_INTERVAL:-5}"
    
    log_step "Waiting for authorization (polling every ${interval}s)..."
    
    local elapsed=0
    while [[ $elapsed -lt $expires_in ]]; do
        sleep "${interval}"
        elapsed=$((elapsed + interval))
        
        local response
        response=$(curl -sS -X POST "${OAUTH_TOKEN_URL}" \
            -H "Content-Type: application/x-www-form-urlencoded" \
            -d "client_id=${OAUTH_CLIENT_ID}" \
            -d "grant_type=urn:ietf:params:oauth:grant-type:device_code" \
            -d "device_code=${device_code}" \
            2>&1)
        
        # Check for errors
        local error
        error=$(echo "${response}" | jq -r '.error // empty')
        
        case "${error}" in
            "authorization_pending")
                # User hasn't authorized yet, continue polling
                continue
                ;;
            "slow_down")
                # Server says slow down, increase interval
                interval=$((interval + 5))
                log_warn "Rate limited, slowing down to ${interval}s intervals"
                continue
                ;;
            "expired_token")
                log_error "Device code expired. Please restart authentication."
                return 1
                ;;
            "access_denied")
                log_error "Authorization denied by user"
                return 1
                ;;
            "")
                # No error - check for tokens
                local access_token refresh_token token_expires_in
                access_token=$(echo "${response}" | jq -r '.access_token // empty')
                refresh_token=$(echo "${response}" | jq -r '.refresh_token // empty')
                token_expires_in=$(echo "${response}" | jq -r '.expires_in // 3600')
                
                if [[ -n "${access_token}" ]]; then
                    log_success "Authorization successful!"
                    save_oauth_tokens "${access_token}" "${refresh_token}" "${token_expires_in}"
                    return 0
                fi
                ;;
            *)
                log_error "Token error: ${error}"
                return 1
                ;;
        esac
    done
    
    log_error "Device code expired (timeout)"
    return 1
}

# -----------------------------------------------------------------------------
# Save OAuth tokens to file
# -----------------------------------------------------------------------------
save_oauth_tokens() {
    local access_token="$1"
    local refresh_token="$2"
    local expires_in="${3:-3600}"
    
    local expires_at=$(($(date +%s) + expires_in))
    
    init_token_storage
    
    cat > "${OAUTH_TOKEN_FILE}" <<EOF
{
    "access_token": "${access_token}",
    "refresh_token": "${refresh_token}",
    "expires_at": ${expires_at},
    "created_at": $(date +%s)
}
EOF
    chmod 600 "${OAUTH_TOKEN_FILE}"
    log_success "OAuth tokens saved"
}

# -----------------------------------------------------------------------------
# Load OAuth tokens from file
# -----------------------------------------------------------------------------
load_oauth_tokens() {
    if [[ ! -f "${OAUTH_TOKEN_FILE}" ]]; then
        return 1
    fi
    
    export OAUTH_ACCESS_TOKEN=$(jq -r '.access_token // empty' "${OAUTH_TOKEN_FILE}")
    export OAUTH_REFRESH_TOKEN=$(jq -r '.refresh_token // empty' "${OAUTH_TOKEN_FILE}")
    export OAUTH_EXPIRES_AT=$(jq -r '.expires_at // 0' "${OAUTH_TOKEN_FILE}")
    
    if [[ -z "${OAUTH_ACCESS_TOKEN}" ]] || [[ -z "${OAUTH_REFRESH_TOKEN}" ]]; then
        return 1
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# Check if OAuth access token needs refresh
# -----------------------------------------------------------------------------
oauth_token_needs_refresh() {
    local expires_at="${OAUTH_EXPIRES_AT:-0}"
    local now=$(date +%s)
    local refresh_at=$((expires_at - REFRESH_BEFORE_EXPIRY))
    
    [[ $now -ge $refresh_at ]]
}

# -----------------------------------------------------------------------------
# Refresh OAuth access token using refresh token
# -----------------------------------------------------------------------------
refresh_oauth_token() {
    local refresh_token="${OAUTH_REFRESH_TOKEN}"
    
    if [[ -z "${refresh_token}" ]]; then
        log_error "No refresh token available"
        return 1
    fi
    
    log_step "Refreshing OAuth access token"
    
    local response
    response=$(curl -sS -X POST "${OAUTH_TOKEN_URL}" \
        -H "Content-Type: application/x-www-form-urlencoded" \
        -d "client_id=${OAUTH_CLIENT_ID}" \
        -d "grant_type=refresh_token" \
        -d "refresh_token=${refresh_token}" \
        2>&1)
    
    local error
    error=$(echo "${response}" | jq -r '.error // empty')
    
    if [[ -n "${error}" ]]; then
        log_error "Token refresh failed: ${error}"
        return 1
    fi
    
    local access_token new_refresh_token expires_in
    access_token=$(echo "${response}" | jq -r '.access_token // empty')
    new_refresh_token=$(echo "${response}" | jq -r '.refresh_token // empty')
    expires_in=$(echo "${response}" | jq -r '.expires_in // 3600')
    
    if [[ -z "${access_token}" ]]; then
        log_error "No access token in refresh response"
        return 1
    fi
    
    # Use new refresh token if provided, otherwise keep old one
    [[ -z "${new_refresh_token}" ]] && new_refresh_token="${refresh_token}"
    
    save_oauth_tokens "${access_token}" "${new_refresh_token}" "${expires_in}"
    load_oauth_tokens
    
    log_success "OAuth token refreshed (expires in ${expires_in}s)"
    return 0
}

# -----------------------------------------------------------------------------
# Get user profiles from Hytale account
# -----------------------------------------------------------------------------
get_profiles() {
    local access_token="${OAUTH_ACCESS_TOKEN}"
    
    if [[ -z "${access_token}" ]]; then
        log_error "No access token available"
        return 1
    fi
    
    log_step "Fetching game profiles"
    
    local response
    response=$(curl -sS -X GET "${ACCOUNT_PROFILES_URL}" \
        -H "Authorization: Bearer ${access_token}" \
        -H "Accept: application/json" \
        2>&1)
    
    local http_code
    http_code=$(curl -sS -o /dev/null -w "%{http_code}" -X GET "${ACCOUNT_PROFILES_URL}" \
        -H "Authorization: Bearer ${access_token}" \
        -H "Accept: application/json" \
        2>&1)
    
    if [[ "${http_code}" != "200" ]]; then
        log_error "Failed to get profiles: HTTP ${http_code}"
        return 1
    fi
    
    # Save profiles to cache
    echo "${response}" > "${PROFILE_CACHE_FILE}"
    chmod 600 "${PROFILE_CACHE_FILE}"
    
    # Extract profile info
    local owner profiles_count
    owner=$(echo "${response}" | jq -r '.owner // empty')
    profiles_count=$(echo "${response}" | jq '.profiles | length')
    
    log_success "Found ${profiles_count} profile(s) for account ${owner:0:8}..."
    
    # Handle profile selection based on AUTOSELECT_GAME_PROFILE
    select_profile
    
    return 0
}

# -----------------------------------------------------------------------------
# Select game profile (auto or manual)
# -----------------------------------------------------------------------------
select_profile() {
    local profiles_count
    profiles_count=$(jq '.profiles | length' "${PROFILE_CACHE_FILE}")
    
    # Check for previously selected profile
    if [[ -f "${SELECTED_PROFILE_FILE}" ]]; then
        local saved_uuid saved_username
        saved_uuid=$(jq -r '.uuid // empty' "${SELECTED_PROFILE_FILE}")
        saved_username=$(jq -r '.username // empty' "${SELECTED_PROFILE_FILE}")
        
        # Verify saved profile still exists in account
        if jq -e ".profiles[] | select(.uuid == \"${saved_uuid}\")" "${PROFILE_CACHE_FILE}" >/dev/null 2>&1; then
            export PROFILE_UUID="${saved_uuid}"
            export PROFILE_USERNAME="${saved_username}"
            log_info "Using saved profile: ${PROFILE_USERNAME} (${PROFILE_UUID:0:8}...)"
            return 0
        else
            log_warn "Saved profile no longer exists, re-selecting..."
            rm -f "${SELECTED_PROFILE_FILE}"
        fi
    fi
    
    # Single profile - always auto-select
    if [[ ${profiles_count} -eq 1 ]]; then
        export PROFILE_UUID=$(jq -r '.profiles[0].uuid' "${PROFILE_CACHE_FILE}")
        export PROFILE_USERNAME=$(jq -r '.profiles[0].username' "${PROFILE_CACHE_FILE}")
        save_selected_profile "${PROFILE_UUID}" "${PROFILE_USERNAME}"
        log_info "Using profile: ${PROFILE_USERNAME} (${PROFILE_UUID:0:8}...)"
        return 0
    fi
    
    # Multiple profiles - check AUTOSELECT_GAME_PROFILE
    if [[ "${AUTOSELECT_GAME_PROFILE:-true}" == "true" ]]; then
        # Auto-select first profile
        export PROFILE_UUID=$(jq -r '.profiles[0].uuid' "${PROFILE_CACHE_FILE}")
        export PROFILE_USERNAME=$(jq -r '.profiles[0].username' "${PROFILE_CACHE_FILE}")
        save_selected_profile "${PROFILE_UUID}" "${PROFILE_USERNAME}"
        log_info "Auto-selected profile: ${PROFILE_USERNAME} (${PROFILE_UUID:0:8}...)"
        return 0
    fi
    
    # Manual selection required - show profiles and prompt
    echo ""
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "${C_BOLD}  PROFILE SELECTION REQUIRED${C_RESET}"
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo -e "  ${C_DIM}Multiple profiles found. Select one to continue:${C_RESET}"
    echo ""
    list_profiles_formatted
    echo ""
    echo -e "  ${C_BOLD}Run:${C_RESET} ${C_CYAN}hytale-auth profile select <number>${C_RESET}"
    echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
    echo ""
    
    # Set empty to indicate selection needed
    export PROFILE_UUID=""
    export PROFILE_USERNAME=""
    return 1
}

# -----------------------------------------------------------------------------
# Save selected profile
# -----------------------------------------------------------------------------
save_selected_profile() {
    local uuid="$1"
    local username="$2"
    
    init_token_storage
    
    cat > "${SELECTED_PROFILE_FILE}" <<EOF
{
    "uuid": "${uuid}",
    "username": "${username}",
    "selected_at": $(date +%s)
}
EOF
    chmod 600 "${SELECTED_PROFILE_FILE}"
}

# -----------------------------------------------------------------------------
# Load selected profile from file
# -----------------------------------------------------------------------------
load_selected_profile() {
    if [[ ! -f "${SELECTED_PROFILE_FILE}" ]]; then
        return 1
    fi
    
    export PROFILE_UUID=$(jq -r '.uuid // empty' "${SELECTED_PROFILE_FILE}")
    export PROFILE_USERNAME=$(jq -r '.username // empty' "${SELECTED_PROFILE_FILE}")
    
    if [[ -z "${PROFILE_UUID}" ]]; then
        return 1
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# List profiles in formatted output
# -----------------------------------------------------------------------------
list_profiles_formatted() {
    if [[ ! -f "${PROFILE_CACHE_FILE}" ]]; then
        log_error "No profiles cached. Run authentication first."
        return 1
    fi
    
    local count
    count=$(jq '.profiles | length' "${PROFILE_CACHE_FILE}")
    
    for ((i=0; i<count; i++)); do
        local username uuid
        username=$(jq -r ".profiles[$i].username" "${PROFILE_CACHE_FILE}")
        uuid=$(jq -r ".profiles[$i].uuid" "${PROFILE_CACHE_FILE}")
        
        # Check if this is the currently selected profile
        local marker="  "
        if [[ -f "${SELECTED_PROFILE_FILE}" ]]; then
            local selected_uuid
            selected_uuid=$(jq -r '.uuid' "${SELECTED_PROFILE_FILE}")
            [[ "${uuid}" == "${selected_uuid}" ]] && marker="${C_GREEN}► ${C_RESET}"
        fi
        
        echo -e "  ${marker}${C_BOLD}$((i+1))${C_RESET}. ${username} ${C_DIM}(${uuid:0:8}...)${C_RESET}"
    done
}

# -----------------------------------------------------------------------------
# Select profile by index (1-based) or UUID
# -----------------------------------------------------------------------------
set_profile_selection() {
    local selector="$1"
    
    if [[ ! -f "${PROFILE_CACHE_FILE}" ]]; then
        log_error "No profiles cached. Run authentication first."
        return 1
    fi
    
    local uuid username
    
    # Check if selector is a number (index) or UUID
    if [[ "${selector}" =~ ^[0-9]+$ ]]; then
        # Index-based selection (1-based)
        local index=$((selector - 1))
        local count
        count=$(jq '.profiles | length' "${PROFILE_CACHE_FILE}")
        
        if [[ ${index} -lt 0 ]] || [[ ${index} -ge ${count} ]]; then
            log_error "Invalid profile number. Valid range: 1-${count}"
            return 1
        fi
        
        uuid=$(jq -r ".profiles[${index}].uuid" "${PROFILE_CACHE_FILE}")
        username=$(jq -r ".profiles[${index}].username" "${PROFILE_CACHE_FILE}")
    else
        # UUID-based selection
        local profile
        profile=$(jq ".profiles[] | select(.uuid == \"${selector}\")" "${PROFILE_CACHE_FILE}")
        
        if [[ -z "${profile}" ]]; then
            log_error "Profile with UUID '${selector}' not found"
            return 1
        fi
        
        uuid=$(echo "${profile}" | jq -r '.uuid')
        username=$(echo "${profile}" | jq -r '.username')
    fi
    
    save_selected_profile "${uuid}" "${username}"
    export PROFILE_UUID="${uuid}"
    export PROFILE_USERNAME="${username}"
    
    log_success "Selected profile: ${username} (${uuid:0:8}...)"
    return 0
}

# -----------------------------------------------------------------------------
# Create new game session
# -----------------------------------------------------------------------------
create_game_session() {
    local profile_uuid="${PROFILE_UUID:-$1}"
    local access_token="${OAUTH_ACCESS_TOKEN}"
    
    if [[ -z "${profile_uuid}" ]]; then
        log_error "No profile UUID available"
        return 1
    fi
    
    if [[ -z "${access_token}" ]]; then
        log_error "No access token available"
        return 1
    fi
    
    log_step "Creating game session for profile ${profile_uuid:0:8}..."
    
    local response
    response=$(curl -sS -X POST "${SESSION_NEW_URL}" \
        -H "Authorization: Bearer ${access_token}" \
        -H "Content-Type: application/json" \
        -d "{\"uuid\": \"${profile_uuid}\"}" \
        2>&1)
    
    # Check for error
    local error
    error=$(echo "${response}" | jq -r '.error // empty')
    
    if [[ -n "${error}" ]]; then
        local error_desc
        error_desc=$(echo "${response}" | jq -r '.error_description // .message // empty')
        log_error "Failed to create session: ${error} - ${error_desc}"
        return 1
    fi
    
    # Extract session tokens
    local session_token identity_token expires_at
    session_token=$(echo "${response}" | jq -r '.sessionToken // empty')
    identity_token=$(echo "${response}" | jq -r '.identityToken // empty')
    expires_at=$(echo "${response}" | jq -r '.expiresAt // empty')
    
    if [[ -z "${session_token}" ]] || [[ -z "${identity_token}" ]]; then
        log_error "Invalid session response: missing tokens"
        return 1
    fi
    
    # Save session tokens
    save_session_tokens "${session_token}" "${identity_token}" "${expires_at}"
    
    log_success "Game session created (expires: ${expires_at})"
    return 0
}

# -----------------------------------------------------------------------------
# Save session tokens to file
# -----------------------------------------------------------------------------
save_session_tokens() {
    local session_token="$1"
    local identity_token="$2"
    local expires_at="$3"
    
    init_token_storage
    
    # Convert ISO timestamp to epoch
    local expires_epoch
    expires_epoch=$(date -d "${expires_at}" +%s 2>/dev/null || echo $(($(date +%s) + SESSION_TOKEN_LIFETIME)))
    
    cat > "${SESSION_TOKEN_FILE}" <<EOF
{
    "session_token": "${session_token}",
    "identity_token": "${identity_token}",
    "expires_at": "${expires_at}",
    "expires_epoch": ${expires_epoch},
    "created_at": $(date +%s)
}
EOF
    chmod 600 "${SESSION_TOKEN_FILE}"
    
    # Export for server use
    export HYTALE_SERVER_SESSION_TOKEN="${session_token}"
    export HYTALE_SERVER_IDENTITY_TOKEN="${identity_token}"
}

# -----------------------------------------------------------------------------
# Load session tokens from file
# -----------------------------------------------------------------------------
load_session_tokens() {
    if [[ ! -f "${SESSION_TOKEN_FILE}" ]]; then
        return 1
    fi
    
    export HYTALE_SERVER_SESSION_TOKEN=$(jq -r '.session_token // empty' "${SESSION_TOKEN_FILE}")
    export HYTALE_SERVER_IDENTITY_TOKEN=$(jq -r '.identity_token // empty' "${SESSION_TOKEN_FILE}")
    export SESSION_EXPIRES_EPOCH=$(jq -r '.expires_epoch // 0' "${SESSION_TOKEN_FILE}")
    
    if [[ -z "${HYTALE_SERVER_SESSION_TOKEN}" ]] || [[ -z "${HYTALE_SERVER_IDENTITY_TOKEN}" ]]; then
        return 1
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# Check if session token needs refresh
# -----------------------------------------------------------------------------
session_needs_refresh() {
    local expires_epoch="${SESSION_EXPIRES_EPOCH:-0}"
    local now=$(date +%s)
    local refresh_at=$((expires_epoch - REFRESH_BEFORE_EXPIRY))
    
    [[ $now -ge $refresh_at ]]
}

# -----------------------------------------------------------------------------
# Refresh game session
# -----------------------------------------------------------------------------
refresh_game_session() {
    local session_token="${HYTALE_SERVER_SESSION_TOKEN}"
    
    if [[ -z "${session_token}" ]]; then
        log_warn "No session token, creating new session"
        return 1
    fi
    
    log_step "Refreshing game session"
    
    local response
    response=$(curl -sS -X POST "${SESSION_REFRESH_URL}" \
        -H "Authorization: Bearer ${session_token}" \
        -H "Content-Type: application/json" \
        2>&1)
    
    # Check for new tokens
    local new_session_token new_identity_token expires_at
    new_session_token=$(echo "${response}" | jq -r '.sessionToken // empty')
    new_identity_token=$(echo "${response}" | jq -r '.identityToken // empty')
    expires_at=$(echo "${response}" | jq -r '.expiresAt // empty')
    
    if [[ -n "${new_session_token}" ]] && [[ -n "${new_identity_token}" ]]; then
        save_session_tokens "${new_session_token}" "${new_identity_token}" "${expires_at}"
        log_success "Game session refreshed"
        return 0
    fi
    
    log_warn "Session refresh failed, will create new session"
    return 1
}

# -----------------------------------------------------------------------------
# Terminate game session (call on shutdown)
# -----------------------------------------------------------------------------
terminate_session() {
    local session_token="${HYTALE_SERVER_SESSION_TOKEN}"
    
    if [[ -z "${session_token}" ]]; then
        return 0
    fi
    
    log_step "Terminating game session"
    
    curl -sS -X DELETE "${SESSION_DELETE_URL}" \
        -H "Authorization: Bearer ${session_token}" \
        >/dev/null 2>&1
    
    log_success "Game session terminated"
}

# -----------------------------------------------------------------------------
# Full authentication flow
# -----------------------------------------------------------------------------
perform_full_auth() {
    init_token_storage
    
    # Try to load existing tokens
    if load_oauth_tokens; then
        log_info "Found existing OAuth tokens"
        
        # Check if access token needs refresh
        if oauth_token_needs_refresh; then
            if ! refresh_oauth_token; then
                log_warn "Token refresh failed, starting new auth flow"
                return 1
            fi
        fi
        
        # Get profiles and create session
        if get_profiles && create_game_session; then
            return 0
        fi
    fi
    
    # No valid tokens - start device code flow
    log_info "Starting device code authentication"
    
    if ! request_device_code; then
        return 1
    fi
    
    if ! poll_for_token; then
        return 1
    fi
    
    # Reload tokens after successful auth
    load_oauth_tokens
    
    if ! get_profiles; then
        return 1
    fi
    
    if ! create_game_session; then
        return 1
    fi
    
    return 0
}

# -----------------------------------------------------------------------------
# Ensure valid tokens (call before operations)
# -----------------------------------------------------------------------------
ensure_valid_tokens() {
    # First check session tokens
    if load_session_tokens; then
        if ! session_needs_refresh; then
            log_info "Session tokens valid"
            return 0
        fi
        
        # Try to refresh session
        if refresh_game_session; then
            return 0
        fi
    fi
    
    # Need to create new session - ensure OAuth tokens are valid
    if load_oauth_tokens; then
        if oauth_token_needs_refresh; then
            if ! refresh_oauth_token; then
                log_error "Cannot refresh OAuth token"
                return 1
            fi
        fi
        
        # Get profiles and create new session
        if get_profiles && create_game_session; then
            return 0
        fi
    fi
    
    log_error "No valid tokens available. Run device auth flow."
    return 1
}

# -----------------------------------------------------------------------------
# Start background token refresh daemon
# -----------------------------------------------------------------------------
start_token_refresh_daemon() {
    (
        while true; do
            sleep 60  # Check every minute
            
            # Refresh session if needed
            if load_session_tokens && session_needs_refresh; then
                if ! refresh_game_session; then
                    # Session refresh failed, try OAuth refresh + new session
                    if load_oauth_tokens; then
                        if oauth_token_needs_refresh; then
                            refresh_oauth_token
                        fi
                        get_profiles
                        create_game_session
                    fi
                fi
            fi
            
            # Refresh OAuth token if needed
            if load_oauth_tokens && oauth_token_needs_refresh; then
                refresh_oauth_token
            fi
        done
    ) &
    TOKEN_REFRESH_PID=$!
    log_info "Token refresh daemon started (PID: ${TOKEN_REFRESH_PID})"
}

# -----------------------------------------------------------------------------
# Print token status
# -----------------------------------------------------------------------------
print_token_status() {
    echo ""
    echo -e "${C_BOLD}Token Status:${C_RESET}"
    echo -e "${C_DIM}─────────────────────────────────────────${C_RESET}"
    
    if load_oauth_tokens; then
        local now=$(date +%s)
        local oauth_remaining=$((OAUTH_EXPIRES_AT - now))
        echo -e "  OAuth Access Token:  ${C_GREEN}Present${C_RESET} (expires in ${oauth_remaining}s)"
        echo -e "  OAuth Refresh Token: ${C_GREEN}Present${C_RESET}"
    else
        echo -e "  OAuth Tokens:        ${C_RED}Not found${C_RESET}"
    fi
    
    if load_session_tokens; then
        local now=$(date +%s)
        local session_remaining=$((SESSION_EXPIRES_EPOCH - now))
        echo -e "  Session Token:       ${C_GREEN}Present${C_RESET} (expires in ${session_remaining}s)"
        echo -e "  Identity Token:      ${C_GREEN}Present${C_RESET}"
    else
        echo -e "  Session Tokens:      ${C_RED}Not found${C_RESET}"
    fi
    
    if [[ -f "${PROFILE_CACHE_FILE}" ]]; then
        local username=$(jq -r '.profiles[0].username // "unknown"' "${PROFILE_CACHE_FILE}")
        echo -e "  Profile:             ${C_GREEN}${username}${C_RESET}"
    fi
    
    echo ""
}

# -----------------------------------------------------------------------------
# Start authentication monitor (token refresh daemon)
# -----------------------------------------------------------------------------
start_auth_monitor() {
    if [[ "${AUTO_REFRESH_TOKENS:-true}" == "true" ]]; then
        start_token_refresh_daemon
    fi
}

# -----------------------------------------------------------------------------
# Cleanup auth resources on shutdown
# -----------------------------------------------------------------------------
cleanup_auth() {
    # Terminate game session if we have tokens
    if [[ -n "${HYTALE_SERVER_SESSION_TOKEN:-}" ]]; then
        terminate_session 2>/dev/null || true
    fi
    
    # Kill token refresh daemon
    if [[ -n "${TOKEN_REFRESH_PID:-}" ]]; then
        kill "${TOKEN_REFRESH_PID}" 2>/dev/null || true
    fi
}
