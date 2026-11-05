package com.vibemusic.workspace;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.model.vo.OnlineSongVO;
import com.vibemusic.service.OnlineMusicService;
import org.slf4j.MDC;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

@Service
public class WorkspaceService {
    private final JdbcTemplate db;
    private final ObjectMapper json;
    private final OnlineMusicService music;
    private final TransactionTemplate tx;
    public WorkspaceService(JdbcTemplate db, ObjectMapper json, OnlineMusicService music, PlatformTransactionManager manager) {
        this.db=db; this.json=json; this.music=music; this.tx=new TransactionTemplate(manager);
    }
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
    public void audit(long user, String action, String resource) {
        db.update("INSERT INTO fmp_audit(user_id,action,resource_id,request_id) VALUES(?,?,?,?)", user,action,resource,MDC.get("requestId"));
    }
    @org.springframework.transaction.annotation.Transactional
    public void purgeUser(long user) {
        // Called inside account deletion's transaction, sharing the owner lock with create/retry.
        db.queryForList("SELECT id FROM tb_user WHERE id=? FOR UPDATE", user);
        db.update("DELETE FROM fmp_import_job WHERE user_id=?", user);
        db.update("DELETE FROM fmp_collection WHERE user_id=?", user);
        db.update("DELETE FROM fmp_play_session WHERE user_id=?", user);
        db.update("UPDATE fmp_audit SET user_id=NULL WHERE user_id=?", user);
    }
    public Map<String,Object> create(long user, String link, String title, String requestKey) {
        ImportTarget target=ImportTarget.parse(link);
        return tx.execute(status -> {
            db.queryForList("SELECT id FROM tb_user WHERE id=? FOR UPDATE", user);
            var existing=db.queryForList("SELECT * FROM fmp_import_job WHERE user_id=? AND request_key=?", user,requestKey);
            if (!existing.isEmpty()) {
                var job=existing.get(0);
                if (!target.source().equals(job.get("source")) || !target.id().equals(job.get("source_id")))
                    throw new ResponseStatusException(HttpStatus.CONFLICT,"同一幂等键不能用于不同链接");
                return job;
            }
            if (db.queryForObject("SELECT COUNT(*) FROM fmp_import_job WHERE user_id=? AND status IN ('QUEUED','RUNNING')",Integer.class,user)>=5)
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"每个用户最多同时保留5个活动任务");
            String collection=UUID.randomUUID().toString(), id=UUID.randomUUID().toString();
            db.update("INSERT INTO fmp_collection(id,user_id,source,source_id,title) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE id=id",collection,user,target.source(),target.id(),title.trim());
            collection=db.queryForObject("SELECT id FROM fmp_collection WHERE user_id=? AND source=? AND source_id=?",String.class,user,target.source(),target.id());
            db.update("INSERT INTO fmp_import_job(id,user_id,collection_id,source,source_id,title,request_key) VALUES(?,?,?,?,?,?,?)",id,user,collection,target.source(),target.id(),title.trim(),requestKey);
            audit(user,"IMPORT_CREATE",id);
            return job(user,id);
        });
    }
    public List<Map<String,Object>> jobs(long user) { return db.queryForList("SELECT * FROM fmp_import_job WHERE user_id=? ORDER BY created_at DESC LIMIT 100", user); }
    public Map<String,Object> job(long user,String id) { return owned("fmp_import_job",user,id); }
    private Map<String,Object> owned(String table,long user,String id) {
        var rows=db.queryForList("SELECT * FROM "+table+" WHERE id=? AND user_id=?",id,user);
        if(rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"记录不存在或不属于当前用户");
        return rows.get(0);
    }
    public List<Map<String,Object>> items(long user,String id) {
        job(user,id);
        return db.queryForList("SELECT position,status,error_text,metadata FROM fmp_import_item WHERE job_id=? ORDER BY position LIMIT 1000",id);
    }
    public void cancel(long user,String id) {
        job(user,id);
        db.update("UPDATE fmp_import_job SET cancel_requested=true,status=IF(status='QUEUED','CANCELLED',status),updated_at=NOW(3) WHERE id=? AND user_id=? AND status IN ('QUEUED','RUNNING')",id,user);
        audit(user,"IMPORT_CANCEL",id);
    }
    public void retry(long user,String id) {
        tx.executeWithoutResult(status -> {
            db.queryForList("SELECT id FROM tb_user WHERE id=? FOR UPDATE",user);
            job(user,id);
            owned("fmp_collection",user,job(user,id).get("collection_id").toString());
            if(db.queryForObject("SELECT COUNT(*) FROM fmp_import_job WHERE user_id=? AND status IN ('QUEUED','RUNNING')",Integer.class,user)>=5)
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"每个用户最多同时保留5个活动任务");
            int changed=db.update("UPDATE fmp_import_job SET status='QUEUED',cancel_requested=false,lease_owner=NULL,error_text=NULL,updated_at=NOW(3) WHERE id=? AND user_id=? AND status IN ('FAILED','PARTIAL','CANCELLED')",id,user);
            if(changed==0) throw new ResponseStatusException(HttpStatus.CONFLICT,"只有失败、部分成功或已取消任务可以重试");
            db.update("UPDATE fmp_import_item SET status='PENDING',error_text=NULL WHERE job_id=? AND status='FAILED'",id);
            recount(id);
            audit(user,"IMPORT_RETRY",id);
        });
    }
    public List<Map<String,Object>> collections(long user) {
        return db.queryForList("SELECT c.*, (SELECT COUNT(*) FROM fmp_collection_song s WHERE s.collection_id=c.id) song_count FROM fmp_collection c WHERE user_id=? ORDER BY created_at DESC LIMIT 100",user);
    }
    public List<OnlineSongVO> songs(long user,String id) {
        owned("fmp_collection",user,id);
        List<OnlineSongVO> songs=db.query("SELECT metadata FROM fmp_collection_song WHERE collection_id=? ORDER BY position", (rs,n)-> {
            try { return music.refreshResourceUrls(json.readValue(rs.getString(1),OnlineSongVO.class)); }
            catch(Exception e) { throw new IllegalStateException("曲库元数据无效",e); }
        },id);
        // Read current account favorites; do not persist like state inside imported JSON.
        var registered=db.queryForList("SELECT s.id,s.source,s.source_song_id,EXISTS(SELECT 1 FROM tb_user_favorite f WHERE f.song_id=s.id AND f.user_id=? AND f.type=0) liked FROM tb_song s JOIN fmp_collection_song m ON m.collection_id=? AND JSON_UNQUOTE(JSON_EXTRACT(m.metadata,'$.source'))=s.source AND JSON_UNQUOTE(JSON_EXTRACT(m.metadata,'$.sourceSongId'))=s.source_song_id",user,id);
        Map<String,Map<String,Object>> bySource=new HashMap<>();
        registered.forEach(row->bySource.put(row.get("source")+":"+row.get("source_song_id"),row));
        for(var song:songs) {
            var row=bySource.get(song.getSource()+":"+song.getSourceSongId());
            if(row!=null){song.setSongId(row.get("id").toString());song.setOnline(false);song.setLikeStatus(((Number)row.get("liked")).intValue());}
        }
        return songs;
    }
    public void rename(long user,String id,String title) {
        tx.executeWithoutResult(status->{owned("fmp_collection",user,id);db.update("UPDATE fmp_collection SET title=? WHERE id=? AND user_id=?",title.trim(),id,user);audit(user,"COLLECTION_RENAME",id);});
    }
    public void delete(long user,String id) {
        tx.executeWithoutResult(status->{
            db.queryForList("SELECT id FROM tb_user WHERE id=? FOR UPDATE",user);
            owned("fmp_collection",user,id);
            if(db.queryForObject("SELECT COUNT(*) FROM fmp_import_job WHERE collection_id=? AND status IN ('QUEUED','RUNNING')",Integer.class,id)>0)
                throw new ResponseStatusException(HttpStatus.CONFLICT,"请先取消正在导入该歌单的任务，并等待任务结束");
            db.update("DELETE FROM fmp_collection WHERE id=? AND user_id=?",id,user);audit(user,"COLLECTION_DELETE",id);
        });
    }
    private void recount(String id) {
        var counts=db.queryForMap("SELECT COUNT(*) total,COALESCE(SUM(status='SUCCESS'),0) succeeded,COALESCE(SUM(status='FAILED'),0) failed FROM fmp_import_item WHERE job_id=?",id);
        long success=((Number)counts.get("succeeded")).longValue(), failed=((Number)counts.get("failed")).longValue();
        db.update("UPDATE fmp_import_job SET total=?,succeeded=?,failed=?,processed=?,updated_at=NOW(3) WHERE id=?", counts.get("total"),success,failed,success+failed,id);
    }
    public void process(String id,String lease) {
        var job=db.queryForMap("SELECT * FROM fmp_import_job WHERE id=?",id);
        try {
            if(!Boolean.TRUE.equals(job.get("directory_loaded"))) {
                List<OnlineSongVO> songs=music.playlist(job.get("source").toString(),job.get("source_id").toString());
                if(songs.isEmpty() || songs.size()>1000) throw new IllegalArgumentException("源歌单未返回1到1000条有效目录；没有按歌名猜测填充");
                if(cancelled(id,lease)) {finish(id,lease,"CANCELLED",null);return;}
                tx.executeWithoutResult(status->{
                    var lock=db.queryForMap("SELECT status,cancel_requested,lease_owner FROM fmp_import_job WHERE id=? FOR UPDATE",id);
                    if(!"RUNNING".equals(lock.get("status")) || Boolean.TRUE.equals(lock.get("cancel_requested")) || !lease.equals(lock.get("lease_owner"))) return;
                    int position=0;
                    for(var song:songs) {
                        if(Thread.currentThread().isInterrupted()) throw new IllegalStateException("worker stopping");
                        String key=hash(song.getSource()+":"+song.getSourceSongId());
                        try { db.update("INSERT IGNORE INTO fmp_import_item(job_id,item_key,position,metadata) VALUES(?,?,?,?)",id,key,position++,json.writeValueAsString(song)); }
                        catch(java.io.IOException e){throw new IllegalArgumentException("Invalid metadata",e);}
                    }
                    db.update("UPDATE fmp_import_job SET directory_loaded=true,updated_at=NOW(3) WHERE id=? AND lease_owner=?",id,lease);
                });
            }
            recount(id);
            var pending=db.queryForList("SELECT * FROM fmp_import_item WHERE job_id=? AND status='PENDING' ORDER BY position",id);
            for(var item:pending) {
                if(cancelled(id,lease)) { finish(id,lease,"CANCELLED",null); return; }
                tx.executeWithoutResult(status->{
                    var lock=db.queryForMap("SELECT cancel_requested,lease_owner FROM fmp_import_job WHERE id=? FOR UPDATE",id);
                    if(Boolean.TRUE.equals(lock.get("cancel_requested")) || !lease.equals(lock.get("lease_owner"))) return;
                    try {
                        var song=json.readValue(item.get("metadata").toString(),OnlineSongVO.class);
                        if(song.getSourceSongId()==null || song.getSongName()==null || song.getSongName().isBlank() || "unavailable".equals(song.getAvailability()))
                            throw new IllegalArgumentException("源条目无有效标识或已被上游标记不可用");
                        db.update("INSERT INTO fmp_collection_song(collection_id,item_key,position,metadata) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE position=VALUES(position),metadata=VALUES(metadata)",job.get("collection_id"),item.get("item_key"),item.get("position"),item.get("metadata"));
                        db.update("UPDATE fmp_import_item SET status='SUCCESS',error_text=NULL WHERE job_id=? AND item_key=?",id,item.get("item_key"));
                    } catch(java.io.IOException | IllegalArgumentException e) {
                        db.update("UPDATE fmp_import_item SET status='FAILED',error_text=? WHERE job_id=? AND item_key=?","元数据无效或上游条目不可用",id,item.get("item_key"));
                    }
                    recount(id);
                });
            }
            if(cancelled(id,lease)) {finish(id,lease,"CANCELLED",null);return;}
            recount(id);
            var end=db.queryForMap("SELECT succeeded,failed FROM fmp_import_job WHERE id=?",id);
            finish(id,lease,((Number)end.get("failed")).intValue()==0?"SUCCEEDED":((Number)end.get("succeeded")).intValue()>0?"PARTIAL":"FAILED",null);
        } catch(Exception e) { finish(id,lease,"FAILED","导入失败：上游不可用或数据库操作失败，可重试；成功条目保留"); }
    }
    private boolean cancelled(String id,String lease) {
        if(Thread.currentThread().isInterrupted()) return true;
        var row=db.queryForMap("SELECT cancel_requested,lease_owner,status FROM fmp_import_job WHERE id=?",id);
        return Boolean.TRUE.equals(row.get("cancel_requested")) || !lease.equals(row.get("lease_owner")) || !"RUNNING".equals(row.get("status"));
    }
    private void finish(String id,String lease,String status,String error) {
        db.update("UPDATE fmp_import_job SET status=?,error_text=?,lease_owner=NULL,updated_at=NOW(3) WHERE id=? AND status='RUNNING' AND lease_owner=?",status,error,id,lease);
    }
}
