package com.vibemusic.service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.client.RestClient;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
class MediaAdapterFallbackTest {
    @Test void missingAdapterRetriesSameIdOnceAndPreservesRange() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var retries=new AtomicInteger();
        server.createContext("/stream",exchange->{
            assertEquals("bytes=0-3",exchange.getRequestHeaders().getFirst("Range"));
            String query=exchange.getRequestURI().getQuery();
            if(query.contains("engine=meting")) {
                retries.incrementAndGet();assertTrue(query.contains("id=520460577"));
                exchange.getResponseHeaders().set("Content-Type","audio/mpeg");exchange.getResponseHeaders().set("Content-Range","bytes 0-3/100");
                exchange.sendResponseHeaders(206,4);exchange.getResponseBody().write(new byte[]{1,2,3,4});
            } else exchange.sendResponseHeaders(404,-1);
            exchange.close();
        });server.start();
        try {
            var service=new OnlineMusicService(RestClient.builder(),new ObjectMapper(),"http://127.0.0.1:"+server.getAddress().getPort(),"http://unused/song");
            var response=new MockHttpServletResponse();
            service.proxyResource("stream","netease","520460577","bytes=0-3",Map.of("engine","go-music-api"),response);
            assertEquals(206,response.getStatus());assertEquals(4,response.getContentAsByteArray().length);assertEquals("bytes 0-3/100",response.getHeader("Content-Range"));assertEquals(1,retries.get());
            var incompatible=new MockHttpServletResponse();
            service.proxyResource("stream","bilibili","BV123","bytes=0-3",Map.of("engine","go-music-api"),incompatible);
            assertEquals(404,incompatible.getStatus());assertEquals(1,retries.get());
        }finally{server.stop(0);}
    }
}
