package com.vibemusic.workspace;
import com.vibemusic.result.Result;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.prometheusmetrics.PrometheusMeterRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
@RestController @RequestMapping("/admin/ops")
public class OperationsController {
    private final JdbcTemplate db;private final ImportWorker worker;private final MeterRegistry meters;private final PrometheusMeterRegistry prometheus;private final com.vibemusic.service.OnlineMusicService music;
    public OperationsController(JdbcTemplate db,ImportWorker worker,MeterRegistry meters,PrometheusMeterRegistry prometheus,com.vibemusic.service.OnlineMusicService music){this.db=db;this.worker=worker;this.meters=meters;this.prometheus=prometheus;this.music=music;}
    @GetMapping("/sources") public Result<?> sources(){WorkspaceAccess.admin();return Result.success(music.diagnostics());}
    @GetMapping public Result<?> overview(){
        WorkspaceAccess.admin();
        var http=meters.find("http.server.requests").timers().stream().map(t->Map.of("method",Objects.toString(t.getId().getTag("method"),""),"uri",Objects.toString(t.getId().getTag("uri"),""),"status",Objects.toString(t.getId().getTag("status"),""),"count",t.count(),"meanMs",t.mean(TimeUnit.MILLISECONDS),"maxMs",t.max(TimeUnit.MILLISECONDS))).toList();
        return Result.success(Map.of("jobs",db.queryForList("SELECT status,COUNT(*) count FROM fmp_import_job GROUP BY status"),"recentJobs",db.queryForList("SELECT id,user_id,title,status,total,processed,failed,updated_at FROM fmp_import_job ORDER BY created_at DESC LIMIT 50"),"audit",db.queryForList("SELECT * FROM fmp_audit ORDER BY id DESC LIMIT 100"),"http",http,"worker",Map.of("active",worker.active(),"queued",worker.queued(),"threads",2,"queueCapacity",4)));
    }
    @GetMapping(value="/prometheus",produces="text/plain") public String prometheus(){WorkspaceAccess.admin();return prometheus.scrape();}
    @GetMapping("/visitors") public Result<?> visitors(){
        WorkspaceAccess.admin();
        // 匿名统计只保留 7 天；页面和清理用同一个窗口。
        db.update("DELETE FROM fmp_visitor_event WHERE created_at < NOW(3) - INTERVAL 7 DAY");
        long unique=db.queryForObject("SELECT COUNT(DISTINCT visitor_id) FROM fmp_visitor_event",Long.class);
        long today=db.queryForObject("SELECT COUNT(DISTINCT visitor_id) FROM fmp_visitor_event WHERE created_at >= CURDATE()",Long.class);
        long events=db.queryForObject("SELECT COUNT(*) FROM fmp_visitor_event",Long.class);
        long searches=db.queryForObject("SELECT COUNT(*) FROM fmp_visitor_event WHERE event='search'",Long.class);
        var keywords=db.queryForList("SELECT keyword,COUNT(*) count FROM fmp_visitor_event WHERE event='search' AND keyword IS NOT NULL GROUP BY keyword ORDER BY count DESC LIMIT 20");
        var sources=db.queryForList("SELECT source,COUNT(*) count FROM fmp_visitor_event WHERE event IN ('stream','probe') AND source IS NOT NULL GROUP BY source ORDER BY count DESC LIMIT 20");
        var recent=db.queryForList("SELECT visitor_id,event,keyword,source,song_key,created_at FROM fmp_visitor_event ORDER BY id DESC LIMIT 100");
        return Result.success(Map.of("windowDays",7,"uniqueVisitors",unique,"todayVisitors",today,"events",events,"searches",searches,"topKeywords",keywords,"sources",sources,"recent",recent));
    }
}
