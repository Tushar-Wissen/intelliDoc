package com.intellidoc.backend.service;

import com.intellidoc.backend.dto.LoginResponseDto;
import com.intellidoc.backend.exception.InvalidCredentialsException;
import com.intellidoc.backend.exception.UserNotFoundException;
import com.intellidoc.backend.model.UserAccountEntity;
import com.intellidoc.backend.repository.UserAccountRepository;
import com.intellidoc.backend.security.JwtTokenProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserAccountRepository userAccountRepository;

    @Mock
    private JwtTokenProvider jwtTokenProvider;

    private AuthService authService;
    private PasswordEncoder passwordEncoder;
    private UserAccountEntity user;

    @BeforeEach
    void setUp() {
        passwordEncoder = new BCryptPasswordEncoder();
        authService = new AuthService(userAccountRepository, passwordEncoder, jwtTokenProvider);
        user = UserAccountEntity.builder()
                .id(UUID.fromString("00000000-0000-0000-0000-000000000002"))
                .tenantId(UUID.fromString("00000000-0000-0000-0000-000000000001"))
                .email("jane.doe@company.com")
                .displayName("Jane Doe")
                .role("member")
                .passwordHash(passwordEncoder.encode("password"))
                .build();
    }

    @Test
    void loginSucceedsWithMatchingCredentials() {
        when(userAccountRepository.findByEmailIgnoreCase("jane.doe@company.com"))
                .thenReturn(Optional.of(user));
        when(jwtTokenProvider.generateToken(user.getId(), user.getTenantId()))
                .thenReturn("signed-token");

        LoginResponseDto response = authService.login("  Jane.Doe@company.com ", "password");

        assertEquals("signed-token", response.getToken());
        assertEquals(user.getId(), response.getUser().getId());
        assertEquals("Jane Doe", response.getUser().getDisplayName());
        assertEquals("member", response.getUser().getRole());
    }

    @Test
    void loginFailsWithWrongPasswordUsingSameErrorAsUnknownEmail() {
        when(userAccountRepository.findByEmailIgnoreCase("jane.doe@company.com"))
                .thenReturn(Optional.of(user));

        InvalidCredentialsException wrongPassword = assertThrows(
                InvalidCredentialsException.class,
                () -> authService.login("jane.doe@company.com", "nope")
        );

        when(userAccountRepository.findByEmailIgnoreCase("missing@company.com"))
                .thenReturn(Optional.empty());

        InvalidCredentialsException unknownEmail = assertThrows(
                InvalidCredentialsException.class,
                () -> authService.login("missing@company.com", "password")
        );

        assertEquals(wrongPassword.getCode(), unknownEmail.getCode());
        assertEquals("AUTH_INVALID_CREDENTIALS", wrongPassword.getCode());
        assertEquals(wrongPassword.getMessage(), unknownEmail.getMessage());
    }

    @Test
    void getCurrentUserReturnsProfile() {
        when(userAccountRepository.findById(user.getId())).thenReturn(Optional.of(user));
        assertEquals("Jane Doe", authService.getCurrentUser(user.getId()).getDisplayName());
    }

    @Test
    void getCurrentUserThrowsWhenPrincipalMissing() {
        when(userAccountRepository.findById(any())).thenReturn(Optional.empty());
        assertThrows(UserNotFoundException.class, () -> authService.getCurrentUser(UUID.randomUUID()));
    }

    @Test
    void maskEmailHidesLocalPart() {
        assertEquals("j***@company.com", AuthService.maskEmail("jane.doe@company.com"));
        assertNotNull(AuthService.normalizeEmail("  A@B.COM  "));
        assertEquals("a@b.com", AuthService.normalizeEmail("  A@B.COM  "));
    }
}
