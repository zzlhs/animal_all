# GBIF Photo Globe

一个面向 GBIF/DWCA 数据的三维地球仪 monorepo。前端与后端是两个并列、可独立安装和运行的包：

```text
gbif-globe-demo-chronoframe-exact/
├── frontend/     Vue/Vite 地球仪与 Sites Worker，Node.js 22.13.1
├── backend/      Node/Fastify API、DWCA 管道与 PostGIS，Node.js 20.x
├── docs/         开发手册与技术设计
└── scripts/      工作区级运行器
```

## 快速启动

根目录 `.nvmrc` 是工作区工具链的 Node.js 22.13.1；`backend/` 内部有自己的 Node.js 20 版本文件。

```bash
npm run install:all
npm run dev
```

前端默认使用仓库中的 120 条样例记录，其中 115 条有坐标，打开 `http://localhost:5173` 即可查看。

也可以直接进入包目录操作：

```bash
cd frontend
npm install
npm run dev
```

## 启动可扩展模式

先启动后端数据库和 API：

```bash
cd backend
cp .env.example .env
docker compose up -d database
npm run db:migrate
npm run dev
```

再在 `frontend/.env` 中配置：

```dotenv
VITE_DATA_MODE=api
VITE_API_BASE_URL=http://localhost:3100
VITE_PMTILES_URL=http://localhost:8080/gbif-map.pmtiles
VITE_PMTILES_SOURCE_LAYER=gbif_occurrences
```

前端 API 模式通过 PMTiles/WebGL 显示十万至百万级数据，悬停或点击时才从后端分页查询完整记录和媒体。

## 工作区命令

```bash
npm run dev          # 用 Node 22 启动 frontend
npm run dev:api      # 用 Node 20 启动 backend API
npm run build        # 构建 frontend
npm run build:api    # 用 Node 20 构建 backend
npm run build:all    # 构建前端和后端
npm test             # 前端测试
npm run test:api     # 后端测试
npm run test:all     # 前后端测试
```

前端包的独立说明见 [`frontend/README.md`](./frontend/README.md)，后端数据管道见 [`backend/README.md`](./backend/README.md)。

完整流程和架构见 [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) 与 [`docs/TECHNICAL_DESIGN.md`](./docs/TECHNICAL_DESIGN.md)。

本项目的前端 Sites 配置位于 [`frontend/.openai/hosting.json`](./frontend/.openai/hosting.json)。构建只生成本地文件，不会自动发布网站，也不会上传数据库、媒体或 PMTiles。
