package com.vibemusic.config;

import org.jetbrains.annotations.NotNull;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig {
    @Value("${FMP_ALLOWED_ORIGINS:http://localhost:8090,http://127.0.0.1:8090,http://localhost:8089,http://127.0.0.1:8089}")
    private String allowedOrigins;
    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(@NotNull CorsRegistry registry) {
                registry.addMapping("/**") // 允许所有路径
                        .allowedOrigins(allowedOrigins.split(","))
                        .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS") // 加上 OPTIONS
                        .allowedHeaders("*") // 允许所有请求头
                        .exposedHeaders("Authorization") // 允许前端获取 Authorization 头
                        .allowCredentials(true); // 允许携带 Cookie 或 Token
            }
        };
    }
}
