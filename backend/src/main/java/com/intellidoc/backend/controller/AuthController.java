package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.ChangePasswordRequestDto;
import com.intellidoc.backend.dto.ForgotPasswordRequestDto;
import com.intellidoc.backend.dto.LoginRequestDto;
import com.intellidoc.backend.dto.LoginResponseDto;
import com.intellidoc.backend.dto.SignupRequestDto;
import com.intellidoc.backend.dto.SimpleMessageResponseDto;
import com.intellidoc.backend.dto.UpdateProfileRequestDto;
import com.intellidoc.backend.dto.UpdateProfileResponseDto;
import com.intellidoc.backend.dto.UserProfileDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping({"/auth", "/api/v1/auth"})
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponseDto> login(@Valid @RequestBody LoginRequestDto request) {
        return ResponseEntity.ok(authService.login(request.getEmail(), request.getPassword()));
    }

    @PostMapping("/signup")
    public ResponseEntity<LoginResponseDto> signup(@Valid @RequestBody SignupRequestDto request) {
        return ResponseEntity.ok(authService.signup(
                request.getEmail(),
                request.getPassword(),
                request.getDisplayName()));
    }

    @GetMapping("/me")
    public ResponseEntity<UserProfileDto> me(@AuthenticationPrincipal AuthPrincipal principal) {
        return ResponseEntity.ok(authService.getCurrentUser(principal.userId()));
    }

    @PutMapping("/me")
    public ResponseEntity<LoginResponseDto> updateProfile(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody UpdateProfileRequestDto request) {
        LoginResponseDto updated = authService.updateProfile(principal.userId(), request.getDisplayName());
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/change-password")
    public ResponseEntity<SimpleMessageResponseDto> changePassword(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody ChangePasswordRequestDto request) {
        authService.changePassword(principal.userId(), request.getOldPassword(), request.getNewPassword(), request.getConfirmNewPassword());
        return ResponseEntity.ok(SimpleMessageResponseDto.builder()
                .message("Password changed successfully")
                .build());
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<SimpleMessageResponseDto> forgotPassword(@Valid @RequestBody ForgotPasswordRequestDto request) {
        authService.forgotPassword(request.getEmail(), request.getNewPassword(), request.getConfirmNewPassword());
        return ResponseEntity.ok(SimpleMessageResponseDto.builder()
                .message("Password reset successfully")
                .build());
    }
}
