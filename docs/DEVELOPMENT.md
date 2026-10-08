# 开发手册

更新日期：2026-10-08。项目使用 TanStack Start、React、TypeScript 和 PostgreSQL/PostGIS。旧前后端目录已经删除。

## 1. 环境与配置

- Node.js 22.13+，统一使用根目录工具链。
- PostgreSQL 16 + PostGIS 3.5。
- Docker：用于本地数据库和固定版本的 Tippecanoe/PMTiles 工具。

从项目根目录执行命令：

```bash
npm ci --legacy-peer-deps
test -f .env.local || cp .env.example .env.local
```

启动、构建及数据任务的根 npm 命令先读取 `.env`，再读取 `.env.local`，最后保留终端已显式设置的变量。数据库、对象存储及媒体密钥仅在服务端使用；配置修改后重启服务。直接进入 workspace 运行 npm 时没有根配置加载器，建议使用根命令。

| 配置 | 用途 |
| --- | --- |
| `DATABASE_URL` | Web 和 Worker 的 PG 连接地址 |
| `DATABASE_SSL`、`DATABASE_CA_CERT` | 远程数据库 TLS 配置 |
| `DATABASE_POOL_MAX` | 连接池大小 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | SQL 单条超时，Web 默认 8000 ms；大量导入可在该命令前单独提高 |
| `PUBLIC_APP_URL` | 本地发布的浏览器可访问地址，默认 `http://127.0.0.1:3000` |
| `MAP_STORAGE_DIR` | 本地 PMTiles 绝对目录，默认根目录 `data/maps`，Web 与导入必须一致 |
| `RESOURCE_CACHE_DIR` | 缩略图与底图磁盘缓存，默认根目录 `data/cache`；容器应挂载持久目录 |
| `VITE_BASEMAP_ASSET_ORIGIN` | 可选底图 CDN 域名，提供相同 `/api/basemap` 路径与 CORS；修改后重新构建 |
| `IMPORT_KINGDOM` | DWCA 导入界，默认 Animalia；样例导入保留全部 120 条记录 |
| `IMPORT_BATCH_SIZE` | 批量写入大小，默认 500 |
| `ACTIVE_DATASET_VERSION` | 低级 Worker 命令默认版本名；Web 读取数据库活动 release |
| `H3_BASE_RESOLUTION` | 基础 H3 分辨率，默认 8 |
| `PMTILES_SOURCE_LAYER` | 瓦片图层名，默认 gbif_occurrences |
| `OBJECT_STORAGE_*` | 手动上传到 S3/R2 等对象存储时使用 |

## 2. 启动

已有 PG 时直接迁移；新建本地 PG 时先启动容器。

```bash
docker compose --env-file .env.local -f infra/compose.yml up -d postgres
npm run db:migrate
npm run dev
```

`npm run dev:web` 是同一个入口。开发端口固定为 3000，端口占用会报错；需要改端口时：

```bash
PUBLIC_APP_URL=http://127.0.0.1:4319 npm run dev -- --host 127.0.0.1 --port 4319
```

数据发布时也需要相同 `PUBLIC_APP_URL`。空库或未发布时 `/api/v1/meta` 返回 `NO_ACTIVE_RELEASE`，页面显示加载失败及重试；运行下一节完成数据接入。

## 3. 一键接入数据

保持 Web 运行，在第二个终端执行：

```bash
npm run data:setup -- --sample
```

默认版本名为 `sample-120-restored`。已有 ready 样例可重新校验发布，不会重复导入。样例文件在 `data/sample/occurrences.json`，只作为 Worker 输入。

自己的 GBIF Darwin Core Archive ZIP：

```bash
npm run data:setup -- --archive /absolute/path/gbif.zip --version gbif-20261006
```

完整流程：

1. 执行未应用的 PG 迁移。
2. 从 ZIP 读取 `meta.xml`，逐段流式解压 core 和可选 multimedia extension。
3. 解析字段索引、编码、分隔符、引号和表头；分批写入 species、occurrences、media，计算 H3。
4. 重建媒体快照、H3 聚合与筛选计数；完成后数据集为 ready。
5. 从 PG 导出 GeoJSON sequence，通过 Docker 构建 PMTiles。
6. 在 `artifacts/<revision>/release.json` 写入真实哈希、大小和地址。
7. 校验本地 PMTiles v3、远端 HEAD/Range/CORS、完整文件哈希及抽样瓦片 revision/schema。
8. 在事务中创建 release 并切换活动指针。

导入失败不会覆盖当前活动发布。相同 ZIP 版本拒绝重复导入，应使用新的版本名；不要把已发布版本作为 `--replace` 目标。构建或 HTTP 校验失败时，PG 中的 ready 数据和生成文件会保留，方便用后续低级命令继续。

本地发布的 URL 包含版本 UUID，响应支持 GET、HEAD、206、416 和长期不可变缓存。元数据接口将 localhost/127.0.0.1 的本地地图地址转换为同源路径，切换开发与生产端口可以继续读取同一个本地文件。远程对象存储发布仍需校验实际域名、Range 和 CORS。

