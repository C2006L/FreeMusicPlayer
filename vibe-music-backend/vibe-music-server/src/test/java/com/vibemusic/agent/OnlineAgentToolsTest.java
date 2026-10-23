package com.vibemusic.agent;

import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.service.OnlineMusicService;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OnlineAgentToolsTest {
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
