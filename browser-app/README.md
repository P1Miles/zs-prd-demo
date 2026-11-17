# 知数免登录版本（迁移分支）

此目录独立部署，旧版 Python 网站未改动。CSV/XLSX 在浏览器 DuckDB-Wasm 内处理；AI 只接收问题、字段结构及修复时的 SQL/通用错误码。没有注册入口，不访问旧版用户数据。浏览器关闭即清除；历史只保留本页最近 10 次结果。

## 部署
1. 将本目录内容上传到 GitHub 的独立仓库（不要上传 .env、node_modules）。若上传整个原项目，Vercel Root Directory 必须选择 browser-app。
2. Vercel 导入仓库，使用 Vite，npm run build，输出 dist。api/query.py 为 Python 函数。
3. Vercel 环境变量填写 DEEPSEEK_API_KEY、DEEPSEEK_MODEL（账户实际支持的模型 ID）。密钥不得加 VITE_ 前缀。
4. 在 Vercel Marketplace 连接 Upstash Redis，配置 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN；QUOTA_SALT 为至少 32 字符的随机字符串；MONTHLY_CALL_LIMIT 默认 1000。
5. 重新部署，打开生产地址。先用示范数据的 SQL 编辑器，再测试自然语言分析。

额度：同 IP 每分钟 5 次、每日 30 次、全站每月 1000 次模型尝试，Redis Lua 原子计数，修复也计数，故障不退款。不代表按人限额，也不等于真实货币账单上限。服务未配置或 Redis 故障时禁止调用付费模型。未添加验证码；大规模公开发布需进一步抗滥用及实际费用验证。

## 当前边界
单表、10MB、10万行、200列，Excel 单工作表纯值；类型默认 VARCHAR，由用户确认；结果最多 1000 行；图表只支持分类+数值两列、最多100类。安全语法沿用旧版 AST 白名单。只选 SQL 不执行数据查询。查询超时终止 worker，需要重新选择文件。手写 SQL 仍需网络调用免费校验接口，不是完全离线版。

尚需完成正式 Vercel 云端构建、账号配置、真实 DeepSeek 联调、目标浏览器/移动端大文件测试。不要将本目录直接当成单文件 HTML 使用。

## 本地
在本目录执行 npm install，启动 ../.venv/bin/python dev_server.py，再 npm run dev。本地无模型凭据时仍可验证 SQL、执行本地查询。不会读取旧版 .env。
