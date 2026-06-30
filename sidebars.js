// @ts-check
// 每套规范一个独立侧边栏。新增规范：在 docs/standards/ 下建文件夹，并在此追加一个侧边栏键。

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  // 规范一：KV Cache 存储回读
  kvCacheSidebar: [
    'standards/kv-cache-storage/overview',
    'standards/kv-cache-storage/spec',
    {
      type: 'category',
      label: '各厂商复现代码',
      collapsed: false,
      items: [
        'standards/kv-cache-storage/vendors/metax',
        'standards/kv-cache-storage/vendors/nvidia',
        'standards/kv-cache-storage/vendors/amd',
        'standards/kv-cache-storage/vendors/other',
      ],
    },
  ],

  // 规范二：多机多卡并发（规划中）
  multiNodeSidebar: [
    'standards/multi-node-concurrency/overview',
  ],
};

module.exports = sidebars;
