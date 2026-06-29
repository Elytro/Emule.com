# GitHub 文件上传页面

基于 **EdgeOne Pages** + **Edge Functions** 构建的 GitHub 文件上传工具。

## 功能特性

- **仓库选择**：支持手动输入，并可通过模糊搜索从仓库下拉列表中快速选择
- **文件上传**：支持点击选择文件 与 拖拽上传，上传前展示文件名与大小
- **安全凭证管理**：GitHub 凭证通过 EdgeOne Pages 环境变量注入，不硬编码在代码中
- **完整反馈**：加载状态、错误提示、上传结果展示
- **响应式布局**：适配桌面端与移动端

## 项目结构

```
├── index.html                         # 前端页面（单页应用）
├── edge-functions/
│   └── api/
│       ├── repos.js                   # 获取仓库列表（支持模糊搜索）
│       └── upload.js                  # 代理文件上传到 GitHub API
└── package.json
```

## 部署到 EdgeOne Pages

### 1. 配置环境变量

在 EdgeOne Makers 项目设置中添加以下**环境变量**：

| 变量名 | 说明 | 示例值 |
|---|---|---|
| `GITHUB_USERNAME` | GitHub 用户名 | `elytro` |
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxx...` |

> ⚠️ **安全提示**：Token 应具备 `repo` 权限。切勿将 Token 硬编码到代码中或提交到版本控制。

### 2. 创建 Personal Access Token

1. 前往 GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. 点击 **Generate new token (classic)**
3. 勾选 `repo` 权限（完整仓库访问）
4. 生成后复制 Token 并填入环境变量

### 3. 部署项目

将项目导入 EdgeOne Makers 并设置好环境变量后，平台会自动部署：

- 静态页面 `index.html` 由 EdgeOne 全球 CDN 加速
- Edge Functions（`edge-functions/api/*.js`）在边缘节点执行，代理 GitHub API 请求

## 本地开发

```bash
# 安装 EdgeOne Makers CLI（如已安装可跳过）
npm install -g edgeone

# 本地开发
edgeone pages dev
```

## 限制说明

- EdgeOne 边缘函数请求体上限约 **1 MB**，建议上传文件大小不超过 **800 KB**
- GitHub API 单文件大小限制为 **100 MB**（通过 API 上传）
- 如果目标路径已有同名文件，上传会返回 409 错误，需先删除或更换路径

## 技术实现

- 前端：原生 HTML/CSS/JS，无框架依赖
- 后端：EdgeOne Edge Functions（Serverless）
- API 代理：所有 GitHub API 调用在边缘节点完成，Token 不暴露到前端
- 模糊搜索：子序列匹配算法，支持输入仓库名的任意片段进行筛选
