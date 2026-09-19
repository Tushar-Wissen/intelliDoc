package com.intellidoc.backend.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

@Component
public class JwtTokenProvider {

    private final SecretKey key;
    private final Duration expiry;

    public JwtTokenProvider(
            @Value("${intellidoc.jwt.secret}") String secret,
            @Value("${intellidoc.jwt.expiry-seconds:86400}") long expirySeconds) {
        byte[] bytes = secret.getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("JWT_SECRET must be at least 32 bytes for HS256");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.expiry = Duration.ofSeconds(expirySeconds);
    }

    public String generateToken(UUID userId, UUID tenantId) {
        return generateToken(userId, tenantId, expiry);
    }

    public String generateToken(UUID userId, UUID tenantId, Duration ttl) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenantId", tenantId.toString())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(ttl)))
                .signWith(key)
                .compact();
    }

    public String generateExpiredToken(UUID userId, UUID tenantId) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(userId.toString())
                .claim("tenantId", tenantId.toString())
                .issuedAt(Date.from(now.minus(Duration.ofHours(2))))
                .expiration(Date.from(now.minus(Duration.ofHours(1))))
                .signWith(key)
                .compact();
    }

    public AuthPrincipal validateAndParse(String token) {
        try {
            Claims claims = Jwts.parser()
                    .verifyWith(key)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
            UUID userId = UUID.fromString(claims.getSubject());
            UUID tenantId = UUID.fromString(claims.get("tenantId", String.class));
            return new AuthPrincipal(userId, tenantId);
        } catch (JwtException | IllegalArgumentException ex) {
            throw new InvalidTokenException(ex);
        }
    }

    public static class InvalidTokenException extends RuntimeException {
        public InvalidTokenException(Throwable cause) {
            super(cause);
        }
    }
}
