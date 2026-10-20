# Vibe Music Provider

基于 [Meting](https://github.com/metowolf/Meting) 的轻量多音源侧车服务。它统一搜索网易云、QQ、酷狗、酷我和百度音乐，并采用类似 go-music-dl 的多源并发、失败隔离与结果去重思路。

```bash
npm install
npm start
```

默认只监听 `127.0.0.1:3001`。可通过 `HOST` 和 `PORT` 修改。Vibe Music 后端用 `vibe-music.online.provider-url` 访问它；浏览器用 `provider-public-url` 播放，因此部署到其他机器时需要把后者设置成浏览器可访问的地址。

第三方平台的可播放性取决于版权、地区、登录状态和上游接口，请只播放你有权访问的内容，并遵守平台服务条款。
