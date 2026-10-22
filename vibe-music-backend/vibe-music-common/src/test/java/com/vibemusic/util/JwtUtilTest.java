package com.vibemusic.util;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JwtUtilTest {

    @BeforeAll
    static void configure() {
        JwtUtil.configure("test-secret-that-is-longer-than-thirty-two-characters", 60_000);
    }

    @Test
    void signsAndParsesRawAndBearerTokens() {
        String token = JwtUtil.generateToken(Map.of("role", "ROLE_USER", "userId", 7));

        assertEquals("ROLE_USER", JwtUtil.parseToken(token).get("role"));
        assertEquals("ROLE_USER", JwtUtil.parseToken("Bearer " + token).get("role"));
    }

    @Test
    void rejectsShortSecrets() {
        assertThrows(IllegalArgumentException.class, () -> JwtUtil.configure("too-short", 60_000));
    }
}
