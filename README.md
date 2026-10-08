# GBIF 生物多样性地球仪

TanStack Start + React + TypeScript 全栈应用，使用 PostgreSQL/PostGIS 保存观测记录和媒体元数据，MapLibre + PMTiles 绘制地球仪。

```text
apps/web/       页面、Start API、音频代理、生产 HTTP 服务
apps/worker/    GBIF ZIP 导入、聚合、瓦片、媒体同步与发布任务
packages/      contracts、db、domain、geo、media 共享模块
data/sample/   原版的 120 条记录，仅供数据库初始化
scripts/       配置加载、Docker 瓦片构建和一键数据接入
infra/         PostgreSQL 与 Web/Worker/瓦片工具 Docker 配置
docs/          开发、架构、迁移规范与验证记录
```

旧 Vue 前端、Fastify 后端及其重复启动/代理代码已移除。浏览器从 Start API 和已发布 PMTiles 读取数据。

## 本地运行

需要 Node.js 22.13+；首次创建数据库和构建瓦片需要 Docker。

```bash
npm ci --legacy-peer-deps
test -f .env.local || cp .env.example .env.local
```

编辑根目录 `.env.local` 的 `DATABASE_URL`。已有 PostgreSQL 可直接使用；需要新建本地库时运行：

```bash
docker compose --env-file .env.local -f infra/compose.yml up -d postgres
npm run db:migrate
npm run dev
```

默认访问 [本地地球仪](http://127.0.0.1:3000/)。`dev` 与 `dev:web` 都启动 TanStack Start，自动读取根目录 `.env`、`.env.local`；终端显式环境变量优先。

### 导入原版数据

保持 Web 服务运行，在第二个终端执行：

```bash
npm run data:setup -- --sample
```

这会把原版 120 条记录及图片、音频、视频元数据导入 PostgreSQL，生成并校验 PMTiles，最后切换活动发布。115 条有有效坐标、20 条带音频、22 个音频链接。页面不直接读取样例 JSON。

### 导入 GBIF 压缩包

```bash
npm run data:setup -- --archive /absolute/path/gbif-download.zip --version gbif-20261006
```

脚本流式解压 DWCA，按 `meta.xml` 解析记录和媒体，分批写入 PG，重建聚合，生成瓦片，完成本地与 HTTP 校验后发布。每次新导入使用不同版本名。原始 ZIP 不会被删除。

ZIP 通常包含媒体 URL 与许可信息。地图使用按需生成、持久缓存的 128 px WebP 缩略图；详情使用 640 px 预览，打开大图时才请求原图。音频通过 PostgreSQL 持久化队列下载并上传 ImageKit，播放器从 ImageKit 播放。配置与任务进度见 [音频队列说明](docs/AUDIO_IMAGEKIT_QUEUE_20261008.md)。加载策略、预热命令及生产实测见 [加载优化与验收](docs/LOADING_OPTIMIZATION_20261008.md)。

## 构建与验证

```bash
npm run build
npm run start
npm run typecheck --workspace apps/worker
npm test
npm run smoke:web
```

真实 PG 集成测试需要独立的、名称以 `_test` 结尾的数据库：

```bash
TEST_DATABASE_URL=postgres://gbif:gbif@127.0.0.1:55439/gbif_test npm test
```

## 文档

- [开发手册](docs/DEVELOPMENT.md)
- [数据库与 ZIP 导入指南](docs/LOCAL_DATABASE_AND_GBIF_IMPORT.md)
- [当前技术架构](docs/TECHNICAL_DESIGN.md)
- [十万至百万级目标规范](docs/TANSTACK_START_POSTGRESQL_DEVELOPMENT.md)
- [功能迁移与验证记录](docs/TANSTACK_START_REPAIR_VERIFICATION.md)

已导入并核对用户提供的真实 GBIF 数据包，当前数据集包含 572,391 条动物观测。导入、分页和容量结果见 [真实数据验收](docs/GBIF_REAL_DATA_ACCEPTANCE_20261006.md)，本次首屏加载优化见 [加载验收](docs/LOADING_OPTIMIZATION_20261008.md)。历史验收中的其他未通过项和百万级完整验收仍需继续处理。
