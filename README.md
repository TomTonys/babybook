# 宝宝簿 BabyBook 🍼

自托管的宝宝记录：**产检（孕期）→ 出生档案 → 疫苗接种 → 成长曲线 → 待办提醒 → AI 问答**。

Node.js + Express + 原生 ESM 前端（无框架、无构建步骤），数据全部存在你自己的 MySQL 里。

## 为什么自托管

- 宝宝的产检数据、出生体重、疫苗批号，不该交给某个 App 厂商的云端
- 一台小主机 / 树莓派 / NAS 就能跑，全家用一个链接访问
- 数据就是一个 MySQL 库，`mysqldump` 一句话备份，随时可以迁走

## 功能

- **多宝宝档案**：支持孕期中（只有预产期，自动算孕周）和已出生两种状态
- **疫苗接种**：按出生日期自动生成国家免疫规划 11 种 22 剂接种计划，逾期/临近自动提醒；自费疫苗（13价肺炎、轮状、水痘、流感等）一键排期；记录厂家、批号、门诊、接种反应
- **产检时间线**：建档 / NT / 大排畸 / 糖耐等，血压、宫高、腹围、胎心，自动推算孕周
- **成长曲线**：身高 / 体重 / 头围 SVG 曲线，自动对比上次变化
- **待办与里程碑**：儿保体检提醒、第一次翻身 / 长牙等记录
- **AI 助手**：内置聊天入口，AI 通过只读函数调用直接查询你的数据库来回答问题（"哪些疫苗逾期了""上次产检医生说什么"），允许读取的模块可在设置里勾选开关
- **家庭共用**：登录鉴权（scrypt + HMAC 会话），头像上传，JSON 一键导出

## 快速开始

前提：准备好一个 MySQL（5.7+ / 8.x）库和账号，表结构首次启动自动创建。

```bash
git clone https://github.com/<你的用户名>/babybook.git
cd babybook
cp .env.example .env    # 改 DB_* 和 ADMIN_PASSWORD
npm install
npm start
```

打开 `http://localhost:8090`，用 `.env` 里的 `ADMIN_USER` / `ADMIN_PASSWORD` 登录（登录后记得去「设置」改密码）。

## Docker 部署

### 用预构建镜像（最省事）

本仓库自带 GitHub Actions（`.github/workflows/docker.yml`）：推送到 `main` 分支或打 `v*` tag，自动构建 **amd64 + arm64** 多架构镜像并推送到 GHCR。

```bash
docker pull ghcr.io/<你的用户名>/babybook:main
# 或按版本 tag：docker pull ghcr.io/<你的用户名>/babybook:1.0.0
```

> 若 package 可见性是 Private，先登录：`echo <PAT> | docker login ghcr.io -u <你的用户名> --password-stdin`（PAT 需 `read:packages` 权限）。

`docker-compose.yml` 默认本地 `build`；想直接用镜像，把 `build: .` 一行换成 `image: ghcr.io/<你的用户名>/babybook:main` 即可。

```bash
cp .env.example .env && vi .env      # 填 DB_HOST / DB_PASSWORD / ADMIN_PASSWORD 等
docker compose up -d
```

本地构建则直接 `docker compose up -d --build`。裸机 Node、systemd 常驻、反向代理细节见 [DEPLOY.md](DEPLOY.md)。

## 配置项（.env）

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | 8090 | 监听端口 |
| `HOST` | 0.0.0.0 | 监听地址 |
| `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` | — | MySQL 连接 |
| `ADMIN_USER`/`ADMIN_PASSWORD` | admin / baby123456 | 首次启动创建的管理员（仅当用户表为空），登录后请改密码 |
| `TRUST_PROXY` | 0 | 放在 Nginx/Caddy 反向代理后设为 1 |
| `SESSION_SECRET` | 空 | 留空自动生成并持久化到数据库 settings 表 |

## AI 助手配置

进入「AI 助手」页签 → 右上「AI 设置」，填一个 **OpenAI 兼容** 的服务即可，配置存数据库、跨重启保留：

| 场景 | API 地址示例 |
|---|---|
| 自建 AI 网关（ai_gateway / one-api / new-api 等） | `http://<网关IP>:<端口>` |
| DeepSeek | `https://api.deepseek.com` |
| OpenAI | `https://api.openai.com/v1` |
| 硅基流动 | `https://api.siliconflow.cn/v1` |
| Ollama 本地模型 | `http://<IP>:11434/v1` |

- 模型名按上游实际填写（如 `deepseek-chat`、`gpt-4o-mini`），填完点「测试连接」验证
- **模块自定义**：勾选允许 AI 读取哪些数据（宝宝档案 / 产检记录 / 疫苗接种 / 成长测量 / 待办提醒），未勾选的模块 AI 完全拿不到
- AI 严格**只读**：只能查询，不能增删改任何记录
- 工作方式选「自动」即可：优先**工具调用**（函数调用按需查库）；遇到不支持 tools 的上游自动降级为**数据快照**（把勾选模块的数据直接随提示词发给模型）
- 支持自定义系统提示词与温度；API Key 保存后界面只显示掩码，可一键清除
- 注意：若填的是公网 API，你的提问与相关数据摘要会发送到该 API 服务商；完全离线可对接局域网内的 Ollama

## 目录结构

```
server/
  index.js          Express 入口
  config.js         配置读取 + .env 解析
  db.js             mysql2 连接池 + 建表 + 疫苗种子数据
  auth.js           HMAC 会话鉴权
  schema.sql        数据库结构
  data/vaccines.js  疫苗程序种子数据（可自行调整）
  lib/              日期 / 密码 / HTTP / 疫苗排期 / AI 工具层
  routes/           auth · babies · vaccines · prenatal · growth · events · ai
public/
  index.html        单页入口（内联 SVG 图标）
  css/app.css       设计系统
  js/
    app.js          路由与外壳
    api.js util.js ui.js
    views/          overview · vaccines · prenatal · growth · ai · settings
.github/workflows/
  docker.yml        自动构建多架构镜像并发布到 GHCR
```

## 数据表

`users` 登录账号 · `babies` 宝宝档案 · `prenatal_visits` 产检 · `vaccine_defs` 疫苗程序（种子数据） · `vaccinations` 接种记录 · `growth_records` 成长测量 · `events` 待办/里程碑 · `settings` 系统键值

## 说明与免责

- 疫苗程序基于《国家免疫规划疫苗儿童免疫程序及说明（2021 年版）》，实际接种以当地社区卫生服务中心安排为准；程序可在 `server/data/vaccines.js` 调整，重启自动同步
- AI 助手基于你的记录数据和模型知识给出**参考**，涉及补种安排、发育评估等医疗决策，请务必以儿科医生 / 接种门诊意见为准

## License

[MIT](LICENSE)
