package com.vibemusic.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.model.vo.OnlineSongVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

@Service
public class OnlineMusicService {
    private static final Set<String> ALLOWED_SOURCES = Set.of("netease", "tencent", "kugou", "kuwo", "baidu");

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String providerUrl;
    private final String providerPublicUrl;

    public OnlineMusicService(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${vibe-music.online.provider-url:http://127.0.0.1:3001}") String providerUrl,
            @Value("${vibe-music.online.provider-public-url:http://127.0.0.1:3001}") String providerPublicUrl) {
        this.restClient = restClientBuilder.build();
        this.objectMapper = objectMapper;
        this.providerUrl = trimTrailingSlash(providerUrl);
        this.providerPublicUrl = trimTrailingSlash(providerPublicUrl);
    }

    public List<OnlineSongVO> search(String keyword, List<String> requestedSources, int limit) {
        if (keyword == null || keyword.isBlank()) return List.of();
        String sources = requestedSources == null ? "" : requestedSources.stream()
                .filter(ALLOWED_SOURCES::contains)
                .distinct()
                .reduce((left, right) -> left + "," + right)
                .orElse("");

        String uri = UriComponentsBuilder.fromUriString(providerUrl + "/search")
                .queryParam("q", keyword.trim())
                .queryParam("sources", sources)
                .queryParam("limit", Math.min(Math.max(limit, 1), 20))
                .build()
                .encode()
                .toUriString();
        String body = restClient.get().uri(uri).retrieve().body(String.class);

        try {
            JsonNode songs = objectMapper.readTree(body).path("songs");
            List<OnlineSongVO> result = new ArrayList<>();
            for (JsonNode song : songs) {
                String source = song.path("source").asText();
                String id = song.path("id").asText();
                String urlId = song.path("urlId").asText(id);
                String picId = song.path("picId").asText();
                if (!ALLOWED_SOURCES.contains(source) || id.isBlank()) continue;

                result.add(OnlineSongVO.builder()
                        .songId("online:" + source + ":" + id)
                        .songName(song.path("name").asText())
                        .artistName(song.path("artist").asText())
                        .album(song.path("album").asText())
                        .duration(song.path("duration").asLong(0))
                        .coverUrl(picId.isBlank() ? null : resourceUrl("cover", source, picId))
                        .audioUrl(resourceUrl("stream", source, urlId))
                        .likeStatus(0)
                        .source(source)
                        .sourceName(song.path("sourceName").asText(source))
                        .online(true)
                        .build());
            }
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException("在线音乐服务返回了无效数据", exception);
        }
    }

    private String resourceUrl(String resource, String source, String id) {
        return UriComponentsBuilder.fromUriString(providerPublicUrl + "/" + resource)
                .queryParam("source", source)
                .queryParam("id", id)
                .build()
                .encode()
                .toUriString();
    }

    private static String trimTrailingSlash(String value) {
        return value != null && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
