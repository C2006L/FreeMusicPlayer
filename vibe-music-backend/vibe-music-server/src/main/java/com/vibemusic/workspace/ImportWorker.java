package com.vibemusic.workspace;

import com.vibemusic.config.SchemaMigrationRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;
import jakarta.annotation.PreDestroy;
import java.util.UUID;
import java.util.concurrent.*;

@Configuration
@EnableScheduling
public class ImportWorker {
    private final JdbcTemplate db;
    private final WorkspaceService workspace;
    private final SchemaMigrationRunner schema;
    private final String lease=UUID.randomUUID().toString();
    private final ThreadPoolExecutor pool=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(4),r->{var t=new Thread(r,"playlist-import");t.setDaemon(true);return t;},new ThreadPoolExecutor.AbortPolicy());
    public ImportWorker(JdbcTemplate db,WorkspaceService workspace,SchemaMigrationRunner schema){this.db=db;this.workspace=workspace;this.schema=schema;}
    @Scheduled(fixedDelay=1500,initialDelay=5000)
    public void dispatch() {
        if(!schema.isReady() || pool.isShutdown()) return;
        db.update("UPDATE fmp_import_job SET status=IF(cancel_requested,'CANCELLED','QUEUED'),lease_owner=NULL,error_text='旧执行租约超时，已恢复检查点',updated_at=NOW(3) WHERE status='RUNNING' AND updated_at < NOW(3)-INTERVAL 2 MINUTE");
        int room=Math.max(0,6-pool.getActiveCount()-pool.getQueue().size());
        if(room==0)return;
        for(String id:db.queryForList("SELECT id FROM fmp_import_job WHERE status='QUEUED' AND cancel_requested=false ORDER BY created_at LIMIT ?",String.class,room)) {
            try {pool.execute(()->{
                if(db.update("UPDATE fmp_import_job SET status='RUNNING',lease_owner=?,updated_at=NOW(3) WHERE id=? AND status='QUEUED' AND cancel_requested=false",lease,id)==1) workspace.process(id,lease);
            });} catch(RejectedExecutionException ignored){break;}
        }
    }
    public int active(){return pool.getActiveCount();}
    public int queued(){return pool.getQueue().size();}
    @PreDestroy public void stop(){pool.shutdownNow();if(schema.isReady())db.update("UPDATE fmp_import_job SET status=IF(cancel_requested,'CANCELLED','QUEUED'),lease_owner=NULL,updated_at=NOW(3) WHERE status='RUNNING' AND lease_owner=?",lease);}
}
