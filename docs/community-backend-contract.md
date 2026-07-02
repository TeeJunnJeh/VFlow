# 创作者社区后端接口契约

本文档用于前后端联调 `random_number_seed_and_community` 分支的创作者社区功能。

当前前端入口已完成，调用集中在 `src/services/community.ts`。后端不要复用素材广场接口，社区需要独立的 `/api/community/*` 接口。

## 基础约定

- 鉴权：沿用现有 Django Session Cookie。
- 请求头：前端会带 `X-Requested-With: XMLHttpRequest`。
- 非 GET 请求：前端会带 `X-CSRFToken`。
- 成功响应建议统一：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

- 错误响应建议统一：

```json
{
  "code": 400,
  "message": "错误说明",
  "error_code": "BAD_REQUEST"
}
```

## 数据结构

### CommunityPost

前端会兼容部分别名，但建议后端按下面字段返回。

```json
{
  "id": "123",
  "title": "窗边的第一帧",
  "body": "帖子正文",
  "post_type": "material_share",
  "author": {
    "id": "8",
    "name": "Kiki",
    "avatar_url": "/media/avatars/a.png"
  },
  "cover_url": "/media/community/covers/1.jpg",
  "media": [
    {
      "id": "m1",
      "kind": "image",
      "url": "/media/community/images/1.jpg",
      "thumbnail_url": "/media/community/thumbs/1.jpg",
      "duration_seconds": null
    }
  ],
  "materials": [
    {
      "id": "21",
      "name": "清晨玻璃高光参考",
      "type": "scene",
      "file_url": "/media/uploads/scene/21.jpg",
      "preview_url": "/media/uploads/scene/21.jpg",
      "can_collect": true
    }
  ],
  "like_count": 128,
  "favorite_count": 36,
  "collect_count": 18,
  "is_liked": false,
  "is_favorited": true,
  "is_collected": false,
  "created_at": "2026-07-02 09:12:00"
}
```

字段说明：

- `post_type`: `material_share` 或 `experience`。
- `media[].kind`: `video`、`image`、`audio`。
- `materials[].type`: `model`、`product`、`scene`、`motion`、`audio`、`script`、`skill`。
- `cover_url`: 视频帖子建议必须返回封面，否则卡片预览效果会差。
- `materials`: 帖子关联的可复用素材。前端会用它做“收集到素材库”。

前端兼容别名：

- `body` 可兼容 `content`。
- `post_type` 可兼容 `type`。
- `author.name` 可兼容 `author_name`。
- `favorite_count` 可兼容 `star_count`。
- `is_favorited` 可兼容 `is_starred`。
- `materials` 可兼容 `assets`。

## 1. 帖子列表

### `GET /api/community/posts/`

查询参数：

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `type` | string | 否 | `all`、`material_share`、`experience`。前端传 `all` 时可不筛选。 |
| `q` | string | 否 | 搜索标题、正文、作者、素材名。 |
| `cursor` | string | 否 | 下一页游标。 |
| `limit` | number | 否 | 每页数量，前端当前传 24。 |

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "items": [],
    "next_cursor": null,
    "total": 0
  }
}
```

要求：

- `items` 返回 `CommunityPost[]`。
- `next_cursor` 为下一页游标；没有更多数据时返回 `null`。
- 列表接口最好已经带齐卡片展示字段，避免前端打开详情前卡片信息不足。

## 2. 发布帖子

### `POST /api/community/posts/`

请求类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `title` | string | 否 | 帖子标题。 |
| `body` | string | 否 | 帖子正文。 |
| `post_type` | string | 是 | `material_share` 或 `experience`。 |
| `video` | file | 是 | 当前前端要求必须上传视频。 |
| `images` | file[] | 否 | 可多张。 |
| `audio` | file | 否 | 可选音频。 |
| `material_asset_ids` | string[] | 否 | 已有素材库素材 id，可重复 append。 |

响应：

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "post": {}
  }
}
```

要求：

