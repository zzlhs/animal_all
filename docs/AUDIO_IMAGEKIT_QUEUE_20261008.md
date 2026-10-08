# 持久化音频队列与 ImageKit 存储

## 实现范围

本次实现 PostgreSQL 持久化音频任务，下载完成后上传 ImageKit，网页使用返回的公开音频 URL 播放。音频在 Worker 内存中临时接收，完成或失败后释放；不写入服务器音频文件缓存。

只创建两类任务：

| 优先级 | 触发操作 | 行为 |
|---|---|---|
| 100 | 点击录音播放、主动启动声景 | 创建任务或提升已有任务优先级 |
| 50 | 打开带录音的观测详情 | 提前下载并上传对应录音 |

地图标记加载、批量观测查询、打开声景选项列表不会批量预热音频。没有新增视野预取、热门区域扫描或全库下载。

## 数据与调度

数据库迁移 `009_audio_download_jobs.sql` 增加 `audio_download_jobs`。同一个原始音频 URL 的 SHA-256 对应一个任务，多条观测引用同一录音时共享上传结果。任务记录优先级、阶段、接收字节、总字节、重试次数、错误代码、下次尝试时间、ImageKit URL/fileId 和完成文件大小。

领取任务通过 PostgreSQL 事务、advisory lock 和 `FOR UPDATE SKIP LOCKED` 完成。全局最多两个任务同时处理，详情任务最多占一个位置。用户点击播放会提升正在等待或处理的同源任务，复用已有任务。已开始的下载会继续执行；预留的连接可领取主动播放任务。

任务持有 60 秒租约，每 10 秒续约并更新进度。进程退出后，租约到期的任务会被恢复领取。旧 Worker 的租约 token 无法覆盖新 Worker 的结果。可重试失败自动尝试最多三次，初始退避五秒；明确的源文件不存在、格式不支持、超出大小上限等失败停止自动重试。页面重试会重置失败任务并重新排队。

上传文件名使用来源哈希，关闭随机文件名，重试使用相同路径。成功后记录 ImageKit 返回值，并更新引用同一来源的媒体行 `imagekit_url`、`imagekit_file_id` 和同步状态。上传过程不直接把来源 URL 交给 ImageKit：Worker 先完整接收文件，再发送文件字节，便于控制源站超时。

原有 `media:sync` 保留图片/视频同步；音频由新队列处理，避免两个系统同时领取音频。

## 超时与大小

| 配置 | 默认值 | 含义 |
|---|---|---|
| `AUDIO_FIRST_RESPONSE_TIMEOUT_MS` | 20000 | 等待源站响应头 |
| `AUDIO_IDLE_TIMEOUT_MS` | 30000 | 读取过程中持续没有新的字节 |
| `AUDIO_TOTAL_TIMEOUT_MS` | 600000 | 一次来源下载的总时限，含重定向 |
| 上传时限 | 120000 | 单次 ImageKit 上传 |
| `AUDIO_MAX_BYTES` | 20971520 | 单条音频最多 20 MiB，按实际账户限制调整 |

持续收到数据的下载不会被首次响应时限中断。长度不符、空文件、意外的部分响应不会标记为完整上传。超时失败可以重试，但没有实现断点续传。

