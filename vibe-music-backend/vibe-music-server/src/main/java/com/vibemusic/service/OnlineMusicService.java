package com.vibemusic.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.model.vo.OnlinePlaylistVO;
import com.vibemusic.model.vo.OnlineSongVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.util.UriComponentsBuilder;
import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

@Service
public class OnlineMusicService {
    private static final long PROBE_TIMEOUT_MS = 2500;
    /** 搜索只快速探测最靠前的一小批结果，用于把首屏可播项排到前面。 */
    private static final int SEARCH_PROBE_LIMIT = 4;
    private static final long SEARCH_PROBE_BUDGET_MS = 2000;
    /** 单次搜索（含上游检索与探测）的总耗时上限，慢源不再额外叠加探测等待。 */
    private static final long SEARCH_TOTAL_BUDGET_MS = 7000;
    /** 完整音源的下限约 64kbps；低于 24kbps（约 192kbps 的 1/8）视为试听。 */
    private static final long FULL_MIN_BYTES_PER_SECOND = 8_000;
    private static final long PREVIEW_MAX_BYTES_PER_SECOND = 3_000;
    /** 只有“按 128kbps 估算的文件时长明显短于标称时长”时才判定为试听。 */
    private static final long ASSUMED_BYTES_PER_SECOND = 16_000;
    private static final long PREVIEW_MAX_SECONDS = 95;
    /** 404 可能只是一次瞬时失效，延迟后只重试一次再定级。 */
    private static final long RETRY_404_DELAY_MS = 400;
    /** 所有搜索请求共享一个探测池，避免多源并发搜索把上游连接打满。 */
    private static final ExecutorService PROBE_EXECUTOR = Executors.newFixedThreadPool(10, runnable -> {
        Thread thread = new Thread(runnable, "online-audio-probe");
        thread.setDaemon(true);
        return thread;
    });

