package com.vibemusic.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.model.vo.OnlineSongVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class OnlineMusicService {
    private static final Set<String> ALLOWED_SOURCES = Set.of(
            "netease", "tencent", "qq", "kugou", "kuwo", "baidu", "migu",
            "qianqian", "jamendo", "joox", "bilibili", "fivesing", "soda");

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String providerUrl;
    private final String providerPublicUrl;

    public OnlineMusicService(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${vibe-music.online.provider-url:http://127.0.0.1:3001}") String providerUrl,
            @Value("${vibe-music.online.provider-public-url:http://127.0.0.1:8080/song}") String providerPublicUrl) {
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
                .queryParam("limit", Math.min(Math.max(limit, 1), 50))
                .build()
                .encode()
                .toUriString();
        String body = restClient.get().uri(URI.create(uri)).retrieve().body(String.class);

        try {
            JsonNode songs = objectMapper.readTree(body).path("songs");
            List<OnlineSongVO> result = new ArrayList<>();
            for (JsonNode song : songs) {
                String source = song.path("source").asText();
                String id = song.path("id").asText();
                String urlId = song.path("urlId").asText(id);
                String picId = song.path("picId").asText();
                String lyricId = song.path("lyricId").asText(id);
                if (!ALLOWED_SOURCES.contains(source) || id.isBlank()) continue;

                result.add(OnlineSongVO.builder()
                        .songId("online:" + source + ":" + id)
                        .songName(song.path("name").asText())
                        .artistName(song.path("artist").asText())
                        .album(song.path("album").asText())
                        .duration(song.path("duration").asLong(0))
                        .coverUrl(picId.isBlank() ? null : resourceUrl("cover", source, picId, song))
                        .audioUrl(resourceUrl("stream", source, urlId, song))
                        .likeStatus(0)
                        .source(source)
                        .sourceName(song.path("sourceName").asText(source))
                        .sourceSongId(id)
                        .sourceUrlId(urlId)
                        .sourcePicId(picId)
                        .sourceLyricId(lyricId)
                        .sourceExtra(song.path("sourceExtra").asText("{}"))
                        .providerEngine(song.path("providerEngine").asText("meting"))
                        .availability(song.path("availability").asText("unknown"))
                        .vip(song.path("vip").asBoolean(false))
                        .online(true)
                        .build());
            }
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException("在线音乐服务返回了无效数据", exception);
        }
    }

    public List<OnlineSongVO> discover(int limit) {
        String uri = UriComponentsBuilder.fromUriString(providerUrl + "/discover")
                .queryParam("limit", Math.min(Math.max(limit, 1), 30))
                .build()
                .encode()
                .toUriString();
        String body = restClient.get().uri(URI.create(uri)).retrieve().body(String.class);
        try {
            JsonNode songs = objectMapper.readTree(body).path("songs");
            List<OnlineSongVO> result = new ArrayList<>();
            for (JsonNode song : songs) {
                String source = song.path("source").asText();
                String id = song.path("id").asText();
                String urlId = song.path("urlId").asText(id);
                String picId = song.path("picId").asText();
                String lyricId = song.path("lyricId").asText(id);
                if (!ALLOWED_SOURCES.contains(source) || id.isBlank()) continue;
                result.add(OnlineSongVO.builder()
                        .songId("online:" + source + ":" + id)
                        .songName(song.path("name").asText())
                        .artistName(song.path("artist").asText())
                        .album(song.path("album").asText())
                        .duration(song.path("duration").asLong(0))
                        .coverUrl(picId.isBlank() ? null : resourceUrl("cover", source, picId, song))
                        .audioUrl(resourceUrl("stream", source, urlId, song))
                        .likeStatus(0)
                        .source(source)
                        .sourceName(song.path("sourceName").asText(source))
                        .sourceSongId(id)
                        .sourceUrlId(urlId)
                        .sourcePicId(picId)
                        .sourceLyricId(lyricId)
                        .sourceExtra(song.path("sourceExtra").asText("{}"))
                        .providerEngine(song.path("providerEngine").asText("meting"))
                        .availability(song.path("availability").asText("unknown"))
                        .vip(song.path("vip").asBoolean(false))
                        .online(true)
                        .build());
            }
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException("在线音乐服务返回了无效数据", exception);
        }
    }

    public String buildStreamUrl(String source, String id) {
        return resourceUrl("stream", source, id);
    }

    public String buildStreamUrl(String source, String id, String name, String artist, String album,
                                 Long duration, String cover, String extra, String engine) {
        return resourceUrl("stream", source, id, name, artist, album, duration, cover, extra, engine);
    }

    public String buildCoverUrl(String source, String id) {
        return resourceUrl("cover", source, id);
    }

    public String buildCoverUrl(String source, String id, String name, String artist, String cover, String engine) {
        String originalCover = (cover == null || cover.isBlank()) && "go-music-api".equals(engine) ? id : cover;
        return resourceUrl("cover", source, id, name, artist, null, null, originalCover, null, engine);
    }

    public Map<String, String> lyrics(String source, String id, Map<String, String> metadata) {
        if (!ALLOWED_SOURCES.contains(source) || id == null || id.isBlank()) return Map.of();
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(providerUrl + "/lyric")
                .queryParam("source", source)
                .queryParam("id", id);
        if (metadata != null) metadata.forEach((key, value) -> {
            if (value != null && !value.isBlank()) builder.queryParam(key, value);
        });
        String uri = builder.build()
                .encode()
                .toUriString();
        try {
            JsonNode payload = objectMapper.readTree(restClient.get().uri(URI.create(uri)).retrieve().body(String.class));
            return Map.of(
                    "lyric", payload.path("lyric").asText(""),
                    "tlyric", payload.path("tlyric").asText("")
            );
        } catch (Exception exception) {
            throw new IllegalStateException("在线歌词暂时不可用", exception);
        }
    }

    private String resourceUrl(String resource, String source, String id) {
        return resourceUrl(resource, source, id, null, null, null, null, null, null, null);
    }

    private String resourceUrl(String resource, String source, String id, JsonNode song) {
        return resourceUrl(resource, source, id,
                song.path("name").asText(""), song.path("artist").asText(""), song.path("album").asText(""),
                song.path("duration").asLong(0), song.path("coverOriginal").asText(""),
                song.path("sourceExtra").asText("{}"), song.path("providerEngine").asText("meting"));
    }

    private String resourceUrl(String resource, String source, String id, String name, String artist, String album,
                               Long duration, String cover, String extra, String engine) {
        String endpoint = "cover".equals(resource) ? "coverOnline" : "streamOnline";
        UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(providerPublicUrl + "/" + endpoint)
                .queryParam("source", source)
                .queryParam("id", id);
        if (name != null && !name.isBlank()) builder.queryParam("name", name);
        if (artist != null && !artist.isBlank()) builder.queryParam("artist", artist);
        if (album != null && !album.isBlank()) builder.queryParam("album", album);
        if (duration != null && duration > 0) builder.queryParam("duration", duration);
        if (cover != null && !cover.isBlank()) builder.queryParam("cover", cover);
        if (extra != null && !extra.isBlank() && !"{}".equals(extra)) builder.queryParam("extra", extra);
        if (engine != null && !engine.isBlank()) builder.queryParam("engine", engine);
        return builder.build()
                .encode()
                .toUriString();
    }

    /**
     * 通过主后端转发媒体资源，避免浏览器直接依赖 provider 的内部端口。
     * 音频 Range 请求会原样转发，因此进度拖动仍可工作。
     */
    public void proxyResource(String resource, String source, String id, String range,
                              Map<String, String> metadata, HttpServletResponse response)
            throws IOException {
        if (!("stream".equals(resource) || "cover".equals(resource))
                || !ALLOWED_SOURCES.contains(source) || id == null || id.isBlank()) {
            response.sendError(HttpServletResponse.SC_BAD_REQUEST, "invalid resource request");
            return;
        }

        UriComponentsBuilder uriBuilder = UriComponentsBuilder.fromUriString(providerUrl + "/" + resource)
                .queryParam("source", source)
                .queryParam("id", id);
        if (metadata != null) {
            metadata.forEach((key, value) -> {
                if (value != null && !value.isBlank()) uriBuilder.queryParam(key, value);
            });
        }
        String uri = uriBuilder.build()
                .encode()
                .toUriString();
        URI currentUri = URI.create(uri);
        for (int redirectCount = 0; redirectCount <= 5; redirectCount++) {
            HttpURLConnection connection = (HttpURLConnection) currentUri.toURL().openConnection();
            // HttpURLConnection 不会自动跨协议跟随 http -> https，因此在这里受控处理。
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("User-Agent", "FreeMusicPlayer/1.0");
            if (range != null && !range.isBlank()) connection.setRequestProperty("Range", range);

            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isBlank()) break;
                URI nextUri = currentUri.resolve(location);
                if (!("http".equalsIgnoreCase(nextUri.getScheme()) || "https".equalsIgnoreCase(nextUri.getScheme()))) break;
                currentUri = nextUri;
                continue;
            }

            response.setStatus(status);
            copyHeader(connection, response, "Content-Type");
            copyHeader(connection, response, "Content-Length");
            copyHeader(connection, response, "Content-Range");
            copyHeader(connection, response, "Accept-Ranges");
            response.setHeader("Cache-Control", "private, max-age=300");

            if (status >= 400) {
                connection.disconnect();
                return;
            }
            try (InputStream input = connection.getInputStream()) {
                input.transferTo(response.getOutputStream());
                response.flushBuffer();
            } finally {
                connection.disconnect();
            }
            return;
        }
        response.sendError(HttpServletResponse.SC_BAD_GATEWAY, "media redirect failed");
    }

    private static void copyHeader(HttpURLConnection connection, HttpServletResponse response, String name) {
        String value = connection.getHeaderField(name);
        if (value != null && !value.isBlank()) response.setHeader(name, value);
    }

    private static String trimTrailingSlash(String value) {
        return value != null && value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
