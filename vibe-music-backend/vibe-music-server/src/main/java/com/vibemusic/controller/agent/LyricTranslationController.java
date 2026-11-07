package com.vibemusic.controller.agent;

import com.vibemusic.service.LyricTranslationService;
import com.vibemusic.result.Result;
import com.vibemusic.util.ThreadLocalUtil;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/agent/lyrics/translations")
public class LyricTranslationController {
    public record Request(@NotEmpty @Size(max=200) List<LyricTranslationService.Line> lines) {}
    private final LyricTranslationService service;
    public LyricTranslationController(LyricTranslationService service) {this.service=service;}
    @PostMapping public Result<Map<String,Object>> start(@Valid @RequestBody Request body,HttpServletRequest request) {return Result.success(service.start(owner(request),body.lines()));}
    @GetMapping("/{id}") public Result<Map<String,Object>> status(@PathVariable String id,HttpServletRequest request) {return Result.success(service.status(owner(request),id));}
    @DeleteMapping("/{id}") public Result<Map<String,Object>> cancel(@PathVariable String id,HttpServletRequest request) {return Result.success(service.cancel(owner(request),id));}
    private String owner(HttpServletRequest request) {
        Map<String,Object> claims=ThreadLocalUtil.get();Object id=claims==null?null:claims.get("userId");
        if(id!=null) return "user:"+id;
        // 匿名请求不能依赖服务端 session：前端请求不带 Cookie 时每次都是新 session，轮询必然 404。
        // 复用浏览器持久化的匿名标识，保证发起与查询落到同一个 owner。
        String visitor=request.getHeader("X-Visitor-Id");
        if(visitor!=null) {
            String normalized=visitor.trim();
            if(normalized.matches("[A-Za-z0-9_-]{8,64}")) return "anon:"+normalized;
        }
        return "session:"+request.getSession(true).getId();
    }
}
