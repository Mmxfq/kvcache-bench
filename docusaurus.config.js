// @ts-check
const { themes: prismThemes } = require('prism-react-renderer');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'LLM KV Cache 存储基准测试标准',
  tagline: '面向大模型推理 KV Cache 卸载/回读的厂商无关、可复现基准测试方法学',
  favicon: 'img/logo.svg',

  url: 'https://kvcache-bench.netlify.app',
  baseUrl: '/',

  organizationName: 'zk-aerospace',
  projectName: 'kvcache-storage-bench',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  // Netlify Identity 控件（供 Decap /admin 在线编辑的登录/邀请流程使用）
  scripts: [
    { src: 'https://identity.netlify.com/v1/netlify-identity-widget.js', async: true },
  ],
  clientModules: [require.resolve('./src/identityRedirect.js')],

  i18n: {
    defaultLocale: 'zh-Hans',
    locales: ['zh-Hans'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          routeBasePath: 'docs',
          sidebarPath: require.resolve('./sidebars.js'),
          // “编辑此页”链接：点开在 GitHub 网页编辑，提交后自动重建
          editUrl: 'https://github.com/Mmxfq/kvcache-bench/edit/main/',
        },
        blog: false,
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'light',
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'KV Cache 存储基准',
        logo: {
          alt: 'Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'dropdown',
            label: '规范库',
            position: 'left',
            items: [
              { label: 'KV Cache 存储回读（已发布）', to: '/docs/standards/kv-cache-storage' },
              { label: '多机多卡并发（规划中）', to: '/docs/standards/multi-node-concurrency' },
            ],
          },
          { to: '/', label: '全部规范', position: 'left' },
          { href: '/admin/', label: '在线编辑', position: 'right', target: '_blank' },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: '规范库',
            items: [
              { label: '全部规范', to: '/' },
              { label: 'KV Cache 存储回读', to: '/docs/standards/kv-cache-storage' },
              { label: '多机多卡并发（规划中）', to: '/docs/standards/multi-node-concurrency' },
            ],
          },
          {
            title: 'KV Cache 各厂商复现',
            items: [
              { label: '沐曦 MetaX', to: '/docs/standards/kv-cache-storage/vendors/metax' },
              { label: 'NVIDIA', to: '/docs/standards/kv-cache-storage/vendors/nvidia' },
              { label: 'AMD', to: '/docs/standards/kv-cache-storage/vendors/amd' },
            ],
          },
          {
            title: '工具',
            items: [{ label: '在线编辑', href: '/admin/' }],
          },
        ],
        copyright: `版权所有 © ${new Date().getFullYear()} 深圳中科航星科技有限公司 · LLM KV Cache 存储基准测试标准`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'python', 'json', 'docker'],
      },
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
    }),
};

module.exports = config;
