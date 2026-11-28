/**
 * starter-custom 生命周期钩子示例
 * 展示如何通过 provideSlots 向父主题布局中无缝注入自定义组件，无需复制整个 HTML 模板。
 */
export default {
  provideSlots(context) {
    return {
      afterHero:
        '<div class="ep-custom-banner"><span>当前已激活子主题 <strong>starter-custom</strong>（继承自 default，通过 theme.hooks.js 动态注入此横幅）</span><span class="ep-badge ep-badge--success">Theme SDK v2</span></div>',
      afterPost:
        '<div class="ep-card" style="margin-top:32px"><strong>二次开发插槽示例</strong><p style="margin:8px 0 0">此区块通过 <code>slot:afterPost</code> 注入，适合挂载评论区、版权声明或相关推荐。</p></div>'
    };
  }
};
