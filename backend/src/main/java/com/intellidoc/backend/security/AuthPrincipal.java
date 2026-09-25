package com.intellidoc.backend.security;

import java.util.UUID;

public record AuthPrincipal(UUID userId, UUID tenantId) {
}
