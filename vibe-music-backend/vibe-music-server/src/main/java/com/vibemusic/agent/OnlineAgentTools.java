package com.vibemusic.agent;

import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.model.vo.SongVO;
import com.vibemusic.service.OnlineMusicService;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Request-scoped collection: cards use service results, never model-generated URLs. */
public class OnlineAgentTools {
    private final OnlineMusicService music;
    private final MusicAgentTools localMusic;
    private final Map<String, Object> songs = new LinkedHashMap<>();
    private int calls;
    private final boolean completeOnly;
    private boolean searchFailed;

    public OnlineAgentTools(OnlineMusicService music) { this(music, null); }
    public OnlineAgentTools(OnlineMusicService music, MusicAgentTools localMusic) { this(music, localMusic, false); }
    public OnlineAgentTools(OnlineMusicService music, MusicAgentTools localMusic, boolean completeOnly) {
        this.music = music; this.localMusic = localMusic; this.completeOnly = completeOnly;
    }

    public static boolean requestsCompleteOnly(String query) {
        if (query == null) return false;
        return java.util.regex.Pattern.compile("只.{0,12}(完整|完整版|非试听)|不要.{0,4}试听|不.{0,4}试听|only.{0,20}(full|complete)",
                java.util.regex.Pattern.CASE_INSENSITIVE).matcher(query).find();
    }

    private static final java.util.regex.Pattern NATURAL_QUERY = java.util.regex.Pattern.compile(
            ".*(最近|热门|流行|推荐|什么歌|哪些歌|榜单|排行|好听|在听|歌曲).*");

    @Tool(description = "搜索真实在线歌曲。传入具体歌名或歌手名，不要把情绪句子当作歌名。最多调用3次。")
    public synchronized List<Map<String, Object>> searchSongs(@ToolParam(description = "具体歌名或歌手名") String keyword) {
        if (keyword == null || keyword.isBlank()) return List.of();
        String trimmed = keyword.trim();
        // 模型有时把整句描述当歌名，这里先拦截，避免全词匹配必然 0 命中后编造标题。
        if (trimmed.length() > 20 || NATURAL_QUERY.matcher(trimmed).find())
            return List.of(Map.of("status", "invalid_keyword",
                    "message", "这是描述性问句而不是歌名/歌手，请传入具体歌名或歌手；热门/榜单类问题由系统的热门入口处理"));
        if (++calls > 3) return List.of();
        try {
            var found = music.search(trimmed.substring(0, Math.min(120, trimmed.length())), null, 5).stream()
                    .filter(s -> !"unavailable".equals(s.getAvailability()))
                    .filter(s -> !completeOnly || "full".equals(s.getAvailability()))
                    .filter(s -> matches(trimmed, s)).limit(5).toList();
            if (found.isEmpty() && completeOnly) return List.of(Map.of("message",
                    "没有服务端已验证完整的资源；未知状态或可打开的链接不能证明完整播放。"));
            found.forEach(s -> { if (songs.size() < 10) songs.putIfAbsent(s.getSongId(), s); });
            return found.stream().map(s -> Map.<String, Object>of(
                    "songName", java.util.Objects.toString(s.getSongName(), ""), "artistName", java.util.Objects.toString(s.getArtistName(), ""),
                    "source", java.util.Objects.toString(s.getSourceName(), ""), "availability", java.util.Objects.toString(s.getAvailability(), "unknown"))).toList();
        } catch (Exception exception) {
            searchFailed = true;
            return List.of(Map.of("status", "search_unavailable", "message", "音乐搜索服务本次未返回有效响应"));
        }
    }

    @Tool(description = "按关键词搜索用户已收录的本地曲库，只在用户要求本地音乐时使用。")
    public synchronized List<SongVO> searchLocalSongs(@ToolParam(description = "本地歌曲、歌手或专辑名") String keyword) {
        if (++calls > 3 || localMusic == null || keyword == null || keyword.isBlank()) return List.of();
        var found = localMusic.searchSongs(keyword).stream().filter(s -> s.getAudioUrl() != null && !s.getAudioUrl().isBlank()).limit(5).toList();
        found.forEach(s -> { if (songs.size() < 10) songs.putIfAbsent("local:" + s.getSongId(), s); });
        return found;
    }

