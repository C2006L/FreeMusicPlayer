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
}
