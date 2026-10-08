# 技术设计：十万至百万级 GBIF 地球仪

## 1. 目标

这一实现解决三个核心问题：

1. 不把十万或百万条记录一次性下载到浏览器，也不在浏览器逐点执行接近 `O(n²)` 的聚合。
2. 同一物种在不同地点的分布不能因“按名字去重”而丢失。
3. 点必须绑定真实经纬度并交给地图 WebGL 投影；旋转和缩放时不会像手工 DOM 坐标那样漂移。

样例与真实数据统一从 PostgreSQL 读取；原版 120 条样例记录保存在 `data/sample`，仅用于数据库初始化。前端入口统一为 TanStack Start。

## 2. 总体架构

```text
GBIF DWCA.zip
      │ 读取 meta.xml，流式读取 core / 可选 multimedia extension
      ▼
Node.js 22 离线导入任务 ── H3 r2…r8
      │
      ▼
PostgreSQL + PostGIS
      ├── occurrences / species / media：权威元数据
      ├── map_cells：低中缩放级别聚合
      └── species_cells：高缩放级别“物种 + 地理网格”聚合
      │                                  │
      │ API 按需分页查询                  │ NDJSON → Tippecanoe → PMTiles
      ▼                                  ▼
TanStack Start Server Routes                         对象存储/CDN
      │                                  │
      └──────────────┬───────────────────┘
                     ▼
          React + MapLibre WebGL
                     │
          ImageKit/原始 CDN 媒体 URL
```

PMTiles 是静态地图索引，适合放在支持 HTTP Range 请求和 CORS 的对象存储/CDN，例如 Cloudflare R2、S3 或兼容服务。ImageKit 主要负责图片/视频等媒体分发；它不替代 PostgreSQL，也不建议用作百万条结构化元数据的查询数据库。

## 3. 数据建模

### `datasets`

每次导入创建独立 version 和不可重复 revision。Web 按 `active_map_release` 指针读取已验证的地图发布，`ACTIVE_DATASET_VERSION` 只作为低级 Worker 命令的默认版本名。导入、聚合、瓦片构建和远端校验完成后，发布事务才切换活动指针；失败不会提前改变当前页面数据。已发布版本保持快照，旧 release 可以回滚。

### `species`

以 GBIF `speciesKey` 为主键保存当前分类信息。名称只作为展示字段，不作为唯一标识。为避免后导入的数据改变旧版本的分类展示，每条 occurrence 的 `raw_data` 同时保存导入时的分类快照；查询与筛选优先使用快照，旧数据才回退到 `species` 表。

### `occurrences`

每一条观测记录都保留，主键为 `dataset_id + gbif_id`。表中同时保存：

- 原始经纬度和 PostGIS `Point(4326)`；
- `h3_r2` 到 `h3_r8`；
- 时间、地点、分类和记录来源；
- 常用索引字段及少量原始扩展数据。

同一种动物出现在十个地点，会有十条 occurrence，不会被物种去重丢掉。
`dataset_id + decimal_latitude + decimal_longitude + gbif_id` 使用部分组合索引，为 15 级以上同一精确坐标的计数和游标分页提供索引路径。

### `media`

一条 occurrence 可以关联多张图片、音频和视频。`identifier` 是 DWCA 原始媒体 URL，`imagekit_url` 是可选的镜像 URL；API 优先返回 ImageKit URL，未同步时自动回退到原 URL。

### `map_cells` 与 `species_cells`

- `map_cells`：按 H3 网格聚合 occurrence 数、物种数、媒体数和年份范围，供低/中缩放级别使用。
- `species_cells`：按 `speciesKey + H3 网格` 聚合，供高缩放级别使用。

最终推荐 H3 基础分辨率为 8。一个物种在不同 H3 单元中会产生多个点，保留全球分布；同一单元中的大量重复观测在 13–14 级只生成一个地图特征，但点击后仍能分页查看全部原始记录。15 级起改为每条 occurrence 的原始经纬度，不再用约 10 km 边长的 r5 网格冒充精确点。

## 4. 地图渲染与交互

前端 `MapCanvas` 使用 MapLibre 原生 vector source 和 circle/symbol layer。经纬度进入矢量瓦片后由地图引擎统一完成球面投影，所以同一特征在旋转、倾斜和连续缩放时保持在地理位置上。

缩放级别与数据层级：