    public synchronized List<Object> songs() { return new ArrayList<>(songs.values()); }
    public synchronized String preparedContext(List<String> queries) {
        var summaries = new ArrayList<Map<String,Object>>();
        for(String query:queries) {
            if(++calls>3)break;
            int split=query.lastIndexOf(' ');
            String title=query.substring(0,split),artist=query.substring(split+1);
            try {
                var base=music.search(query,List.of("netease","qq","kuwo","migu"),20).stream()
                        .filter(song->title.equalsIgnoreCase(java.util.Objects.toString(song.getSongName(),"")) && artist.equalsIgnoreCase(java.util.Objects.toString(song.getArtistName(),"")))
                        .filter(OnlineAgentTools::studioEdition)
                        .filter(song->!"unavailable".equals(java.util.Objects.toString(song.getAvailability(),"unknown")))
                        .toList();
                var complete=base.stream()
                        .filter(song->!"preview".equals(java.util.Objects.toString(song.getAvailability(),"unknown")))
                        .filter(song->!completeOnly || "full".equals(song.getAvailability()))
                        .sorted(java.util.Comparator.comparingInt(song->song.getDuration()!=null && song.getDuration()>0?0:1))
                        .limit(2).toList();
                // 完整音频缺失时退回真实试听候选，availability 仍为 preview，不伪装成完整可播。
                var candidates=complete.isEmpty() && !completeOnly?base.stream()
                        .sorted(java.util.Comparator.comparingInt(song->song.getDuration()!=null && song.getDuration()>0?0:1))
                        .limit(2).toList():complete;
                for(var song:candidates) {
                    if(!music.canOpenAudio(song))continue;
                    songs.putIfAbsent(song.getSongId(),song);
                    summaries.add(Map.of("songName",song.getSongName(),"artistName",song.getArtistName(),"availability",java.util.Objects.toString(song.getAvailability(),"unknown")));
                    break;
                }
            } catch(Exception error) { searchFailed=true; }
        }
        return summaries.toString();
    }
    public synchronized boolean searchFailed() { return searchFailed; }
    /** 热门/榜单意图走 provider /discover（真实推荐歌单），不伪造曲目。 */
    public synchronized String preparedDiscoveryContext() {
        try {
            var summaries = new ArrayList<Map<String,Object>>();
            var found = music.discover(20).stream()
                    .filter(song->!"unavailable".equals(java.util.Objects.toString(song.getAvailability(),"unknown")))
                    .filter(song->!completeOnly || "full".equals(song.getAvailability()))
                    .filter(OnlineAgentTools::studioEdition)
                    .limit(6).toList();
            for(var song:found) {
                songs.putIfAbsent(song.getSongId(),song);
                summaries.add(Map.of("songName",java.util.Objects.toString(song.getSongName(),""),
                        "artistName",java.util.Objects.toString(song.getArtistName(),""),
                        "availability",java.util.Objects.toString(song.getAvailability(),"unknown")));
            }
            if(found.isEmpty()) searchFailed=true;
            return summaries.toString();
        } catch(Exception error) { searchFailed=true; return "[]"; }
    }
    private static boolean studioEdition(OnlineSongVO song) {
        String text=java.util.Objects.toString(song.getSongName(),"")+" "+java.util.Objects.toString(song.getAlbum(),"");
        return !java.util.regex.Pattern.compile("(?i)remix|混音|live|现场|演唱会|cover|翻唱|伴奏|instrumental|acoustic|不插电|demo|remaster|重制|改编|加速|降速|慢板|(^|[\\s（(])dj").matcher(text).find();
    }

    private boolean matches(String keyword, OnlineSongVO song) {
        String text = (song.getSongName() + " " + song.getArtistName() + " " + song.getAlbum()).toLowerCase(java.util.Locale.ROOT);
        return java.util.Arrays.stream(keyword.toLowerCase(java.util.Locale.ROOT).trim().split("\\s+"))
                .allMatch(text::contains);
    }
}
