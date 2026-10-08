# 地球仪加载优化与验收

日期：2026-10-08。应用：TanStack Start / React / PostgreSQL / MapLibre / PMTiles。

本次完成缩略图、标记密度、渐进加载、底图缓存和生产测量这五项改进。当前活动数据仍是用户提供 ZIP 导入的 572,391 条动物观测，其中 566,878 条可以定位。首屏只读取当前瓦片和少量代表记录，详情通过点击和分页读取。

## 1. 改动与实际行为

| 改进 | 当前实现 | 主要代码 |
| --- | --- | --- |
| 图片按尺寸加载 | 地图与列表使用最多 128 px 的 WebP；详情首图使用最多 640 px 的预览；打开大图时才读取原图 | `packages/media/src/imageVariants.ts`、`apps/web/src/server/images.server.ts` |
| 控制标记密度 | 按缩放、投影后的屏幕距离和数量选择标记，优先保留选中及播放位置 | `apps/web/src/features/globe/markerLayout.ts` |
| 渐进加载 | GBIF 瓦片可用后先显示数字／声音标记；代表记录分批到达后补充照片；底图与地形随后加载 | `MapCanvas.tsx`、`useMarkerRecords.ts` |
| 底图传输与缓存 | 打包样式和 TileJSON 信息，底图资源通过同源接口缓存；全球视图使用更少的地形瓦片；支持单独设置底图 CDN 域名 | `basemap.ts`、`basemap.server.ts` |
| 生产验证 | 生产静态资源预生成 Brotli / gzip，提供真实浏览器加载测量和桌面／手机交互检查 | `server.mjs`、`apps/web/scripts/performance.mjs`、`interaction.mjs` |

同时修复手机宽度下详情弹窗越界。卡片随着实际选中坐标移动，水平方向保留边距，箭头继续指向选中位置。失效图片显示占位图标，避免出现浏览器破图。

## 2. 缩略图与媒体存储

媒体 ID 是 PostgreSQL `media.id`，与 GBIF 观测 ID 不同。接口为：

```text
GET /api/media/<media-id>/pin?v=v1
GET /api/media/<media-id>/preview?v=v1
```

- `pin`：最多 128 × 128 px，居中裁剪，适合地图和列表。
- `preview`：宽度最多 640 px，保持比例，适合详情卡片。
- 两种尺寸均为 WebP，质量 78；小图不强行放大。
- iNaturalist 图片优先读取源站 `small` 或 `medium` 版本；其他来源由服务器下载、缩放。小尺寸源不可用时可在服务器尝试原始来源，浏览器仍只收到缩略图。
- 同一个源地址、尺寸和版本共用缓存。相同请求只生成一次，最多同时处理 4 张图片。
- 输入下载限制为 20 MiB、解码限制为 4,000 万像素；每次源站请求最多 12 秒。

PG 保存观测记录、媒体地址、许可和元数据。生成的 WebP 存在磁盘缓存中；ZIP 中的媒体地址仍指向外部源站，未把所有原始照片写入 PG。

不需要配置 ImageKit 即可生成本地缩略图。已有 ImageKit 地址仍可作为来源使用。

### 预热缩略图

预热当前活动发布中的一批图片：

```bash
npm run media:thumbnails -- --limit=500
```

命令输出成功／失败数量和 `lastMediaId`，可按输出继续下一批：

```bash
npm run media:thumbnails -- --limit=500 --after=<lastMediaId>
```

每批支持 1–10,000 条，任务并发为 4。预热适合在发布后分批执行；未预热的图片会按需生成。本次实际执行 3 条预热，结果为 3 成功、0 失败；未执行全部 745,692 张图片的下载或预热。

## 3. 可见标记与代表记录

| 缩放范围 | 标记上限 | 照片标记上限 |
| --- | ---: | ---: |
| zoom < 3.5 | 32 | 12 |
| 3.5 ≤ zoom < 7 | 64 | 24 |
| zoom ≥ 7 | 84 | 40 |

普通标记中心距离至少 62 px，并避开地图按钮和浮动播放器占用的区域，给控件保留 32 px 的标记空间。聚合数量较大的标记优先保留，选中或播放位置具有更高优先级。缩放或移动地图会重新选择可见标记；页面展示数量受限，数据库数量、聚合计数和详情分页保留完整数据。

