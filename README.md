# AI API 代理服务 (EdgeOne Pages)

一个基于 Koa 框架的轻量级 HTTP 代理服务，用于在腾讯云 EdgeOne Pages 上转发 AI API 请求。支持双服务负载均衡和自动故障转移。

## ✨ 核心特性

- **双服务负载均衡** - 随机选择主服务或备用服务
- **故障自动转移** - 主服务返回 5xx 错误时自动切换到备用服务
- **600秒超时控制** - 适合 AI 服务的长时间处理
- **完整 HTTP 方法支持** - GET、POST、PUT、DELETE、PATCH、HEAD、OPTIONS
- **CORS 支持** - 自动处理跨域请求和预检请求
- **请求转发** - 完整的请求头、请求体和查询参数转发
- **错误处理** - 详细的错误信息和诊断日志
- **自定义域名** - 支持绑定任意自定义域名（如 `xxx.lan.space`）

## 📦 技术栈

- **框架**: Koa 3.x
- **运行环境**: Node.js 20.x (EdgeOne Pages)
- **部署平台**: 腾讯云 EdgeOne Pages
- **依赖**: 仅 Koa（极度轻量）

## 🚀 快速开始

### 本地开发

#### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您的 AI 服务地址：

```env
SERVICE_1=https://api.openai.com
SERVICE_2=https://api.anthropic.com
TIMEOUT_MS=600000
```

#### 2. 启动本地开发服务

```bash
npm run dev:local
```

服务器会在 `http://localhost:8088` 启动。

#### 3. 测试 API

```bash
# GET 请求
curl http://localhost:8088/v1/models

# POST 请求（带 JSON 体）
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4","messages":[{"role":"user","content":"Hello"}]}'

# CORS 预检请求
curl -X OPTIONS http://localhost:8088/v1/models
```

### 生产部署

#### 1. 推送代码到 GitHub

```bash
git add .
git commit -m "Deploy AI proxy service"
git push origin main
```

注意：`.env` 文件不会被上传（在 `.gitignore` 中）

#### 2. 在 EdgeOne 创建项目

