package com.vibemusic.util;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.util.DigestUtils;

import java.nio.charset.StandardCharsets;

/**
 * Password hashing helper. New passwords use BCrypt; legacy 32-character MD5
 * hashes remain readable so they can be upgraded after a successful login.
 */
public final class PasswordUtil {

    private static final BCryptPasswordEncoder ENCODER = new BCryptPasswordEncoder(12);

    private PasswordUtil() {
    }

    public static String encode(String rawPassword) {
        return ENCODER.encode(rawPassword);
    }

    public static boolean matches(String rawPassword, String storedPassword) {
        if (rawPassword == null || storedPassword == null) {
            return false;
        }
        if (isLegacyMd5(storedPassword)) {
            String digest = DigestUtils.md5DigestAsHex(rawPassword.getBytes(StandardCharsets.UTF_8));
            return digest.equalsIgnoreCase(storedPassword);
        }
        try {
            return ENCODER.matches(rawPassword, storedPassword);
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }

    public static boolean isLegacyMd5(String storedPassword) {
        return storedPassword != null && storedPassword.matches("(?i)^[0-9a-f]{32}$");
    }
}
