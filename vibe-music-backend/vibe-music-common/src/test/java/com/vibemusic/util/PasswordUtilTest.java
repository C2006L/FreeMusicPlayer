package com.vibemusic.util;

import org.junit.jupiter.api.Test;
import org.springframework.util.DigestUtils;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.*;

class PasswordUtilTest {

    @Test
    void encodesNewPasswordsWithBcrypt() {
        String encoded = PasswordUtil.encode("FreeMusic123!");

        assertTrue(encoded.startsWith("$2"));
        assertTrue(PasswordUtil.matches("FreeMusic123!", encoded));
        assertFalse(PasswordUtil.matches("wrong-password", encoded));
    }

    @Test
    void acceptsLegacyMd5ForTransparentMigration() {
        String legacy = DigestUtils.md5DigestAsHex("FreeMusic123!".getBytes(StandardCharsets.UTF_8));

        assertTrue(PasswordUtil.isLegacyMd5(legacy));
        assertTrue(PasswordUtil.matches("FreeMusic123!", legacy));
        assertFalse(PasswordUtil.matches("wrong-password", legacy));
    }

    @Test
    void rejectsMalformedStoredHashesWithoutThrowing() {
        assertFalse(PasswordUtil.matches("FreeMusic123!", "not-a-supported-password-hash"));
    }
}
