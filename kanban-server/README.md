# 看板服务

Node 服务，给看板插件存数据。不放进记账服务，也不要重启记账进程（3000 / 3001）。

## 本地

```bash
npm install
KANBAN_TOKEN=改成一串只有你知道的token PORT=3002 node server.js
```

`GET /api/snapshot` 要带 `Authorization: Bearer <token>`。没有 token 返回 401。空库的 `revision` 是 0。

数据文件默认是 `kanban-server/data/board.db`。

## 每周备份

每周一 09:00（亚洲/上海）把一个 `board.db` 发到邮箱。SMTP 存在本库 `meta` 表的 `smtp` 里，形状和记账服务一样：`host`、`port`、`user`、`pass`、`from`、`to`。

第一次启动如果自己还没有 smtp，会只读记账库 `/root/projects/bookkeeping/data/zhangben.db` 的 `settings.smtp` 并复制过来。路径可用 `BOOKKEEPING_DB` 覆盖。密码不写进仓库。

## 服务器

把这个目录同步到 `/root/projects/kanban`。这台机器的 g++ 不认 C++20，装不了 better-sqlite3 12，所以在服务器上改用和记账服务相同的 10.1.0：

```bash
cd /root/projects/kanban
npm install better-sqlite3@10.1.0 express@4.21.2 nodemailer@6.10.1
```

不要再跑一次不带版本的 `npm install`，那会按 package.json 装回 12，而这台机器编译不过。开发机继续用 package.json 里的 12.4.1。然后听 3002，不要用 systemd 去碰别的服务。

```bash
cd /root/projects/kanban
KANBAN_TOKEN=你的token PORT=3002 nohup node server.js >> /root/projects/kanban/server.log 2>&1 &
```
