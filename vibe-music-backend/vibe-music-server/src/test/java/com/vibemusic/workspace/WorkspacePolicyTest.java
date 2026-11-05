package com.vibemusic.workspace;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import com.vibemusic.util.ThreadLocalUtil;
import static org.junit.jupiter.api.Assertions.*;
class WorkspacePolicyTest {
    @AfterEach void clear(){ThreadLocalUtil.remove();}
    @Test void linksAreIdentifiersNotProxyUrls(){
        assertEquals(new ImportTarget("bilibili","BV1DG4y187sw"),ImportTarget.parse("https://www.bilibili.com/video/BV1DG4y187sw?p=2"));
        assertEquals("123",ImportTarget.parse("https://music.163.com/#/playlist?id=123").id());
        assertEquals("123",ImportTarget.parse("https://music.163.com/playlist?id=123&x=1").id());
        assertEquals("123",ImportTarget.parse("https://y.qq.com/n/ryqq/playlist/123").id());
        for(String url:java.util.List.of("http://127.0.0.1/private","https://music.163.com.evil.test/playlist?id=1","https://user@music.163.com/playlist?id=1","https://music.163.com:443/playlist?id=1","file:///etc/passwd")) assertThrows(IllegalArgumentException.class,()->ImportTarget.parse(url));
    }
    @Test void rolesAndIdentityComeFromVerifiedClaims(){
        assertThrows(RuntimeException.class,WorkspaceAccess::userId);
        ThreadLocalUtil.set(java.util.Map.of("role","ROLE_USER","userId",7));
        assertEquals(7,WorkspaceAccess.userId());assertThrows(RuntimeException.class,WorkspaceAccess::admin);
        ThreadLocalUtil.set(java.util.Map.of("role","ROLE_ADMIN","adminId",1));
        assertDoesNotThrow(WorkspaceAccess::admin);assertThrows(RuntimeException.class,WorkspaceAccess::userId);
    }
    @Test void listeningReportsAreMonotonicBoundedAndRetrySafe(){
        assertEquals(0,ListeningService.acceptedDelta(20,20,20,30));
        assertEquals(0,ListeningService.acceptedDelta(20,10,20,30));
        assertEquals(5,ListeningService.acceptedDelta(0,1000,0,0));
        assertEquals(15,ListeningService.acceptedDelta(3,18,3,15));
        assertEquals(60,ListeningService.acceptedDelta(0,1000,0,1000));
    }
}