| 地图缩放 | H3 层级 | 展示内容 |
|---|---:|---|
| 0–2 | r2 | 全球粗聚合，点位是固定 H3 中心 |
| 3–4 | r3 | 洲际/大区域聚合 |
| 5–6 | r4 | 大区域聚合 |
| 7–8 | r5 | 区域聚合 |
| 9–10 | r6 | 城市级聚合 |
| 11–12 | r7 | 更细网格聚合 |
| 13–14 | r8 | 物种 + 细网格聚合，固定 H3 中心 |
| 15–18 | 原始坐标 | 每条 occurrence 的精确经纬度 |

跨越上述边界时，聚合层级变化会让一个父网格拆成多个子网格，这是数据钻取。每个聚合点使用 H3 的规范中心，不再由最小 GBIF ID 的偶然位置决定；15 级以上的单条点始终使用原始坐标。Tippecanoe 使用 `--no-feature-limit --no-tile-size-limit`，不会为了控制瓦片大小静默丢记录；代价是极密集区域可能产生较大的高缩放瓦片，需要在真实数据上监控。

交互规则：

- PMTiles 特征只包含轻量字段和代表记录 ID，不包含完整媒体数组。
- 鼠标停留 180 ms 后才发起查询，快速划过不会产生大量请求。
- 一个 occurrence 时直接加载详情卡片。
- 多个 occurrence 时打开列表；每页 20 条，使用游标分页，避免深分页的 `OFFSET` 开销。
- 点击列表项显示完整详情；多图支持缩略图、灯箱、键盘切换和打开原图，音频和视频可播放。
- 浏览器只缓存最近 250 个悬停结果，内存不会随数据集无限增长。

## 5. API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | Node 进程存活 |
| GET | `/api/v1/meta` | 当前数据版本、记录数、PMTiles 配置 |
| GET | `/api/v1/occurrences/:gbifId` | 一条 occurrence 及其媒体 |
| GET | `/api/v1/cells/:resolution/:cellId/occurrences` | 网格内 occurrence 游标分页，可带 `speciesKey` |
| GET | `/api/v1/cells/:resolution/:cellId/species` | 网格内物种代表记录分页 |
| GET | `/api/v1/coordinates/:lat/:lng/occurrences` | 高缩放同一精确坐标内的 occurrence 分页 |
| GET/HEAD | `/api/audio-proxy?url=…` | 仅代理允许域名且 MIME 确认为音频的响应，并保留 Range |

API 校验 H3 分辨率与 cell ID，限制最大分页大小。PMTiles 文件响应提供跨域和 Range 支持；Web 与业务 API 默认同源。数据库查询参数化，不拼接用户值；只有受控的 H3 列名来自常量映射。

## 6. 复杂度和容量

原来的浏览器聚合会随点数增加快速变慢。新方案把工作拆成：

- 导入：对每条 occurrence 计算七个 H3 cell，整体近似 `O(n)`；
- 聚合：PostgreSQL 按带索引的 H3 列分组，离线执行；媒体计数先物化到事务级临时表，所有 H3 层级复用一次扫描结果；
- 地图加载：只读取当前视口与缩放级别涉及的瓦片；
- 详情：只读取当前 cell 的一页记录。

低中缩放列表的总数直接读取 `map_cells` 中预计算的 occurrence/鸟类/昆虫/音频计数，物种网格优先读取 `species_cells`；只有精确坐标或组合筛选无法命中聚合值时才实时计数，避免每次悬停重复扫描高密度网格。

十万条数据通常单机 PostgreSQL 即可。到百万级时优先增加数据库内存、连接池和离线任务资源，并监控索引命中率与瓦片大小；前端模型不需要重写。数据规模继续增长时，可把导入/聚合任务放到独立 worker，但 API 协议保持不变。

## 7. 数据更新与缓存

建议每个 DWCA 快照使用不可变版本，例如 `dwca-2026-08-27`：

1. 导入新版本并生成聚合；
2. 生成带版本名的 PMTiles，例如 `gbif-dwca-2026-08-27.pmtiles`；
3. 上传并验证 Range/CORS；
4. 使用 release manifest 验证后在事务中切换 `active_map_release`；
5. 重启 API；
6. 需要回滚时使用 `release:rollback -- --release-id=<旧 release ID>`。

