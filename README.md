<div align="center">
  <img src="./favicon.ico" alt="FreeMusicPlayer" width="96">
  <h1>FreeMusicPlayer</h1>
  <p>一个包含本地曲库、在线多音源搜索、后台管理和 AI 音乐助手的全栈音乐播放器。</p>

  <img src="https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot" alt="Spring Boot">
  <img src="https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs" alt="Vue 3">
  <img src="https://img.shields.io/badge/Java-17%2B-ED8B00?logo=openjdk" alt="Java 17+">
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT License">
</div>

## 项目简介

歌词新增多语言分组、其他来源查找、LRC/TXT 导入、时间偏移及可取消的本机 Ollama 翻译。使用方法和限制见 [歌词优化说明](docs/歌词优化说明.md)。

FreeMusicPlayer 是一个前后端分离的桌面风格音乐平台，包含用户端播放器、管理后台、Spring Boot API、多引擎在线音乐适配层和 AI 音乐助手。当前版本以在线发现和用户自己的音乐数据为主，不再把原项目中已经失效的示例媒体当作可用曲库。

在线适配层默认使用独立部署的 `go-music-api` 完成多源搜索、流代理和音源元数据解析，并保留 Meting 作为兼容回退。当前可聚合网易云、QQ 音乐、酷狗、酷我、咪咕、千千、Jamendo、JOOX、Bilibili、5sing 等来源；实际结果由平台、地区、账号权益和接口状态决定。

> 本仓库不包含受版权保护的原始音频与封面文件。在线歌曲能否搜索或播放取决于上游平台的版权、地区限制和接口可用性。

## 功能

### 用户端

- 歌曲、歌手、歌单浏览与搜索
- 播放队列、进度、音量、收藏、评论和下载
- 多平台并发搜索、来源标识和相同歌曲多音源保留
- 按平台逐步返回搜索结果，展示等待、空结果和不可用状态
- 30 秒试听识别、播放失败自动换源和严格的歌名/歌手/时长匹配
- 会员、试听、不可用状态提示，不把受限资源伪装成完整歌曲
- 注册、登录、个人资料和头像管理
- 平台真实推荐歌单选曲，以及独立的实际播放历史
- 个人音乐工作区：公开歌单 / B站合集导入任务、私有歌单与近30天账号收听统计
- 导入任务进度与明细、取消、幂等提交、失败重试和进程重启后恢复
- 深色主题与响应式播放器界面
- 支持流式输出的 AI 音乐助手

### 管理端

- 用户状态与资料管理
- 歌手、歌曲、歌单的增删改查
- 音频、封面和轮播图资源管理
- 用户反馈处理和数据统计
- 运行与任务诊断：音源请求、缓存与冷却状态、导入执行器、HTTP 指标及工作区操作审计

### 服务端

- JWT 登录认证与角色权限控制
- MyBatis-Plus + MySQL 数据访问
- Redis 登录会话与业务缓存
- MinIO 音频和图片对象存储
- Spring AI + Ollama / DashScope 工具调用
- SSE 流式对话输出
- MySQL 持久化任务、受限线程池、租约超时恢复与逐条事务检查点
- 播放会话累计上报、去重、服务端计时上限与账号数据隔离
- Actuator / Micrometer 指标与管理员鉴权的 Prometheus 输出
- Testcontainers 隔离 MySQL 集成测试与 Playwright 浏览器回归

本轮具体实现、数据表、接口和测试范围见 [全栈完善记录](docs/全栈完善记录.md)；生产环境模板和配置见 [生产部署](deploy/README.md)。生产模板与本机开发环境分开，不会自动替换现有数据库。

2026-10-26 针对音源进程退出、空结果误报、助手状态与推荐问题的复现和修复见 [播放与助手排查记录](docs/播放与助手排查记录.md)。界面“完整性未知”不代表无法播放；“检索失败”只描述该平台的本次请求。

## 系统结构

```text
浏览器（Vue 用户端 / 管理端）
        │ HTTP / SSE
        ▼
Spring Boot API :18080
  ├─ MySQL :13306      业务数据
  ├─ Redis :6379       会话与缓存
  ├─ Provider :3001    统一音源适配、排序与兼容回退
  ├─ go-music-api :3002 多平台搜索、探测与流代理
  ├─ MinIO :9000       可选的用户附件存储
  └─ Ollama / DashScope  本地或云端 AI 对话与工具调用
```

