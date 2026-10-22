# FreeMusicPlayer Client

FreeMusicPlayer 的用户端播放器，基于 Vue 3、TypeScript、Vite、Pinia、Element Plus 和 Tailwind CSS。

## 功能

- 本地曲库与在线多来源搜索
- 播放队列、进度拖动、音量和播放模式
- 收藏、下载、歌手、歌单、评论和个人中心
- 在线音源失败隔离、试听识别与自动切源
- FreeMusic Assistant 流式音乐问答
- 深色桌面播放器界面与响应式布局

## 开发

需要 Node.js 18 或更高版本。推荐从仓库根目录使用统一脚本启动完整环境：

```powershell
.\scripts\setup-dev.ps1
.\scripts\start-dev.ps1
```

仅启动前端：

```powershell
cd vibe-music-client
pnpm install
pnpm dev
```

默认访问地址为 <http://localhost:8090>，后端默认位于 <http://localhost:8080>。

## 验证

```powershell
pnpm type-check
pnpm build
```

第三方平台的搜索和播放能力取决于版权、地区、账号权益和上游接口状态。项目不会提供或共享第三方平台账号凭据，请只播放和下载你有权访问的内容。
