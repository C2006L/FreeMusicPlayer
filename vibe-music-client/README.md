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

默认访问地址为 <http://localhost:8090>，后端默认位于 <http://localhost:18080>。API 地址可通过 `VITE_APP_BASE_API` 设置。

### 手机 / 平板联调

在同一局域网内用手机打开 `http://<本机局域网IP>:8090` 时，后端地址不能再用 `localhost`：

```powershell
# 方式一：启动脚本自动把前后端公开地址指向局域网 IP
$env:FMP_PUBLIC_HOST = '192.168.1.100'
.\scripts\start-dev.ps1

# 方式二：分别设置（已有值不会被脚本覆盖）
$env:VITE_APP_BASE_API = 'http://192.168.1.100:18080'
$env:VIBE_MUSIC_PROVIDER_PUBLIC_URL = 'http://192.168.1.100:18080/song'
$env:FMP_ALLOWED_ORIGINS = 'http://192.168.1.100:8090,http://localhost:8090,http://127.0.0.1:8090'
```

`VITE_APP_BASE_API` 保留 `localhost` 时，前端会把发往本机回环地址的请求与媒体地址自动改写到当前页面主机；但播放代理地址由后端生成，仍建议同时设置 `VIBE_MUSIC_PROVIDER_PUBLIC_URL`。手机页面与 API 端口不同，属于跨源请求，因此还需把 `http://<局域网IP>:8090` 加进后端 `FMP_ALLOWED_ORIGINS`（方式一会自动设置）；否则浏览器会因 CORS 拦截报错。桌面默认的 `localhost` 开发方式不受影响。

## 验证

```powershell
pnpm type-check
pnpm build
```

第三方平台的搜索和播放能力取决于版权、地区、账号权益和上游接口状态。项目不会提供或共享第三方平台账号凭据，请只播放和下载你有权访问的内容。
