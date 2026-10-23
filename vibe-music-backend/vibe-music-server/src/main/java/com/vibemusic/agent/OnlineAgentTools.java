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

    public OnlineAgentTools(OnlineMusicService music) { this(music, null); }
    public OnlineAgentTools(OnlineMusicService music, MusicAgentTools localMusic) { this.music = music; this.localMusic = localMusic; }

    @Tool(description = "搜索真实在线歌曲。传入简短歌名、歌手名或音乐风格关键词。最多调用3次。")
    public synchronized List<Map<String, Object>> searchSongs(@ToolParam(description = "简短音乐搜索关键词") String keyword) {
        if (++calls > 3 || keyword == null || keyword.isBlank()) return List.of();
        try {
            var found = music.search(keyword.substring(0, Math.min(120, keyword.length())), null, 5).stream()
                    .filter(s -> !"unavailable".equals(s.getAvailability()))
                    .filter(s -> matches(keyword, s)).limit(5).toList();
            found.forEach(s -> { if (songs.size() < 10) songs.putIfAbsent(s.getSongId(), s); });
            return found.stream().map(s -> Map.<String, Object>of(
                    "songName", s.getSongName(), "artistName", s.getArtistName(),
                    "source", s.getSourceName(), "availability", s.getAvailability())).toList();
        } catch (Exception exception) {
            return List.of(Map.of("error", "在线曲库暂时不可用，请告知用户稍后重试"));
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

    private boolean matches(String keyword, OnlineSongVO song) {
        String text = (song.getSongName() + " " + song.getArtistName() + " " + song.getAlbum()).toLowerCase(java.util.Locale.ROOT);
        return java.util.Arrays.stream(keyword.toLowerCase(java.util.Locale.ROOT).trim().split("\\s+"))
                .allMatch(text::contains);
    }
}
