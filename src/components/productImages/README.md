# AI首帧图生成 - 功能框架指南

## 📁 目录结构

```
src/
├── components/productImages/
│   ├── Common/                    # 共用组件
│   │   ├── ImageUploader.tsx      # 图片上传组件
│   │   ├── LoadingProgress.tsx    # 进度显示组件
│   │   ├── ErrorDialog.tsx        # 错误对话框
│   │   └── index.ts
│   │
│   ├── Functions/
│   │   └── FirstFrame/            # 首帧图生成功能
│   │       ├── FirstFrameView.tsx     # 主容器 (生命周期管理)
│   │       ├── FirstFrameForm.tsx     # 参数表单
│   │       ├── FirstFrameResult.tsx   # 结果展示
│   │       └── index.ts
│   │
│   └── index.ts                   # 模块导出
│
├── services/
│   └── productImagesApi.ts        # API服务层
│
└── types/
    └── productImages.ts           # TypeScript类型定义
```

## 🎯 核心功能

### 1. FirstFrameView (主容器)
- **职责**: 管理整个首帧图生成流程的生命周期
- **状态**: `'upload' | 'form' | 'generating' | 'result' | 'error'`
- **流程**:
  ```
  上传图片 → 填写参数 → 生成中 → 展示结果 → 设为首帧/视频生成
  ```

### 2. FirstFrameForm (参数表单)
- **职责**: 收集用户参数输入
- **必填项**: 无（所有参数都有默认值）
- **选填项**: 品类、人物类型、出镜方式、画幅比例、风格、文案留白、输出数量

### 3. FirstFrameResult (结果展示)
- **职责**: 展示生成的首帧图
- **特点**: 竖屏友好预览、大图展示、缩略图切换
- **操作**: 下载、设为首帧、进入视频生成、重新生成

### 4. ImageUploader (上传组件)
- **特点**: 支持拖拽和点击上传、文件验证
- **验证**: 格式(JPG/PNG/WebP)、大小(≤5MB)

### 5. LoadingProgress (进度显示)
- **特点**: 动画进度条、预计时间、步骤显示、取消功能

### 6. ErrorDialog (错误处理)
- **特点**: 两种严重级别(警告/错误)、建议提示、重试选项

## 🔌 API服务集成

```typescript
// 所有可用的API方法

// 1. 生成首帧图
await productImagesApi.generateFirstFrame(images, params, projectId);
// 返回: { taskId, status, progress, createdAt }

// 2. 查询生成状态
await productImagesApi.getGenerationStatus(taskId);
// 返回: { id, status, progress, outputImages, errorMessage, completedAt }

// 3. 下载单张结果
await productImagesApi.downloadImage(taskId, imageId);
// 返回: Blob

// 4. 下载所有结果（ZIP）
await productImagesApi.downloadAllResults(taskId);
// 返回: Blob

// 5. 取消生成
await productImagesApi.cancelGeneration(taskId);

// 6. 提交反馈
await productImagesApi.submitFeedback(taskId, score, notes);
```

## 📝 使用示例

### 基础使用

```typescript
import { FirstFrameView } from '@/components/productImages';

export function MyComponent() {
  const [view, setView] = useState('firstFrame');
  
  const handleBack = () => setView('workbench');
  
  return (
    <FirstFrameView 
      onBack={handleBack}
      projectId={projectId}  // 可选：关联到视频项目
    />
  );
}
```

### 高级集成

```typescript
// 在Workbench中添加首帧图视图
import { FirstFrameView } from '@/components/productImages';

type ViewType = 
  | 'workbench'
  | 'assets'
  | 'first_frame_image'  // 新增
  | // ... 其他视图

const views = {
  first_frame_image: (
    <FirstFrameView 
      onBack={() => setActiveView('workbench')}
      projectId={projectId}
    />
  ),
  // ... 其他视图
};
```

## 🎨 参数详解

### FirstFrameParams

```typescript
interface FirstFrameParams {
  // 选填项 - 都有默认值
  category?: 'beauty' | 'skincare' | 'food' | 'appliance' | 'other';
  personType?: 'female' | 'male' | 'neutral' | 'no_limit';
  holdingStyle?: 'single_hand' | 'both_hands' | 'chest' | 'side';
  aspectRatio?: '9:16' | '4:5' | '1:1';
  style?: 'authentic' | 'live' | 'studio' | 'clean';
  textWhitespace?: 'top' | 'bottom' | 'right' | 'none';
  outputCount?: 1 | 2 | 4;
}
```

