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
    @GetMapping("/dashboard") public Result<?> dashboard(){
        WorkspaceAccess.admin();
        // 首页数字卡：全部来自真实表计数，空表返回 0。
        long users=count("SELECT COUNT(*) FROM tb_user");
        long todayUsers=count("SELECT COUNT(*) FROM tb_user WHERE create_time >= CURDATE()");
        long artists=count("SELECT COUNT(*) FROM tb_artist");
        long artistsWithArea=count("SELECT COUNT(*) FROM tb_artist WHERE area IS NOT NULL AND area <> ''");
        long artistsWithGender=count("SELECT COUNT(*) FROM tb_artist WHERE gender IS NOT NULL");
        long songs=count("SELECT COUNT(*) FROM tb_song");
        long activeSongs=count("SELECT COUNT(*) FROM tb_song WHERE media_status='active'");
        long playlists=count("SELECT COUNT(*) FROM tb_playlist");
        // 只保留数据库中真实存在并可聚合的维度：曲库来源、可播状态、匿名访客、搜索关键词、导入任务。
        var sources=db.queryForList("SELECT source AS name,COUNT(*) AS count FROM tb_song GROUP BY source ORDER BY count DESC");
        var mediaStatus=db.queryForList("SELECT media_status AS name,COUNT(*) AS count FROM tb_song GROUP BY media_status ORDER BY count DESC");
        var importJobs=db.queryForList("SELECT status AS name,COUNT(*) AS count FROM fmp_import_job GROUP BY status ORDER BY count DESC");
        var topKeywords=db.queryForList("SELECT keyword AS name,COUNT(*) AS count FROM fmp_visitor_event WHERE event='search' AND keyword IS NOT NULL GROUP BY keyword ORDER BY count DESC LIMIT 10");
        // 趋势按天补齐，避免空数据时前端画出断裂或虚构曲线。
        var userTrend=daily("SELECT DATE(create_time) AS day,COUNT(*) AS count FROM tb_user WHERE create_time >= CURDATE() - INTERVAL 13 DAY GROUP BY day",14);
        var visitorTrend=daily("SELECT DATE(created_at) AS day,COUNT(DISTINCT visitor_id) AS count FROM fmp_visitor_event WHERE created_at >= CURDATE() - INTERVAL 6 DAY GROUP BY day",7);
        Map<String,Object> payload=new LinkedHashMap<>();
        payload.put("users",Map.of("total",users,"today",todayUsers));
        payload.put("artists",Map.of("total",artists,"withArea",artistsWithArea,"withGender",artistsWithGender));
        payload.put("songs",Map.of("total",songs,"active",activeSongs));
        payload.put("playlists",Map.of("total",playlists));
        payload.put("sources",sources);
        payload.put("mediaStatus",mediaStatus);
        payload.put("importJobs",importJobs);
        payload.put("topKeywords",topKeywords);
        payload.put("userTrend",userTrend);
        payload.put("visitorTrend",visitorTrend);
        payload.put("generatedAt",new java.util.Date().toString());
        return Result.success(payload);
    }
    private long count(String sql){Long value=db.queryForObject(sql,Long.class);return value==null?0L:value;}
    private List<Map<String,Object>> daily(String sql,int days){
        Map<String,Long> byDay=new HashMap<>();
        for(Map<String,Object> row:db.queryForList(sql)){byDay.put(String.valueOf(row.get("day")),((Number)row.get("count")).longValue());}
        List<Map<String,Object>> series=new ArrayList<>();
        java.time.LocalDate today=java.time.LocalDate.now();
        for(int i=days-1;i>=0;i--){String day=today.minusDays(i).toString();series.add(Map.of("date",day,"count",byDay.getOrDefault(day,0L)));}
        return series;
    }
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
