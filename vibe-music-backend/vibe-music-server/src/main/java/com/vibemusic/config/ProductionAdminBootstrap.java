package com.vibemusic.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/** First production boot only. Never replace an existing administrator password. */
@Component
@Profile("prod")
public class ProductionAdminBootstrap implements ApplicationRunner {
    private final JdbcTemplate db;
    private final String username;
    private final String password;

    public ProductionAdminBootstrap(JdbcTemplate db,
            @Value("${FMP_ADMIN_USERNAME:}") String username,
            @Value("${FMP_ADMIN_PASSWORD:}") String password) {
        this.db = db;
        this.username = username;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        // Serialize first-boot account creation if multiple backend instances start together.
        db.execute((java.sql.Connection connection) -> {
            var single = new JdbcTemplate(new org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true));
            if (!Integer.valueOf(1).equals(single.queryForObject("SELECT GET_LOCK('fmp-admin-bootstrap',30)", Integer.class))) {
                throw new IllegalStateException("Administrator bootstrap is locked");
            }
            try {
                if (single.queryForObject("SELECT COUNT(*) FROM tb_admin", Integer.class) == 0) {
                    if (!username.matches("[a-zA-Z0-9_]{3,20}") || password.length() < 16 || password.length() > 64) {
                        throw new IllegalStateException("First production boot requires FMP_ADMIN_USERNAME (3-20 letters/digits/_) and FMP_ADMIN_PASSWORD (16-64 characters)");
                    }
                    single.update("INSERT INTO tb_admin(username,password) VALUES(?,?)", username,
                            new BCryptPasswordEncoder().encode(password));
                }
            } finally {
                single.execute("DO RELEASE_LOCK('fmp-admin-bootstrap')");
            }
            return null;
        });
    }
}