ImageKit 的账户上传与分发限制需以实际套餐为准：[官方上传说明](https://imagekit.io/docs/api-reference/upload-file/upload-file-v1)、[分发限制](https://imagekit.io/docs/transformations)。默认上限用于限制内存和单文件上传大小。

## 配置与启动

启动脚本读取项目根目录 `.env` 和 `.env.local`。至少配置：

```dotenv
IMAGEKIT_PUBLIC_KEY=填写现有公钥
IMAGEKIT_PRIVATE_KEY=填写现有私钥
IMAGEKIT_UPLOAD_ENDPOINT=https://upload.imagekit.io/api/v1/files/upload
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/你的账户
IMAGEKIT_FOLDER=/gbif-photo-globe
AUDIO_WORKER_EMBEDDED=true
```

私钥仅由服务端使用，不进入浏览器。

上传 API 地址与账户文件访问地址是两个配置。当前 SDK 的上传地址固定为上面的官方 API；`IMAGEKIT_URL_ENDPOINT` 是账户的文件分发地址。本地配置已写入被 Git 忽略的 `.env.local`，文件权限为 `0600`，通过真实上传确认账户分发地址为 `https://ik.imagekit.io/jhz79pomy5`。

```sh
npm run db:migrate
npm run dev:web
```

默认嵌入 Worker 在网页音频接口或地图元数据接口使用时启动。生产 `npm run start` 会在启动时恢复队列。

独立 Worker 适合持续后台运行：把网页环境的 `AUDIO_WORKER_EMBEDDED` 设为 `false`，然后分别启动网页和 Worker：

```sh
npm run audio:worker
```

Docker 可通过 `audio-worker` profile 启动独立服务。网页和 Worker 应使用相同数据库及 ImageKit 配置，网页设 `AUDIO_WORKER_EMBEDDED=false`。

没有配置 ImageKit 时，任务仍保存为等待状态，网页显示配置缺失提示。补齐配置并重启服务即可处理。已有的 ImageKit 音频仍可以播放。

默认允许 xeno-canto、observation.org 和导入数据使用的两个 iNaturalist 音频域名。`AUDIO_PROXY_ALLOWED_HOSTS` 如有设置，会覆盖默认允许列表。

## 网页交互

播放器区分准备中、缓冲中、播放中、暂停、失败和播放结束，依据音频事件更新。准备失败时清空旧音频，浮动播放器和详情按钮均支持重新请求队列。浏览器阻止播放时，重试会直接在用户点击时调用已有音频的播放方法。

声景在首次播放成功后才启动倒计时。首次 CDN 缓冲时不会把尚未设置的截止时间误判为已经结束；播放期间再次缓冲时仍按既定截止时间计时。

首次下载并上传尚未完成时会等待；详情提前准备后，点击播放可以直接获取 ImageKit URL。浏览器按媒体加载机制读取该 URL，无需先下载整个文件并写入 IndexedDB。

超时、文件不存在、源站拒绝访问、请求限流、不支持的格式、ImageKit 验证/上传失败和浏览器播放限制分别显示提示。

音频预热页面为 `/audio-prewarm`，声景面板提供入口。页面每两秒读取进度，展示任务总数、各阶段数量、已完成数、失败原因、重试按钮和 ImageKit 存储容量。列表显示最近 100 个任务，统计覆盖所有任务。容量是本队列完成上传的原始音频字节数，不代表 ImageKit 账户整体用量、其他资产或历史版本占用。

关闭播放或离开详情会停止浏览器等待，已经持久化的任务会继续执行。

## 验证

- 默认测试覆盖三个超时、完整文件验证、上传字节和返回结果、前端任务请求、播放器状态、失败重试、浏览器播放限制及声景互斥。
- `npm run test:audio-queue` 自动创建独立的临时 PostGIS 数据库，验证迁移、去重、优先级提升、跨 Worker 并发、进程中断恢复、过期结果隔离和共享 URL，完成后删除测试数据库。
- 当前真实数据库已应用音频队列迁移。
- 截图中的 GBIF 5995331953 录音在新下载链路中完整接收 180327 字节，耗时约 5.74 秒，期间只使用内存。源站速度会变化。
- 补齐 ImageKit 配置并重启后，当前队列的 5 个真实音频任务全部上传成功，总原文件大小为 1267707 字节（约 1.21 MiB），失败任务为 0。此统计仅覆盖已经触发的任务，不代表全库音频已下载。
- 截图中的 GBIF 5995331953 录音已上传至 ImageKit；观测接口返回云端 URL，CDN 范围请求返回 `206`、`audio/mpeg` 和正确的 `Content-Range`。另一个 iNaturalist 音频也通过范围响应检查。
- 浏览器声景播放真实 ImageKit 音频，播放时间及倒计时持续推进，暂停与恢复状态正确，浏览器没有新增错误。验收中发现并修复了首次缓冲导致声景提前结束的问题，增加了对应回归测试。

最终检查：116 项默认自动化测试通过；14 项数据库集成测试在独立测试库中通过；网页构建、Worker 类型检查、生产 HTTP smoke 检查通过。当前服务为 `http://127.0.0.1:4319/`。此前也已验证配置缺失时的失败提示与浮动重试。

验收记录：

- [结构化结果](acceptance/2026-10-08/audio-imagekit-queue.json)
- [配置完成后的预热页面截图](acceptance/2026-10-08/audio-imagekit-configured.jpg)
- [ImageKit 实际播放截图](acceptance/2026-10-08/audio-imagekit-playing.jpg)
- [播放器失败状态截图](acceptance/2026-10-08/audio-player-failure.jpg)
