package com.vibemusic.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import static org.junit.jupiter.api.Assertions.*;

class OnlineMusicCollectionTest {
    @Test
    void forwardsDirectoryWithoutReorderingOrLosingCid() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/bilibili/collection", exchange -> {
            byte[] body = """
                    {"songs":[
                      {"source":"bilibili","id":"BV1DG4y187sw|9","name":"P1","providerEngine":"go-music-api","sourceExtra":"{\\"cid\\":\\"9\\"}"},
                      {"source":"bilibili","id":"BV1DG4y187sw|2","name":"P2","providerEngine":"go-music-api","sourceExtra":"{\\"cid\\":\\"2\\"}"}
                    ]}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, body.length);
            try (var stream = exchange.getResponseBody()) { stream.write(body); }
        });
        server.start();
        try {
            var service = new OnlineMusicService(RestClient.builder(), new ObjectMapper(),
                    "http://127.0.0.1:" + server.getAddress().getPort(), "http://localhost:18080/song");
            var songs = service.bilibiliCollection("BV1DG4y187sw");
            assertEquals(2, songs.size());
            assertEquals("BV1DG4y187sw|9", songs.get(0).getSourceSongId());
            assertEquals("BV1DG4y187sw|2", songs.get(1).getSourceSongId());
            assertTrue(songs.get(0).getAudioUrl().contains("engine=go-music-api"));
            assertTrue(songs.get(0).getSourceExtra().contains("9"));
            songs.get(0).setAudioUrl("http://old-backend.invalid:8080/expired");
            assertTrue(service.refreshResourceUrls(songs.get(0)).getAudioUrl().startsWith("http://localhost:18080/song/streamOnline?"));
            assertThrows(IllegalArgumentException.class, () -> service.bilibiliCollection("http://localhost"));
        } finally { server.stop(0); }
    }
}
