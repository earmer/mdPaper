# mdPaper

`mdPaper` 是一个基于 Vue 3、TypeScript、Vite 与 TDesign Vue Next 的浏览器端学术排版工具。当前版本采用双预览职责分离方案：**全屏编辑时使用 HTML 预览提供即时编辑反馈，常规右侧主预览使用 Typst SVG 提供接近最终排版结果的版式预览**；默认导出路径为 **Typst PDF**，旧截图导出仅保留为兼容模式。

## 当前能力

- 纯前端运行：无后端 API、无云函数，编辑、预览与导出均在浏览器内完成。
- Markdown 编辑：支持标题、列表、引用、表格、链接、代码块、图片、脚注等基础语法。
- 数学公式：HTML 预览侧当前由 KaTeX 渲染；Typst 侧数学兼容增强仍在后续计划中。
- 元信息编辑：左侧表单继续管理标题、副标题、作者、单位、通讯作者、摘要、关键词、基金等结构化字段。
- 双预览职责分离：
  - 全屏双栏编辑预览 = HTML
  - 非全屏右侧主预览 = Typst SVG
- Typst 导出：默认导出为 Typst PDF；旧 screenshot/canvas 导出为显式兼容模式。
- Typst 调试窗口：可查看编译状态、diagnostics、最近生成源码、模板名、编译时间与虚拟工程摘要。
- 模板切换：当前内置 R.U.B.B.I.S.H 模板族，可在预览区切换模板。
- 图片资源：支持浏览器内图片资源池，已上传图片以 `mdasset:` 形式引用。
- 图片显示比例：正文区支持设置图片最大显示百分比，HTML 预览与 Typst 序列化都会读取该设置。
- 本地草稿：编辑内容与元信息会持久化到浏览器本地缓存。
- 国际化：当前支持 `zh-CN` / `en-US`。
- 明暗主题：界面支持亮色与暗色模式，纸面预览保持白底阅读体验。

## 预览与导出模型

### 1. HTML 预览

HTML 预览的职责是提供**编辑过程中的即时反馈**。

- 使用场景：全屏双栏编辑。
- 目标：快速查看 Markdown 结构、段落、图片、公式与整体排版趋势。
- 当前限制：HTML 预览仍在继续向 Typst 语义对齐，不能把它视为最终排版结果。

### 2. Typst SVG 预览

Typst SVG 预览的职责是提供**右侧主预览**。

- 使用场景：非全屏主界面右侧预览。
- 目标：展示基于 Typst 实际编译得到的页面结果。
- 特点：多页 SVG 页面间已加入明确间距，便于区分页面边界。
- 编译失败时：主预览区仅显示轻量同步状态，更多细节可在 Typst 调试窗口中查看。

### 3. Typst PDF 导出

当前默认导出路径是 Typst PDF。

- 预览与导出应来自同一份 Typst 编译产物。
- 导出结果是可搜索、可选中文本的 PDF，而不是截图位图。
- 若当前 Typst 编译失败，默认导出会失败，并提示查看 Typst 调试信息。

### 4. Legacy Screenshot Export

旧导出方式仍保留，但仅作为兼容模式。

- 本质上仍是截图式导出。
- 可能出现文字位图化、分页误差、远程资源不一致等问题。
- 不应再视为默认导出路径。

## Typst 调试窗口

预览区提供独立的 Typst 调试入口，用于辅助排查排版与编译问题。

当前可查看的信息包括：

- 编译状态：`idle / compiling / ready / error`
- 当前模板
- 最近编译时间
- diagnostics
- 最近一次生成的 Typst 源码
- 虚拟工程摘要，例如入口文件、模板入口、已注入的源码文件列表

当前调试窗口主要用于：

- 判断失败发生在模板、正文、引用还是资源阶段
- 查看最终实际送入 Typst 的源码
- 辅助定位 Typst 编译错误

## 模板系统

当前模板源码位于：`src/services/typst/templates/`

当前状态：

- 模板文件已从 TypeScript 内联字符串迁移为独立 `.typ` 文件。
- 当前仓库内已存在 R.U.B.B.I.S.H 默认模板与紧凑模板。
- 模板切换已经接入预览区。

后续整理方向已经明确，但尚未全部实现：

- 仅 `template_*.typ` 文件应作为可选模板显示
- `common.typ` 将作为主入口默认共享导入
- `common_rubbish.typ` 将承担当前 R.U.B.B.I.S.H 模板族共享能力
- 模板目录下所有 `.typ` 文件都应进入 Typst 虚拟源码文件系统

也就是说，当前已经完成“模板独立文件化”，但“按命名约定自动发现模板”仍在后续计划中。

## 元信息模型

