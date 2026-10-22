package com.vibemusic.config;

import com.vibemusic.util.JwtUtil;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
public class JwtConfiguration {

    @Value("${security.jwt.secret}")
    private String secret;

    @Value("${security.jwt.expiration-millis:21600000}")
    private long expirationMillis;

    @PostConstruct
    public void configureJwt() {
        JwtUtil.configure(secret, expirationMillis);
    }
}
