package com.vibemusic.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.vibemusic.model.vo.OnlineSongVO;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import java.net.InetSocketAddress;
import static org.junit.jupiter.api.Assertions.*;

class OnlineMediaProbeTest {
    @Test void probeUsesRangeAndRejectsMissingOrNonAudioResponses() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/stream",exchange->{
            assertEquals("bytes=0-0",exchange.getRequestHeaders().getFirst("Range"));
            String query=exchange.getRequestURI().getQuery();
            int code=query.contains("missing")?404:query.contains("json")?200:206;
            exchange.getResponseHeaders().set("Content-Type",query.contains("json")?"application/json":"audio/mpeg");
            exchange.sendResponseHeaders(code,1);try(var out=exchange.getResponseBody()){out.write(0);}
        });
        server.start();
        try {
            var service=new OnlineMusicService(RestClient.builder(),new ObjectMapper(),"http://127.0.0.1:"+server.getAddress().getPort(),"http://unused/song");
            assertTrue(service.canOpenAudio(OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=qq&id=valid").build()));
            assertFalse(service.canOpenAudio(OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=qq&id=missing").build()));
            assertFalse(service.canOpenAudio(OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=qq&id=json").build()));
        } finally {server.stop(0);}
    }

    @Test void gradesCompleteAndTrialPayloadsWithoutGuessing() {
        // Real observations: netease 206 audio/mpeg with these Content-Range totals.
        assertEquals("full",OnlineMusicService.classifyBytes(9_263_064,231));
        assertEquals("preview",OnlineMusicService.classifyBytes(481_115,294));
        assertEquals("preview",OnlineMusicService.classifyBytes(720_813,238));
        // A genuinely short song is not a trial when its payload matches the duration.
        assertEquals("full",OnlineMusicService.classifyBytes(2_160_000,54));
        // Ambiguous bitrate or missing duration stays unverified instead of claiming full.
        assertNull(OnlineMusicService.classifyBytes(2_000_000,400));
        assertNull(OnlineMusicService.classifyBytes(5_000_000,0));
        assertNull(OnlineMusicService.classifyBytes(0,200));
    }
}
