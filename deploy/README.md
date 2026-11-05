# 生产部署模板

这套配置与根目录 `compose.dev.yml` 独立，面向 Linux Docker / Docker Desktop。已校验 Compose 配置、空库初始化、管理员首次创建及重复迁移；本轮没有在公网部署，也没有完整构建并启动这一套生产镜像。上线前仍需在目标机器完整试运行。

## 配置与启动

从项目根目录执行：

```powershell
Copy-Item deploy/.env.example deploy/.env
```

填写 `deploy/.env`。它被 Git 和 Docker 构建上下文忽略：

| 配置 | 要求 |
| --- | --- |
| MYSQL_ROOT_PASSWORD / MYSQL_PASSWORD / REDIS_PASSWORD | 各自设置独立的强随机密码 |
| VIBE_MUSIC_JWT_SECRET | 至少32字符；建议48字节随机值编码后的字符串；重启时保持一致 |
| FMP_ADMIN_USERNAME | 3–20位字母、数字或下划线 |
| FMP_ADMIN_PASSWORD | 首次空库启动要求16–64字符；现有管理员不会被覆盖 |
| FMP_PUBLIC_API_URL | 浏览器可访问的完整API地址，如 `https://music.example.com/api`，末尾不要 `/` |
| FMP_ALLOWED_ORIGINS | 用户端和管理端真实来源，逗号分隔；不填通配符 |
| SMTP_HOST / USERNAME / PASSWORD | 自己配置的真实发信服务；这里没有内嵌免费发信账号 |
| SMTP_PORT / SMTP_STARTTLS / SMTP_SSL | 默认587 + STARTTLS；按邮箱服务要求填写，465一般需 SSL=true、STARTTLS=false |
| OLLAMA_BASE_URL / MODEL | 可选机器人模型地址；模型不可达时，其他音乐功能仍可用 |

生成随机值示例（每个密钥分别运行一次，不把结果提交仓库）：

```powershell
$bytes = New-Object byte[] 48
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
[Convert]::ToBase64String($bytes)
```

```powershell
docker compose --env-file deploy/.env -f deploy/compose.yml config --quiet
docker compose --env-file deploy/.env -f deploy/compose.yml up --build -d
docker compose --env-file deploy/.env -f deploy/compose.yml logs -f backend provider
```

默认只绑定本机 `127.0.0.1:8880` 用户端和 `127.0.0.1:8881` 管理端。两个前端分别以 `/api` 访问同源代理。用管理员环境变量配置的凭据登录管理端。

MySQL、Redis、Go 音源服务、Node 侧车和 Java API不发布宿主端口。公开部署时在前面加自己管理的 HTTPS 入口，分别转发到这两个入口，更新 API URL 与允许来源；本模板不申请域名或自动生成证书。TLS 终止代理应保留转发信息；本模板的 Nginx 到 Java 代理会关闭 SSE 缓冲并转发音频 Range / If-Range。

Linux 下访问宿主 Ollama 需要配置可达地址或宿主网关，不能把容器内 `127.0.0.1` 当作宿主。Ollama 不要求在应用启动时自动拉模型。

## 数据与更新

- `schema.sql` 仅含原业务表结构，不含原作者账号、私人信息或示例媒体；首次空卷由 MySQL 初始化。它不是升级脚本，不要手动导入已有业务库。
- Java 的增量迁移对已有数据库补列、索引和工作区表，以数据库锁串行执行，记录在 `fmp_schema_history`。
- 首次生产启动只在管理员表为空时创建一个 BCrypt 管理员；重复启动保留原密码。用户自行使用邮箱注册。
- 数据位于独立 Compose 项目的 `mysql-data` / `redis-data` 命名卷。本机开发数据仍在 `.runtime`，二者不会混用。Docker Desktop命名卷的位置由其磁盘镜像设置决定，不能仅凭仓库位于D盘断定生产卷也在D盘。
- 更新前备份生产 MySQL 和密钥，再重新构建启动。停机使用 `docker compose ... down`；保留数据卷，不要随意添加 `-v`。
- 图片 / 本地上传在此模板中关闭；在线曲库和导入目录不依赖 MinIO。要开放附件上传需额外配置对象存储并重新评估上传入口。

## 验收

检查 `/api/health` 必需组件为 UP；完成真实SMTP验证码注册和登录；导入一个你有权访问的公开歌单；验证播放/拖动、工作区任务与统计、后台诊断以及退出后的权限。上游音乐接口和模型的实际可用性需在部署地区单独确认。

`/api/admin/ops/prometheus` 需要管理员令牌；如接入外部 Prometheus，需由部署方管理只读采集凭据。本轮没有增加公共免鉴权采集接口，也没有默认运行 Prometheus / Grafana。

构建镜像使用固定主版本标签，Go服务沿用仓库既有摘要；这不是全镜像摘要锁定。正式发布可再把验证过的基础镜像固定到具体摘要。第三方服务许可证见根 README。