- `data.post` 返回完整 `CommunityPost`。
- 后端需要保存视频、图片、音频，并将它们序列化到 `media`。
- `material_asset_ids` 对应已有素材库素材，序列化到 `materials`。

## 3. 帖子详情

### `GET /api/community/posts/<post_id>/`

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "post": {}
  }
}
```

要求：

- `data.post` 返回完整 `CommunityPost`。
- 如果列表接口已返回完整字段，详情接口也仍建议提供，便于后续评论、长文、更多素材扩展。

## 4. 点赞 / 收藏

### `POST /api/community/posts/<post_id>/reaction/`

请求体：

```json
{
  "action": "like",
  "value": true
}
```

字段：

- `action`: `like` 或 `favorite`。
- `value`: `true` 表示设置为已操作，`false` 表示取消。

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "post_id": "123",
    "is_liked": true,
    "is_favorited": false,
    "like_count": 129,
    "favorite_count": 36
  }
}
```

要求：

- 接口应幂等：重复设置同一个 `value` 不应重复计数。
- 前端有乐观更新，失败时会回滚。

## 5. 举报帖子

### `POST /api/community/posts/<post_id>/report/`

请求体：

```json
{
  "reason": "内容不合适"
}
```

响应：

```json
{
  "code": 0,
  "message": "举报已提交"
}
```

要求：

- 同一用户对同一帖子重复举报可去重，或允许多条记录，后端自定。
- 至少保存 `user`、`post`、`reason`、`created_at`。

## 6. 收集帖子素材到个人素材库

### `POST /api/community/posts/<post_id>/materials/<material_id>/collect/`

请求类型：`multipart/form-data`

字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `value` | boolean | 否 | `true` 表示收集到素材库，`false` 表示取消收集并从素材库移除。默认建议为 `true`。 |
| `folder_id` | string | 否 | 目标素材库文件夹 id。为空表示放到默认位置。 |

响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "asset_id": "88",
    "collect_count": 19,
    "is_collected": true,
    "already_collected": false
  }
}
```

要求：

- `value=true` 时，将帖子关联素材复制或引用到当前用户素材库，具体策略后端决定。
- `value=false` 时，将该用户从该帖子素材产生的素材库记录移除或取消关联。
- 接口应幂等：重复 `value=true` 不重复加计数，重复 `value=false` 不重复减计数。
- 如果已经收集过，建议返回 `already_collected: true`，但仍保持 `code: 0`。
- `is_collected` 返回当前用户对该素材的最新收集状态。
- `collect_count` 返回该帖子或该素材最新收集数，前端会据此更新。

## 7. Skill 素材类型

任务里提到新增 `skill` 资产类型。社区前端的类型定义已经预留 `skill`，但当前素材选择器还未展示 skill tab。

后端建议：

- 在素材库模型中加入 `SKILL` 或等价类型。
- `/api/assets/list/?type=SKILL` 能返回 skill 资产。
- 社区 `materials[].type` 可返回 `skill`。
- 后续前端只需要把 skill 加到素材选择器 tab。

## 前端当前行为

- 入口：侧边栏“创作者社区”。
- 页面：`src/components/community/CommunityView.tsx`。
- API service：`src/services/community.ts`。
- 后端接口不可用时，前端显示占位帖子用于预览排版，不会伪装成真实数据。
- 后端接口可用后，占位帖子会自动被真实列表替换。

## 联调验收清单

- `GET /api/community/posts/` 返回 200，页面能显示真实卡片。
- 搜索 `q` 能筛选标题/正文/作者/素材。
- `type=material_share` 与 `type=experience` 能正常筛选。
- 发布帖子后返回完整 `CommunityPost`，前端能立即插到列表第一条。
- 点赞、收藏响应返回最新计数和状态。
- 收集素材后返回最新 `collect_count`。
- 视频帖子有 `cover_url` 或 `media[].thumbnail_url`。
- 后端 401/403/400 错误返回 JSON，不返回 HTML。