```text
FreeMusicPlayer/
├── vibe-music-client/          Vue 3 用户端
├── vibe-music-admin/           Vue 3 管理端
├── vibe-music-backend/
│   ├── vibe-music-server/      Spring Boot 主服务
│   ├── vibe-music-model/       DTO、Entity、VO
│   └── vibe-music-common/      公共常量、结果与工具
├── vibe-music-provider/        go-music-api + Meting 多引擎适配侧车
├── sql/vibe_music.sql          数据库结构与初始化数据
├── compose.dev.yml             MySQL、Redis、go-music-api 和可选 MinIO
├── config/                     Docker 本地开发配置
├── deploy/                     空库初始化、生产配置、Dockerfile 与 Nginx 代理
├── tests/e2e/                  浏览器回归（测试专用接口桩与真实音频元素）
└── scripts/                    Windows 安装、启动和停止脚本
```

## 快速开始（Windows）

### 环境要求

- Windows 10/11 和 Docker Desktop
- JDK 17 或更高版本
- Node.js 18 或更高版本
- PowerShell

Maven Wrapper 和固定版本的 pnpm 会由脚本调用，无需全局单独安装。

### 首次安装

先启动 Docker Desktop，然后在项目根目录运行：

```powershell
.\scripts\setup-dev.ps1
```

依赖缓存、MySQL、Redis 和可选的 MinIO 数据会尽量保存在项目的 `.runtime` 目录中；项目位于 D 盘时，这些可写数据也位于 D 盘。

### 启动

```powershell
.\scripts\start-dev.ps1
```

默认启动 MySQL、Redis 和增强音源 API，歌曲通过在线 Provider 实时解析，不依赖 MinIO。首次启动需要下载 `go-music-api` 镜像。需要测试头像、封面或本地音频上传时再运行：

```powershell
.\scripts\start-dev.ps1 -WithMinio
```

不需要管理端时：

```powershell
.\scripts\start-dev.ps1 -WithoutAdmin
```

启动地址：

| 服务 | 地址 |
| --- | --- |
| 用户端 | http://localhost:8090 |
| 管理端 | http://localhost:8089 |
| 后端 API | http://localhost:18080 |
| MinIO 控制台（仅 `-WithMinio`） | http://localhost:9001 |
| 在线音乐 Provider | http://localhost:3001 |
| 增强音源 API / Swagger | http://localhost:3002/swagger/index.html |

MinIO 本地开发账号为 `minioadmin / minioadmin`。MinIO 现在是可选的附件存储，只用于头像、封面及用户主动上传的媒体，不参与在线歌曲播放。这些凭据仅用于本机开发环境，请勿直接用于公网部署。

本地开发管理端保留一个 BCrypt 账号 `admin_demo / Fmp2026Admin!`（仅开发库使用）；种子数据里的旧 MD5 管理员均已标记 `disabled = 1`，不再接受登录。生产环境首次启动由 `FMP_ADMIN_USERNAME` / `FMP_ADMIN_PASSWORD` 创建 BCrypt 管理员。

### 手机 / 平板联调

同一局域网内用手机或平板打开 `http://<本机局域网IP>:8090` 时，后端地址不能再用 `localhost`。先执行 `ipconfig` 确认当前 WLAN 的 IPv4 地址，再在**启动前**设置环境变量并重启前后端（只改配置不重启不生效）：

```powershell
$env:FMP_PUBLIC_HOST = '<本机局域网IP>'   # 脚本会自动推导 VITE_APP_BASE_API、播放代理地址和 FMP_ALLOWED_ORIGINS
.\scripts\start-dev.ps1
```

也可以分别设置 `VITE_APP_BASE_API`、`VIBE_MUSIC_PROVIDER_PUBLIC_URL`、`FMP_ALLOWED_ORIGINS`（已有值不会被脚本覆盖），三者必须都指向局域网 IP，否则会出现请求被 CORS 拦截或播放地址仍指向 localhost。要点：

- 手机页面与 API 端口不同，属于跨源请求，`FMP_ALLOWED_ORIGINS` 需包含 `http://<局域网IP>:8090`；桌面默认的 `localhost` 方式不受影响。
- Windows 防火墙需放行入站 8090（用户端）和 18080（后端 API），否则手机只能打开页面、请求全部超时。
- 局域网 IP 通常由 DHCP 分配，重启路由器或换网段后会变化，每次联调前重新确认。
- 管理端默认只监听 `127.0.0.1`；确需让手机访问管理端时显式运行 `.\scripts\start-dev.ps1 -ExposeAdmin`。
- 没有配置平台登录态（Cookie）时，网易云 / QQ 多数只返回试听片段，因此用户端默认搜索源不含这两个平台，可在曲库页手动指定来源。

