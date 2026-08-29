# GBIF Photo Globe API

独立的 Node.js 20 后端，负责 DWCA 导入、PostGIS 查询、H3 聚合、PMTiles 数据构建和可选的 ImageKit 媒体同步。

## 运行要求

- Node.js 20.x；`.nvmrc`、`.node-version` 和 `package.json#engines` 已锁定主版本。
- PostgreSQL 16 + PostGIS，或直接使用 `compose.yml`。
- 构建 PMTiles 时可使用本机 `tippecanoe`/`pmtiles`，也可使用项目锁定版本的 `Dockerfile.tiles`。

## 本地启动

```bash
cp .env.example .env
npm install
docker compose up -d database
npm run db:migrate
npm run dev
```

健康检查：`GET http://localhost:3100/api/health`。

也可以让 Compose 同时运行数据库和 API：

```bash
docker compose up --build
```

API 容器会先执行数据库迁移，再启动服务。DWCA 导入和 PMTiles 构建属于离线任务，不会在 API 启动时自动执行。

## 数据任务

```bash
npm run dwca:import -- --archive /absolute/path/dwca.zip --version dwca-2026-08-27
npm run sample:seed -- --version sample-115
npm run db:aggregate -- --version=dwca-2026-08-27
npm run dataset:prune-retired -- --older-than-days=30 --limit=5 --confirm
npm run map:export -- --version dwca-2026-08-27
npm run map:build
npm run map:tools:build
npm run map:build:docker
npm run map:upload -- --input artifacts/gbif-map.pmtiles --key maps/gbif-v1.pmtiles
npm run media:sync -- --limit 500
```

如需覆盖同名数据版本，显式添加 `--replace`。新数据会先以内部暂存版本完整导入并聚合，成功后再单事务切换；共享物种分类也只在这个切换事务中发布，因此失败不会删除或提前改变旧版本。被替换的数据会标记为 `retired`，以保护切换时正在处理的请求。确认不再需要后，可使用带 `--confirm` 的 `dataset:prune-retired` 分批清理。生产环境仍推荐使用不可变的新版本名，而不是重复覆盖。

DWCA 导入优先读取 `meta.xml`，因此 core/extension 文件名、分隔符、编码和列顺序不必固定；一个 section 的多个 `<location>` 会依次流式读取，嵌套 `meta.xml` 的相对路径也会正确解析。没有 multimedia extension 的归档也可以导入；ZIP 内同名候选有歧义时会明确失败，不会静默读错文件。ImageKit 同步使用数据库队列，`--limit` 表示本次实际领取的受支持媒体数，失败记录会按配置退避重试。

`map:build`、`map:verify` 和 `map:upload` 不要求数据库连接。构建和上传前都会校验本地 PMTiles v3 文件头；普通构建不会上传任何文件。
`map:upload` 不提供默认远端对象名，必须显式传入带数据版本或 revision 的 `--key ...pmtiles`，避免覆盖带 `immutable` 长缓存的旧文件。

具体配置和端到端流程见 [`../docs/DEVELOPMENT.md`](../docs/DEVELOPMENT.md)。
