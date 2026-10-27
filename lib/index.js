// dsh-select-menu —— 宿主侧：把浏览器脚本注入 DSH 页面
//
// 两条通道并存（和 dsh-whale-widget 同一套做法）：
//   ① web 形态：ctx.webServer.register 提供 /dsh-select-menu/select-menu.js，
//              再用 ctx.webServer.tapIndex 往 index.html 的 </body> 前插 <script defer src>
//   ② 桌面形态（Electron）：桌面壳直接从安装包 dist 读 index.html，不经过 renderIndex，
//      所以 tapIndex 不生效；唯一通道是 webserver/index-inject 的结构化行。
//      该表在宿主启动时一次性收集 ⇒ 这一行必须在 apply() 最开始就注册。
//      行内容是"内联 script"，由它自己去建 <script src> 并吞掉 onerror
//      （路由被卸载时静默失败，绝不让宿主因为本插件起不来而报错）。

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ASSET_PATH = path.join(PACKAGE_ROOT, 'assets', 'select-menu.js')
const ROUTE = '/dsh-select-menu/select-menu.js'

// 不做内存缓存：改完 assets 刷新页面就生效（只在页面加载时读一次，代价可以忽略）
function loadAsset() {
  try {
    return fs.readFileSync(ASSET_PATH, 'utf8')
  } catch (err) {
    return '/* dsh-select-menu: assets/select-menu.js not found: ' + String(err && err.message) + ' */'
  }
}

const INLINE_ROW =
  '(function(){try{' +
  'if(document.querySelector("script[data-dsm]"))return;' +
  'var s=document.createElement("script");' +
  's.src="' + ROUTE + '";s.defer=true;s.setAttribute("data-dsm","1");' +
  's.onerror=function(){};' +
  '(document.body||document.head).appendChild(s);' +
  '}catch(e){}})()'

export default {
  name: 'dsh-select-menu',

  apply(root) {
    // ① 桌面端：结构化注入行（必须第一时间注册）
    try {
      root.on('webserver/index-inject', (table) => {
        try {
          if (!Array.isArray(table)) return
          for (const row of table) {
            if (!row) continue
            if (row.kind === 'script-src' && row.src === ROUTE) return
            if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf(ROUTE) >= 0) return
          }
          table.push({ kind: 'script', placement: 'body', text: INLINE_ROW })
        } catch (err) {}
      })
    } catch (err) {}

    // ② web 端：路由 + tapIndex
    root.inject(['webServer'], (ctx) => {
      const disposers = []

      try {
        disposers.push(ctx.webServer.register({
          kind: 'exact',
          path: ROUTE,
          handler: (req, res) => {
            res.writeHead(200, {
              'Content-Type': 'application/javascript; charset=utf-8',
              'Cache-Control': 'no-store',
            })
            res.end(loadAsset())
          },
        }))
      } catch (err) {}

      try {
        disposers.push(ctx.webServer.tapIndex((html) => {
          if (typeof html !== 'string') return html
          if (html.indexOf(ROUTE) !== -1) return html
          const tag = '<script defer src="' + ROUTE + '"></script>'
          return html.indexOf('</body>') !== -1 ? html.replace('</body>', tag + '</body>') : html + tag
        }))
      } catch (err) {}

      try {
        root.effect(() => () => {
          for (const d of disposers) { try { d && d() } catch (err) {} }
        })
      } catch (err) {}
    })
  },
}
