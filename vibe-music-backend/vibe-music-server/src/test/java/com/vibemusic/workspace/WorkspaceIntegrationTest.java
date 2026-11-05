package com.vibemusic.workspace;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vibemusic.service.OnlineMusicService;
import com.vibemusic.model.vo.OnlineSongVO;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

@Testcontainers(disabledWithoutDocker=true)
class WorkspaceIntegrationTest {
    @Container static final MySQLContainer<?> mysql=new MySQLContainer<>("mysql:8.0");
    JdbcTemplate db; WorkspaceService service; OnlineMusicService music; ListeningService listening;
    @BeforeEach void setup() throws Exception {
        var source=new DriverManagerDataSource(mysql.getJdbcUrl(),mysql.getUsername(),mysql.getPassword());
        db=new JdbcTemplate(source);
        for(String sql:new org.springframework.core.io.ClassPathResource("db/20261025-workspace.sql").getContentAsString(java.nio.charset.StandardCharsets.UTF_8).split(";"))if(!sql.isBlank())db.execute(sql);
        db.execute("CREATE TABLE IF NOT EXISTS tb_user(id bigint PRIMARY KEY)");db.update("INSERT IGNORE INTO tb_user VALUES(1),(2)");
        db.execute("CREATE TABLE IF NOT EXISTS tb_song(id bigint PRIMARY KEY,source varchar(20),source_song_id varchar(128))");
        db.execute("CREATE TABLE IF NOT EXISTS tb_user_favorite(id bigint PRIMARY KEY AUTO_INCREMENT,user_id bigint,type int,song_id bigint)");
        db.update("DELETE FROM tb_user_favorite");db.update("DELETE FROM tb_song");
        db.update("DELETE FROM fmp_import_job");db.update("DELETE FROM fmp_collection");db.update("DELETE FROM fmp_play_session");db.update("DELETE FROM fmp_audit");
        music=mock(OnlineMusicService.class);
        when(music.refreshResourceUrls(any())).thenAnswer(invocation->invocation.getArgument(0));
        var manager=new DataSourceTransactionManager(source);
        service=new WorkspaceService(db,new ObjectMapper(),music,manager);listening=new ListeningService(db,manager);
    }
    @Test void importIsIdempotentOwnedAndKeepsSuccessfulCheckpoints(){
        var a=OnlineSongVO.builder().source("netease").sourceSongId("1").songName("Good").availability("unknown").build();
        var b=OnlineSongVO.builder().source("netease").sourceSongId("2").songName("Blocked").availability("unavailable").build();
        when(music.playlist("netease","123")).thenReturn(List.of(a,b));
        String key=UUID.randomUUID().toString();
        var job=service.create(1,"https://music.163.com/playlist?id=123","Mine",key);
        String id=job.get("id").toString(),collection=job.get("collection_id").toString();
        assertEquals(id,service.create(1,"https://music.163.com/playlist?id=123","Mine",key).get("id"));
        assertThrows(RuntimeException.class,()->service.job(2,id));assertThrows(RuntimeException.class,()->service.cancel(2,id));
        db.update("UPDATE fmp_import_job SET status='RUNNING',lease_owner='test' WHERE id=?",id);service.process(id,"test");
        assertEquals("PARTIAL",service.job(1,id).get("status"));assertEquals(1,service.songs(1,collection).size());
        db.update("INSERT INTO tb_song VALUES(11,'netease','1')");db.update("INSERT INTO tb_user_favorite(user_id,type,song_id) VALUES(1,0,11)");
        var liked=service.songs(1,collection).get(0);assertEquals(1,liked.getLikeStatus());assertEquals("11",liked.getSongId());assertFalse(liked.getOnline());
        assertThrows(RuntimeException.class,()->service.rename(2,collection,"stolen"));assertThrows(RuntimeException.class,()->service.delete(2,collection));
        service.retry(1,id);db.update("UPDATE fmp_import_job SET status='RUNNING',lease_owner='test' WHERE id=?",id);service.process(id,"test");
        assertEquals(1,service.songs(1,collection).size());verify(music,times(1)).playlist("netease","123");
    }
    @Test void queuedCancellationAndListeningRetriesAreSafe(){
        var job=service.create(1,"https://music.163.com/playlist?id=123","Mine",UUID.randomUUID().toString());
        service.cancel(1,job.get("id").toString());assertEquals("CANCELLED",service.job(1,job.get("id").toString()).get("status"));
        var event=new ListeningController.Event(UUID.randomUUID().toString(),"1","Song","Artist","netease",3,3);
        listening.report(1,event);listening.report(1,event);
        assertEquals(3,db.queryForObject("SELECT SUM(played_seconds) FROM fmp_play_session WHERE user_id=1",Integer.class));
        assertEquals(0,((Number)((Map<?,?>)listening.stats(2).get("summary")).get("playedSeconds")).intValue());
    }
    @Test void expiredWorkerLeaseRecoversFromTheDatabase() throws Exception {
        when(music.playlist("netease","123")).thenReturn(List.of(OnlineSongVO.builder()
                .source("netease").sourceSongId("1").songName("Recovered").build()));
        var job=service.create(1,"https://music.163.com/playlist?id=123","Recover",UUID.randomUUID().toString());
        String id=job.get("id").toString();
        db.update("UPDATE fmp_import_job SET status='RUNNING',lease_owner='dead-process',updated_at=NOW()-INTERVAL 3 MINUTE WHERE id=?",id);
        var schema=mock(com.vibemusic.config.SchemaMigrationRunner.class);when(schema.isReady()).thenReturn(true);
        var worker=new ImportWorker(db,service,schema);
        try {
            worker.dispatch();
            for(int attempt=0;attempt<100 && !"SUCCEEDED".equals(service.job(1,id).get("status"));attempt++)Thread.sleep(50);
            assertEquals("SUCCEEDED",service.job(1,id).get("status"));
            assertEquals(1,service.songs(1,job.get("collection_id").toString()).size());
        }finally{worker.stop();}
    }
    @Test void accountPurgeRemovesPrivateRowsAndAnonymizesAudit(){
        service.create(1,"https://music.163.com/playlist?id=123","Remove",UUID.randomUUID().toString());
        listening.report(1,new ListeningController.Event(UUID.randomUUID().toString(),"1","Song","Artist","netease",3,3));
        service.purgeUser(1);
        assertTrue(service.jobs(1).isEmpty());assertTrue(service.collections(1).isEmpty());
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM fmp_play_session WHERE user_id=1",Integer.class));
        assertEquals(0,db.queryForObject("SELECT COUNT(*) FROM fmp_audit WHERE user_id=1",Integer.class));
    }
    @Test void productionSchemaHasNoSeedAccountsAndBootstrapsOnlyOnce() throws Exception {
        String schemaSql=java.nio.file.Files.readString(java.nio.file.Path.of("../../deploy/schema.sql"));
        var bootstrapDb=new JdbcTemplate(new DriverManagerDataSource(mysql.getJdbcUrl(),"root",mysql.getPassword()));
        bootstrapDb.execute((java.sql.Connection connection)->{
            var isolated=new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection,true));
            isolated.execute("CREATE DATABASE IF NOT EXISTS prod_boot_test");isolated.execute("USE prod_boot_test");
            try {
                org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection,
                        new org.springframework.core.io.support.EncodedResource(new org.springframework.core.io.ByteArrayResource(schemaSql.getBytes(java.nio.charset.StandardCharsets.UTF_8)), java.nio.charset.StandardCharsets.UTF_8));
                assertEquals(0,isolated.queryForObject("SELECT COUNT(*) FROM tb_user",Integer.class));
                assertEquals(0,isolated.queryForObject("SELECT COUNT(*) FROM tb_admin",Integer.class));
                var bootstrap=new com.vibemusic.config.ProductionAdminBootstrap(isolated,"test_admin","A-private-test-password-123");
                bootstrap.run(null);String password=isolated.queryForObject("SELECT password FROM tb_admin",String.class);
                assertTrue(new org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder().matches("A-private-test-password-123",password));
                bootstrap.run(null);assertEquals(password,isolated.queryForObject("SELECT password FROM tb_admin",String.class));
                var migration=new com.vibemusic.config.SchemaMigrationRunner(isolated);migration.run(null);migration.run(null);
                assertTrue(migration.isReady());assertEquals(2,isolated.queryForObject("SELECT COUNT(*) FROM fmp_schema_history",Integer.class));
            }finally{isolated.execute("USE test");isolated.execute("DROP DATABASE prod_boot_test");}
            return null;
        });
    }
}
