# AXIS 魔方工作室

支持二阶、三阶、四阶、五阶魔方、五魔方和金字塔魔方的交互、拆解、外观定制与求解。

## 本地运行

需要 Node.js 22.13 或更高版本。

```sh
npm install
npm run setup
npm run dev
```

打开 `http://localhost:3000`。Windows 也可以在安装依赖后运行 `start.bat`。

## 常用命令

- `npm run verify`：TypeScript 类型检查。
- `npm run build`：类型检查并生成 `web/dist`。
- `npm start`：预览已构建的版本。
- `npm run lint --prefix web`：运行项目的完整 lint 检查。
- `npm run deploy`：使用已有 Wrangler 配置部署。

## 代码组织

`web/components/workspace/WorkspaceHeader.tsx` 和 `WorkspacePanel.tsx` 提供所有魔方共用的工具栏、保存反馈、导航与响应式面板。各魔方的模型、渲染和求解逻辑位于 `web/lib`。

临时检查脚本、截图和性能输出放在已忽略的 `.local/` 中。构建产物、依赖目录和本地数据不提交到 Git。
