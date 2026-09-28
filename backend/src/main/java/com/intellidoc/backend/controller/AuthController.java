package com.intellidoc.backend.controller;

import com.intellidoc.backend.dto.LoginRequestDto;
import com.intellidoc.backend.dto.LoginResponseDto;
import com.intellidoc.backend.dto.SignupRequestDto;
import com.intellidoc.backend.dto.UserProfileDto;
import com.intellidoc.backend.security.AuthPrincipal;
import com.intellidoc.backend.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
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
}
