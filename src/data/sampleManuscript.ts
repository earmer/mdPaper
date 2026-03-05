import type { ManuscriptDraft } from '@/types/manuscript';

export const sampleManuscript: ManuscriptDraft = {
  locale: 'zh-CN',
  theme: 'light',
  enableDraftPersistence: true,
  metadata: {
    title: '面向学术写作的浏览器端 Markdown 期刊排版方法研究',
    subtitle: 'A Browser-Only Workflow for Journal-Style PDF Typesetting',
    abstract:
      '本文提出一种纯前端期刊排版流程，将论文元信息结构化建模，并与 Markdown 正文渲染深度耦合，实现“所见即所得”的实时预览与 PDF 导出。系统在浏览器内完成公式渲染、图文混排、单栏正文、页眉页脚生成和分页控制，无需后端服务。实验结果表明，在常见投稿场景下，该方法可稳定生成符合期刊格式要求的高质量文档，并显著降低作者排版负担。',
    keywords: ['Markdown', '学术排版', '前端工程', 'PDF 导出', '浏览器计算'],
    authors: [
      {
        id: 'author-1',
        name: '张伟',
        nameEn: 'Wei Zhang',
        affiliationIds: ['aff-1'],
        email: 'wei.zhang@example.edu.cn',
      },
      {
        id: 'author-2',
        name: '李娜',
        nameEn: 'Na Li',
        affiliationIds: ['aff-1', 'aff-2'],
        email: 'na.li@example.edu.cn',
      },
      {
        id: 'author-3',
        name: '王磊',
        nameEn: 'Lei Wang',
        affiliationIds: ['aff-2'],
        email: 'lei.wang@example.edu.cn',
      },
    ],
    affiliations: [
      {
        id: 'aff-1',
        org: '示例科技大学 智能信息学院',
        city: '上海',
        country: '中国',
      },
      {
        id: 'aff-2',
        org: '未来计算研究院 软件系统中心',
        city: '北京',
        country: '中国',
      },
    ],
    correspondingAuthorId: 'author-2',
    correspondingAuthorContact: 'na.li@example.edu.cn',
    fundings: [
      {
        id: 'fund-1',
        text: 'xxxx基金会（编号10000000）',
      },
    ],
  },
  content: `## 1 引言

随着在线协作写作工具的普及，研究者越来越希望在浏览器中完成从撰写到投稿的全流程。传统方案通常依赖本地 LaTeX 环境或桌面排版软件，不仅学习成本高，也难以与现代 Web 编辑体验融合。

本文系统的核心思想是将排版参数与文稿语义统一管理。对于行内公式，可直接写作 $E=mc^2$；对于块级公式，可写为：

$$
\\begin{array}{c} 
  H_{n}=\\frac{n}{\\sum \\limits_{i=1}^{n}\\frac{1}{x_{i}}}= \\frac{n}{\\frac{1}{x_{1}}+ \\frac{1}{x_{2}}+ \\cdots + \\frac{1}{x_{n}}} \\\\ G_{n}=\\sqrt[n]{\\prod \\limits_{i=1}^{n}x_{i}}= \\sqrt[n]{x_{1}x_{2}\\cdots x_{n}} \\\\ A_{n}=\\frac{1}{n}\\sum \\limits_{i=1}^{n}x_{i}=\\frac{x_{1}+ x_{2}+ \\cdots + x_{n}}{n} \\\\ Q_{n}=\\sqrt{\\sum \\limits_{i=1}^{n}x_{i}^{2}}= \\sqrt{\\frac{x_{1}^{2}+ x_{2}^{2}+ \\cdots + x_{n}^{2}}{n}} \\\\ H_{n}\\leq G_{n}\\leq A_{n}\\leq Q_{n} 
\\end{array}
$$

## 2 方法

### 2.1 元信息建模

我们将标题、作者、单位、通讯作者、联系方式、基金、摘要、关键词定义为结构化字段，并通过响应式状态统一驱动预览和导出。

在作者展示层，系统根据 \`correspondingAuthorId\` 为指定作者追加 \`*\` 标记，并在作者单位下方输出 \`* 通讯作者: 姓名 (联系方式)\`，以满足常见期刊投稿规范。

### 2.2 关键流程

1. 输入元信息并编辑 Markdown 正文。
2. 通过统一渲染管线生成排版预览。
3. 调整页边距与行距，快速收敛投稿版式。
4. 基于同一容器执行 PDF 导出。

> 该流程避免了“编辑器样式”和“导出样式”分离导致的版式漂移问题。

### 2.3 图文与表格示例

![系统流程图](/fixture-paper-figure.svg "系统流程示意")

Table 1: 关键模块输入输出

| 模块 | 输入 | 输出 |
| --- | --- | --- |
| MetaForm | 作者、单位、通讯作者、联系方式、摘要 | Front Matter |
| Markdown Parser | Markdown 文本 | 语义化 HTML |
| Export Engine | 预览容器 | mdPaper PDF |

## 3 讨论

单栏模式下，正文围绕结构块完整性进行分页控制。为了提升可读性，我们对标题、代码块、表格设置了“避免页内断裂”策略。


a = \arg\max_{a \in \mathcal{A}} Q(s, a)

此外，拖拽图片可自动转为 base64 并插入文稿，减少跨域图片在导出阶段失效的风险。

## 4 结论

本文给出一种轻量、可部署、无后端依赖的期刊 PDF 工具实现路径，适用于课程论文、会议初稿与快速投稿排版。`,
  exportSetting: {
    paperSize: 'A4',
    normalizeHeadings: true,
    fontSize: 10.8,
    lineHeight: 1.42,
    paragraphIndent: 2,
    margins: {
      top: 25,
      right: 25,
      bottom: 25,
      left: 25,
    },
    headerFooter: {
      showHeader: true,
      showFooter: true,
      showJournalName: true,
      showCopyright: true,
      showPageNumber: true,
    },
  },
  imageOption: {
    enableCompression: true,
    quality: 0.82,
    maxWidth: 1800,
  },
  imageAssets: {},
};