PMTiles 文件名带版本后可以使用长缓存；`/api/v1/meta` 和详情接口使用较短缓存或由反向代理按业务要求配置。
每个 PMTiles 特征还保存 dataset version 和 revision。前端在请求详情前与 `/api/v1/meta` 同时核对两项，因此同名版本被重建时也不会把旧瓦片坐标连接到新数据库记录。

## 8. 安全边界

- `IMAGEKIT_PRIVATE_KEY`、数据库密码只存在后端环境变量或密钥管理服务中。
- 前端只允许出现 Mapbox public token、API 地址和公开 PMTiles 地址。
- ImageKit 同步任务默认创建公开媒体 URL；如果要使用私有媒体，必须额外实现后端短时签名 URL，不能直接把私钥交给浏览器。
- DWCA 的许可、创作者、rights holder 和来源 URL 被保留，界面和导出仍需遵守原媒体授权。

## 9. 媒体与部署边界

ImageKit 同步不是一次性游标扫描，而是持久队列：任务以原子 SQL 领取，状态为 `pending/processing/failed/synced`，失败按指数退避，运行中断超过 30 分钟的任务可被重新领取。未启用的媒体类型在 SQL 中直接排除，因此不会阻塞后续记录。

PMTiles 使用 S3 兼容接口分片上传，上传后用 `HeadObject` 校验对象长度。公开地址必须支持 CORS、`HEAD` 和 HTTP Range。Cloudflare R2 的 S3 兼容端点可直接使用，但公开域名和 S3 API 端点不是同一个概念。

Web 使用 Node.js 22 的 Start HTTP 服务；PG 和离线 Worker 独立运行。部署配置位于 `infra`，Web 可挂载本地 PMTiles 目录，也可从已发布 CDN 地址读取。构建命令不会自动部署或上传对象。

## 10. 中英文数据边界

界面文本、日期、国家名和底图标签支持中英文切换。DWCA 中若有 `vernacularName`、`country`、`language` 会保留并由 API 返回；科学名始终保留原文。`locality/stateProvince` 属于数据提供者的自由文本，项目不会臆造机器翻译，因此源数据只有一种语言时，该字段仍显示源语言。若生产需求要求完整双语地名或物种俗名，应在离线导入阶段接入受控词表并保存译文，而不是在浏览器临时翻译。

## 11. TanStack Start 迁移状态

唯一 Web 入口位于 `apps/web`，共享查询与发布服务位于 `packages/`，数据任务位于 `apps/worker`；旧 Vue/Fastify 目录已删除。新应用已接入 PMTiles 图层、筛选和游标分页，服务端按已发布 revision 读取。

新增迁移 007、008 引入发布指针及记录级媒体字段；worker 聚合负责持续写入，008 对旧数据回填。发布 CLI 强制核验 manifest、本地与远端内容哈希、HTTP Range/CORS 和抽样瓦片 revision，完成后事务切换活动指针。

实现与测试边界、启动和发布命令见 [开发手册第 10 章](./DEVELOPMENT.md)。首屏为 SSR 页面壳；百万级容量、手机帧率、完整 SSR 数据预取和生产运维验收尚需独立验证，不能将目录拆分或构建成功视为全部架构目标已验收。


## 12. 照片标记与声景迁移

不超过 160 个可定位点的数据集由 PG 返回有界记录集合，使用原版邻近聚合和照片组件。大量记录仍通过 PMTiles 绘制；当前视野特征较少时批量读取代表记录生成图片/音频/数字标记，较密集时保留 WebGL 绘制。DOM 标记由 MapLibre 投影并隐藏球背面的标记。播放光波同时支持单条点和包含播放记录的聚合点。

音频使用统一 Start 代理和浏览器缓存。播放成功才更新播放状态；失败显示提示；切换来源取消等待中的请求。声景支持单段、2–4 段混音、音量、暂停恢复及倒计时循环，和观测录音互斥。

## 13. 自动导入脚本

`npm run data:setup -- --archive /absolute/path/gbif.zip --version unique-version` 完成迁移、流式解压入库、H3 聚合、PG 导出、Docker 瓦片构建、HTTP/哈希校验与发布。样例使用 `--sample`。启动与数据任务的根命令统一读取 `.env` 和 `.env.local`；本地瓦片服务支持 HEAD、Range、206/416。

实际运行步骤见 [数据库导入指南](./LOCAL_DATABASE_AND_GBIF_IMPORT.md)。已验证 120 条原版记录和小型 DWCA 包；十万/百万性能指标仍需真实数据验证。
