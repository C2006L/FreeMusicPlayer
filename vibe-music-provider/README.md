# FreeMusicPlayer Provider

FreeMusicPlayer 的统一音源适配侧车。它优先调用独立的 `go-music-api` 服务获取扩展平台搜索、源元数据和媒体代理能力，并以 [Meting](https://github.com/metowolf/Meting) 作为兼容回退。

与旧版本不同，本服务不会按“歌名 + 歌手”删除跨平台结果，也不会在搜索阶段隐藏所有暂时解析失败的条目。播放可用性和约 30 秒试听由平台标记、后端探测及播放器实际媒体时长共同判断。

```bash
npm install
npm start
```

默认只监听 `127.0.0.1:3001`。可通过 `HOST` 和 `PORT` 修改。设置 `GO_MUSIC_API_URL=http://127.0.0.1:3002` 即可启用增强引擎；未设置或服务不可用时自动回退到 Meting。

主要接口：`/health`、`/search`、`/discover`、`/stream`、`/cover`、`/lyric`。`sourceExtra` 是不透明的上游元数据，只用于后续流解析，不应由前端修改。

搜索结果会检查每个关键词是否命中歌曲名、歌手或专辑，过滤上游返回的无关填充结果。`node --test *.test.mjs` 验证相关性过滤；未找到匹配结果时不使用其他歌曲冒充。当前接入的 API 没有独立歌手接口，前端按歌曲贡献者字段展示相关歌手，不提供虚构头像或全量作品计数。

## 自有账号授权（可选）

如果你本人拥有对应平台账号，可以在启动 Provider 前通过环境变量提供自己的 Cookie：

- `MUSIC_COOKIE_NETEASE`
- `MUSIC_COOKIE_TENCENT`
- `MUSIC_COOKIE_KUGOU`
- `MUSIC_COOKIE_KUWO`
- `MUSIC_COOKIE_BAIDU`

Cookie 只由本机 Provider 读取，不会返回给浏览器，也不应提交到 Git。配置授权只能使用账号本身已有的播放权益；没有权限的歌曲仍会标记为试听或不可用。

第三方平台的可播放性取决于版权、地区、登录状态和上游接口，请只播放你有权访问的内容，并遵守平台服务条款。
