# Vercel评审及交互前端部署包

把本文件夹中的index.html、experience.html、vercel.json上传到已连接Vercel的GitHub仓库根目录。上传解压后的文件，不要只上传zip。index.html替换原评审首页。不要上传.env、密钥或.data目录。

Vercel使用Other，Root Directory指向这些文件所在目录，构建命令留空，输出目录为`.`（配置已提供）。提交到生产分支后等自动部署完成。访问`/`看评审，点击交互体验在左侧iframe打开`/experience.html`，独立窗口同样指向本站页面。

这是两个已关联的静态前端页面。上传HTML不会自动部署Python、DuckDB、账号存储、上传接口或DeepSeek调用。当前页面明确显示后端待连接。真实分析需要部署现有后端并设计同域反向代理或认证跨域方案；不能仅改一个API域名就假定Cookie和权限正确。API Key仅放后端环境变量。

完成后端部署后，应使用原app/review集成链路（含bridge）接回真实体验；本包侧栏的示例为查看/复制，不会冒充已完成真实数据导入。
