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

FreeMusicPlayer 是一个前后端分离的桌面风格音乐平台，包含用户端播放器、管理后台、Spring Boot API、多引擎在线音乐适配层和 AI 音乐助手。当前版本以在线发现和用户自己的音乐数据为主，不再把原项目中已经失效的示例媒体当作可用曲库。

在线适配层默认使用独立部署的 `go-music-api` 完成多源搜索、流代理和音源元数据解析，并保留 Meting 作为兼容回退。当前可聚合网易云、QQ 音乐、酷狗、酷我、咪咕、千千、Jamendo、JOOX、Bilibili、5sing 等来源；实际结果由平台、地区、账号权益和接口状态决定。

> 本仓库不包含受版权保护的原始音频与封面文件。在线歌曲能否搜索或播放取决于上游平台的版权、地区限制和接口可用性。

## 功能

### 用户端

- 歌曲、歌手、歌单浏览与搜索
- 播放队列、进度、音量、收藏、评论和下载
- 多平台并发搜索、来源标识和相同歌曲多音源保留
- 30 秒试听识别、播放失败自动换源和严格的歌名/歌手/时长匹配
- 会员、试听、不可用状态提示，不把受限资源伪装成完整歌曲
- 注册、登录、个人资料和头像管理
- 基于收藏风格的歌曲推荐
- 深色主题与响应式播放器界面
- 支持流式输出的 AI 音乐助手

### 管理端

- 用户状态与资料管理
- 歌手、歌曲、歌单的增删改查
- 音频、封面和轮播图资源管理
- 用户反馈处理和数据统计

### 服务端

- JWT 登录认证与角色权限控制
- MyBatis-Plus + MySQL 数据访问
- Redis 登录会话与业务缓存
- MinIO 音频和图片对象存储
- Spring AI + DashScope（通义千问）工具调用
- SSE 流式对话输出

## 系统结构

```text
浏览器（Vue 用户端 / 管理端）
        │ HTTP / SSE
        ▼
Spring Boot API :8080
  ├─ MySQL :13306      业务数据
  ├─ Redis :6379       会话与缓存
  ├─ Provider :3001    统一音源适配、排序与兼容回退
  ├─ go-music-api :3002 多平台搜索、探测与流代理
  ├─ MinIO :9000       可选的用户附件存储
  └─ DashScope         AI 对话与工具调用
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
| 后端 API | http://localhost:8080 |
| MinIO 控制台（仅 `-WithMinio`） | http://localhost:9001 |
| 在线音乐 Provider | http://localhost:3001 |
| 增强音源 API / Swagger | http://localhost:3002/swagger/index.html |

MinIO 本地开发账号为 `minioadmin / minioadmin`。MinIO 现在是可选的附件存储，只用于头像、封面及用户主动上传的媒体，不参与在线歌曲播放。这些凭据仅用于本机开发环境，请勿直接用于公网部署。

### 停止

```powershell
.\scripts\stop-dev.ps1
```

停止脚本会移除开发容器，但不会删除 `.runtime` 中的数据库和对象存储数据。

### 修改后端代码后重新构建

```powershell
.\scripts\stop-dev.ps1
.\scripts\setup-dev.ps1 -SkipDockerPull
.\scripts\start-dev.ps1
```

## 启用 AI 音乐助手

AI 助手需要有效的阿里云百炼 DashScope API Key。启动前在同一个 PowerShell 窗口设置：

```powershell
$env:DASHSCOPE_API_KEY = "你的 API Key"
.\scripts\start-dev.ps1
```

API Key 不会写入仓库。未配置时，播放器的普通功能仍可使用，但机器人请求会失败。

AI 请求链路：

1. 用户端向 `POST /agent/chat` 提交会话 ID 和问题。
2. Spring AI 把系统提示词、会话记忆和问题发送给通义千问。
3. 模型需要真实曲库信息时，会调用 `MusicAgentTools` 查询 MySQL。
4. 后端把模型增量内容封装成 SSE 事件推送给浏览器。

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
5. 浏览器检测到约 30 秒、且明显短于标称时长的媒体时，会按歌名、主要歌手和时长误差自动寻找其他来源。
6. 换源不会自动拿 Live、Remix 或翻唱冒充录音棚原版；所有来源均受限时会明确提示。

## 数据与媒体说明

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

### IDEA 提示 8080 已被占用

说明脚本已经启动了一个后端。使用脚本启动时不要再从 IDEA 重复运行 `VibeMusicServerApplication`。

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
| AI | Spring AI、Spring AI Alibaba、DashScope |
| 在线音乐 | Node.js、@meting/core、独立 go-music-api 服务 |

## 开源说明

本项目基于 [Alex-LiSun/vibe-music-server](https://github.com/Alex-LiSun/vibe-music-server) 的 MIT 许可代码继续开发。

- 在线兼容回退使用 MIT 许可的 [metowolf/Meting](https://github.com/metowolf/Meting)。
- 增强音源能力通过独立运行的 [guohuiyuan/go-music-api](https://github.com/guohuiyuan/go-music-api) REST 服务接入。该服务采用 AGPL-3.0，本仓库不复制或重新许可其源码；分发或修改该服务时需单独遵守其许可证。
- 管理端基于 [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin)。

项目代码按照仓库中的 MIT License 发布。使用第三方音乐平台内容时，请遵守当地法律、服务条款和版权要求。