### 公网临时隧道（演示用）

本机连了 VPN 或处于终端隔离的网络时，局域网地址无法被其他设备访问，可临时把前后端暴露到公网：

```powershell
.\scripts\start-dev.ps1 -Tunnel
```

脚本会起两条 cloudflared quick tunnel（8090 用户端、18080 后端），把随机生成的公网地址自动写进 `VITE_APP_BASE_API`、`VIBE_MUSIC_PROVIDER_PUBLIC_URL`、`FMP_ALLOWED_ORIGINS` 后重启前后端，不需要手改配置。cloudflared 缺失或无法执行时会自动下载到 `.runtime\tools\cloudflared.exe`（下载源可用 `FMP_CLOUDFLARED_URL` 覆盖）。管理端 8089 不对外，数据库、缓存、对象存储端口也不映射。

演示结束后关闭隧道并恢复本地开发环境：

```powershell
.\scripts\tunnel-dev.ps1 -Stop
.\scripts\start-dev.ps1
```

### 停止

```powershell
.\scripts\stop-dev.ps1
```

停止脚本会移除开发容器，但不会删除 `.runtime` 中的数据库和对象存储数据。

### 修改后端代码后重新构建

```powershell
.\scripts\restart-backend.ps1
```

## 启用 AI 音乐助手

默认使用本机 Ollama 的 `qwen2.5:3b`，不会自动下载模型。先启动 Ollama，并确保模型已安装：

```powershell
ollama list
$env:OLLAMA_MODEL = "qwen2.5:3b"
.\scripts\start-dev.ps1
```

可设置 `OLLAMA_BASE_URL`（默认 `http://127.0.0.1:11434`）或改用支持工具调用的其他模型。使用云端通义千问时：

```powershell
$env:FMP_AI_PROVIDER = "dashscope"
$env:DASHSCOPE_API_KEY = "你的 API Key"
.\scripts\start-dev.ps1
```

API Key 不会写入仓库。设置 `FMP_AI_PROVIDER=none` 可关闭 AI。修改配置后重启后端。用户端“服务状态”可查看模型是否存在、Ollama 是否在线或云端密钥是否配置。

AI 请求链路：

1. 用户端向 `POST /agent/chat` 提交会话 ID 和问题。
2. Spring AI 把系统提示词、隔离的会话记忆和问题发送给选定模型。
3. 模型通过 `OnlineAgentTools` 调用在线曲库，用户要求本地音乐时查询有效的本地曲库；推荐卡片直接来自查询结果，不由模型编造播放地址。
4. 后端通过 SSE 的 text、songs、error、done 事件推送结果，支持超时、停止生成和断线取消。

## 邮箱与账号

登录使用邮箱和密码；注册、找回密码及变更邮箱需要一次性验证码。新密码使用 BCrypt，旧 MD5 账号成功登录后自动迁移。改密或找回密码会撤销旧会话。

本地测试邮件使用 Mailpit，不会发往外部邮箱：

```powershell
.\scripts\start-dev.ps1 -WithMail
```

