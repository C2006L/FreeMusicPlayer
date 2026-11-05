package com.vibemusic.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import static org.junit.jupiter.api.Assertions.*;

class LyricTranslationServiceTest {
    final ObjectMapper mapper=new ObjectMapper();
    @Test void validatesIdsAndOrderWithoutAcceptingMissingOrDuplicatedTranslations() throws Exception {
        var input=List.of(new LyricTranslationService.Line(3,"first"),new LyricTranslationService.Line(9,"second"));
        var output=LyricTranslationService.validateBatch(mapper.readTree("{\"lines\":[{\"id\":9,\"text\":\"二\"},{\"id\":3,\"text\":\"一\"}]}"),input);
        assertEquals(List.of(3,9),output.stream().map(LyricTranslationService.Line::id).toList());
        assertThrows(IllegalArgumentException.class,()->LyricTranslationService.validateBatch(mapper.readTree("{\"lines\":[{\"id\":3,\"text\":\"一\"},{\"id\":3,\"text\":\"二\"}]}"),input));
        assertThrows(IllegalArgumentException.class,()->LyricTranslationService.validateBatch(mapper.readTree("{\"lines\":[]}"),input));
    }
    @Test void realHttpTaskIsCachedAndPrivateAndCancellable() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var entered=new CountDownLatch(1); var release=new CountDownLatch(1);
        server.createContext("/api/chat",exchange->{
            String request=new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8);
            if(request.contains("slow")){entered.countDown();try{release.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}}
            byte[] body=mapper.writeValueAsBytes(Map.of("message",Map.of("content","{\"lines\":[{\"id\":0,\"text\":\"你好\"}]}")));
            try{exchange.sendResponseHeaders(200,body.length);exchange.getResponseBody().write(body);}finally{exchange.close();}
        }); server.start();
        var service=new LyricTranslationService(mapper,"http://127.0.0.1:"+server.getAddress().getPort(),"fixture-model");
        try {
            var input=List.of(new LyricTranslationService.Line(0,"hello"));
            var first=service.start("owner-a",input);String id=first.get("id").toString();
            long deadline=System.currentTimeMillis()+5000;
            while(!service.status("owner-a",id).get("status").equals("SUCCEEDED") && System.currentTimeMillis()<deadline)Thread.sleep(10);
            assertEquals("SUCCEEDED",service.status("owner-a",id).get("status"));
            assertEquals(id,service.start("owner-a",input).get("id"));
            assertThrows(ResponseStatusException.class,()->service.status("owner-b",id));
            var slow=service.start("owner-a",List.of(new LyricTranslationService.Line(0,"slow")));String slowId=slow.get("id").toString();
            assertTrue(entered.await(3,java.util.concurrent.TimeUnit.SECONDS));
            assertThrows(ResponseStatusException.class,()->service.start("owner-a",input.stream().map(l->new LyricTranslationService.Line(1,l.text())).toList()));
            assertEquals("CANCELLED",service.cancel("owner-a",slowId).get("status"));
            assertThrows(ResponseStatusException.class,()->service.start("owner-a",List.of(new LyricTranslationService.Line(0,""))));
        } finally { release.countDown();service.close();server.stop(0); }
    }
}
