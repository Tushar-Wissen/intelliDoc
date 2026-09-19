package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.LoginResponseDto;
import com.intellidoc.backend.dto.UserProfileDto;
import com.intellidoc.backend.exception.InvalidCredentialsException;
import com.intellidoc.backend.exception.UserNotFoundException;
import com.intellidoc.backend.model.UserAccountEntity;
import com.intellidoc.backend.repository.UserAccountRepository;
import com.intellidoc.backend.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserAccountRepository userAccountRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenProvider jwtTokenProvider;

    @Transactional(readOnly = true)
    public LoginResponseDto login(String email, String password) {
        String normalized = normalizeEmail(email);
        UserAccountEntity user = userAccountRepository.findByEmailIgnoreCase(normalized)
                .orElseThrow(() -> {
                    log.warn("Login failed for unknown or unmatched credentials: {}", maskEmail(normalized));
                    return new InvalidCredentialsException();
                });

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            log.warn("Login failed for unknown or unmatched credentials: {}", maskEmail(normalized));
            throw new InvalidCredentialsException();
        }

        String token = jwtTokenProvider.generateToken(user.getId(), user.getTenantId());
        log.info("Login succeeded for userId={}", user.getId());
        return LoginResponseDto.builder()
                .token(token)
                .user(toProfile(user))
                .build();
    }

    @Transactional(readOnly = true)
    public UserProfileDto getCurrentUser(UUID userId) {
        UserAccountEntity user = userAccountRepository.findById(userId)
                .orElseThrow(UserNotFoundException::new);
        return toProfile(user);
    }

    private UserProfileDto toProfile(UserAccountEntity user) {
        return UserProfileDto.builder()
                .id(user.getId())
                .displayName(user.getDisplayName())
                .role(user.getRole())
                .build();
    }

    static String normalizeEmail(String email) {
        return email == null ? null : email.trim().toLowerCase();
    }

    static String maskEmail(String email) {
        if (email == null || !email.contains("@")) {
            return "***";
        }
        int at = email.indexOf('@');
        String local = email.substring(0, at);
        String domain = email.substring(at);
        if (local.isEmpty()) {
            return "***" + domain;
        }
        return local.charAt(0) + "***" + domain;
    }
}
