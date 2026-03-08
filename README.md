# mdPaper（纯静态）

`mdPaper` 是一个基于 **Vue 3 + TypeScript + Vite + TDesign Vue Next** 的纯前端期刊排版工具。用户填写期刊元信息（作者、单位、通讯作者、联系方式、基金、摘要、关键词等）并输入 Markdown 正文后，可实时预览最终版式，并导出期刊风格 PDF。

## 功能特性

- 纯静态：无后端 API、无云函数，全部在浏览器完成。
- Markdown 渲染：标题、列表、引用、表格、链接、代码块、图片。
- 数学公式：支持 `$...$` 与 `$$...$$`，由 KaTeX 渲染。
- 期刊模块：标题、作者/单位/通讯作者、基金、摘要、关键词自动排版。
- 标题编号：支持 `## / ### / ####` 自动编号为 `1 / 1.1 / 1.1.1`（附录可保留 `Appendix I`）。
- 图表公式：支持 Figure/Table 自动题注编号与块级公式自动编号 `(1)(2)(3)`。
- 快捷插入：支持标题、列表、表格、代码块、行内/块级公式、引用与图片语法。
- 正文单栏排版：默认 A4 + 25mm 页边距，支持字号、行距、首行缩进。
- 页眉页脚：页眉显示“期刊名 + 论文标题”，页脚显示 `Page N`。
- 图片拖拽：拖入编辑器自动转 base64 Markdown，支持压缩（质量/最大宽）。
- 导出方式：`canvas`（直接下载 PDF）。
- 自动缓存：输入会自动保存到浏览器本地缓存，刷新后自动恢复。
- 一键清空：支持二次确认后清空当前输入与本地缓存。
- i18n：`zh-CN` / `en-US`。
- 亮/暗模式：预览纸张区域保持白纸视觉，周边跟随主题变化。
- 顶栏外链：标题 `mdPaper` 右侧提供 GitHub 图标入口，直达项目仓库。

## 本地运行

```bash
pnpm install
pnpm dev
```

构建与预览：

```bash
pnpm build
pnpm preview
```

## 静态部署

本项目构建后输出 `dist/`，可直接部署到任意静态托管：

- Cloudflare Pages：Build command `pnpm build`，Output `dist`
- GitHub Pages：将 `dist` 内容发布到 Pages 分支或使用 CI 自动发布

`vite.config.ts` 已设置 `base: './'`，适配子路径静态托管。

## 元信息字段（与当前代码一致）

`metadata` 结构对应 `src/types/manuscript.ts` 中的 `ManuscriptMeta`：

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

通讯作者渲染规则（`src/utils/format.ts` + `src/components/PreviewPane.vue`）：

- 作者行会在通讯作者姓名后追加 `*`，并与单位上标共存（如：`李娜²*`）。
- 通讯作者信息单独一行显示：`* 通讯作者: 姓名 (联系方式)`。
- 若联系方式为空，则显示为：`* 通讯作者: 姓名`。

## 字体文件与版权说明

字体位于：`src/assets/fonts/`

- `simsun.woff2`：中文宋体角色（默认使用可分发衬线字体映射）
- `timesnewroman.woff2` / `timesnewroman-italic.woff2`：英文/数字衬线角色
- `stix2math.woff2`：数学字体角色

说明：

- 为保证可运行示例，仓库中放置了可分发字体文件并映射到对应角色。
- 若你有正式商用授权字体（如 SimSun / Times New Roman / STIX Two Math），可直接替换同名文件。
- 替换字体后无需改业务代码，仅需保证文件路径与格式（woff2）一致。

## 导出方式与建议

### `browser-print`

- 方式：`markdown-it` → 学术模板渲染 → `pagedjs` 分页 → 浏览器 `window.print()`
- 优势：文字保持可选中；数学公式、代码高亮与分页质量更稳定
- 注意：会打开浏览器打印对话框，请选择“另存为 PDF”

建议：

- 常规场景优先使用浏览器打印导出
- 涉及远程图片时优先先转内联资源，再导出

## 导出回归对照（手动）

1. 在左侧「元信息」面板点击「恢复示例论文 / Reset to sample manuscript」。
2. 在预览首页检查作者区：通讯作者姓名后应出现 `*`（且与单位上标共存），并显示单独一行通讯作者说明。
3. 在预览区按页检查：重点看标题是否孤行、图表/公式是否被硬切。
4. 选择导出并下载 PDF，逐页对比预览。

重点观察项：

- 是否仍出现“第一页空白、正文从第二页开始”。
- 通讯作者标记是否正确：例如 `张伟¹，李娜¹,²*，王磊²`，且有 `* 通讯作者: 李娜 (na.li@example.edu.cn)`。
- 段落是否有明显孤行/寡行。
- 表格、图片、块级公式是否出现底部裁切或残缺。
- 预览与导出结果的页序是否一致。

## 常见问题（FAQ）

### 1. 远程图片导出失败或丢失

原因：跨域（CORS）限制导致 canvas/抓取失败。

处理：

- 优先使用拖拽上传（自动转 base64）
- 在导出弹窗中执行“尝试转为内联 base64”
- 若目标站点不允许跨域，仍可能失败，建议手动本地化图片

### 2. 公式显示正常但导出异常

处理：

- 确认公式语法为 KaTeX 支持的 LaTeX 子集
- 对超长公式尝试拆分为多行或减小字号后再导出

### 3. 分页不理想

处理：

- 调整页边距、字号、行距
- 大表格/大图尽量缩小宽度，避免跨页冲突
- 导出前先在预览区逐页核对

### 4. 字体风格与期刊要求不一致

处理：

- 将 `src/assets/fonts/` 下字体替换为目标期刊授权字体
- 保持文件名不变即可快速生效

## 项目结构

```text
src/
  main.ts
  App.vue
  constants/
    journal.ts
  assets/
    fonts/
  styles/
    tokens.css
    theme.css
    journal.css
    main.css
  i18n/
    index.ts
    zh-CN.ts
    en-US.ts
  store/
    useManuscriptStore.ts
  components/
    TopBar.vue
    MetaForm.vue
    MarkdownEditor.vue
    PreviewPane.vue
    ExportDialog.vue
  services/
    markdown/
      md.ts
      normalizeMath.ts
      sanitize.ts
    export/
      exportPdf.ts
      exportRoot.ts
      helpers.ts
      engines/
        browserPrintEngine.ts
    image/
      imageToBase64.ts
      compressImage.ts
  utils/
    dom.ts
    format.ts
    debounce.ts
    imageAsset.ts
  data/
    sampleManuscript.ts
  types/
    manuscript.ts
    modules.d.ts
```