`metadata` 结构定义于 `src/types/manuscript.ts` 中的 `ManuscriptMeta`：

```ts
interface ManuscriptMeta {
  title: string;
  subtitle: string;
  abstract: string;
  keywords: string[];
  authors: Author[];
  affiliations: Affiliation[];
  correspondingAuthorId: string;
  correspondingAuthorContact: string;
  fundings: FundingItem[];
}
```

当前作者与单位的表达遵循“作者局部标记”思路：

- `1`、`2` 等标记表示作者与单位的关联
- `*` 表示通讯作者标记
- 这类标记是 front matter 内部的局部视觉标记，不等同于正文脚注系统

## 图片与资源说明

### 1. `mdasset:` 资源

编辑器上传或拖拽进入的图片会进入浏览器内资源池，并通过 `mdasset:` 进行引用。

这是当前 Typst 编译路径优先支持的图片来源。

### 2. 远程链接图片

当前策略已经明确：**不支持把远程链接图片自动纳入 Typst 编译与默认导出路径**。

原因不是单一实现细节，而是浏览器环境下远程抓取经常受到 CORS 等限制，无法作为可靠的排版输入。

当前表现：

- HTML 预览中，远程图片仍可能由浏览器直接显示。
- Typst 预览与 Typst 导出中，远程链接图片不被视为可靠输入。
- 界面会给出明确提示，而不是继续伪装为可导出资源。

推荐做法：

- 对需要进入 Typst 预览与导出的图片，优先使用上传后的 `mdasset:` 资源。
- 不要依赖远程图床 URL 作为最终投稿 PDF 的资源来源。

### 3. 图片显示比例

当前 `imageOption.maxDisplayPercent` 已接入：

- HTML 预览中的图片显示宽度限制
- Typst 序列化时的图片宽度参数

该设置用于统一控制正文图片在页面中的最大显示比例。

## 字体说明

当前仓库内包含部分字体资源，位于：`src/assets/fonts/`

当前实现已经会在 Typst 运行时侧接入字体，但字体系统仍处于继续整理阶段。当前应注意：

- 不应把某个系统字体名称视为天然存在
- 浏览器侧与 Typst Wasm 侧的字体可用性并不完全等价
- 后续会继续整理字体加载机制与模板排版之间的关系

换言之，当前字体链路可用，但还不是最终定型方案。

## 本地开发

安装依赖并启动开发环境：

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm typecheck
pnpm build
pnpm preview
```

说明：

- `pnpm typecheck`：执行 TypeScript / Vue 类型检查
- `pnpm build`：执行类型检查并构建生产产物
- `pnpm preview`：本地预览构建结果

## 静态部署

构建输出目录为 `dist/`，可部署到任意静态托管平台。

例如：

- Cloudflare Pages
- GitHub Pages
- 其他支持静态文件部署的平台

`vite.config.ts` 已配置为适应静态部署场景。

## 当前目录结构

```text
src/
  assets/
    fonts/
  components/
    ExportDialog.vue
    MarkdownEditor.vue
    MetaForm.vue
    PreviewPane.vue
    TopBar.vue
  constants/
  data/
    sampleManuscript.ts
  i18n/
    en-US.ts
    index.ts
    zh-CN.ts
  services/
    document/
    export/
      engines/
    image/
    markdown/
    pagination/
    typst/
      compileManuscript.ts
      runtime.ts
      serialize.ts
      templates.ts
      templates/
        frontmatter.typ
        rubbish-compact.typ
        rubbish-default.typ
  store/
    useManuscriptStore.ts
  styles/
    journal.css
    main.css
    theme.css
    tokens.css
  types/
    manuscript.ts
  utils/
    format.ts
    imageAsset.ts
```

## 当前已知限制

- HTML 预览与 Typst 预览仍有部分语义差异，正在继续对齐。
- Typst 文本转义仍需进一步完善，复杂字符组合仍需继续覆盖。
- `[@key]` reference 语法与 bibliographic pipeline 仍未完全收口。
- 数学公式的 Typst 兼容增强尚未接入 `miTeX`。
- 模板自动发现机制尚未完全按命名约定实现。
- 字体系统与资源系统仍在继续整理。

## 手动检查建议

开发阶段建议至少检查以下内容：

1. 全屏双栏中 HTML 预览是否与编辑内容一致。
2. 非全屏右侧 Typst 预览是否成功编译并分页显示。
3. 切换模板后，内容语义是否保持不变，仅版式变化。
4. Typst PDF 导出是否与当前 Typst 预览一致。
5. Typst 调试窗口中的 diagnostics 是否能解释当前错误。
6. `mdasset:` 图片是否同时在 HTML 与 Typst 路径中正常工作。

## 路线图

当前未完成事项已整理到：`roadmap.md`
