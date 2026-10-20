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

FreeMusicPlayer 是一个前后端分离的音乐平台，包含用户端播放器、管理后台、Spring Boot API、在线音乐聚合服务和 AI 音乐助手。项目内置 499 条歌曲元数据，可连接 MinIO 中的本地媒体文件，也可以通过 Meting 聚合搜索网易云、QQ 音乐、酷狗、酷我和百度音乐。

> 本仓库不包含受版权保护的原始音频与封面文件。在线歌曲能否搜索或播放取决于上游平台的版权、地区限制和接口可用性。

## 功能

### 用户端

- 歌曲、歌手、歌单浏览与搜索
- 播放队列、进度、音量、收藏、评论和下载
- 网易云、QQ 音乐、酷狗、酷我、百度多音源聚合搜索
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
  ├─ MinIO :9000       音频与图片
  ├─ Provider :3001    多音源搜索与播放地址解析
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
├── vibe-music-provider/        基于 @meting/core 的在线音乐侧车
├── sql/vibe_music.sql          数据库结构与初始化数据
├── compose.dev.yml             MySQL、Redis、MinIO 开发环境
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

依赖缓存、MySQL、Redis 和 MinIO 数据会尽量保存在项目的 `.runtime` 目录中；项目位于 D 盘时，这些可写数据也位于 D 盘。

### 启动

```powershell
.\scripts\start-dev.ps1
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
| MinIO 控制台 | http://localhost:9001 |
| 在线音乐 Provider | http://localhost:3001 |

MinIO 本地开发账号为 `minioadmin / minioadmin`。这些凭据仅用于本机开发环境，请勿直接用于公网部署。

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

## 数据与媒体说明

- SQL 初始化文件包含 499 条歌曲元数据，但不包含原始音频和封面。
- 本地媒体文件需要上传到 MinIO 的 `vibe-music-data` 桶，并与数据库 URL 对应。
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
| 在线音乐 | Node.js、@meting/core |

## 开源说明

本项目基于 [Alex-LiSun/vibe-music-server](https://github.com/Alex-LiSun/vibe-music-server) 的 MIT 许可代码继续开发。

- 在线多音源适配使用 MIT 许可的 [metowolf/Meting](https://github.com/metowolf/Meting)。
- 聚合搜索的并发、失败隔离和去重设计参考 [guohuiyuan/go-music-dl](https://github.com/guohuiyuan/go-music-dl)，未复制其 AGPL-3.0 源码。
- 管理端基于 [vue-pure-admin](https://github.com/pure-admin/vue-pure-admin)。

项目代码按照仓库中的 MIT License 发布。使用第三方音乐平台内容时，请遵守当地法律、服务条款和版权要求。
