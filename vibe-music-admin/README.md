# FreeMusicPlayer Console

FreeMusicPlayer 的内容与用户管理端，负责维护用户、歌手、歌曲、歌单、首页轮播图和反馈数据。界面采用与用户端一致的深炭灰、暖珊瑚色设计系统，但保留适合高密度管理工作的表格、筛选、批量操作和弹窗交互。

## 技术栈

- Vue 3、TypeScript、Vite
- Pinia、Vue Router
- Element Plus、Tailwind CSS
- vue-pure-admin 基础布局组件
- ECharts 数据概览

## 页面与功能

- 内容概览：用户、歌手、歌曲与歌单统计
- 用户管理：查询、编辑、启用、禁用和删除
- 歌手管理：资料维护与封面上传
- 歌曲管理：信息维护、音频上传、封面上传与预览
- 歌单管理：歌单资料和歌曲绑定
- 运营管理：轮播图与用户反馈

所有路由、权限判断和数据操作均连接 FreeMusicPlayer Java 后端，不使用静态演示数据替代真实业务数据。

## 启动

推荐在仓库根目录统一启动：

```powershell
.\scripts\setup-dev.ps1   # 仅首次运行需要
.\scripts\start-dev.ps1
```

管理端默认地址：<http://localhost:8089>

只启动管理端：

```powershell
cd vibe-music-admin
pnpm install
pnpm dev
```

后端默认地址为 <http://localhost:18080>，可通过 `VITE_APP_BASE_API` 修改。开发代理配置位于项目的 Vite 配置和环境文件中。

## 验证

```powershell
pnpm type-check
pnpm build
```

## 设计约定

- 默认使用暗色界面，强调色为暖珊瑚橙 `#ef6f52`。
- 公共设计规则集中在 `src/style/freemusicplayer.scss`，不要在业务页重复创建同类颜色和间距。
- 表格、搜索表单、弹窗、分页和导航必须保留清晰的 hover、focus、disabled 与 loading 状态。
- 管理端可以在设置面板切换主题，但默认主题应与 FreeMusicPlayer 用户端保持一致。

第三方音乐平台的可用性取决于版权、地区、账号权益和上游接口状态。管理端只维护项目自身数据，不提供会员权限绕过功能。
