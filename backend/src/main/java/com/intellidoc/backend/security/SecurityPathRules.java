package com.intellidoc.backend.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpMethod;

public final class SecurityPathRules {

    private SecurityPathRules() {
    }

    public static boolean isPublic(HttpServletRequest request) {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        if ("/health".equals(path) || "/api/v1/health".equals(path)) {
            return true;
        }
        return HttpMethod.POST.matches(request.getMethod())
                && ("/auth/login".equals(path) || "/api/v1/auth/login".equals(path));
    }
}