生产加载验收使用 `npm run build` 后的 `npm run start`。缩略图预热、底图快照更新及自动性能测量见 [加载优化与验收](LOADING_OPTIMIZATION_20261008.md)。

大量导入可单独放宽 SQL 超时：

```bash
DATABASE_STATEMENT_TIMEOUT_MS=300000 npm run data:setup -- --archive /absolute/path/gbif.zip --version gbif-large-20261006
```

## 4. 分步操作与远程存储

```bash
npm run dwca:import -- --archive /absolute/path/gbif.zip --version gbif-next
npm run map:export -- --version gbif-next --output /absolute/path/features.geojsonseq
npm run map:build -- --input /absolute/path/features.geojsonseq --output /absolute/path/map.pmtiles
```

`map:build` 自动使用 `infra/Dockerfile.tiles` 的工具镜像，本机无需安装 Tippecanoe/PMTiles。工具版本固定为 Tippecanoe 2.79.0、PMTiles CLI 1.30.0。构建保留完整特征，热点瓦片体积需要实测。

发布到生产对象存储时：

```bash
npm run map:upload -- --input /absolute/path/map.pmtiles --key maps/gbif-next/build-001.pmtiles
```

写入对象存储配置后显式执行上传。然后创建 manifest：

```json
{
  "datasetRevision": "填写 datasets.revision",
  "pmtilesUrl": "https://your-cdn.example/maps/gbif-next/build-001.pmtiles",
  "localPath": "/absolute/path/map.pmtiles",
  "sourceLayer": "gbif_occurrences",
  "featureSchemaVersion": 2,
  "sha256": "文件的真实 SHA256",
  "size": 123456,
  "verifyOrigin": "https://your-app.example",
  "sampleTiles": [{ "z": 0, "x": 0, "y": 0 }]
}
```

抽样瓦片必须实际包含数据。填入实际值后：

```bash
npm run release:publish -- --manifest /absolute/path/release.json --dry-run
npm run release:publish -- --manifest /absolute/path/release.json
npm run release:rollback -- --release-id=2
```

保留 release ID、旧数据集和不可变瓦片，以便回滚。`db:prune-retired` 仅处理没有任何 release 引用的退役数据，保留已发布快照。

可选媒体镜像任务：

```bash
npm run media:sync -- --limit 100
```

执行会向所配置的 ImageKit 上传媒体。实际参数参见 `apps/worker/src/media/sync-imagekit.ts`；运行需要 ImageKit 配置。媒体同步不是 ZIP 导入的前置条件。音频使用独立的优先级队列，配置、Worker 启动及 `/audio-prewarm` 进度页面见 [音频队列说明](AUDIO_IMAGEKIT_QUEUE_20261008.md)。

## 5. 页面与数据读取

- dark/light、语言、星空、大气、玻璃控制按钮与旧版保持相同样式和文案。
- 数据集不超过 160 个可定位点时，API 从 PG 返回有界集合，沿用旧版邻近聚合、图片标记、音频图标和动态光波，并按屏幕距离控制标记密度。
- 大数据集通过 PMTiles 加载当前瓦片；按缩放与屏幕距离选择最多 32／64／84 个可见标记，优先显示选中和播放位置。先显示数字或音频占位，再以每批最多 24 条获取代表记录，逐批补充照片。聚合数量和详情分页保留原始数据总数。
- 聚合详情使用带 revision 的查询和游标分页；媒体也绑定同一发布快照。
- 音频通过持久化队列下载并上传 ImageKit，支持准备/缓冲/播放/暂停/失败状态、下载重试、重播和定位；声景支持单段、2–4 段混音、15/30/60/90 分钟倒计时及音量。
- 声景与单条录音互斥，切换会取消未完成的音频加载。

PG 保存记录、媒体 URL 与许可等元数据。通常 DWCA 不包含所有原始媒体二进制，播放仍需要源站可访问；可配置媒体 CDN 镜像。

## 6. 测试与生产运行

```bash
npm run typecheck:web
npm run typecheck --workspace apps/worker
npm test
npm run build
npm run smoke:web
npm run start
```

独立测试数据库必须以 `_test` 结尾：

```bash
TEST_DATABASE_URL=postgres://gbif:gbif@127.0.0.1:55439/gbif_test npm test
```

CI 使用 PostGIS 服务执行类型检查、测试、构建、样例导入、瓦片特征导出与生产 HTTP smoke。

容器配置在 `infra/compose.yml`。Web 挂载 `data/maps` 供本地瓦片读取；生产可以发布 CDN 地址。`/api/health` 检查进程，`/api/ready` 检查数据库和活动发布。

十万/百万容量验收应记录导入数量与耗时、热点瓦片尺寸、PG 执行计划和 API p95、浏览器帧率与长时内存。当前小规模验证不代替这些指标。
