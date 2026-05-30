# Clothing Color Match Studio

一个面向服装样品图、电商图、模特图和面料图的在线校色工具。项目目标是在浏览器内完成服装颜色匹配：上传标准图作为参考，只调整样品图中衣服蒙版区域的颜色，同时尽量保留纹理、褶皱、图案、光影和明暗关系。

## 项目定位

Clothing Color Match Studio 是一个前端优先的 MVP 项目，适合本地运行、团队演示，以及部署到 GitHub Pages、Vercel 或 Netlify。当前版本不依赖后端服务，核心图像处理在浏览器 Canvas 中完成。

## 功能介绍

- 标准图上传：上传一张标准图作为校色参考。
- 标准图衣服参考区域选择：使用画笔在标准图上选择衣服取色区域，避免背景、皮肤、阴影污染参考色。
- 样品图批量上传：支持批量上传 JPG、PNG、WebP 样品图。
- 样品图衣服蒙版编辑：支持画笔、橡皮擦、画笔大小、透明度、显示/隐藏、撤销、重做和清空蒙版。
- Lab 自动校色：基于标准图 referenceMask 和样品图 targetMask，在 Lab 色彩空间中主要迁移 a/b 通道，并保留目标图 L 通道。
- 人工调整：支持亮度、对比度、饱和度、色相、曝光、阴影、高光、白平衡、色温、校色强度和纹理保留强度。
- 前后对比：支持单图预览、左右对比、拖动分割线对比、按住空格临时查看原图，以及放大查看细节。
- 单张下载：导出当前选中样品图的最终处理结果。
- 批量 ZIP 下载：批量处理有蒙版的样品图，并打包为 ZIP；缺少蒙版的图片会被跳过并显示状态。
- 原尺寸 / 2K / 4K 导出：原尺寸保持图片原始宽高，2K 长边为 2048px，4K 长边为 4096px，导出时保持原始比例。

## 技术栈

- React
- Vite
- TypeScript
- Tailwind CSS
- Canvas API
- 浏览器端 ImageData 像素处理
- 项目内置 simpleZip ZIP 生成器

## 本地运行方法

```bash
npm install
npm run dev
```

启动后打开终端输出中的本地地址，通常是：

```txt
http://localhost:5173
```

## 构建方法

```bash
npm run build
```

构建产物会输出到 `dist/`。本地预览生产构建：

```bash
npm run preview
```

## 导出验收方法

项目包含 Task 07 的导出专项验收脚本，用于验证 ZIP 文件、文件命名、原尺寸、2K、4K 和比例保持逻辑：

```bash
npm run verify:export
```

推荐在提交前运行：

```bash
npm run build
npm run verify:export
```

## 使用流程

1. 上传标准图。
2. 切换到标准图取色区域，在衣服区域绘制 referenceMask。
3. 批量上传待校色样品图。
4. 选择样品图，在衣服区域绘制 targetMask。
5. 点击自动校色，预览 Lab 校色结果。
6. 根据需要使用人工调整面板微调颜色和明暗。
7. 使用前后对比检查纹理、褶皱、图案和光影是否保留。
8. 选择原尺寸、2K 或 4K。
9. 单张下载当前图片，或批量下载 ZIP。

## 部署方法

### Vercel

1. 将项目推送到 GitHub。
2. 在 Vercel 中导入该仓库。
3. Framework Preset 选择 `Vite`。
4. Build Command 使用 `npm run build`。
5. Output Directory 使用 `dist`。
6. 点击 Deploy。

### Netlify

1. 将项目推送到 GitHub。
2. 在 Netlify 中选择 Add new site，并连接该仓库。
3. Build command 使用 `npm run build`。
4. Publish directory 使用 `dist`。
5. 点击 Deploy site。

### GitHub Pages

推荐使用 GitHub Actions 部署 Vite 构建产物：

1. 将项目推送到 GitHub。
2. 在仓库 Settings > Pages 中选择 GitHub Actions。
3. 添加工作流：安装依赖、运行 `npm run build`、上传并部署 `dist/`。
4. 如果部署到仓库子路径，例如 `https://user.github.io/repo-name/`，需要根据仓库路径配置 Vite `base`，否则静态资源可能无法加载。

也可以手动运行 `npm run build`，再将 `dist/` 内容发布到静态站点托管服务。

## 当前 MVP 限制

- 当前主要导出 JPG，暂未提供 PNG/WebP 导出选项。
- 当前 ZIP 使用项目内置 `simpleZip` 实现，未接入 JSZip 依赖。
- 大图批量处理全部在浏览器主线程中完成，可能有性能和内存压力。
- 当前服装区域需要手动绘制蒙版，暂未接入 AI 自动分割。
- 当前不包含项目保存、历史工程恢复、云端存储或多人协作能力。
- 如果原图小于 2K/4K 目标尺寸，可以放大导出，但放大不会增加真实细节。

## 后续开发计划

- 引入 Web Worker，将批量处理和大图像素计算移出主线程。
- 可选接入 JSZip，替换当前内置 ZIP 生成器。
- 增加 AI 服装分割能力，降低手动绘制蒙版成本。
- 支持项目保存和恢复，保留图片、蒙版、校色参数和导出设置。
- 扩展 PNG/WebP 导出格式。
- 增加批量处理重试、取消、进度条和更详细的错误报告。
- 优化超大图处理性能，并探索后端或 GPU 批量处理方案。

## 项目结构

```txt
src/
  components/       UI 组件
  core/             图像处理、校色、调整、导出和 ZIP 逻辑
  types/            共享类型定义
  App.tsx           页面状态和功能编排
scripts/
  verify-export.mjs 导出和 ZIP 专项验收脚本
```

## 验收清单

- `npm run build` 通过。
- `npm run verify:export` 通过。
- 标准图 referenceMask 已绘制后才能自动校色。
- 样品图 targetMask 控制校色、人工调整和导出处理范围。
- ZIP 可以下载并解压。
- 2K/4K 导出长边正确，图片比例不变形。
