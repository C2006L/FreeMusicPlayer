package com.vibemusic.workspace;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;

@Service
public class ListeningService {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    public ListeningService(JdbcTemplate db,PlatformTransactionManager manager){this.db=db;this.tx=new TransactionTemplate(manager);}
    public static int acceptedDelta(int previous,int reported,int accepted,long elapsed) {
        return (int)Math.min(60,Math.min(Math.max(0,reported-previous),Math.max(0,elapsed+5-accepted)));
    }
    public void report(long user,ListeningController.Event event) {
        var now=LocalDateTime.now(ZoneId.of("Asia/Shanghai"));
        String key=WorkspaceService.hash(event.source()+":"+event.songId());
        tx.executeWithoutResult(status->{
            db.update("INSERT IGNORE INTO fmp_play_session(user_id,session_id,song_key,title,artist,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",user,event.sessionId(),key,event.title(),event.artist(),event.source(),now,now);
            var row=db.queryForMap("SELECT * FROM fmp_play_session WHERE user_id=? AND session_id=? FOR UPDATE",user,event.sessionId());
            if(!key.equals(row.get("song_key"))) throw new ResponseStatusException(HttpStatus.CONFLICT,"播放会话不能换成另一首歌");
            int old=((Number)row.get("reported_seconds")).intValue(), accepted=((Number)row.get("played_seconds")).intValue();
            Object timestamp=row.get("created_at");
            var started=timestamp instanceof LocalDateTime local?local:((java.sql.Timestamp)timestamp).toLocalDateTime();
            int delta=acceptedDelta(old,event.playedSeconds(),accepted,Duration.between(started,now).getSeconds());
            if(event.playedSeconds()>=old) db.update("UPDATE fmp_play_session SET reported_seconds=?,played_seconds=played_seconds+?,position_seconds=?,updated_at=? WHERE user_id=? AND session_id=?",event.playedSeconds(),delta,event.position(),now,user,event.sessionId());
        });
    }
    public Map<String,Object> stats(long user) {
        var since=LocalDate.now(ZoneId.of("Asia/Shanghai")).minusDays(29).atStartOfDay();
        var summary=db.queryForMap("SELECT COALESCE(SUM(played_seconds),0) playedSeconds,COALESCE(SUM(played_seconds>=3),0) playCount,COUNT(DISTINCT CASE WHEN played_seconds>=3 THEN song_key END) uniqueSongs FROM fmp_play_session WHERE user_id=? AND created_at>=?",user,since);
        var daily=db.queryForList("SELECT DATE(created_at) day,SUM(played_seconds) playedSeconds FROM fmp_play_session WHERE user_id=? AND created_at>=? GROUP BY DATE(created_at) ORDER BY day",user,since);
        var top=db.queryForList("SELECT song_key,title,artist,source,SUM(played_seconds) playedSeconds,COUNT(*) playCount FROM fmp_play_session WHERE user_id=? AND created_at>=? AND played_seconds>=3 GROUP BY song_key,title,artist,source ORDER BY playedSeconds DESC LIMIT 10",user,since);
        var recent=db.queryForList("SELECT title,artist,source,position_seconds position,updated_at playedAt FROM fmp_play_session WHERE user_id=? AND played_seconds>=3 ORDER BY updated_at DESC LIMIT 30",user);
        return Map.of("summary",summary,"daily",daily,"top",top,"recent",recent,"timezone","Asia/Shanghai","days",30);
    }
}
