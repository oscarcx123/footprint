# 旅行足迹

用 Leaflet + OSM 在 GitHub Pages 上展示旅行足迹

## 灵感来源

前阵子刷到了例如中国制霸（省级行政区），日本経県値（都道府県）等记录足迹的地图。但两者都是基于各国的一级行政区，个人总感觉颗粒度不够细。中国地级市的制霸地图其实已经有成熟的产品，主流几个地图app都提供地级市甚至街道层级的足迹功能。相比之下，基于日本二级行政区（市区町村）的足迹地图几乎不存在。更不用说同时支持多个国家地区的足迹地图。

## 支持地区

目前只支持日本的`市区町村`层级，未来计划支持中国的地级市层级

## 快速开始

1. 安装依赖（仅用于本地工具）：

```bash
npm install
```

2. 构建（生成 `dist/`）：

```bash
npm run build
```

3. 本地预览 `dist/`：

```bash
npm run start
# 打开 http://localhost:8080
```

项目在 `dist/` 中以静态文件方式提供 `data/visits.json`（构建时会把 `data/visits.json` 复制到 `dist/data/visits.json`）。请注意：`visits.json` 是公开可读的静态文件，适合用于公开的旅行记录展示。

## 编辑与保存

启动本地编辑器服务器：

```bash
npm run editor
# 或 node scripts/editor_server.js
```

打开编辑器： `http://127.0.0.1:3000/editor.html`

点击地图区块，编辑 **Dates / Note**，点击 **保存**。若将 `Dates` 与 `Note` 都清空则会删除该条目

服务器会在写入前自动备份旧文件（最多保留 **3 个** 最近的备份）。

注意：`editor.html` **不会** 被打包到 `dist/`，因此不会被部署到 GitHub Pages（仅本地使用）。

## 数据格式示例

```json
{
  "13101": {
    "name": "東京23区",
    "dates": ["2010-01", "2011-05"],
    "note": "看演唱会"
  }
}
```

说明：
* `name`：仅用于可读性（显示在编辑器与 tooltip）并不会覆盖 GeoJSON 的官方名称
* `dates`：数组，记录多次访问；年份筛选会匹配 `YYYY` 前缀
* `note`：支持换行（`\n`），会在 tooltip 中换行显示

## 注意事项

GeoJSON 数据来源：
* [s0001/N03-21_210101_designated_city](https://github.com/smartnews-smri/japan-topography/blob/main/data/municipality/geojson/s0001/N03-21_210101_designated_city.json)

仓库中包含对 [Japan Topography GeoJSON](https://github.com/smartnews-smri/japan-topography) 的定制修改：
* 把东京23区合并为一个整体（mapshaper -dissolve）
* 移除特定争议岛屿的数据

这些修改仅用于提高个人足迹记录与可视化的便利性。本仓库不保证数据的完整性、精度或与上游项目的同步更新情况，也不对地图的正确性或现实适用性作出保证。

在公共展示、法律、行政、政策分析或其他敏感场景中使用前，请自行评估、核验并根据需要进行调整。

## 更新记录

### 2026.01.11 V1.0.1

替换日本 GeoJSON 为低精度版本，大幅减少体积

### 2026.01.10 V1.0.0

在 Copilot 的加持下，只用半天时间就从 0 完成开发、调试并上线