    private final HttpClient mediaProbeClient=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NORMAL).build();

    private record MediaProbe(int status, String contentType, long contentLength, long totalBytes) { }

    /** A bounded opening check, never proof of complete audio or account rights. */
    public boolean canOpenAudio(OnlineSongVO song) {
        try {
            String query=URI.create(song.getAudioUrl()).getRawQuery();
            if(query==null)return false;
            var probe=probeStream(query,4_000);
            return (probe.status()==200 || probe.status()==206)
                    && acceptsAudio(probe.contentType())
                    && probe.contentLength()>0;
        } catch(InterruptedException error) {Thread.currentThread().interrupt();return false;}
        catch(Exception error) {return false;}
    }

    /**
     * 通过 provider 的 Range 探活取得真实可播等级。拿不到确凿证据（超时、无总长度、
     * 时长未知）时保持 unknown，绝不把未验证的资源标成 full。
     */
    private MediaProbe probeStream(String query, long timeoutMs) throws IOException, InterruptedException {
        var request=HttpRequest.newBuilder(URI.create(providerUrl+"/stream?"+query))
                .timeout(Duration.ofMillis(timeoutMs)).header("Range","bytes=0-0")
                .header("User-Agent","FreeMusicPlayer/1.0").GET().build();
        var response=mediaProbeClient.send(request,HttpResponse.BodyHandlers.ofInputStream());
        try(var body=response.body()) {
            String type=response.headers().firstValue("Content-Type").orElse("").toLowerCase(Locale.ROOT);
            long length=response.headers().firstValueAsLong("Content-Length").orElse(0);
            // 206 的 Content-Length 只有 1 字节，必须用 Content-Range 里的总长度；
            // 200 表示上游忽略了 Range，Content-Length 才是完整大小。
            long total=contentRangeTotal(response.headers().firstValue("Content-Range").orElse(""));
            if(total<=0 && response.statusCode()==200) total=length;
            return new MediaProbe(response.statusCode(),type,length,total);
        }
    }

    private static long contentRangeTotal(String header) {
        if(header==null)return 0;
        int slash=header.lastIndexOf('/');
        if(slash<0 || slash==header.length()-1)return 0;
        String total=header.substring(slash+1).trim();
        if(total.isEmpty() || "*".equals(total))return 0;
        try { return Math.max(0,Long.parseLong(total)); } catch(NumberFormatException ignored) { return 0; }
    }

    private static boolean acceptsAudio(String type) {
        return type.startsWith("audio/") || type.startsWith("video/mp4")
                || type.startsWith("application/octet-stream") || type.startsWith("application/ogg");
    }

    String gradeAvailability(OnlineSongVO song) {
        try {
            String query=URI.create(song.getAudioUrl()).getRawQuery();
            if(query==null)return null;
            var probe=probeStream(query,PROBE_TIMEOUT_MS);
            if(probe.status()==404) {
                // 只为 404 重试一次：403/410 是确定的权限或下架结果，重试没有意义。
                Thread.sleep(RETRY_404_DELAY_MS);
                probe=probeStream(query,PROBE_TIMEOUT_MS);
            }
            if(Set.of(403,404,410).contains(probe.status()))return "unavailable";
            if(probe.status()!=200 && probe.status()!=206)return null;
            if(!acceptsAudio(probe.contentType()))return "unavailable";
            long duration=song.getDuration()==null?0:song.getDuration();
            return classifyBytes(probe.totalBytes(),duration);
        } catch(InterruptedException error) {Thread.currentThread().interrupt();return null;}
        catch(Exception error) {return null;}
    }

    static String classifyBytes(long totalBytes,long durationSeconds) {
        if(totalBytes<=0 || durationSeconds<=0)return null;
        long bytesPerSecond=totalBytes/durationSeconds;
        long secondsAtAssumedBitrate=totalBytes/ASSUMED_BYTES_PER_SECOND;
        // 1/8 大小的试听，或按 128kbps 估算不足 95 秒且明显短于标称时长。
        if(bytesPerSecond<PREVIEW_MAX_BYTES_PER_SECOND
                || secondsAtAssumedBitrate<=PREVIEW_MAX_SECONDS && secondsAtAssumedBitrate<durationSeconds*0.8)
            return "preview";
        return bytesPerSecond>=FULL_MIN_BYTES_PER_SECOND?"full":null;
    }

    /**
     * 按需探测单条资源。只接受已知源与曲目元数据，由服务端重建 provider 请求，
     * 不接受客户端传入任意 URL。拿不到证据时返回 null，前端保持 unknown。
     */
    public String probeAvailability(String source, String id, String name, String artist, String album,
                                    Long duration, String cover, String extra, String engine) {
        if(!ALLOWED_SOURCES.contains(source) || id==null || id.isBlank())return null;
        var song=OnlineSongVO.builder()
                .source(source)
                .sourceUrlId(id)
                .duration(duration)
                .audioUrl(buildStreamUrl(source,id,name,artist,album,duration,cover,extra,engine))
                .build();
        return gradeAvailability(song);
    }

    /**
     * 只探测最靠前的一小批结果：默认排序里用户最先看到的条目才值得花预算，
     * 探测有总预算，超时未完成的条目保持 unknown，不会拖慢整次搜索。
     * 排序按 full > preview > restricted > unknown > unavailable，同一档内保持 provider 的相关性顺序。
     */
    private List<OnlineSongVO> verifyAvailability(List<OnlineSongVO> songs,long budgetMs) {
        if(songs.isEmpty() || budgetMs<=0)return songs;
        List<OnlineSongVO> candidates=songs.stream()
                .filter(song->"unknown".equals(song.getAvailability()))
                .limit(SEARCH_PROBE_LIMIT)
                .toList();
        List<Future<String>> futures=new ArrayList<>(candidates.size());
        for(OnlineSongVO song:candidates) futures.add(PROBE_EXECUTOR.submit(()->gradeAvailability(song)));
        long deadline=System.nanoTime()+TimeUnit.MILLISECONDS.toNanos(budgetMs);
        for(int index=0;index<futures.size();index++) {
            Future<String> future=futures.get(index);
            try {
                long remaining=deadline-System.nanoTime();
                if(remaining<=0)break;
                String grade=future.get(remaining,TimeUnit.NANOSECONDS);
                if(grade!=null) candidates.get(index).setAvailability(grade);
            } catch(InterruptedException error) {
                Thread.currentThread().interrupt();break;
            } catch(Exception ignored) {
                future.cancel(true);
            }
        }
        for(Future<String> future:futures) if(!future.isDone()) future.cancel(true);
        songs.sort(Comparator.comparingInt(song->availabilityRank(song.getAvailability())));
        return songs;
    }

    private static int availabilityRank(String availability) {
        return switch(java.util.Objects.toString(availability,"unknown")) {
            case "full" -> 0;
            case "preview" -> 1;
            case "restricted" -> 2;
            case "unavailable" -> 4;
            default -> 3;
        };
    }

    private static final Set<String> ALLOWED_SOURCES = Set.of(
            "netease", "tencent", "qq", "kugou", "kuwo", "baidu", "migu",
            "qianqian", "jamendo", "joox", "bilibili", "fivesing", "soda");

    private final RestClient restClient;
    private final RestClient collectionClient;
    private final ObjectMapper objectMapper;
    private final String providerUrl;
    private final String providerPublicUrl;

    public OnlineMusicService(
            RestClient.Builder restClientBuilder,
            ObjectMapper objectMapper,
            @Value("${vibe-music.online.provider-url:http://127.0.0.1:3001}") String providerUrl,
            @Value("${vibe-music.online.provider-public-url:http://127.0.0.1:8080/song}") String providerPublicUrl) {
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        factory.setReadTimeout(Duration.ofSeconds(18));
        this.restClient = restClientBuilder.requestFactory(factory).build();
        var collectionFactory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build());
        collectionFactory.setReadTimeout(Duration.ofSeconds(35));
        this.collectionClient = restClientBuilder.clone().requestFactory(collectionFactory).build();
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
        // 探测最靠前的一小批并排序；其余条目仍由前端悬停时按需探测。
        long startedAt=System.nanoTime();
        List<OnlineSongVO> songs=parseSongs(providerBody(uri,false));
        long remaining=SEARCH_TOTAL_BUDGET_MS-TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-startedAt);
        return verifyAvailability(songs,Math.min(SEARCH_PROBE_BUDGET_MS,remaining));
    }

    public List<OnlineSongVO> bilibiliCollection(String bvid) {
        if (bvid == null || !bvid.matches("^BV[a-zA-Z0-9]{10}$")) throw new IllegalArgumentException("无效的 B 站视频编号");
        String uri = UriComponentsBuilder.fromUriString(providerUrl + "/bilibili/collection")
                .queryParam("bvid", bvid).build().encode().toUriString();
        return parseSongs(providerBody(uri,true));
    }

    public List<OnlineSongVO> playlist(String source,String id) {
        if("bilibili".equals(source)) return bilibiliCollection(id);
        if(!Set.of("netease","qq").contains(source) || id==null || !id.matches("[0-9]{1,20}")) throw new IllegalArgumentException("无效歌单标识");
        String uri=UriComponentsBuilder.fromUriString(providerUrl+"/playlist").queryParam("source",source).queryParam("id",id).build().encode().toUriString();
        return parseSongs(providerBody(uri,true));
    }

    private String providerBody(String uri,boolean longer) {
        return (longer?collectionClient:restClient).get().uri(URI.create(uri))
                .header("X-Request-Id",java.util.Objects.toString(org.slf4j.MDC.get("requestId"),java.util.UUID.randomUUID().toString()))
                .retrieve().body(String.class);
    }
    public Object diagnostics() {
        try { return objectMapper.readTree(providerBody(providerUrl+"/metrics",false)); }
        catch(Exception e){return Map.of("status","DOWN");}
    }

    private List<OnlineSongVO> parseSongs(String body) {
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

    /**
     * Recommended playlists come from the provider's real platform feeds. The
     * client only sees upstream metadata and proxies covers through this host.
     */
    public List<OnlinePlaylistVO> discoverPlaylists(int limit) {
        String uri = UriComponentsBuilder.fromUriString(providerUrl + "/playlists")
                .queryParam("limit", Math.min(Math.max(limit, 1), 48))
                .build()
                .encode()
                .toUriString();
        String body = restClient.get().uri(URI.create(uri)).retrieve().body(String.class);
        try {
            JsonNode playlists = objectMapper.readTree(body).path("playlists");
            List<OnlinePlaylistVO> result = new ArrayList<>();
            for (JsonNode playlist : playlists) {
                String source = playlist.path("source").asText();
                String id = playlist.path("id").asText();
                String name = playlist.path("name").asText();
                if (!Set.of("netease", "qq").contains(source) || id.isBlank() || name.isBlank()) continue;
                String cover = playlist.path("coverUrl").asText();
                result.add(OnlinePlaylistVO.builder()
                        .id(id)
                        .name(name)
                        .coverUrl(cover.isBlank() ? null : buildCoverUrl(source, cover, "", "", cover, "go-music-api"))
                        .trackCount(playlist.path("trackCount").asLong(0))
                        .playCount(playlist.path("playCount").asLong(0))
                        .creator(playlist.path("creator").asText(""))
                        .source(source)
                        .sourceName(playlist.path("sourceName").asText(source))
                        .link(playlist.path("link").asText(""))
                        .build());
            }
            return result;
        } catch (Exception exception) {
            throw new IllegalStateException("在线歌单服务返回了无效数据", exception);
        }
    }

    public String buildStreamUrl(String source, String id) {
        return resourceUrl("stream", source, id);
    }
    /** Persist stable identifiers; rebuild the API entry points when a private collection is read. */
    public OnlineSongVO refreshResourceUrls(OnlineSongVO song) {
        if (!ALLOWED_SOURCES.contains(song.getSource()) || song.getSourceSongId() == null)
            throw new IllegalArgumentException("无效的平台元数据");
        String pic = java.util.Objects.toString(song.getSourcePicId(), "");
        String cover = pic.startsWith("https://") || pic.startsWith("http://") ? pic : "";
        String audioId = song.getSourceUrlId() == null || song.getSourceUrlId().isBlank() ? song.getSourceSongId() : song.getSourceUrlId();
        song.setAudioUrl(buildStreamUrl(song.getSource(), audioId, song.getSongName(), song.getArtistName(),
                song.getAlbum(), song.getDuration(), cover, song.getSourceExtra(), song.getProviderEngine()));
        song.setCoverUrl(pic.isBlank() ? null : buildCoverUrl(song.getSource(), pic, song.getSongName(), song.getArtistName(), cover, song.getProviderEngine()));
        return song;
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
                    "tlyric", payload.path("tlyric").asText(""),
                    "romalrc", payload.path("romalrc").asText(""),
                    "source", payload.path("source").asText(source)
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
        boolean retriedAdapter = false;
        // Meting 支持的平台都允许一次适配回退，不再用 ID 形状猜测曲目来源。
        boolean adapterEligible = Set.of("netease", "qq", "tencent", "kugou", "kuwo", "baidu").contains(source);
        // QQ/酷狗 CDN 会校验 Referer，缺失时直链返回 403。
        String referer = Set.of("qq", "tencent").contains(source) ? "https://y.qq.com/"
                : "kugou".equals(source) ? "https://www.kugou.com/" : null;
        for (int redirectCount = 0; redirectCount <= 5; redirectCount++) {
            HttpURLConnection connection = (HttpURLConnection) currentUri.toURL().openConnection();
            // HttpURLConnection 不会自动跨协议跟随 http -> https，因此在这里受控处理。
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(30_000);
            connection.setRequestProperty("User-Agent", "FreeMusicPlayer/1.0");
            if (referer != null) connection.setRequestProperty("Referer", referer);
            if (range != null && !range.isBlank()) connection.setRequestProperty("Range", range);

            int status = connection.getResponseCode();
            // Resolve the exact same platform ID once with the compatibility
            // adapter. Never change recording, and never retry a partial body.
            if (!retriedAdapter && "stream".equals(resource) && adapterEligible && metadata != null
                    && "go-music-api".equals(metadata.get("engine")) && Set.of(403, 404, 410).contains(status)) {
                connection.disconnect(); retriedAdapter = true;
                currentUri = UriComponentsBuilder.fromUriString(uri).replaceQueryParam("engine", "meting").build(true).toUri();
                redirectCount = -1;
                continue;
            }
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null || location.isBlank()) break;
                URI nextUri = currentUri.resolve(location);
                if (!("http".equalsIgnoreCase(nextUri.getScheme()) || "https".equalsIgnoreCase(nextUri.getScheme()))) break;
                currentUri = nextUri;
                continue;
            }

            // 上游失败时不要透传 Content-Type/Content-Length，否则浏览器会收到
            // “声明了长度却没有响应体”的截断响应，<audio> 永远拿不到元数据。
            if (status >= 400) {
                connection.disconnect();
                response.reset();
                response.setStatus(status < 500 ? status : HttpServletResponse.SC_BAD_GATEWAY);
                response.setContentType("text/plain; charset=UTF-8");
                response.setHeader("Cache-Control", "no-store");
                response.getWriter().write("media unavailable");
                return;
            }

            response.setStatus(status);
            copyHeader(connection, response, "Content-Type");
            copyHeader(connection, response, "Content-Length");
            copyHeader(connection, response, "Content-Range");
            copyHeader(connection, response, "Accept-Ranges");
            response.setHeader("Cache-Control", "private, max-age=300");

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
