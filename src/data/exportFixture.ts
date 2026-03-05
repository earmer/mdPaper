import type { ManuscriptMeta } from '@/types/manuscript';

export interface ExportRegressionFixture {
  metadata: ManuscriptMeta;
  content: string;
}

export const exportRegressionFixture: ExportRegressionFixture = {
  metadata: {
    title: '浏览器端学术排版导出一致性与分页质量评估',
    subtitle: 'WYSIWYG Fidelity and Pagination Quality in Client-Side Academic PDF Export',
    abstract:
      '本文构建一个纯前端导出回归样例，用于系统验证学术排版中的 WYSIWYG 一致性、分页稳定性与版式严肃性。样例覆盖长段落、分节标题、表格、图像、块级公式、列表与引用，重点观测空白首页、标题孤行、段落截断、公式残缺等问题。通过统一渲染根与分页规则约束，导出结果在预览与 PDF 之间保持高一致性，并显著降低页底硬切现象。',
    keywords: ['WYSIWYG', '分页控制', '浏览器导出', '期刊排版', '回归测试'],
    authors: [
      {
        id: 'fixture-author-1',
        name: '陈明',
        nameEn: 'Ming Chen',
        affiliationIds: ['fixture-aff-1'],
        email: 'ming.chen@example.edu',
      },
      {
        id: 'fixture-author-2',
        name: '赵婷',
        nameEn: 'Ting Zhao',
        affiliationIds: ['fixture-aff-1', 'fixture-aff-2'],
        email: 'ting.zhao@example.edu',
      },
    ],
    affiliations: [
      {
        id: 'fixture-aff-1',
        org: '前沿排版研究中心',
        city: '上海',
        country: '中国',
      },
      {
        id: 'fixture-aff-2',
        org: 'Human-Centered Publishing Lab',
        city: 'Boston',
        country: 'United States',
      },
    ],
    fundings: [
      {
        id: 'fixture-funding-1',
        text: '示例研究计划（No. MP-2026-011）',
      },
    ],
  },
  content: `## 1 引言 / Introduction

在浏览器端完成学术写作与排版，核心挑战并不在于 Markdown 渲染本身，而在于“预览模型”和“导出模型”能否严格共享同一套排版约束。若导出链路直接抓取一个带有滚动轨道、缩放变换或惰性渲染副作用的预览节点，就可能出现第一页空白、页序偏移、正文下移、页底截断等问题。这些问题在短文档中偶发，但在含有多级标题、图表、公式和长段落的真实投稿稿件中会被明显放大。

为了模拟投稿场景，本样例刻意使用较长的连续论述段，以触发跨页与跨栏的极限条件。实验表明，当分页引擎未约束标题与首段关系时，二级标题很容易出现在页底，导致读者在下一页才看到正文开头，阅读节奏被硬切。该问题可通过标题避免页后断裂、标题后首段避免页前断裂等组合策略显著缓解，同时保持版心利用率。

我们进一步强调，WYSIWYG 在学术语境中不只是视觉近似，而是“结构一致 + 页序一致 + 行段完整”的复合指标。只有当同一份输入在预览与导出中保持稳定页码、稳定段落分布和稳定图文关系时，作者才能在提交前可靠地进行最终校对。

## 2 方法 / Methods

### 2.1 版式一致性策略

系统采用单一文章 DOM 结构驱动预览与导出，导出前将文章克隆到隔离渲染根，并等待字体与图像解码完成。该设计避免了预览视窗滚动位置、动画过渡以及 transform 对截图坐标系的污染，从而减少第一页空白和整体错位。

### 2.2 分页约束策略

分页规则围绕“结构块完整”而不是“逐段绝对禁止断页”展开。标题、图表、块级公式、代码块和引用块默认避免页内切割；普通段落保留自然换页，只通过孤行寡行约束减少残行。这样既能保护语义块完整，又不会因过度 avoid 把大量内容整体挤到下一页。

### 2.3 公式与图表样例

$$
\\mathbf{H}_{\\theta}(x)=\\arg\\max_{y\\in\\mathcal{Y}}\\left(\\sum_{k=1}^{K}\\alpha_k\\,\\phi_k(x,y)-\\lambda\\,\\Omega(y)\\right)
$$

![导出回归图示](/fixture-paper-figure.svg "图 1 导出回归测试图")

| 指标 | 观测点 | 合格标准 |
| --- | --- | --- |
| WYSIWYG | 预览页序 vs PDF 页序 | 不允许空白首页、缺页、整体错页 |
| 标题连贯性 | 标题是否孤行 | 标题后至少跟随一段正文 |
| 段落完整性 | 页底是否硬切 | 不出现截断字符与残缺公式 |
| 图表完整性 | 图、表、公式分页 | 默认不切割，超大内容可平滑跨页 |

## 3 结果与讨论 / Results and Discussion

本节使用连续长段落验证分页质量。首先，若段落行距偏大且没有孤行寡行约束，页面尾部容易出现单行悬挂。其次，双栏模式下若 column-fill 行为不明确，不同浏览器可能出现列高分配差异，造成同一段在预览与导出中的落点不一致。再次，若对所有段落统一设置“禁止断页”，会导致版心利用率显著下降，反而使跨页跳跃更加频繁。

在本实现中，分页策略优先保证结构块完整，并允许普通段落在自然位置换页。该策略在中长文档中表现更稳健：标题与正文连接关系更连贯，图表和公式残缺现象明显减少，页底留白保持在可接受范围。对于极端大表格和超宽公式，系统仍可能触发跨页或缩放，这是浏览器排版模型的合理退化路径，应通过作者侧内容拆分进一步优化。

1. 检查标题是否被孤立到页底。
2. 检查段落是否出现孤行寡行。
3. 检查图表与公式是否被粗暴切断。
4. 检查预览页序与导出页序是否一致。

> 建议在每次导出前固定纸张尺寸、页边距和栏距，再进行最终版式核对，以避免参数漂移带来的页码变化。

## 4 结论 / Conclusion

本回归样例可一键注入编辑器，用于复现和验证导出一致性问题。建议在每次修改导出引擎或分页样式后，都执行同一组手动核查步骤：逐页比对预览、使用 paged 导出、使用 canvas 导出，并重点检查空白首页、页序偏移、标题孤行与内容截断。`,
};
