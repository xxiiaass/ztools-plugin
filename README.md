# ztools-plugin

自用的一套 [ZTools](https://github.com/ZToolsCenter/ZTools) 插件合集。ZTools 是开源的 uTools 替代品（Electron 启动器），这里每个目录都是一个可直接安装的插件。

主打两件事：**把小工具做得比系统自带的好用一点**、**把重复操作压到两三次按键**。

## 插件一览

| 插件 | 目录 | 版本 | 一句话 | 触发方式 |
| --- | --- | --- | --- | --- |
| **JSON 嵌套解析** | [`json-nested/`](json-nested) | 0.1.1 | 树形解析被反复转义 / 多层嵌套的 JSON | 关键词 `json` `jsonn`，或直接贴 JSON |
| **JSON 预处理** | [`json-prep/`](json-prep) | 0.1.0 | 无界面：先用 JS 洗一遍文本，再转给 `json-editor` 打开 | 关键词 `jj`，或任意含 JSON 的文本 |
| **CLS 日志查询** | [`cls-log/`](cls-log) | 0.1.0 | 选中一个 UUID，选环境直接用 Firefox 打开腾讯云 CLS 检索页 | 选中 36 位 UUID，或关键词 `cls` `日志` |
| **文本集合运算** | [`set-ops/`](set-ops) | 0.1.2 | 左右两段多行文本做交集 / 并集 / 差集 / 排除 | 关键词 `集合` `setop` |
| **CSV 关联** | [`csv-join/`](csv-join) | 0.1.1 | 两个 CSV 按指定列做连接，结果可选列后导出 | 关键词 `csv` `关联`，或选中 1~2 个 CSV 文件 |

## 安装

三种方式，任选：

1. **装包**：下载对应目录里的 `*.zpx`，ZTools → 插件管理 → 从本地安装。
2. **装目录**：ZTools → 插件管理 → 添加本地插件，指向仓库里的插件目录（开发调试用，改完刷新即生效）。
3. **只想看看界面**：直接双击各目录下的 `preview.html`，它内联了一份模拟宿主环境，能在浏览器里跑真实交互。

> `.zpx` 就是把 `plugin.json` + 主页面 + `preload.js` + `logo.png` 打成一个 zip 再改后缀，不含 `preview.html`。

## 各插件说明

### json-nested — JSON 嵌套解析

自带的 JSON 工具遇到「某个字段的值本身是一段 JSON 字符串（还带着一堆转义符）」就废了。这个插件把这种结构一层层拆开。

- 自动识别 `\"`、`\\`、`\uXXXX` 等转义并解包，最多剥 3 层
- 树形展示，节点可折叠、显示路径（`data.cfg.list[2].payload`），支持按路径过滤
- 每个节点单独复制、复制路径、复制反序列化后的值
- 「转发给其它 JSON 工具」按钮：清洗完的文本直接 `redirect` 给 `json-editor`

### json-prep — JSON 预处理

和上一个不同，这个**没有界面**：`mode: 'none'`，点一下就执行、跳转、消失。

- 清洗非法 JSON（尾逗号、单引号、注释、未加引号的 key 等）
- 反转义后交给 `json-editor` 正常展示
- 顶部常量可改：`TARGET = ['json-editor', 'Json']`、`UNWRAP_NESTED`、`OUTPUT = 'compact' | 'pretty'`
- 依赖：需要先装 `json-editor` 插件（`ztools.redirect` 只能把文本投递给 `regex` / `over` 类型的入口）

### cls-log — CLS 日志查询

把「复制 UUID → 打开控制台 → 选日志主题 → 填检索框」压成一次回车。

- 匹配 36 位 UUID（`8-4-4-4-12`），列出「eo 生产日志 / eo 测试日志 / 合规生产日志」三项
- 选中后拼出带 `queryBase64` 的 CLS 检索 URL（URL-safe base64），直接用 Firefox 打开
- 没装 Firefox 时退化到默认浏览器，再退到复制链接到剪贴板
- 换环境只改 `preload.js` 里的 `TARGETS` 数组：`region` / `topic_id` / `time` / `grammarVersion`

### set-ops — 文本集合运算

贴两段文本，点按钮出结果，适合对账、比对域名/ID 列表。

- 交集、并集、对称差集、A 排除 B、B 排除 A
- 可选：去首尾空白、去空行、去重、忽略大小写、排序
- 结果一键复制（`copyText` → IPC → `navigator.clipboard` → `execCommand` 四级兜底），或存成文件

### csv-join — CSV 关联

原本是本地脚本 `pastebot/map.js`（`csv-parse` + `csv-stringify`）干的活，搬进插件后能选文件、看预览。

- 选两个 CSV（点选或拖拽到左右任一侧），自动识别分隔符（`,` `\t` `;` `|`）并解析列名，兼容引号、`""` 转义、CRLF、BOM
- 指定关联列：下拉选或**直接点列名标签**；两边有同名列时自动匹配（手动选过就不再被覆盖）
- 六种模式：`A∩B` 内连接、`A·B` 左连接、`B·A` 右连接、`A∪B` 全外连接、`A−B`、`B−A`
- 语义与原脚本一致：结果表头 = A 的列 + B 的列，重复 key **首次出现优先**
- **结果列可勾选**：默认去掉 B 侧与 A 重名的列（合并时最常见的冗余），差集模式只留有效那一侧；预览、导出、复制三处完全一致
- 导出走「另存为」对话框（UTF-8 带 BOM，Excel 打开中文不乱码），另有下载目录、Blob 下载两级兜底
- 在 ZTools 里选中 1~2 个 CSV 文件即可直接带入（`files` 类型入口，preload 读文件带 GBK 兜底）

## 目录结构

```
.
├── json-nested/
│   ├── plugin.json               # 插件清单：name / title / main / preload / features
│   ├── index.html                # 主界面（UI 型插件）
│   ├── preload.js                # 宿主桥接：剪贴板、文件读写
│   ├── logo.png                  # 128×128
│   ├── preview.html              # 浏览器预览版（内联模拟宿主，不打包进 .zpx）
│   └── json-nested-0.1.1.zpx     # 可直接安装的包
├── json-prep/                    # 无界面插件，主页面是 blank.html
├── cls-log/                      # 列表选择型插件
├── set-ops/
└── csv-join/
```

每个插件都是自包含的：拷走一个目录就能跑，没有共享依赖、不需要构建。

## 开发笔记

写这些插件时踩过的坑，记下来省得再踩一遍。

### ZTools 与 uTools 不是直接兼容

- 全局对象是 `window.ztools`，**没有** `window.utools` 别名（个别插件里自己加了 shim）
- `plugin.json` 用 `name`（ID）+ `title`（显示名），uTools 的 `pluginName` 不认
- `features[].cmds` 支持 `string` / `regex` / `over` / `img` / `files`；字段有 `match` `minLength` `maxLength` `exclude` `label` `extensions` `fileType`
- 插件模式：默认 UI（`main`）、`mode: 'none'`（无界面，点完即走，靠 preload 的 `window.exports[code].args.enter` 执行）、`mode: 'list'`（列表选择）

### preload 的边界（最容易翻车的地方）

插件页是 `WebContentsView`，`webPreferences` 大致是：

```js
{ contextIsolation: false, nodeIntegration: false, sandbox: false, preload: '<插件自己的 preload>' }
```

宿主的能力由 `session.registerPreloadScript()` 注入另一份 preload。由此得出：

- ✅ 页面能直接拿到 `window.ztools`（`contextIsolation: false`，同一上下文）
- ✅ preload 里 `require('fs')` / `require('path')` / `require('electron')` 可用
- ❌ **preload 里拿不到 `electron.app` / `electron.shell` / `electron.dialog`**（主进程专属），一调用就抛错
- ✅ 剪贴板读用 `electron.clipboard.readText()`（renderer 非沙箱可用）；写优先 `ztools.copyText()`

系统能力该走这几条通道（`ipcRenderer.sendSync`）：

| 需求 | 通道 / API |
| --- | --- |
| 复制文本 | `ztools.copyText(text)` → 成功返回 `true` |
| 另存为对话框 | `ztools.showSaveDialog(opts)` → 取消返回 `undefined`，否则返回文件路径 |
| 系统目录 | `ztools.getPath('downloads' \| 'home' \| 'pluginData' \| …)` |
| 在访达中显示 | `ztools.shellShowItemInFolder(path)` |
| 写文件 | preload 里 `fs.writeFileSync` |

> 一句话：**preload 只管文件 IO，系统级交互一律交给 `ztools.*`**。

### 转发给其它插件

`ztools.redirect(label, payload)` 的 `payload` 只有非空字符串能命中对方的 `regex` / `over` 入口；`label` 可以是 `['插件标题', 'cmd 名']` 或裸的 cmd 名。`json-prep` 就是靠这个把清洗后的文本投给 `json-editor` 的。

### 预览页

每个 UI 插件都带一份 `preview.html`：`index.html` 的内容 + 一段在正文脚本之前注入的 `<script>`，用来伪造 `window.ztools`（`dbStorage` / `copyText` / `onPluginEnter` / `setExpendHeight`）和 `window.__bridge`（`saveFile` 走 Blob 下载）。改完界面双击就能看效果，不用反复重装插件。

## 说明

自用为主，代码随手参考。插件里出现的日志主题 ID、集群区域等都是本人环境配置，换环境请自行替换 `preload.js` 里的常量。
