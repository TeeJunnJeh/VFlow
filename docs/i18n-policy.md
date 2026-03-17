# Frontend i18n 文案治理规范

## 1. 目标

- 禁止在业务代码中直接写用户可见文案。
- 所有展示文案必须通过 i18n key 读取。
- 通过脚本在合并前自动检查，减少漏翻译、硬编码和线上回退风险。
- 后面可以接入 CI。

## 2. 适用范围

- 目录：`src/**`
- 文件类型：`.tsx`, `.ts`（包含组件、页面、hooks、服务层提示文案）
- 不在本规范约束内：后端日志、测试桩、第三方依赖源码

## 3. 强制规则（MUST）

1. 所有用户可见文案必须走 `t.xxx`。
2. 新增文案时，必须同步新增 `src/i18n/translations.ts` 的 `en` 与 `zh` key。
3. key 命名必须采用模块前缀，使用下划线分隔：`assets_plaza_detail_title`。
4. 组件内禁止 JSX 直接写中文文本或中文属性值。
5. toast、弹窗、按钮文案、空状态、错误提示都属于“用户可见文案”，都必须走 i18n。

## 4. 推荐规则（SHOULD）

1. key 命名按“页面/模块 + 场景 + 语义”组织，避免通用歧义 key（如 `title1`）。
2. 不同语义不要复用同一个 key。
3. 长句文案优先拆分并使用具名参数，避免字符串拼接。

## 5. 新增文案流程

1. 在代码中先引用目标 key（如 `t.assets_plaza_manage_save`）。
2. 在 `translations.ts` 的 `en`、`zh` 同步补齐该 key。
3. 运行本地扫描：
   - `npm i18n:scan`
4. 运行构建验证：
   - `npm run build`
5. 提交 PR。

## 6. 扫描脚本规范

脚本：`scripts/check-i18n.mjs`

当前策略：

- 严格失败（error）：
  - 代码引用了不存在的 i18n key。
  - `zh/en` 缺失 key 或 key 值为空。
- 警告（warn）：
  - 其他语言（如 `ms/vi/ko`）缺失 key。
  - 其他语言 key 值为空。


## 7. ESLint 协同检查

文件：`eslint.config.js`

已启用 JSX 中文硬编码检测规则（当前告警级别），用于开发期即时提醒。


## 9. 反例与正例

反例：

```tsx
<button>删除素材</button>
```

正例：

```tsx
<button>{t.assets_plaza_manage_delete}</button>
```

反例：

```tsx
toast.success('保存成功')
```

正例：

```tsx
toast.success(t.assets_plaza_manage_save_success)
```

## 10. PR 自检清单

- 是否存在任何硬编码用户可见文案？
- 新增 key 是否同时补齐 `en` 与 `zh`？
- key 命名是否可读、语义单一？
- 是否已执行 `npm i18n:scan` 与 `npm run build`？

## 11. 例外申请

如确有临时场景需绕过（例如紧急线上修复），必须在 PR 描述中说明：

1. 绕过原因
2. 影响范围
3. 清理计划与截止时间

未经说明的绕过视为不合规。
