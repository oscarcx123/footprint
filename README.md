# 旅行足迹

用 Leaflet + OSM 在 GitHub Pages 上展示旅行足迹

## 灵感来源

前阵子刷到了例如中国制霸（省级行政区），日本経県値（都道府県）等记录足迹的地图。但两者都是基于各国的一级行政区，个人总感觉颗粒度不够细。中国地级市的制霸地图其实已经有成熟的产品，主流几个地图app都提供地级市甚至街道层级的足迹功能。相比之下，基于日本二级行政区（市区町村）的足迹地图几乎不存在。更不用说同时支持多个国家地区的足迹地图。

## 支持地区

目前支持日本的 `都道府県` 、 `市区町村` 与中国的 `地级市`（仓库中包含 `geojson/jp_municipalities.topojson` 与 `geojson/cn_municipalities.topojson`）。网站会在加载时检查 `geojson/manifest.json`（可选），若存在则按 manifest 中的条目自动填充国家/地区菜单，便于未来扩展其他国家。

如果你希望无缝支持新国家地区，请在 `geojson/` 下添加对应的 topojson 文件并在 `geojson/manifest.json` 中登记新条目（如下）：

```json
[
  {"id": "cn", "name": "中国", "file": "cn_municipalities.topojson"},
  {"id": "jp", "name": "日本", "file": "jp_municipalities.topojson"},
  {"id": "us", "name": "美国", "file": "us_states.topojson"}
]
```

注：manifest 是可选文件；如未提供，系统会尝试查找内置候选文件 `cn` 与 `jp`


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

## 参考规则

这里附上「経県値」的评分标准。说到底这只是参考值，自己想怎么记录就怎么记录。本人的标准是不计算「访问」以下的地区。日本的「道の駅」比较特殊，是本地自治体运营的公路驿站，本质是村镇延伸，对于微小自治体来说就是唯一像样的商业点，因此也算作「访问」。

| 分类 | 分值 | 简要说明                         |
|------|------|----------------------------------|
| 居住 | 5    | 实际居住过（3个月以上长期停留）  |
| 宿泊 | 4    | 住过一晚以上（不含夜晚路过）     |
| 访问 | 3    | 实地走过，但没住宿               |
| 接地 | 2    | 下车停留（换乘、高速服务区休息） |
| 通过 | 1    | 仅路过（不含飞机）               |
| 未踏 | 0    | 从未到达（连路过都没有）         |

## 数据格式示例

```json
{
  "13101": {
    "name": "東京23区",
    "dates": ["2010-01", "2011-05"],
    "note": "看演唱会"
  },
  "310101": {
    "name": "上海市",
    "dates": ["2012-03"],
    "note": "东方明珠"
  }
}
```

说明：
* `name`：仅用于可读性（显示在编辑器与 tooltip）并不会覆盖 GeoJSON 的官方名称
* `dates`：数组，记录多次访问；年份筛选会匹配 `YYYY` 前缀
* `note`：支持换行（`\n`），会在 tooltip 中换行显示

## 注意事项

GeoJSON / TopoJSON 数据来源：
* [topojson/s0010/designated_city](https://github.com/smartnews-smri/japan-topography/blob/main/data/municipality/topojson/s0010/N03-21_210101_designated_city.json)
* [GEOJSON 中国地图数据集 V1.6.3](https://geojson.cn/data/atlas/china)

仓库中包含对 [Japan Topography TopoJSON](https://github.com/smartnews-smri/japan-topography) 的定制修改：
* 把东京23区合并为一个整体（mapshaper -dissolve）
* 移除特定争议岛屿的数据
* 移除四个所属未定地
* 都道府県（mapshaper simplify = 20%）
* 市区町村（mapshaper simplify = 70%）

仓库中包含对 [GEOJSON 中国地图数据集 V1.6.3](https://geojson.cn/data/atlas/china) 的定制修改：
* 把直辖市和港澳地区分别从区级精度合并为市级（mapshaper -dissolve）
* 地级市（mapshaper simplify = 20%）

未经 mapshaper simplify 处理的 TopoJSON 文件存放在 topojson_source 文件夹下，如有需要可自取。

**这些修改仅用于优化加载性能，并提升足迹记录与可视化的便利性。本仓库不保证数据的完整性、精度或与上游项目的同步更新情况，也不对地图的正确性或现实适用性作出保证。**

**在公共展示、法律、行政、政策分析或其他敏感场景中使用前，请自行评估、核验并根据需要进行调整。**

## 更新记录

### 2026.02.23 V1.3.0

* 优化加载速度（Promise.all 并行加载）
* 优化 TopoJSON 体积（mapshaper simplify）
* 折叠四个或以上的 Visited 
    * Visited: 2006-10, 2007-01, 2007-06, 2016-08
    * 会显示成 Visited: 2006-10, (2 more), 2016-08
* 修复 Chrome 在打开控制台时，快速移动鼠标在地图上划过多个区域，它们会显示蓝色和tooltip，且鼠标移走后不会消失的问题
    * Chrome 不开启控制台时没有问题
    * Firefox 无论是否开启控制台都没有问题

### 2026.02.06 V1.2.1

优化左上角控制面板的显示效果

### 2026.01.12 V1.2.0

* 优化地图打开时的默认视角，减少加载完成后的画面跳动
* 日本地区在不同缩放等级下自动切换显示层级：
    * 放大查看时以市区町村为单位展示足迹
    * 缩小查看时（zoom < 7）以都道府县为单位展示整体访问情况
* 修复部分交互与界面细节问题

### 2026.01.11 V1.1.0

* 支持中国的足迹记录
* 替换日本 GeoJSON 为 TopoJSON 版本，大幅减少体积
* 缩短地图右下角 Attribution 横幅

### 2026.01.10 V1.0.0

在 Copilot 的加持下，只用半天时间就从 0 完成开发、调试并上线