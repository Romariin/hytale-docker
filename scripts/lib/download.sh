#!/bin/bash
# =============================================================================
# Server download and extraction
# =============================================================================

# Downloader credentials file path (matches hytale-downloader default)
readonly DOWNLOADER_CREDENTIALS_FILE="${SERVER_DIR}/.cache/.hytale-downloader-credentials.json"

# -----------------------------------------------------------------------------
# Write OAuth tokens to hytale-downloader credentials file
# -----------------------------------------------------------------------------
write_downloader_credentials() {
    local access_token="${OAUTH_ACCESS_TOKEN:-}"
    local refresh_token="${OAUTH_REFRESH_TOKEN:-}"
    local expires_at="${OAUTH_EXPIRES_AT:-0}"
    
    if [[ -z "${access_token}" ]] || [[ -z "${refresh_token}" ]]; then
        return 1
    fi
    
    mkdir -p "$(dirname "${DOWNLOADER_CREDENTIALS_FILE}")"
    
    # Write in the format hytale-downloader expects
    cat > "${DOWNLOADER_CREDENTIALS_FILE}" <<EOF
{
    "access_token": "${access_token}",
    "refresh_token": "${refresh_token}",
    "expires_at": ${expires_at}
}
EOF
    chmod 600 "${DOWNLOADER_CREDENTIALS_FILE}"
    log_success "Credentials written for downloader"
    return 0
}

# -----------------------------------------------------------------------------
# Ensure we have valid OAuth tokens for downloader
# -----------------------------------------------------------------------------
ensure_downloader_auth() {
    # Check if we already have valid OAuth tokens
    if load_oauth_tokens 2>/dev/null; then
        if ! oauth_token_needs_refresh; then
            log_info "Using existing OAuth token for downloader"
            write_downloader_credentials
            return 0
        fi
        
        # Try to refresh
        if refresh_oauth_token 2>/dev/null; then
            log_success "OAuth token refreshed for downloader"
            write_downloader_credentials
            return 0
        fi
    fi
    
    # No valid tokens - need to authenticate
    log_step "Authenticating for server download"
    
    if ! request_device_code; then
        return 1
    fi
    
    if ! poll_for_token; then
        return 1
    fi
    
    load_oauth_tokens
    write_downloader_credentials
    return 0
}

check_for_updates() {
    local patchline="${PATCHLINE:-release}"
    
    if [[ ! -f "${VERSION_INFO_FILE}" ]]; then
        return 1  # No version info, needs download
    fi
    
    # Get current version info
    source "${VERSION_INFO_FILE}"
    local current_version="${CURRENT_VERSION:-unknown}"
    local current_patchline="${CURRENT_PATCHLINE:-release}"
    
    # Check latest version
    local latest_version
    latest_version=$("${HYTALE_DOWNLOADER}" -print-version -patchline "${patchline}" 2>/dev/null | grep -oP 'version \K[^)]+' | head -1)
    
    if [[ -z "${latest_version}" ]]; then
        log_warn "Could not check for updates"
        return 0
    fi
    
    if [[ "${current_patchline}" != "${patchline}" ]]; then
        log_step "Patchline changed: ${current_patchline} → ${patchline}"
        return 1
    fi
    
    if [[ "${current_version}" != "${latest_version}" ]]; then
        log_step "Update available: ${current_version} → ${latest_version}"
        return 1
    fi
    
    return 0
}

save_version_info() {
    local patchline="$1"
    local version="$2"
    
    cat > "${VERSION_INFO_FILE}" <<EOF
CURRENT_VERSION="${version}"
CURRENT_PATCHLINE="${patchline}"
LAST_UPDATE="$(date -u +"%Y-%m-%d %H:%M:%S UTC")"
EOF
    
    log_success "Version: ${version} (${patchline})"
}

