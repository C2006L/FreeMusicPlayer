package com.vibemusic.agent;

import com.vibemusic.controller.agent.AgentController;
import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class AgentRecommendationFlowTest {
    @Test void catalogRecommendationFinishesWithoutWaitingForAnyLanguageModel() throws Exception {
        @SuppressWarnings("unchecked") ObjectProvider<ChatModel> models=mock(ObjectProvider.class);
        var music=mock(OnlineMusicService.class);
        var song=OnlineSongVO.builder().songId("studio").songName("蓝莲花").artistName("许巍").album("时光漫步").audioUrl("http://local/audio").build();
        when(music.search(anyString(),anyList(),eq(20))).thenReturn(List.of(song));
        when(music.canOpenAudio(any())).thenReturn(true);
        var controller=new AgentController(models,music,mock(AiStatusService.class),mock(MusicAgentTools.class),"ollama","test-model");
        var mvc=MockMvcBuilders.standaloneSetup(controller).setMessageConverters(
                new org.springframework.http.converter.StringHttpMessageConverter(java.nio.charset.StandardCharsets.UTF_8),
                new org.springframework.http.converter.json.MappingJackson2HttpMessageConverter()).build();
        var request=mvc.perform(post("/agent/chat").contentType("application/json").content("{\"conversationId\":\"test-rock\",\"query\":\"推荐几首摇滚歌曲\"}"))
                .andExpect(request().asyncStarted()).andReturn();
        request.getAsyncResult(3000);
        String body=mvc.perform(asyncDispatch(request)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(body.contains("event:done"),body);assertTrue(body.contains("蓝莲花"),body);assertTrue(body.contains("曲库检索结果"),body);
        verify(models,times(1)).getIfAvailable();
    }
}
