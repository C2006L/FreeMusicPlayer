package com.vibemusic.agent;

import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.service.OnlineMusicService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OnlineAgentToolsTest {
    @Test void moodRequestsUseRealThemeQueriesButExplicitSongRequestsRemainUntouched() {
        var queries=RecommendationPlan.themeQueries("心情低落的时候听什么好？");
        assertFalse(queries.isEmpty());
        assertTrue(queries.stream().noneMatch(query->query.contains("平凡之路")));
        assertTrue(queries.stream().noneMatch(query->query.contains("陪你度过漫长岁月")));
        assertTrue(queries.stream().allMatch(query->query.contains(" ")));
        assertTrue(RecommendationPlan.themeQueries("搜索《悲伤音乐》").isEmpty());
        assertTrue(RecommendationPlan.themeQueries("播放罗大佑的童年").isEmpty());
    }
    @Test void themeContextUsesProviderResultsAndKeepsAvailabilityTruthful() {
        var music=mock(OnlineMusicService.class);
        var unknown=OnlineSongVO.builder().songId("1").songName("后来").artistName("刘若英").availability("unknown").build();
        var full=OnlineSongVO.builder().songId("2").songName("十年").artistName("陈奕迅").availability("full").build();
        var cover=OnlineSongVO.builder().songId("3").songName("后来 (翻唱)").artistName("Other").availability("unknown").build();
        when(music.theme(anyList(),eq(20))).thenReturn(List.of(unknown,full,cover));
        var tools=new OnlineAgentTools(music);
        String context=tools.preparedThemeContext(List.of("失恋 疗伤","分手 情歌"));
        assertEquals(List.of(unknown,full),tools.songs());
        assertTrue(context.contains("availability=unknown"));
        verify(music).theme(argThat(list->list.size()==2),eq(20));
    }
    @Test void preparedRecommendationsRejectCoversAndWrongArtists() {
        var music=mock(OnlineMusicService.class);
        var original=OnlineSongVO.builder().songId("original").songName("平凡之路").artistName("朴树").availability("unknown").build();
        var cover=OnlineSongVO.builder().songId("cover").songName("平凡之路 (Cover 朴树)").artistName("Other").availability("unknown").build();
        when(music.search(anyString(),anyList(),eq(20))).thenReturn(List.of(cover,original));
        when(music.canOpenAudio(any())).thenReturn(true);
        var tools=new OnlineAgentTools(music);tools.preparedContext(List.of("平凡之路 朴树"));
        assertEquals(List.of(original),tools.songs());
        var strict=new OnlineAgentTools(music,null,true);strict.preparedContext(List.of("平凡之路 朴树"));assertTrue(strict.songs().isEmpty());
    }
    @Test void preparedRecommendationsCheckAlbumEditionAndTryNextReachableEntry() {
        var music=mock(OnlineMusicService.class);
        var remix=OnlineSongVO.builder().songId("remix").songName("蓝莲花").artistName("许巍").album("一时 Remix概念精选辑").build();
        var broken=OnlineSongVO.builder().songId("broken").songName("蓝莲花").artistName("许巍").album("时光漫步").build();
        var studio=OnlineSongVO.builder().songId("studio").songName("蓝莲花").artistName("许巍").album("时光漫步").build();
        when(music.search(anyString(),anyList(),eq(20))).thenReturn(List.of(remix,broken,studio));
        when(music.canOpenAudio(studio)).thenReturn(true);
        var tools=new OnlineAgentTools(music);tools.preparedContext(List.of("蓝莲花 许巍"));
        assertEquals(List.of(studio),tools.songs());verify(music,never()).canOpenAudio(remix);
    }
    @Test
    void completeOnlyNeverTreatsUnknownOrVipAsFull() {
        OnlineMusicService music = mock(OnlineMusicService.class);
        OnlineSongVO unknown = OnlineSongVO.builder().songId("1").songName("Numb").availability("unknown").build();
        OnlineSongVO restricted = OnlineSongVO.builder().songId("2").songName("Numb").availability("restricted").build();
        when(music.search(anyString(), isNull(), eq(5))).thenReturn(List.of(unknown, restricted));
        OnlineAgentTools tools = new OnlineAgentTools(music, null, true);
        assertTrue(tools.searchSongs("Numb").get(0).containsKey("message"));
        assertTrue(tools.songs().isEmpty());
        assertTrue(OnlineAgentTools.requestsCompleteOnly("只要完整版 Numb，不要试听"));
        assertTrue(OnlineAgentTools.requestsCompleteOnly("Only full songs please"));
        assertFalse(OnlineAgentTools.requestsCompleteOnly("搜索 Numb"));
    }

    @Test
    void cardsUseRealSearchMetadataAndBoundToolCalls() {
        OnlineMusicService music = mock(OnlineMusicService.class);
        OnlineSongVO song = OnlineSongVO.builder().songId("online:qq:123").songName("Numb")
                .artistName("Linkin Park").sourceName("QQ 音乐").source("qq")
                .availability("restricted").audioUrl("http://localhost:18080/song/streamOnline").build();
        when(music.search(anyString(), isNull(), eq(5))).thenReturn(List.of(song));
        OnlineAgentTools tools = new OnlineAgentTools(music);
        for (int i = 0; i < 5; i++) tools.searchSongs("Numb");
        verify(music, times(3)).search("Numb", null, 5);
        assertEquals(1, tools.songs().size());
        assertSame(song, tools.songs().get(0));
    }
}
