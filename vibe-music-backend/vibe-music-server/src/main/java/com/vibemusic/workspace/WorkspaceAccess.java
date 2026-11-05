package com.vibemusic.workspace;

import com.vibemusic.util.ThreadLocalUtil;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class WorkspaceAccess {
    private WorkspaceAccess() { }
    public static long userId() {
        var claims = ThreadLocalUtil.<java.util.Map<String, Object>>get();
        if (claims == null || !"ROLE_USER".equals(claims.get("role")) || claims.get("userId") == null)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要普通用户登录");
        return Long.parseLong(claims.get("userId").toString());
    }
    public static void admin() {
        var claims = ThreadLocalUtil.<java.util.Map<String, Object>>get();
        if (claims == null || !"ROLE_ADMIN".equals(claims.get("role"))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "需要管理员权限");
    }
}