### 默认值
- **category**: `'beauty'`
- **personType**: `'female'`
- **holdingStyle**: `'single_hand'`
- **aspectRatio**: `'9:16'`
- **style**: `'authentic'`
- **textWhitespace**: `'top'`
- **outputCount**: `4`

## 🌐 页面规划

### 网址映射
```
/workbench?view=first_frame_image  →  FirstFrameView
                ↓ (生成后)
 localStorage['firstFrameImage']  →  Generate.tsx接收参数
                ↓ (设为首帧/进入视频)
/workbench?view=generate  →  Generate 页面（自动填充首帧）
```

### 数据流转
```typescript
// FirstFrameView 生成后
localStorage.setItem('firstFrameImage', JSON.stringify({
  imageUrl: string;
  imageId: string;
  taskId: string;
  timestamp: string;
}));

// Generate.tsx 读取
const firstFrame = JSON.parse(
  localStorage.getItem('firstFrameImage') || '{}'
);
if (firstFrame.imageUrl) {
  // 自动使用为首帧
  setFormData({ firstFrameUrl: firstFrame.imageUrl });
}
```

## 🔄 생命周期流程

```
1. 挂载 (mount)
   ↓
2. 上传图片 (phase='upload')
   ↓
3. 填写参数 (phase='form')
   ↓
4. 调用API生成 (phase='generating')
   │  └─ 轮询状态 (pollTaskStatus)
   │     └─ 更新进度 (setProgress)
   ↓
5. 展示结果 (phase='result')
   ├─ 用户下载
   ├─ 用户设为首帧 (localStorage)
   └─ 用户进入视频生成
   
   或错误处理 (phase='error')
   └─ 用户重试或返回编辑
```

## 📊 状态管理

| State | 类型 | 用途 |
|-------|------|------|
| `phase` | `Phase` | 当前流程阶段 |
| `images` | `File[]` | 上传的图片文件 |
| `results` | `ProductImageResult[]` | 生成的结果 |
| `progress` | `number` | 生成进度(0-100) |
| `error` | `ErrorInfo\|null` | 错误信息 |
| `taskId` | `string\|null` | 后端任务ID |

## ✅ 测试清单

### 单元测试
- [ ] ImageUploader 文件验证
- [ ] FirstFrameForm 参数验证
- [ ] API服务层 (mock)
- [ ] 进度轮询逻辑

### 集成测试
- [ ] 完整生成流程 (upload→form→generate→result)
- [ ] 错误处理和恢复
- [ ] 网络中断恢复
- [ ] 数据流转到Generate页面

### 端到端测试
- [ ] 实际生成测试
- [ ] 下载功能
- [ ] localStorage 持久化
- [ ] 视频生成链路打通

## 🚀 后续功能扩展

当前框架支持以下扩展:

### 1. ProductGalleryView (商品套图生成)
- 复用 ImageUploader、LoadingProgress、ErrorDialog
- 新增 ProductGalleryForm、ProductGalleryResult

### 2. ClothingSwapView (AI换装)
- 修改 ImageUploader (支持双图上传)
- 新增 ClothingSwapForm、ClothingSwapResult

### 3. 共用功能
- 预设模板系统
- 历史记录管理
- 批量下载
- 质量评分反馈

## 📚 相关文档

- **设计规范**: [商品图片生成_设计风格指南.md](../商品图片生成_设计风格指南.md)
- **实施规划**: [商品图片生成_实施规划.md](../商品图片生成_实施规划.md)
- **迭代计划**: [商品图片生成_迭代计划完整版.md](../商品图片生成_迭代计划完整版.md)

## 🐛 常见问题

### Q: 如何自定义参数默认值?
A: 修改 `FirstFrameForm` 中的 `useState` 初始值即可。

### Q: 如何处理后端API变化?
A: 所有API调用都在 `productImagesApi.ts` 中，修改该文件即可。

### Q: 如何集成到其他页面?
A: 使用 `localStorage` 或 React Context 传递数据，参考"页面规划"部分。

### Q: 如何扩展到其他生成类型?
A: 按照 `FirstFrame` 的目录结构创建新的功能文件夹即可。

## 📞 支持

关于框架的问题，请参考规划文档或检查 TypeScript 类型定义。