代表记录每批最多 24 条，当前标记预算下最多需要 4 批请求。每批独立显示结果，慢请求不会挡住已经返回的照片。离开视野后，未完成的代表记录请求通过 `AbortSignal` 取消；相同 revision 下已经读取的记录可复用。

代表记录缓存有效期为 5 分钟，控制在 40 批查询和约 960 条记录以内。MapLibre 每个源的瓦片缓存上限为 128；缩放时取消部分未完成的旧瓦片请求。

## 4. 加载顺序与底图

1. 加载背景、地球投影和 GBIF PMTiles 源。
2. GBIF 源数据到达后，在约 100 ms 的节流周期内选出屏幕标记，立即显示数字／声音占位。
3. 分批读取代表记录，补充有预算的照片标记。
4. 首批标记出现约 400 ms 后安装底图的边界、地点标签等图层。
5. 底图安装后约 1,500 ms 开启地形；若 GBIF 源未能及时返回，5 秒后启动底图兜底加载。

标记同步由 GBIF `sourcedata`、渲染和移动事件驱动，不再等待整幅地图触发 `idle`。全球视图用 512 px 的地形 source 配置减少请求，区域视图保留原始地形配置。

底图样式与瓦片 URL 快照随构建打包，省去启动时串行获取远端 style、TileJSON 的请求。保留 OpenFreeMap / OpenMapTiles / OpenStreetMap 相关署名。底图资源接口只处理固定来源和允许的瓦片、字体、图标与地形路径。

更新快照：

```bash
npm run basemap:update
npm run build
```

本次更新命令已实测，样式包含 111 个图层，瓦片版本为 `20261004_113936_pt`。部署前及定期维护时更新快照，再构建部署，以保持瓦片版本有效。

### 磁盘与浏览器缓存

默认目录：项目根目录 `data/cache`。也可以设置：

```dotenv
RESOURCE_CACHE_DIR=/absolute/path/gbif-cache
```

| 缓存 | 磁盘预算 | 磁盘有效期 | 源站请求并发 |
| --- | ---: | ---: | ---: |
| 图片 `images/` | 512 MiB | 30 天 | 4 |
| 底图 `basemap/` | 1 GiB | 7 天 | 8 |

每个缓存目录最多 20,000 个条目，周期性清理过期或较少使用的资源。缓存由哈希键索引，写入使用临时文件与重命名；进程重启后仍可命中。失败来源有 30 秒重试冷却，队列上限为 128。

图片响应支持 ETag 和一天浏览器缓存；版本化底图瓦片／sprite 支持一年不可变缓存，字体和地形缓存为一周。protobuf 与 JSON 底图资源支持 gzip。生产 JS／CSS 等资源预生成 Brotli 和 gzip，哈希资产支持不可变缓存、ETag、HEAD 和原始字节 Range。

容器已挂载 `data/cache`。多实例部署应明确各实例的缓存目录、磁盘预算和 CDN 回源策略。

### 可选底图 CDN

```dotenv
VITE_BASEMAP_ASSET_ORIGIN=https://your-basemap-cdn.example
```

该域名需要提供相同 `/api/basemap/...` 路径、正确内容类型、压缩头和 CORS。配置修改后需要重新构建。当前本地验收使用同源接口；生产 CDN 尚未配置或实测。

PMTiles 保留 Range 读取。元数据接口将本地 localhost / 127.0.0.1 发布地址转换为同源路径，切换开发和生产端口后可继续使用同一份地图文件。

## 5. 生产加载实测

环境：本机 Node.js 22.23.2、真实 Chrome 无头浏览器、1280 × 720 视口、本地 PostgreSQL 与生产 HTTP 服务。使用当前 572,391 条动物观测及约 243 MiB PMTiles 文件，没有模拟限速。

冷加载使用新建的空服务器资源缓存目录与空浏览器缓存；热加载在同一浏览器上下文再次打开页面。每次采样 30 秒，然后点击一个可见标记测量详情出现时间。

| 指标 | 冷加载 | 热加载 |
| --- | ---: | ---: |
| 首个 DOM 标记出现 | 0.61 秒 | 0.25 秒 |
| 首张地图照片加载 | 1.92 秒 | 0.28 秒 |
| 首屏 DOM 标记数量 | 7 | 7 |
| 点击到详情出现 | 117 ms | 113 ms |
| 采样的页面传输量 | 1.94 MiB | 0.04 MiB |
| 浏览器脚本错误／页面地图告警 | 0／0 | 0／0 |

