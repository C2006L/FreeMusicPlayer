package com.vibemusic.service;

import com.vibemusic.mapper.*;
import com.vibemusic.model.dto.*;
import com.vibemusic.service.impl.UserFavoriteServiceImpl;
import com.vibemusic.util.ThreadLocalUtil;
import org.junit.jupiter.api.Test;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.*;
import java.util.*;
import static org.mockito.Mockito.*;

class FavoriteCacheIsolationTest {
    @Configuration
    @EnableCaching(proxyTargetClass = true)
    static class Config {
        @Bean CacheManager cacheManager() { return new ConcurrentMapCacheManager("userFavoriteCache"); }
        @Bean UserFavoriteMapper favorites() { return mock(UserFavoriteMapper.class); }
        @Bean SongMapper songs() { return mock(SongMapper.class); }
        @Bean PlaylistMapper playlists() { return mock(PlaylistMapper.class); }
        @Bean UserFavoriteServiceImpl service() { return new UserFavoriteServiceImpl(); }
    }

    @Test void identicalQueriesKeepSeparateCacheEntriesForEachVerifiedUser() {
        try (var context = new AnnotationConfigApplicationContext(Config.class)) {
            var mapper = context.getBean(UserFavoriteMapper.class);
            when(mapper.getUserFavoriteSongIds(anyLong())).thenReturn(List.of());
            when(mapper.getUserFavoritePlaylistIds(anyLong())).thenReturn(List.of());
            var service = context.getBean(UserFavoriteServiceImpl.class);
            for (long user : new long[]{1, 2, 1, 2}) {
                ThreadLocalUtil.set(Map.of("role", "ROLE_USER", "userId", user));
                service.getUserFavoriteSongs(new SongDTO());
                service.getUserFavoritePlaylists(new PlaylistDTO());
            }
            // Repeated requests are cached, but user 2 must execute its own queries.
            verify(mapper, times(1)).getUserFavoriteSongIds(1L);
            verify(mapper, times(1)).getUserFavoriteSongIds(2L);
            verify(mapper, times(1)).getUserFavoritePlaylistIds(1L);
            verify(mapper, times(1)).getUserFavoritePlaylistIds(2L);
        } finally {
            ThreadLocalUtil.remove();
        }
    }
}