打开 `http://localhost:8025` 查看验证码。真实邮件服务使用 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USERNAME`、`SMTP_PASSWORD`，并按供应商要求设置 `SMTP_AUTH`、`SMTP_SSL` 或 `SMTP_STARTTLS`。

JWT 密钥由脚本生成到 `.runtime/jwt-secret.txt`。IDE 启动时需自行设置 `VIBE_MUSIC_JWT_SECRET`。登录凭据保存在当前浏览器会话中。

## 歌手发现与服务诊断

当前上游没有独立歌手搜索接口。歌手页从真实歌曲结果提取相关歌手，按平台保留身份，用名称占位而不把歌曲封面当作歌手头像；点击后按平台与歌手名称筛选歌曲。同名歌手仍可能混合，数量仅代表本次搜索，不是全量作品数。

`/status` 页面展示数据库、会话缓存、音源服务、附件存储和 AI 状态。默认后端为 **18080**，避免与其他项目的 8080 冲突；启动脚本检查应用标识、API 版本和依赖状态。

数据库启动时自动检查当前版本结构，记录在 `fmp_schema_history`。升级前备份：

```powershell
.\scripts\backup-db.ps1
# 恢复会覆盖数据，先停止后端并确认备份：
.\scripts\restore-db.ps1 -BackupPath .runtime\backups\你的备份.sql -ConfirmRestore
```

## 在线平台账号授权（可选）

默认在线来源只能返回平台公开允许的内容；会员歌曲是否能够完整播放仍由对应平台、账号权益和地区规则决定。增强音源服务从 `.runtime/go-music-api/cookies.json` 读取你自己的 Cookie，例如：

```json
{
  "netease": "MUSIC_U=...; __csrf=...;",
  "qq": "qm_keyst=...; uin=...;",
  "kugou": "token=...; userid=...;",
  "bilibili": "SESSDATA=...;"
}
```

修改后重启服务。该文件位于被 Git 忽略的 `.runtime` 目录，不要把 Cookie 写进源码、提交到 GitHub、截图或分享给其他人。Meting 回退仍支持 `MUSIC_COOKIE_NETEASE`、`MUSIC_COOKIE_TENCENT` 等环境变量。

本项目不会绕过付费校验，也不保证未购买的 VIP 曲目可以完整播放。找不到完整来源时会显示试听/受限状态；请使用自己的合法账号权益、本地音乐或开放授权音乐。

## 搜索与换源机制

1. Provider 向多个来源并发搜索，每个来源默认最多保留 20 条，不再只取前 5 条。
2. 只按“来源 + 平台歌曲 ID”去重，因此同一首歌在不同平台的版本会保留。
3. 搜索结果按歌名和歌手相关度排序，并显示来源及平台给出的 VIP/无效标记。
4. 点击播放后由后端代理真实媒体流，避免浏览器跨域和常见防盗链问题。
5. 浏览器检测到明显短于标称时长的短片段（包含常见的 30/60/90 秒试听）时，按相同歌名、完整歌手署名、版本标记及已知时长寻找替代资源。缺少时长或版本不一致时不自动替换；真实短曲不会仅因时长短而被判为试听。
6. 自动换源按具体资源记录尝试次数，每首最多尝试 4 个资源。找不到可信替代时提示手动搜索其他版本，不承诺已经穷尽全网音源。

### 播放验证状态与筛选

- **尚未验证 / 权益待验证**：链接或平台标记不是完整播放证明，VIP 标记也不等于一定不能播放。
- **试听片段**：实际媒体时长明显短于已知完整时长。
- **时长匹配**：音频元数据时长与歌曲标称时长相符，仅证明时长一致，不保证整曲可播放。
- **完整播完**：当前浏览器确实播放覆盖了几乎全部音频并自然结束，跳到结尾不算。仅在已知歌曲完整时长匹配时记录。
- **播放失败**：当前具体来源播放失败，不能据此推断其他平台均不可用。

验证记录仅保留在当前页面会话内、按引擎/平台/歌曲区分、15 分钟过期，不上传服务器。搜索页可优先已验证资源、隐藏已知试听/失败，或仅显示本次完整播完的在线结果；筛选作用于当前已返回的在线搜索集合，本地结果不受影响，分页保留。

机器人提供“仅服务端已验证完整的在线资源”选项，服务端严格排除未知和权益待验证结果。当前上游没有可靠的服务端完整播放证据，因此开启后可能无结果；浏览器中的完整播完记录不会自动变成服务端证明。没有完整资源时不伪造推荐，也不解密或绕过会员限制。

### B 站合集顺序播放

播放 B 站条目后，底部播放器和展开播放页会显示“B站合集”。点击可读取真实分 P / 合集目录，选择“播放整个合集”、从指定条目开始顺序播放，或“只播当前条目”（不展开目录、不改变队列）。

整合集按源站目录顺序插入当前位置，相同条目去重，其他歌曲保留；每一 P 使用独立的 `BV + CID` 标识，避免重复播放第一 P。合集条目播放失败时提示并顺序跳过，顺序模式到队列末尾停止，不无限循环失败资源。单视频长合集只有一个条目，不按标题中的歌曲名猜测拆曲。目录最多接受 1000 条，超过时明确报错，不静默截断冒充完整目录。

B 站当前适配器不提供同步歌词时显示明确空状态；接口的“操作成功”或空结果不会显示为歌词。

## 数据与媒体说明

### 个人工作区与账号统计

登录后通过侧栏“音乐工作区”访问 `/workspace`，可以导入网易云 `playlist?id=…`、QQ `/n/ryqq/playlist/…`、B站 `/video/BV…` 的公开 HTTPS 链接。当前只导入歌曲目录与元数据，不批量下载音频，不把搜索结果猜成歌单。每个目录上限1000条、每个用户最多5个活动任务。

任务和歌单保存在 MySQL 中，按当前登录账号隔离；失败任务重试保留成功条目，进程意外退出后过期租约约2分钟内可重新排队。工作区歌单与管理端维护的公共歌单分开。注销账号会清理个人工作区和统计记录。

浏览器本地“继续聆听”和服务端账号统计是两套用途不同的数据。账号统计只在登录后实际播放累计3秒时开始上报，随后约每15秒及暂停/切歌时累计上报；快进不计时，重发不重复累计。统计不代表平台版权、会员权益或完整播放验证；网络中断、页面关闭可能丢失最后一小段。

管理员登录后访问“运行与任务诊断”（`/operations/index`）。指标表示当前进程处理过的实际请求，没有压测时不能把页面上的平均耗时写成性能提升成绩。

- 首页“在线发现”读取网易云/QQ 的真实推荐歌单与歌单曲目，不再搜索“热门歌曲”冒充热榜；支持部分平台失败时展示其余来源，缓存 10 分钟并轮换批次。
- “继续聆听”来自浏览器独立的 `PlayHistory` 记录：实际播放累计 3 秒才计入，最多保留 60 首。加入队列、加载失败或仅跳到结尾不会计入。旧队列不会被伪装成历史，也不会被清空。
- 恢复队列时不会自动请求旧音频。点击播放后，在线曲目根据平台 ID、引擎及解析参数重建当前后端地址，本地曲目重新查询详情；缺少必要信息时明确提示重新搜索。封面加载失败使用固定比例的统一占位图。

- SQL 初始化文件中的旧示例歌曲只包含已丢失的地址，迁移后会标记为不可用；它们不是当前在线曲库。
- MinIO 仅用于用户主动上传的本地媒体和附件；在线播放地址由后端实时解析并代理，不依赖 MinIO。
- 页面出现灰色图片占位通常表示 MinIO 中缺少对应文件，不代表前端网络完全断开。
- Redis、MySQL、MinIO 使用 D 盘目录绑定，因此不会以命名卷形式出现在 Docker Desktop 的 Volumes 页面。

## 常见问题

### 页面提示“网络连接失败”

前端 Axios 在 20 秒内收不到后端响应时会显示该提示。先检查：

```powershell
docker compose -f compose.dev.yml ps
```

然后查看 `.runtime/logs/backend.out.log`。本仓库的启动脚本会显式加载 `config/application-docker.yml`，Docker MySQL 使用主机端口 `13306`，避免误连本机已有的 `3306`。

### IDEA 提示端口已被占用

确认占用端口的应用是否为 FreeMusicPlayer，其他项目也可能使用同一端口。当前开发 API 默认 18080。使用脚本启动时不要再从 IDEA 重复运行 `VibeMusicServerApplication`。

### Docker Desktop 中出现随机名称的 0 Bytes 卷

它们是一次性 MinIO 初始化容器产生的匿名空卷，不是 Redis 或 MySQL 数据。真实数据位于 `.runtime`。

### 图片和内置歌曲无法加载

初始化 SQL 只有媒体地址。必须自行准备并上传对应的 MinIO 媒体文件；也可以使用在线多音源搜索结果。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 用户端 / 管理端 | Vue 3、TypeScript、Vite、Pinia、Element Plus、Tailwind CSS |
| 后端 | Spring Boot 3.5、Java 17+、Maven 多模块 |
| 数据 | MyBatis-Plus、MySQL 8、Druid、Redis 7 |
| 文件存储 | MinIO / S3 兼容对象存储 |
| AI | Spring AI、Ollama、Spring AI Alibaba、DashScope |
| 在线音乐 | Node.js、@meting/core、独立 go-music-api 服务 |

## 开源说明

本项目基于 [Alex-LiSun/vibe-music-server](https://github.com/Alex-LiSun/vibe-music-server) 的 MIT 许可代码继续开发。

- 在线兼容回退使用 MIT 许可的 [metowolf/Meting](https://github.com/metowolf/Meting)。
- 增强音源能力通过独立运行的 [guohuiyuan/go-music-api](https://github.com/guohuiyuan/go-music-api) REST 服务接入。该服务采用 AGPL-3.0，本仓库不复制或重新许可其源码；分发或修改该服务时需单独遵守其许可证。
- 管理端基于 [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin)。

项目代码按照仓库中的 MIT License 发布。使用第三方音乐平台内容时，请遵守当地法律、服务条款和版权要求。