1. 登录 [EdgeOne 控制台](https://console.tencentcloud.com/edgeone)
2. 创建新的 Pages 项目
3. 选择您的 GitHub 仓库
4. 配置环境变量：
   - `SERVICE_1`: 主 AI 服务地址
   - `SERVICE_2`: 备用 AI 服务地址
   - `TIMEOUT_MS`: 请求超时时间（毫秒）

#### 3. 绑定自定义域名

在 EdgeOne 项目设置中绑定自定义域名（如 `xxx.lan.space`）

#### 4. 自动部署

代码推送到 GitHub 后，EdgeOne 自动构建和部署。

### 测试生产环境

```bash
curl https://xxx.lan.space/v1/models
```

## 📋 API 使用示例

### 转发到 OpenAI

```bash
curl -X POST https://xxx.lan.space/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-xxx" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {
        "role": "user",
        "content": "Hello, how are you?"
      }
    ]
  }'
```

代理会自动将请求转发到 `SERVICE_1` 或 `SERVICE_2`，并返回原始响应。

### 故障转移示例

如果 `SERVICE_1` 返回 5xx 错误或超时：
1. 主服务失败时自动尝试备用服务 `SERVICE_2`
2. 返回详细的错误信息和耗时统计

```json
{
  "error": "Service Unavailable: Both upstreams failed.",
  "details": {
    "primary": "fetch failed (1000ms)",
    "backup": "fetch failed (2000ms)"
  }
}
```

## ⚙️ 配置说明

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `SERVICE_1` | 主 AI 服务地址 | `https://api.openai.com` |
| `SERVICE_2` | 备用 AI 服务地址 | `https://api.anthropic.com` |
| `TIMEOUT_MS` | 请求超时时间（毫秒） | `600000`（10分钟） |

### 本地开发 vs 生产环境

| 方面 | 本地开发 | 生产环境 |
|------|---------|---------|
| 变量来源 | `.env` 文件 | EdgeOne 环境变量 |
| 加载方式 | dotenv 包 | EdgeOne 运行时注入 |
| 文件上传 | 不上传（.gitignore） | 不需要 |
| 访问方式 | `process.env.SERVICE_1` | `process.env.SERVICE_1` |

**关键点**: 本地和生产的代码完全相同，只需在环境中配置不同的变量值即可。

## 🔍 工作原理

### 请求流程

```
用户请求
  ↓
https://xxx.lan.space/v1/models?key=value
  ↓
提取路径: /v1/models
提取参数: key=value
  ↓
随机选择 SERVICE_1 或 SERVICE_2
  ↓
构建目标 URL:
https://api.openai.com/v1/models?key=value
  ↓
转发请求
  ↓
返回响应给客户端
```

### 自定义域名支持

当前实现完全支持任意自定义域名：

- 代码使用 `ctx.path` 提取请求路径（不含域名）
- 自动将请求域名替换为 `SERVICE_1` 或 `SERVICE_2`
- 无需修改代码，只需在 EdgeOne 绑定域名即可

## 📊 错误处理

### 常见错误及解决方案

#### 500: SERVICE_1 and SERVICE_2 must be set

**原因**: 环境变量未配置

**解决方案**:
- 本地: 确保 `.env` 文件存在且包含 `SERVICE_1` 和 `SERVICE_2`
- 生产: 在 EdgeOne 控制台配置环境变量

#### 400: Invalid request body

**原因**: 请求体超过 6MB 限制（EdgeOne 平台限制）

**解决方案**: 减小请求体大小

#### 503: Service Unavailable: Both upstreams failed

**原因**: 两个上游服务都失败

**解决方案**:
- 检查 `SERVICE_1` 和 `SERVICE_2` 地址是否正确
- 检查 API 密钥是否有效
- 检查网络连接

## 🧪 本地测试

### 验证路径转发

```bash
# 请求
curl http://localhost:8088/v1/models

# 日志输出
[Proxy] GET /v1/models -> Primary: https://api.openai.com
[Proxy] Primary succeeded: 200 (1234ms)
[Proxy] GET /v1/models -> 200 (1236ms)
```

### 验证 CORS 支持

```bash
curl -i -X OPTIONS http://localhost:8088/v1/models
```

应该返回 204 和以下头部：
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS`
- `Access-Control-Allow-Headers: *`

### 验证请求体转发

```bash
curl -X POST http://localhost:8088/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'
```

### 验证故障转移

修改 `.env` 使用不存在的服务地址：

```env
SERVICE_1=http://localhost:9999
SERVICE_2=http://localhost:9998
```

重启服务后，所有请求应该返回 503 错误和详细信息。

## 📁 项目结构

```
koa-cpa-proxy/
├── node-functions/
│   └── koa/
│       └── [[default]].js          # Koa 应用入口
├── test-local-server.js             # 本地测试服务器
├── package.json                     # 项目配置
├── .env.example                     # 环境变量示例
├── .gitignore                       # Git 配置
├── tsconfig.json                    # TypeScript 配置
├── eslint.config.mjs                # ESLint 配置
└── README.md                        # 本文档
```

## 📚 常见问题

### Q: 本地开发和生产环境需要相同的 API 地址吗？

**A**: 不一定。您可以在本地使用测试账户的地址，生产环境使用正式账户的地址。

### Q: 如何修改超时时间？

**A**: 修改 `TIMEOUT_MS` 环境变量的值（单位：毫秒）。默认为 600000ms（10分钟）。

### Q: 请求头会被转发吗？

**A**: 是的，所有请求头都会被转发，除了 `Host` 头会被自动替换为上游服务地址。

### Q: 支持 WebSocket 吗？

**A**: 当前版本不支持 WebSocket，仅支持 HTTP 请求。

### Q: 如何添加认证或修改请求？

**A**: 修改 `node-functions/koa/[[default]].js` 中的中间件逻辑即可。

## 🔗 相关链接

- [EdgeOne Pages 官方文档](https://cloud.tencent.com/document/product/1552)
- [Koa 官方文档](https://koajs.com)
- [EdgeOne CLI 使用指南](https://cloud.tencent.com/document/product/1552/127423)

## 📄 许可证

MIT License

## 💬 支持

如有问题，请：
1. 查看本文档
2. 检查 EdgeOne 控制台的日志
3. 查看本地开发环境的输出日志

---

**最后更新**: 2026-01-22  
**状态**: 生产就绪 ✅
