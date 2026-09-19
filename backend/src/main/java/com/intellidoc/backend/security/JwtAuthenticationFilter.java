package com.intellidoc.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.intellidoc.backend.exception.ApiErrorBody;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtTokenProvider jwtTokenProvider;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        if (SecurityPathRules.isPublic(request)) {
            filterChain.doFilter(request, response);
            return;
        }

        String header = request.getHeader("Authorization");
        if (header == null || header.isBlank()) {
            writeUnauthorized(response, request, "AUTH_MISSING_TOKEN", "Authentication required.");
            return;
        }
        if (!header.startsWith("Bearer ")) {
            writeUnauthorized(response, request, "AUTH_TOKEN_INVALID", "Session expired or invalid.");
            return;
        }

        String token = header.substring(7).trim();
        if (token.isEmpty()) {
            writeUnauthorized(response, request, "AUTH_MISSING_TOKEN", "Authentication required.");
            return;
        }

        try {
            AuthPrincipal principal = jwtTokenProvider.validateAndParse(token);
            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());
            SecurityContextHolder.getContext().setAuthentication(authentication);
            filterChain.doFilter(request, response);
        } catch (JwtTokenProvider.InvalidTokenException ex) {
            writeUnauthorized(response, request, "AUTH_TOKEN_INVALID", "Session expired or invalid.");
        }
    }

    private void writeUnauthorized(
            HttpServletResponse response,
            HttpServletRequest request,
            String code,
            String message) throws IOException {
        String requestId = request.getHeader("X-Request-Id");
        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
        }
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        ApiErrorBody body = ApiErrorBody.builder()
                .error(ApiErrorBody.ApiError.builder()
                        .code(code)
                        .message(message)
                        .requestId(requestId)
                        .build())
                .build();
        objectMapper.writeValue(response.getOutputStream(), body);
    }
}
