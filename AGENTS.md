# AGENTS.md

## 项目目标

开发一个服装自动校色在线网站。核心目标是：

- 上传标准图作为校色参考
- 上传待校色服装图片
- 只改变待处理图片中衣服的颜色
- 不改变衣服纹理、褶皱、光影、图案细节
- 支持蒙版编辑、自动校色、人工调色、实时预览、前后对比、批量处理、2K/4K 导出

## 技术栈

MVP 阶段优先使用：

- React
- Vite
- TypeScript
- Canvas API
- Tailwind CSS
- JSZip
- Web Worker

MVP 阶段不要引入复杂后端，不要接入 AI 自动分割模型。  
后期可以扩展 Python/FastAPI 后端、SAM 2 服装分割、GPU 批量处理等能力。

## 开发原则

1. 每次只完成一个阶段任务，不要一次性重写整个项目。
2. 每次修改前先阅读 DEVELOPMENT_PLAN.md 和 TASKS.md。
3. 每次完成后必须说明：
   - 修改了哪些文件
   - 实现了哪些功能
   - 如何运行和测试
   - 哪些功能还没做
4. 不允许删除已有功能。
5. 不允许为了实现新功能而破坏已有交互。
6. 图像处理必须默认只作用于衣服蒙版区域。
7. 校色算法必须优先保留纹理、褶皱、图案、光影和明暗关系。
8. 所有核心图像处理逻辑尽量拆分到 src/core/。
9. UI 需要简洁、美观、实用，适合电商服装图片处理工具。
10. 每个阶段完成后必须运行 npm run build，确保没有 TypeScript 或构建错误。

## 图像处理要求

### 标准图

标准图不能直接用整张图平均色作为参考。  
必须允许用户选择标准图中的衣服区域，并只基于该区域提取参考颜色。

### 待处理图

校色只能作用于待处理图片的衣服蒙版区域。  
背景、皮肤、头发、手部、场景等非衣服区域不能被修改。

### 算法原则

优先使用 Lab 色彩空间进行校色：

- 保留目标图 L 通道，保护亮度、纹理、褶皱和光影
- 主要迁移 a / b 色彩通道
- 支持校色强度控制
- 支持高光保护
- 支持阴影保护
- 支持蒙版边缘羽化

禁止使用：

- 简单 RGB 平均色替换
- 整图滤镜
- 直接重绘衣服
- 会破坏纹理细节的强力生成式处理

## 文件结构建议

```txt
clothing-color-match/
│
├─ public/
│
├─ src/
│   ├─ components/
│   │   ├─ UploadPanel.tsx
│   │   ├─ ReferencePanel.tsx
│   │   ├─ ImageList.tsx
│   │   ├─ CanvasEditor.tsx
│   │   ├─ MaskToolbar.tsx
│   │   ├─ ColorAdjustPanel.tsx
│   │   ├─ ComparePreview.tsx
│   │   └─ ExportPanel.tsx
│   │
│   ├─ core/
│   │   ├─ colorTransfer.ts
│   │   ├─ labColor.ts
│   │   ├─ maskUtils.ts
│   │   ├─ imageLoader.ts
│   │   ├─ adjustment.ts
│   │   ├─ exportImage.ts
│   │   └─ batchProcessor.ts
│   │
│   ├─ workers/
│   │   └─ colorWorker.ts
│   │
│   ├─ store/
│   │   └─ useProjectStore.ts
│   │
│   ├─ types/
│   │   └─ index.ts
│   │
│   ├─ App.tsx
│   └─ main.tsx
│
├─ AGENTS.md
├─ DEVELOPMENT_PLAN.md
├─ TASKS.md
├─ README.md
├─ package.json
└─ vite.config.ts
```

## 验收命令

每次任务完成后运行：

```bash
npm install
npm run build
```

如果项目已经添加测试，再运行：

```bash
npm test
```

## 输出要求

每次完成任务后，请按以下格式输出：

```txt
1. 完成内容
2. 主要文件变更
3. 运行命令
4. 验收结果
5. 手动测试方法
6. 下一步建议
```

## 工作方式

Codex 每次只执行 TASKS.md 中的一个任务。  
不要跳过任务。  
不要提前实现后续功能。  
不要大规模重构无关代码。  
如果构建失败，优先修复构建错误。  
每个任务完成后更新 TASKS.md 中对应任务状态。