download_server() {
    local patchline="${PATCHLINE:-release}"
    
    # Skip if files exist and FORCE_UPDATE is not set
    if [[ -f "${SERVER_JAR}" ]] && [[ -f "${ASSETS_ZIP}" ]]; then
        if [[ "${FORCE_UPDATE:-false}" != "true" ]]; then
            # Check for updates
            if check_for_updates; then
                log_success "Server files cached (up to date)"
                return 0
            fi
            log_step "Update detected, downloading"
        else
            log_step "Force update enabled, re-downloading"
        fi
    else
        log_step "Downloading server files"
    fi
    
    # Ensure we have auth tokens for the downloader
    ensure_downloader_auth || log_warn "Auth failed, downloader will prompt"
    
    # Download
    local download_dir="${SERVER_DIR}/.cache"
    mkdir -p "${download_dir}"
    cd "${download_dir}"
    
    # Run downloader (it reads credentials from DOWNLOADER_CREDENTIALS_FILE)
    local downloaded_version=""
    "${HYTALE_DOWNLOADER}" -patchline "${patchline}" -credentials-path "${DOWNLOADER_CREDENTIALS_FILE}" 2>&1 | while IFS= read -r line; do
        if [[ "$line" == *"https://oauth.accounts.hytale.com/oauth2/device/verify?user_code="* ]]; then
            # Extract the URL from the line (fallback if our token didn't work)
            local url=$(echo "$line" | grep -oP 'https://oauth\.accounts\.hytale\.com/oauth2/device/verify\?user_code=[^[:space:]]*' || echo "$line")
            # Display auth URL prominently
            echo ""
            echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
            echo -e "${C_BOLD}  AUTHENTICATION REQUIRED${C_RESET}"
            echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
            echo -e "  ${C_CYAN}${url}${C_RESET}"
            echo -e "${C_BOLD}${C_YELLOW}═══════════════════════════════════════════════════════════${C_RESET}"
            echo ""
        elif [[ "$line" == *"downloading latest"* ]]; then
            # Replace with cleaner message
            log_step "Downloading latest on ${patchline} patchline"
        elif [[ "$line" == *"successfully downloaded"* ]]; then
            # Capture version from success message
            downloaded_version=$(echo "$line" | grep -oP 'version \K[^)]+' || echo "")
        elif [[ "$line" == *"["*"="*"]"* ]] || [[ "$line" == *"validating checksum"* ]]; then
            # Skip progress bars, validation, and success messages
            :
        elif [[ "$line" == *"hytale.com"* ]]; then
            # Skip any other hytale.com URLs
            :
        elif [[ "$line" == *"visit"* ]] || [[ "$line" == *"authenticate"* ]] || [[ "$line" == *"Authorization"* ]] || [[ "$line" == *"user_code"* ]]; then
            # Skip auth instruction lines
            :
        else
            echo "$line"
        fi
    done
    local dl_status=${PIPESTATUS[0]}
    
    if [[ $dl_status -ne 0 ]]; then
        log_error "Download failed"
        cd "${SERVER_DIR}"
        return 1
    fi
    
    # Find and extract zip
    local zip_file
    zip_file=$(find "${download_dir}" -maxdepth 1 -name "*.zip" -type f | head -1)
    
    if [[ -z "${zip_file}" ]]; then
        log_error "No zip file found"
        cd "${SERVER_DIR}"
        return 1
    fi
    
    log_step "Extracting server files"
    unzip -oq "${zip_file}" -d "${SERVER_DIR}" || { log_error "Extraction failed"; return 1; }
    
    # Cleanup
    rm -rf "${download_dir}"
    cd "${SERVER_DIR}"
    
    # Verify
    [[ -f "${SERVER_JAR}" ]] || { log_error "Server JAR missing"; return 1; }
    [[ -f "${ASSETS_ZIP}" ]] || { log_error "Assets.zip missing"; return 1; }
    
    # Extract version from zip filename if not captured
    if [[ -z "${downloaded_version}" ]]; then
        local zip_name=$(basename "${zip_file}")
        downloaded_version=$(echo "${zip_name}" | grep -oP '\d{4}\.\d{2}\.\d{2}-[a-f0-9]+' || echo "unknown")
    fi
    
    # Save version info
    save_version_info "${patchline}" "${downloaded_version}"
    
    log_success "Server files ready"
    return 0
}
