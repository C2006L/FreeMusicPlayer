package com.vibemusic.config;

import com.vibemusic.interceptor.AuthRateLimitInterceptor;
import com.vibemusic.interceptor.LoginInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Paths;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private LoginInterceptor loginInterceptor;
    @Autowired
    private AuthRateLimitInterceptor authRateLimitInterceptor;

    /** MinIO 未启用时的本地回退目录，经 /uploads/** 直接提供访问。 */
    @Value("${vibe-music.upload.dir:./.runtime/uploads}")
    private String localUploadDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Paths.get(localUploadDir).toAbsolutePath().normalize().toUri().toString();
        if (!location.endsWith("/")) location = location + "/";
        registry.addResourceHandler("/uploads/**").addResourceLocations(location);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authRateLimitInterceptor)
                .addPathPatterns("/user/login", "/admin/login", "/user/sendVerificationCode", "/user/register", "/user/resetUserPassword", "/agent/chat", "/agent/lyrics/translations", "/workspace/**")
                .order(0);

        // 登录接口和注册接口不拦截
        registry.addInterceptor(loginInterceptor)
                .addPathPatterns("/**") // 拦截所有请求
                .excludePathPatterns(
                        "/admin/login", "/admin/logout", "/admin/register",
                        "/user/login", "/user/logout", "/user/register",
                        "/user/sendVerificationCode", "/user/resetUserPassword",
                        "/health",
                        "/banner/getBannerList",
                        "/playlist/getAllPlaylists", "/playlist/getRecommendedPlaylists", "/playlist/getPlaylistDetail/**",
                        "/playlist/discoverOnline", "/playlist/onlineDetail",
                        "/artist/getAllArtists", "/artist/getArtistDetail/**", "/artist/discoverOnline",
                        "/song/getAllSongs", "/song/getRecommendedSongs", "/song/getSongDetail/**",
                        "/song/discoverOnline", "/song/bilibiliCollection",
                        "/song/coverOnline", "/song/lyricOnline",
                        "/uploads/**")
                .order(1);
    }
}
