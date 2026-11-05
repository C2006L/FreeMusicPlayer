package com.vibemusic.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import com.vibemusic.model.vo.OnlineSongVO;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import java.net.InetSocketAddress;
import java.util.concurrent.atomic.AtomicInteger;
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

    @Test void retriesTransient404OnceThenGradesSuccessfulResponse() throws Exception {
        var flakyCalls=new AtomicInteger();
        var forbiddenCalls=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/stream",exchange->{
            String query=exchange.getRequestURI().getQuery();
            assertEquals("bytes=0-0",exchange.getRequestHeaders().getFirst("Range"));
            if(query.contains("flaky")) {
                // First probe misses, the delayed retry succeeds with a full payload.
                if(flakyCalls.incrementAndGet()==1) { exchange.sendResponseHeaders(404,-1); exchange.close(); return; }
                exchange.getResponseHeaders().set("Content-Type","audio/mpeg");
                exchange.getResponseHeaders().set("Content-Range","bytes 0-0/9263064");
                exchange.sendResponseHeaders(206,1);
                try(var out=exchange.getResponseBody()){out.write(0);}
                return;
            }
            if(query.contains("forbidden")) { forbiddenCalls.incrementAndGet(); exchange.sendResponseHeaders(403,-1); exchange.close(); return; }
            exchange.sendResponseHeaders(404,-1); exchange.close();
        });
        server.start();
        try {
            var service=new OnlineMusicService(RestClient.builder(),new ObjectMapper(),"http://127.0.0.1:"+server.getAddress().getPort(),"http://unused/song");
            var flaky=OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=netease&id=flaky").duration(231L).build();
            assertEquals("full",service.gradeAvailability(flaky));
            assertEquals(2,flakyCalls.get(),"404 must be retried exactly once");
            var forbidden=OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=netease&id=forbidden").duration(231L).build();
            assertEquals("unavailable",service.gradeAvailability(forbidden));
            assertEquals(1,forbiddenCalls.get(),"403 is deterministic and must not be retried");
            var missing=OnlineSongVO.builder().audioUrl("http://unused/song/streamOnline?source=netease&id=missing").duration(231L).build();
            assertEquals("unavailable",service.gradeAvailability(missing));
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
