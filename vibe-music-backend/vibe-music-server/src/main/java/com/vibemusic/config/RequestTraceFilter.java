package com.vibemusic.config;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.stereotype.Component;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import java.io.IOException;
import java.util.UUID;
@Component
public class RequestTraceFilter extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
        String id=request.getHeader("X-Request-Id");
        if(id==null || !id.matches("[a-zA-Z0-9-]{8,64}")) id=UUID.randomUUID().toString();
        MDC.put("requestId",id);response.setHeader("X-Request-Id",id);
        long start=System.nanoTime();
        try{chain.doFilter(request,response);}finally{
            LoggerFactory.getLogger(RequestTraceFilter.class).info("requestId={} method={} path={} status={} elapsedMs={}",id,request.getMethod(),request.getRequestURI(),response.getStatus(),(System.nanoTime()-start)/1_000_000);
            MDC.remove("requestId");com.vibemusic.util.ThreadLocalUtil.remove();
        }
    }
}
