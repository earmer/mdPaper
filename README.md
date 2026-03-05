# mdPaper（纯静态）

`mdPaper` 是一个基于 **Vue 3 + TypeScript + Vite + TDesign Vue Next** 的纯前端期刊排版工具。用户填写期刊元信息（作者、单位、基金、摘要、关键词等）并输入 Markdown 正文后，可实时预览最终版式，并导出期刊风格 PDF。

## 功能特性

- 纯静态：无后端 API、无云函数，全部在浏览器完成。
- Markdown 渲染：标题、列表、引用、表格、链接、代码块、图片。
- 数学公式：支持 `$...$` 与 `$$...$$`，由 KaTeX 渲染。
- 期刊模块：标题、作者/单位、基金、摘要、关键词自动排版。
- 标题编号：支持 `## / ### / ####` 自动编号为 `1 / 1.1 / 1.1.1`（附录可保留 `Appendix I`）。
- 图表公式：支持 Figure/Table 自动题注编号与块级公式自动编号 `(1)(2)(3)`。
- 正文单栏排版：默认 A4 + 25mm 页边距，支持字号、行距、首行缩进。
- 页眉页脚：页眉显示“期刊名 + 论文标题”，页脚显示 `Page N`。
- 图片拖拽：拖入编辑器自动转 base64 Markdown，支持压缩（质量/最大宽）。
- 导出引擎：`paged`（默认，打印流）+ `canvas`（直接下载）。
- 导出回归样例：一键填充长文 fixture，快速复现分页与导出一致性问题。
- 自动缓存：输入会自动保存到浏览器本地缓存，刷新后自动恢复。
- 一键清空：支持二次确认后清空当前输入与本地缓存。
- i18n：`zh-CN` / `en-US`。
- 亮/暗模式：预览纸张区域保持白纸视觉，周边跟随主题变化。

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

## 字体文件与版权说明

字体位于：`src/assets/fonts/`

- `simsun.woff2`：中文宋体角色（默认使用可分发衬线字体映射）
- `timesnewroman.woff2` / `timesnewroman-italic.woff2`：英文/数字衬线角色
- `stix2math.woff2`：数学字体角色

说明：

- 为保证可运行示例，仓库中放置了可分发字体文件并映射到对应角色。
- 若你有正式商用授权字体（如 SimSun / Times New Roman / STIX Two Math），可直接替换同名文件。
- 替换字体后无需改业务代码，仅需保证文件路径与格式（woff2）一致。

## 导出引擎差异与建议

### 1) `paged`（默认）

- 方式：Paged.js + Print CSS + 浏览器打印流程
- 优势：分页更可控，复杂排版稳定，页眉页脚更接近期刊打印逻辑
- 使用：点击导出后会弹出浏览器打印，选择“保存为 PDF”

### 2) `canvas`

- 方式：html2pdf.js（html2canvas + jsPDF）
- 优势：直接下载 PDF，不走打印对话框
- 注意：复杂页面可能出现文字栅格化、分页细节偏差

建议：

- 投稿版优先 `paged`
- 快速分享可用 `canvas`

## 导出回归对照（手动）

1. 在左侧「元信息」面板点击「填充导出测试样例 / Load export fixture」。
2. 在预览区按页检查：重点看标题是否孤行、图表/公式是否被硬切。
3. 选择 `Paged` 导出，走浏览器打印保存 PDF，逐页对比预览。
4. 选择 `Canvas` 导出，再次对比页序与分页位置。

重点观察项：

- 是否仍出现“第一页空白、正文从第二页开始”。
- 段落是否有明显孤行/寡行。
- 表格、图片、块级公式是否出现底部裁切或残缺。
- 预览与两种导出引擎的页序是否一致。

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
- 对复杂公式优先使用 `paged` 引擎

### 3. 分页不理想

处理：

- 调整页边距、字号、行距
- 大表格/大图尽量缩小宽度，避免跨页冲突
- 对严格页眉页脚场景优先 `paged`

### 4. 字体风格与期刊要求不一致

处理：

- 将 `src/assets/fonts/` 下字体替换为目标期刊授权字体
- 保持文件名不变即可快速生效

## 项目结构

```text
src/
  main.ts
  App.vue
  assets/
    fonts/
  styles/
    tokens.css
    theme.css
    print.css
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
      sanitize.ts
    export/
      exportPdf.ts
      helpers.ts
      engines/
        pagedEngine.ts
        canvasEngine.ts
    image/
      imageToBase64.ts
      compressImage.ts
  utils/
    dom.ts
    format.ts
    debounce.ts
  data/
    sampleManuscript.ts
```
