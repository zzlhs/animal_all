# 开发与数据管道手册

## 1. 环境要求

- 工作区与 `frontend` 使用 Node.js `22.13.1`；`backend` 使用 Node.js `20.x`。
- Docker 与 Docker Compose，用于本地 PostGIS。
- 生成 PMTiles 时安装 Tippecanoe 和 PMTiles CLI，或使用项目提供的固定版本工具镜像。
- 一个标准 GBIF DWCA ZIP；推荐包含 `meta.xml`，multimedia extension 可选。

根目录、`frontend` 与 `backend` 各自提供 `.nvmrc`/`.node-version`，进入对应目录后使用对应版本。后端 `engines` 和 Dockerfile 锁定 Node 20。当前代码按 [TDWG Darwin Core Text Guide](https://dwc.tdwg.org/text/) 处理一个 section 的一个或多个 `<location>`；它不依赖全量解压 DWCA，而是读取文件位置、编码、分隔符、引号、表头行数与字段索引后流式批量写入数据库，因此 2 GB 以上压缩包也不会一次性进入内存。文件位置按 `meta.xml` 所在目录解析；同名路径有歧义时拒绝猜测。没有 `meta.xml` 时回退到带表头的 `occurrence.txt`/可选 `multimedia.txt`。

## 2. 初始化后端

```bash
cd backend
cp .env.example .env
npm install
docker compose up -d database
npm run db:migrate
```

最重要的后端配置：

| 环境变量 | 说明 | 示例 |
|---|---|---|
| `DATABASE_URL` | PostgreSQL 连接地址 | `postgres://gbif:gbif@localhost:5432/gbif_globe` |
| `ACTIVE_DATASET_VERSION` | API 当前数据版本 | `dwca-2026-08-27` |
| `CORS_ORIGINS` | 允许的前端来源，逗号分隔 | `http://localhost:5173` |
| `AUDIO_PROXY_ALLOWED_HOSTS` | 允许后端代理的音频源域名 | `xeno-canto.org,www.xeno-canto.org` |
| `PMTILES_URL` | 已上传 PMTiles 的公开地址 | `https://cdn.example.com/gbif-v1.pmtiles` |
| `PMTILES_SOURCE_LAYER` | 矢量瓦片 layer 名 | `gbif_occurrences` |
| `IMPORT_KINGDOM` | 导入过滤条件 | `Animalia` |
| `IMPORT_BATCH_SIZE` | 每批数据库写入数 | `500` |
| `H3_BASE_RESOLUTION` | 物种细网格与 API 查询层级，推荐 8 | `8` |
| `IMAGEKIT_URL_ENDPOINT` | ImageKit URL endpoint | `https://ik.imagekit.io/account` |
| `IMAGEKIT_PRIVATE_KEY` | 仅后端媒体同步任务使用 | 不提交到 Git |
| `IMAGEKIT_SYNC_MEDIA_TYPES` | 同步的媒体类型 | `image,video` 或 `image,video,audio` |
| `IMAGEKIT_SYNC_MAX_ATTEMPTS` | 单条媒体最大领取次数 | `5` |
| `OBJECT_STORAGE_*` | S3/R2 兼容存储连接、桶、公开域名与可选 CORS 验证来源 | 见 `.env.example` |

## 3. 导入 DWCA

先保证 `.env` 中的 `ACTIVE_DATASET_VERSION` 与本次导入版本一致：

```bash
npm run dwca:import -- \
  --archive /absolute/path/to/dwca.zip \
  --version dwca-2026-08-27
```

导入过程会：

1. 流式扫描 occurrence，只保留 `IMPORT_KINGDOM`；
2. 校验 GBIF ID、经纬度和 dataset UUID；
3. 计算 H3 r2 到 r8；
4. 批量写入 species 和 occurrences；
5. 如归档包含 multimedia extension，第二遍流式扫描媒体，只关联已导入 occurrence；
6. 构建 `map_cells` 与 `species_cells`；
7. 把暂存 dataset 状态改为 `ready`，再在一个事务中发布共享物种分类并原子提升为目标版本。

同名版本默认拒绝重复导入。只有明确要重建时才使用：

```bash
npm run dwca:import -- --archive /path/to/dwca.zip --version test-v1 --replace
```

`--replace` 不会预先删除旧版本。新数据使用 `test-v1.__staging__` 暂存，导入、媒体关联和聚合全部成功且至少有一条可绘制记录后才切换；已有物种分类也到切换事务中才更新，失败时只删除暂存数据。旧数据切换后标记为 `retired`，用于保护切换时正在处理的 API 请求。确认保留期结束后可显式分批删除：

```bash
npm run dataset:prune-retired -- --older-than-days=30 --limit=5 --confirm
```

该命令具有删除性，缺少 `--confirm` 时会拒绝执行。生产数据仍推荐每次导入使用新的不可变版本名。

如果只是验证完整后端链路，可把仓库现有 120 条（115 条可绘制）样例写入 PostGIS：

```bash
npm run sample:seed -- --version sample-115
```

重复生成同名样例时同样需要显式加 `--replace`。

## 4. 生成 PMTiles

先从聚合表流式导出 NDJSON：

```bash
npm run map:export -- --version dwca-2026-08-27 --output artifacts/gbif-map.ndjson
```

再生成 PMTiles：

```bash
npm run map:build -- \
  --input artifacts/gbif-map.ndjson \
  --output artifacts/gbif-map.pmtiles
```

`map:build` 调用本机的 `tippecanoe` 和 `pmtiles`，不要求数据库连接，并在替换正式输出前校验 PMTiles v3 文件头。如果本机没有工具，可构建锁定 Tippecanoe `2.79.0` 和 go-pmtiles `v1.30.0` 的工具镜像：

```bash
npm run map:tools:build
npm run map:build:docker -- --input artifacts/gbif-map.ndjson --output artifacts/gbif-map.pmtiles
```

导出的 0–12 级聚合点和 13–14 级 r8 物种网格均使用规范 H3 中心，15–18 级使用原始 occurrence 经纬度。每个特征包含 dataset version 和不可重复 revision；前端会同时核对两者，防止同名版本重建后加载旧 PMTiles。瓦片构建明确关闭 feature/tile size 丢弃限制，保证不静默删点；真实百万级数据需检查热点瓦片大小。

生成后把 `.pmtiles` 上传到支持：

- HTTP `Range` 请求；
- 浏览器来源的 `GET`、`HEAD` 和 CORS；
- 正确的 `Content-Type: application/vnd.pmtiles`；
- 不可变文件长缓存。

ImageKit 可以保存媒体资产，但 PMTiles 是否能稳定获得 Range/CORS 行为取决于具体交付配置。生产上更推荐 R2/S3 类对象存储承载 PMTiles。

填写 `OBJECT_STORAGE_*` 后可显式执行分片上传（此命令不会被普通 build 自动调用）：

```bash
npm run map:upload -- \
  --input artifacts/gbif-map.pmtiles \
  --key maps/gbif-dwca-2026-08-27.pmtiles
```

任务完成后会用远端对象元数据校验文件长度；如果配置了公开域名，还会请求前 127 字节并核对 `206 Content-Range`、PMTiles magic 和 v3 版本。上传命令不提供默认 `--key`；对象名必须以 `.pmtiles` 结尾并带数据版本或 revision，以便安全使用 immutable 长缓存。也可以单独验证已有地址：

```bash
npm run map:verify -- \
  --url https://cdn.example.com/maps/gbif-v1.pmtiles \
  --origin https://your-frontend.example.com
```

## 5. 可选：同步媒体到 ImageKit

填写后端 `.env`：

```dotenv
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_account
IMAGEKIT_PRIVATE_KEY=private_xxx
IMAGEKIT_FOLDER=/gbif-photo-globe
IMAGEKIT_SYNC_MEDIA_TYPES=image,video
IMAGEKIT_SYNC_CONCURRENCY=3
```

执行一小批验证：

```bash
npm run media:sync -- --limit 20
```

确认 ImageKit 中的文件和前端播放正常后，再提高 limit。`--limit` 是本次实际领取的已启用媒体数，不是未过滤扫描行数。任务使用 `gbifId-mediaId` 稳定文件名；数据库原子领取任务并持久化尝试次数、错误和下次重试时间。失败记录指数退避，处理中断超过 30 分钟可重新领取；未启用类型不会阻塞队列。重复上传覆盖同路径文件，不产生随机副本。

修复源地址或配置后，如需重新处理已达到最大次数的失败项，可显式执行：

```bash
npm run media:sync -- --reset-failed --limit 20
```

默认只同步图片和视频。音频可以继续使用 DWCA 原始 CDN；如确认 ImageKit 账户允许所需非图片媒体并能返回正确 MIME/Range 响应，可配置 `image,video,audio`。

## 6. 启动 API

以下命令在 `backend` 目录中执行：

```bash
npm run dev
```

验证：

```bash
curl http://localhost:3100/api/health
curl http://localhost:3100/api/v1/meta
```

生产构建：

```bash
npm run typecheck
npm test
npm run build
npm start
```

## 7. 配置前端

`frontend/.env`：

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://localhost:3100
VITE_PMTILES_URL=http://localhost:8080/gbif-map.pmtiles
VITE_PMTILES_SOURCE_LAYER=gbif_occurrences
VITE_MAPBOX_ACCESS_TOKEN=
VITE_PUBLIC_SITE_URL=
```

如果 `VITE_PMTILES_URL` 为空，前端会从 `/api/v1/meta` 获取 `PMTILES_URL`。本地开发时也可以用任意支持 Range 的静态服务器提供 `artifacts/gbif-map.pmtiles`。
只有在需要生成可公开抓取的社交预览元数据时才填写 `VITE_PUBLIC_SITE_URL`；未配置时不会写入旧的或猜测的部署地址。

以下命令从仓库根目录进入 `frontend` 包后执行：

```bash
cd frontend
npm install
npm run dev
```

也可以在仓库根目录使用 `npm run dev`，根脚本会自动用 Node.js 22 启动 `frontend`。

切回小样例：

```dotenv
VITE_DATA_MODE=sample
```

## 8. 验证清单

- `npm run build`：根脚本调用 `frontend`，前端 sample 模式构建成功。
- API 模式环境变量下前端构建成功。
- 在 `backend` 目录执行 `npm run typecheck`、`npm test`、`npm run build`，全部通过。
- `/api/health` 返回数据库 available。
- `/api/v1/meta` 的数据版本和 PMTiles URL 正确。
- 在 r2 到 r8 的缩放边界检查父网格拆分，并在 15 级以上核对原始经纬度。
- 单条点悬停/点击直接显示卡片；多条点显示列表并能加载下一页。
- 多图灯箱、音频、视频均能打开或播放，来源和授权信息仍保留。
- PMTiles 请求返回 `206 Partial Content` 或服务端正确处理 Range。
- API 不可达或 PMTiles 配置缺失时，前端显示中英文错误与重试入口。
- `npm run test:all`：根脚本分别运行 `frontend` 和 `backend` 测试；有 `TEST_DATABASE_URL` 时迁移集成测试自动启用。

## 9. 部署边界

前端、API、PostgreSQL、PMTiles/CDN 是四个可独立部署单元。构建本项目不会自动部署任何单元。推荐的生产拓扑是：

- 前端：静态站点；
- API：Node.js 20 容器；
- 数据库：托管 PostgreSQL/PostGIS；
- PMTiles：R2/S3 + CDN；
- 图片/视频：ImageKit，音频按账户能力使用 ImageKit 或原对象存储。

`frontend/.openai/hosting.json`/Sites Worker 只覆盖静态前端和小样例音频代理，不会承载 Node/PostGIS。执行前端 build 不等于部署；只有明确运行部署或 `map:upload` 命令才会改变远端状态。

上线前先在新 dataset version 和新 PMTiles URL 上验证，再切换配置，不直接覆盖正在使用的版本文件。
