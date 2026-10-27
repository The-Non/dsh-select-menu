# dsh-select-menu

DSH（DeepSeek Harness）Web 界面插件：**选中对话文字后弹出浮层**，支持复制、追问（引用 / 解释一下），引用以**输入框上方的副栏**呈现，回车发送时自动把引文拼进消息。

## 效果

选中任意一条消息里的文字 →

```
[ 复制 ] [ 追问 › ]
            ├ 引用        → 输入框上方出现引用副栏，光标自动跳进输入框
            └ 解释一下    → 副栏 + 输入框里预填「解释一下这段：」
```

- 副栏：不透明卡片，左侧竖线，右上角 `×` 取消；最多显示 3 行
- 回车发送时，插件先拦下 → 把 `> 引文` + 你的话写进编辑器 → 再替你按一次回车
- 写入失败不吞消息：改为把引文追加到输入框末尾并提示"再按一次回车"
- 输入框内部选字不会触发（不干扰打字）

## 安装

这是一份**本地插件**，按 DSH 插件管理的方式装：

```bash
# 1) 把本目录放到 profile 里（示例路径）
#    ~/.dsh/profiles/desktop/local-plugins/dsh-select-menu
# 2) 在 profile 目录里加依赖（link 协议，不联网）
cd ~/.dsh/profiles/desktop
pnpm add "link:./local-plugins/dsh-select-menu"
# 3) 把它加进组合包列表：package.json -> dsh.profile.bundles 追加 "dsh-select-menu"
# 4) 重启 DSH（或刷新页面）
```

`package.json` 里需要两处同时存在：

```json
{
  "dependencies": { "dsh-select-menu": "link:local-plugins/dsh-select-menu" },
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-select-menu"] } }
}
```

## 卸载

- 从 `dsh.profile.bundles` 里删掉 `dsh-select-menu`，再 `pnpm remove dsh-select-menu`
- 或直接删掉 `local-plugins/dsh-select-menu` 目录，重启 DSH

## 实现

| 文件 | 作用 |
| --- | --- |
| `lib/index.js` | 宿主侧：注册 `/dsh-select-menu/select-menu.js` 路由；web 形态用 `webServer.tapIndex` 注入 `<script>`，桌面（Electron）形态用 `webserver/index-inject` 推内联 script 行 |
| `assets/select-menu.js` | 浏览器侧：纯 JS，无框架依赖，直接操作 DOM |
| `cordis.patch.yml` | 组合包 patch，把插件插进 profile 的配置树 |

几个关键实现取舍：

- **为什么不用 client module**：DSH 的浏览器插件可以声明 `dsh.client` 走构建产物（需要 tsdown 打包 + 平台模块基座）。本插件只需要一段 DOM 脚本，用注入 `<script>` 的方式最简单，也便于热改（宿主每次请求现读磁盘，改完刷新页面即可）。
- **为什么发送要拦回车**：DSH 的输入框是 Lexical，引用框在它外部、不属于输入内容，所以只能由插件在发送前把引文拼进去。编辑器只认自己的事件，因此"全选覆盖"要先给它发一次 `Ctrl+A`，否则会变成追加（会导致文字重复）。
- **聚焦输入框**：Lexical 根节点可能是 `contenteditable=false`，设 DOM range 无效；改为在输入框里模拟一次带坐标的 `pointerdown → mousedown → pointerup → mouseup → click`，让 Lexical 自己算选区。

## 已知限制

- 只拦 **回车** 发送；用鼠标点发送按钮时引文不会被带上
- 副栏是浮层，位置跟随输入框卡片（400ms 轮询 + resize/scroll 重算）
- 引文以 `> ` Markdown 引用形式进入消息

## License

MIT
