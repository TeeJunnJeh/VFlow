# Nano Banana API 调研报告（VFlow 现状）

更新日期：2026-04-01  
范围：VFlow 前端 + vflow-backend 后端

## 1. 结论先行

1. 当前仓库未发现单独名为 nano banana 的 SDK 或 REST 网关。
2. 现阶段“可实际调用”的图像能力，统一落在 Google GenAI 链路（gemini-2.5-flash-image-preview）。
3. 对外可用接口主要有三条：
- /api/assets/temp-upload/
- /api/projects/generate_fusion_image
- /api/projects/generate_smart_repair
4. 建议将“nano banana”在工程中定义为“图像编辑能力层”的产品名，底层先由 Google GenAI 承载；后续替换模型时仅变更后端适配层。

## 2. 已接入能力与入口

### 2.1 临时上传

- 后端路由：POST /api/assets/temp-upload/
- 作用：接收前端文件，返回 media 路径，供后续图像生成接口使用。
- 前端调用位置：VFlow/src/services/productImagesApi.ts

请求：multipart/form-data
- file: 二进制文件

响应关键字段：
- data.path 或 data.url

### 2.2 多图融合

- 后端路由：POST /api/projects/generate_fusion_image
- 作用：多图 + 文本提示词生成结果图。
- 模型：gemini-2.5-flash-image-preview
- 计费：GenerationTask.TaskType.IMAGE_FUSION

请求 JSON：
- project_id: string (必填)
- image_paths: string[] (必填，/media/...)
- prompt: string (必填)
- aspect_ratio: string (可选，默认 1:1)
- resolution: string (可选，默认 2K)

响应 JSON：
- data.image_url: string
- data.task_id: number
- data.project_id: string
- data.cost / data.balance

### 2.3 智能修复

- 后端路由：POST /api/projects/generate_smart_repair
- 作用：单图（可带参考图）定向修图，支持子页面和工具编码。
- 模型：gemini-2.5-flash-image-preview
- 计费：GenerationTask.TaskType.IMAGE_FUSION

请求 JSON：
- project_id: string (可选)
- source_image_path: string (必填)
- reference_image_path: string (可选)
- repair_prompt: string (必填)
- subpage: fashion_model | product_object | other (可选)
- tool_code: string (可选)
- strength: light | medium | strong (可选)
- strength_hint: string (可选)
- aspect_ratio: 1:1 | 4:5 | 9:16 | 16:9 (可选)
- resolution: 1K | 2K | 4K (可选)
- output_count: 1 | 2 | 4 (可选)

响应 JSON：
- data.image_urls: string[]
- data.image_url: string（首图）
- data.subpage / data.tool_code
- data.task_id / data.project_id
- data.cost / data.balance

## 3. 调用链路（前后端）

1. 前端上传原图/参考图到 temp-upload，拿到 /media/... 路径。
2. 前端请求 generate_smart_repair，携带业务参数（subpage、tool_code、repair_prompt）。
3. 后端校验用户与项目、扣点、记录 GenerationTask。
4. 后端构建增强提示词（基础系统指令 + 子页面工具策略 + 用户提示词）。
5. 后端调用 Google GenAI，保存结果图到 media，返回 image_urls。
6. 失败时自动退款并落任务失败状态。

## 4. 智能修图能力分层设计（已实现骨架）

### 4.1 子页面分组

1. 服装/模特（fashion_model）
- mannequin_to_model
- anime_ip
- fashion_3d_showcase
- flat_lay_with_accessories
- body_reshape
- accessory_try_on

2. 商品/物品（product_object）
- product_defect_fix
- background_replace
- stain_remove
- detail_enhance

3. 其他（other）
- old_photo_restore
- logo_cleanup
- text_replace
- custom_retouch

### 4.2 扩展方式

新增功能只需三步：
1. 前端 TOOL_MATRIX 增加一个 tool 定义（标题、描述、默认提示词）。
2. 后端 SMART_REPAIR_TOOL_PROMPTS 增加对应 tool_code 的策略提示。
3. 如需专属参数（如遮罩、关键点、姿态），在 generate_smart_repair 请求体中加字段并在后端解析。

## 5. 接入建议（面向下一阶段）

1. 增加“选区修复”
- 前端引入画笔蒙版层，上传 mask_path。
- 后端在 prompt 中强制“仅编辑蒙版区域”。

2. 增加“结构化输入”
- 把自由文本拆为：目标、保留项、禁止项、风格约束，减少随机性。

3. 增加“工具级参数模板”
- 例如改身材加入 body_ratio_strength，搭配上身加入 accessory_anchor_hint。

4. 增加“质量守卫”
- 后处理校验分辨率、主体完整性、Logo变形，失败重试一次。

## 6. 环境与风险

1. 必需环境变量：GOOGLE_API_KEY。
2. 如果未来出现真正的 nano banana 专用 API，应在后端新增 provider 层：
- ProviderA: GoogleGenAIProvider
- ProviderB: NanoBananaProvider
3. 业务层保持统一协议（subpage/tool_code/prompt/asset paths），避免前端改动。

## 7. 关键代码位置

- 后端客户端：vflow-backend/projects/views.py::_get_google_genai_client
- 后端融合接口：vflow-backend/projects/views.py::generate_fusion_image
- 后端修图接口：vflow-backend/projects/views.py::generate_smart_repair
- 前端修图 API：VFlow/src/services/productImagesApi.ts::generateSmartRepair
- 前端修图页面：VFlow/src/components/productImages/Functions/SmartRepair/SmartRepairView.tsx
