# uibase — 组件库架构与维护规范

Coded 的自建 UI 原语库。每个组件一个目录（`Foo/`：`Foo.tsx` + `Foo.css` + `index.ts` barrel），根 barrel `src/uibase/index.ts` 统一再导出。消费侧永远走 `@uibase` 别名，不许深链到组件目录内部。

## 一、能力分层（金字塔，依赖方向自上往下）

```
                    ┌─────────────────────────────┐
                    │  Meta（零 DOM 行为基座）       │
                    │  useShortcut / 独占快捷键注册   │
                    └──────────────┬───────────────┘
                                   │ 组合（不是继承视觉）
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
        MetaButton          Dropdown              （未来更多）
     （按钮行为三件套）      （独立交互复合体）
      = Meta + 原生按钮        从 Meta 拿快捷键
      + Tooltip 组合
              │
     ┌────────┴────────┐
     ▼                 ▼
  Button（文字）    IconButton（图标）
  视觉特化          视觉特化
```

**规则**：

1. **Meta 不产生 DOM、不占空间**。它只注册/注销快捷键（window 级单监听，注册表独占——重复绑定立即抛错，避免静默双发）。
2. **MetaButton 是"按钮基座"**：行为 = Meta 快捷键 + 原生 `<button>` + Tooltip 气泡（Tooltip 是**组合**进来的，不是被它拥有）。
3. **Button / IconButton 是 MetaButton 的视觉特化**：改尺寸/形状/图标插槽，不重写行为。
4. **Dropdown 从 Meta 获得 `cycleShortcut`**（直接循环选中项，不碰面板）。它**不继承按钮链**——它的触发器可以是药丸也可以是任意自定义元素（`renderTrigger`），所以不能假设按钮语义。
5. **Tooltip 永远保持独立兄弟组件**：它只负责渲染气泡（可以显示快捷键*文本*，但**不注册任何快捷键行为**）。需要 tooltip 的组件在**自己的触发点**组装它——禁止把 Tooltip 内嵌进其他组件内部。

## 二、新增/维护组件的流程

### 1. 先判断：这是“能力”还是“视觉组件”？

| 你要加的东西 | 应该放在哪 |
|---|---|
| 一段可复用行为（快捷键、Escape 关闭、外部点击关闭、焦点陷阱…） | **uibase/Meta 的 hook**（如 `useEscapeDismiss`） |
| 一个可复用视觉基元（文字按钮、图标按钮、下拉、气泡…） | 新建 `uibase/Foo/`，从最近的基座组合 |
| 纯样式微调 | 目标组件自己的 `.css`，或 barrel 注释里注明的共享规则 |

**判断标准**：如果它不渲染任何属于自己的 DOM、只注册监听/状态/事件，它就是能力，放 Meta；否则它是个组件，从最近的基座向下分层。

### 2. 新建视觉组件的 checklist

- [ ] 目录结构：`Foo/Foo.tsx` + `Foo/Foo.css` + `Foo/index.ts`
- [ ] Props 接口 `FooProps` 导出（组件名 + Props 后缀）
- [ ] 行为从基座组合：需要快捷键 → `useShortcut`；需要 tooltip → 触发点自行组装 Tooltip；需要按钮壳 → 组合 MetaButton
- [ ] CSS 用主题变量并带 fallback（`var(--text, #26272d)`）
- [ ] 支持 `className?: string` 透传（供应用侧特化）
- [ ] 无障碍：`aria-label` 或等价物；键盘可达（如适用）
- [ ] 在 `src/uibase/index.ts` barrel 中导出组件 + 类型
- [ ] `npm run typecheck` 双配置通过

### 3. 修改现有组件的 checklist

- [ ] 公共 API（props 名称/形状）变更 → 检查 barrel 注释与所有调用点（`grep -rn "ComponentName" src/`）
- [ ] 行为变更 → 确认不会改变现有调用方（如：禁用态仍不响应快捷键）
- [ ] 样式变更 → 检查深色主题下的回退变量是否仍然成立
- [ ] typecheck 通过后交用户目视验证（除非用户明确要求代理截图验证）

## 三、现有组件能力速查

| 组件 | 能力来源 | 特殊职责 |
|---|---|---|
| Meta | （本体） | 快捷键注册、文案平台化（Mod→Ctrl/Cmd） |
| MetaButton | Meta + Tooltip | 按钮三件套；变体的行为入口 |
| Button | MetaButton | 文字按钮：variant（primary/secondary/ghost）× size（sm/md/lg）× block |
| IconButton | MetaButton | 图标按钮：方形 chrome + icon slot |
| Tooltip | （独立） | 纯展示气泡；可显示快捷键文本但不注册行为 |
| Dropdown | Meta（useShortcut） | 选择器/动作菜单；触发器可自定义；12 向放置 |
| Menu / Dialog / Split / WindowControls / ThemeProvider / Icon | （各自独立） | 各负其责，不经 Meta |

## 四、反模式（禁止）

1. **Tooltip 内嵌进其他组件**：tooltip 是调用方在触发点组装的，不是组件默认自带的。
2. **行为写在视觉组件里**：快捷键注册、全局监听、外部点击关闭这类能力，一旦发现第二个消费者就必须下沉到 Meta hook，禁止 copy-paste。
3. **深链导入**：永远 `import { X } from '@uibase'`，不许 `import X from '@uibase/Foo/Foo'`。
4. **IPC/平台调用进入 uibase**：uibase 组件保持纯展示；`window.dshDesktop` 等桥接由应用层注入为 props。
5. **CSS 硬编码颜色**：所有颜色/间距/阴影走主题变量，变量必须带 fallback。

## 五、验证

- **静态门禁**：`npm run typecheck`（web + node 双配置）必须通过。
- **视觉验证**：默认由用户运行 `npm run dev` 目视确认；代理不得自行启动 dev server / CDP 截图探针，除非用户明确说“由你验证”。
- 若历史遗留的 dev 进程残留导致 5173 端口被占，用 AGENTS.md 里登记的清扫命令清场后再启动。
