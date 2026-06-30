# LLM KV Cache 存储基准测试标准（文档站）

基于 [Docusaurus](https://docusaurus.io/) 的文档站，支持持续更新、多厂商扩展与**在线编辑**。

## 页面结构

- **标准化规范**（`docs/spec.md`，站点首页 `/docs/`）：完整方法学，不含复现代码。
- **各厂商复现代码**（`docs/vendors/*.md`）：每个厂商一页，含该平台完整可复现代码与实测结果。
  - 沐曦 MetaX（已完成）、NVIDIA、AMD、其他国产（待测模板）。

## 本地开发

```bash
npm install          # 首次（如慢：npm config set registry https://registry.npmmirror.com）
npm start            # 开发服务器 http://localhost:3000（热更新）
npm run build        # 生产构建到 build/
npm run serve        # 预览构建产物
```

> 环境要求 Node ≥ 18；依赖已钉定（overrides.webpack=5.94.0）以兼容 Node 18。

## 在线编辑（Decap CMS）

站点内置 `/admin/` 在线编辑器（Decap CMS），保存即提交到 Git，触发 Netlify 自动重建。

**启用步骤（Netlify 控制台，一次性）**：

1. Site settings → Identity → **Enable Identity**，并邀请你的邮箱为用户。
2. Identity → Services → **Git Gateway → Enable**。
3. 访问 `https://你的站点/admin/`，用 Identity 账号登录即可在线编辑“标准化规范”与“各厂商”页。

**本地试用编辑**：`npx decap-server`，浏览器开 `http://localhost:3000/admin/`（`config.yml` 已设 `local_backend: true`）。

> 路径假设 bench-site 为 Git 仓库根；若作为子目录，请在 `static/admin/config.yml` 的 file/folder 前加 `bench-site/`，并把 `editUrl`、`netlify.toml` 的 base/publish 同步调整。

## 部署到 Netlify

### 方式一：连接 Git（推荐，自动持续部署 + 在线编辑）

1. 把 **bench-site 目录作为仓库根**推到 GitHub/GitLab。
2. Netlify → Add new site → Import from Git，自动读取 `netlify.toml`（command=`npm run build`、publish=`build`）。
3. 按上节启用 Identity + Git Gateway 以开启在线编辑。

### 方式二：CLI / 拖拽

```bash
npm i -g netlify-cli && netlify login && netlify deploy --prod --dir=build
```
或把 `build/` 拖到 Netlify 拖拽部署区（此方式不支持在线编辑）。

## 扩展到新厂商

复制 `docs/vendors/other.md` 为新页：填平台适配信息 → benchcap_full.py 原样复制 → run_tiers.sh 改监控命令与环境变量 → 实测 GPU KV 容量重设 M → 跑标准流程 → 过有效性清单 → 填结果表。
