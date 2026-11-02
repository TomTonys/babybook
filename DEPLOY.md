# 部署指南

宝宝簿需要一个可连通的 MySQL（5.7+ / 8.x），应用与数据库同机或同内网皆可。
表结构、疫苗种子数据、管理员账号都会在首次启动时自动创建。

## 方式 A：Docker Compose（推荐）

仓库已内置 `Dockerfile` 和 `docker-compose.yml`。本仓库的 GitHub Actions 会自动构建多架构镜像发布到 GHCR，可直接 `docker pull ghcr.io/<你的用户名>/babybook:main` 拉取，免去本地 build（详见 README）。

```bash
cp .env.example .env
vi .env            # 至少改：DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / ADMIN_PASSWORD

docker compose up -d --build
docker compose logs -f      # 查看日志
docker compose down         # 停止
```

浏览器打开 `http://<服务器IP>:8090`，用 `.env` 里的 `ADMIN_USER` / `ADMIN_PASSWORD` 登录。
头像等上传文件通过 `./data/uploads` 卷持久化到宿主机，容器重建不丢。

## 方式 B：裸机 Node（机器上有 Node ≥ 18）

```bash
cp .env.example .env && vi .env     # 同上改数据库与管理员
npm install --omit=dev
node server/index.js                # 前台跑，或配合 systemd / pm2 常驻
```

想开机自启，加 systemd：

```ini
# /etc/systemd/system/babybook.service
[Unit]
Description=BabyBook
After=network.target
[Service]
WorkingDirectory=/opt/babybook
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
User=nobody
[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now babybook
sudo journalctl -u babybook -f
```

## 反向代理 / HTTPS

放在 Nginx、Caddy 等反代后面时，把 `.env` 里的 `TRUST_PROXY=1`，
这样会话 cookie 会带上 `Secure` 标记。Caddy 示例：

```
your.domain {
    reverse_proxy 127.0.0.1:8090
}
```

## 常见问题

- **DB_HOST 填什么？**
  - 应用与 MySQL 同机、MySQL 只监听本地 → 填 `127.0.0.1`
  - 应用跑在容器里、MySQL 在宿主机 → 填宿主机内网 IP，或用 `--network host` / 自定义网络
  - MySQL 账号需允许从应用所在主机连接（如 `'user'@'%'`）
- **端口被占用？** 改 `.env` 里的 `PORT`，同步改 compose 的端口映射
- **数据怎么备份？** 直接备份 MySQL 库即可；应用「设置」里也有 JSON 导出
- **首次启动会做什么？** 自动建表 + 写入疫苗程序种子数据 + 创建管理员账号（仅当没有用户时）