首屏 5 个不同图片资源成功加载，实际尺寸均为 128 px；没有请求地图原图。JS／CSS 等构建资产总量约 1.91 MiB，预压缩 Brotli 总量约 0.48 MiB。

优化前的同尺寸采样中，30 秒内没有出现照片 DOM 标记，地图已显示 WebGL 数字标记；首屏有密集遮挡，底图请求仍占用加载时间。此次对比的首屏资源量由脚本采样，部分 MapLibre worker 请求可能未包含在页面 CDP 统计中，不能作为完整网络流量账单。

这些时间是当前本机样本。首个标记和首张照片出现时间与整幅底图全部完成加载时间不同；结果不代表受限网络、真实手机或生产 CDN 的统一时间保证。

证据：

- [优化前测量](acceptance/2026-10-07/loading-before.json)
- [优化后最终测量](acceptance/2026-10-08/loading-after-final.json)
- [冷加载首屏](acceptance/2026-10-08/loading-after-final-cold.png)
- [冷加载点击详情](acceptance/2026-10-08/loading-after-final-cold-detail.png)
- [桌面／手机交互报告](acceptance/2026-10-08/interaction.json)

交互复测中，桌面首屏为 7 个标记，音频筛选并放大后为 30 个；手机视口首屏为 9 个，音频筛选并放大后为 13 个。两种视口均通过标记间距、按钮避让、卡片边界、拖动后定位和主题切换检查。

- [手机声音详情与选中位置](acceptance/2026-10-08/interaction-390-audio.png)
- [桌面浅色主题](acceptance/2026-10-08/interaction-1280-light.png)

## 6. 启动与复现

根目录 npm 命令会读取 `.env` 与 `.env.local`；终端显式环境变量优先。

```bash
npm run build
PUBLIC_APP_URL=http://127.0.0.1:4319 HOST=127.0.0.1 PORT=4319 npm run start
```

另一个终端执行：

```bash
npm run performance:web -- --url=http://127.0.0.1:4319 --output=docs/acceptance/loading-retest.json --verify=true
node apps/web/scripts/interaction.mjs http://127.0.0.1:4319 docs/acceptance/interaction-retest.json
npm test
npm run smoke:web
```

浏览器脚本默认使用本机 Chrome；性能脚本也支持 `CHROME_PATH` 指定可执行文件。未指定 `RESOURCE_CACHE_DIR` 时，性能脚本的 `cold` 只表示新浏览器上下文；测量服务器冷缓存时，应先给生产服务设置一个新的空缓存目录。

开发时仍可使用：

```bash
PUBLIC_APP_URL=http://127.0.0.1:4319 npm run dev:web -- --host 127.0.0.1 --port 4319
```

开发模式用于修改代码；验收加载时间使用生产构建。

## 7. 验证范围与待完成项

- `npm run build`：通过，包括 Web TypeScript 检查与静态资源压缩。
- Worker TypeScript 检查：通过。
- `npm test`：94 项通过、9 项 PostgreSQL 专用集成测试跳过；本次没有提供独立的 `TEST_DATABASE_URL`。
- `npm run smoke:web`：SSR、Brotli、不可变缓存、ETag、Range 和输入校验通过。
- 真实页面性能验证：冷／热加载均无脚本错误或地图告警，地图图片不超过 128 px。
- 交互检查覆盖桌面 1280 × 720 和手机视口 390 × 844：标记密度、详情边界、选中位置、主题切换和声音详情；手机视口模拟不能代替真实设备测试。

部分外部图片来源仍不可用，例如本次聚合列表中的 `moth.tbn.org.tw`。缓存只能加速可读取的资源；失效来源由占位图显示，后续可通过媒体镜像或来源修复解决。

本次声音检查验证音频标记、详情和播放按钮展示，没有新增全量声音播放验收。既有 [真实数据报告](GBIF_REAL_DATA_ACCEPTANCE_20261006.md) 中的物种键、音频源、空坐标及并发查询等未通过项需要按各自原因继续修复。

尚未完成 1,000,000 条完整数据验收、真实手机帧率、受限网络测量、20 分钟浏览器内存和生产 CDN 验证。

当前供用户查看的 4319 预览已切换到上述生产构建，使用根目录 `data/cache`。健康、就绪、活动发布和缩略图接口已检查通过；临时的 4318 验收服务已关闭。
