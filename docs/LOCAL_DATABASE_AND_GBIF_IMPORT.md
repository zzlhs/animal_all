# PostgreSQL 配置与 GBIF ZIP 导入

所有命令在项目根目录执行。现在只有 TanStack Start 应用，`npm run dev` 和 `npm run dev:web` 均启动新版，并自动读取根目录配置。

## 1. 配置数据库

```bash
npm ci --legacy-peer-deps
test -f .env.local || cp .env.example .env.local
```

在 `.env.local` 配置 `DATABASE_URL`。使用已有 PG 时直接连接；新建本地 PG 时：

```bash
docker compose --env-file .env.local -f infra/compose.yml up -d postgres
```

需要同时保证容器的账户、数据库名、宿主机端口与连接地址一致。修改初始化环境变量不会自动改变已有数据库用户密码。Apple Silicon 上如果镜像没有 arm64，可在 Docker 命令前添加 `DOCKER_DEFAULT_PLATFORM=linux/amd64`。

启动与数据任务命令的配置优先顺序为：终端显式环境变量 > `.env.local` > `.env`。数据库连接只在服务器使用。配置修改后重启 Web。

## 2. 启动新版

```bash
npm run db:migrate
npm run dev
```

默认地址 `http://127.0.0.1:3000/`。空库需要完成导入发布后才会出现记录。

## 3. 使用原版数据

保持 Web 运行，在第二个终端执行：

```bash
npm run data:setup -- --sample
```

120 条原版记录及媒体元数据导入 PG，115 条可定位，20 条带音频，共 22 个音频链接。页面读取 PG 与生成的 PMTiles；`data/sample/occurrences.json` 只供初始化脚本使用。

## 4. 使用你的压缩包

提供 GBIF **Darwin Core Archive ZIP** 的绝对路径：

```bash
npm run data:setup -- --archive /absolute/path/gbif-download.zip --version gbif-20261006
```

脚本自动迁移数据库、流式解压、识别 `meta.xml`、分批导入、重建 H3/媒体聚合、用 Docker 构建 PMTiles、验证后切换活动发布。

- 每次新导入使用新的 `--version`；已有 ZIP 版本拒绝覆盖。
- 原始 ZIP 保留。导入不把完整压缩包一次载入内存。
- 无 `meta.xml` 时支持带表头的 `occurrence.txt` 和可选 `multimedia.txt`。
- 同一个 section 的多个文件、嵌套路径、编码、分隔符及字段索引由解析器处理。
- 默认 `IMPORT_KINGDOM=Animalia`；日志分别报告扫描、筛选和导入数量。
- 媒体写入数据库的是 URL、类型、许可、作者等元数据。GBIF ZIP 通常没有全部原始图片/音频；浏览器按这些 URL 读取媒体，音频经过项目代理和缓存。
- Web 必须正在运行，使发布脚本能验证 HTTP 文件。发布失败时当前活动数据保持可用。

大量导入可提高单条 SQL 超时：

```bash
DATABASE_STATEMENT_TIMEOUT_MS=300000 npm run data:setup -- --archive /absolute/path/gbif-download.zip --version gbif-million-20261006
```

## 5. 路径、端口与产物

- PG：完整记录、媒体、聚合、版本与活动发布指针。
- `data/maps/<revision>.pmtiles`：地图瓦片。
- `artifacts/<revision>/features.geojsonseq`：从 PG 导出的地图特征。
- `artifacts/<revision>/release.json`：真实哈希、大小、URL 和验证信息。

可用 `MAP_STORAGE_DIR` 改瓦片目录；Web 与 CLI 必须一致。可用 `PUBLIC_APP_URL` 改发布地址；默认 `http://127.0.0.1:3000`。

```bash
PUBLIC_APP_URL=http://127.0.0.1:4319 npm run dev -- --host 127.0.0.1 --port 4319
PUBLIC_APP_URL=http://127.0.0.1:4319 npm run data:setup -- --sample
```

改地址后重新发布，不能仅改 `ACTIVE_DATASET_VERSION`。生产对象存储、分步操作和回滚见[开发手册](./DEVELOPMENT.md)。

## 6. 检查数据

```sql
SELECT version, revision, status, occurrence_count, plottable_count,
       aves_count, insecta_count, audio_occurrence_count
FROM datasets;

SELECT mr.id, mr.dataset_revision, mr.pmtiles_url
FROM active_map_release active
JOIN map_releases mr ON mr.id = active.release_id;
```

浏览器中检查照片标记、筛选数量、详情、播放、声景单段/混音。`/api/v1/meta` 返回当前发布，`/api/ready` 返回服务就绪状态。

2026-10-06 已用用户提供的真实 ZIP 导入 572,391 条 Animalia 观测，完成数量对账、地图发布、热点完整分页及 20/50 并发实测。验收发现物种键兼容、音频域名配置、空坐标、密集标记布局及部分性能问题，整体未通过；详见[真实数据验收报告](./GBIF_REAL_DATA_ACCEPTANCE_20261006.md)。当前真实预览使用 4319 端口。一百万条、真实手机及生产环境仍需单独验收。
