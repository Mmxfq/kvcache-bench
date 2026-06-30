import React from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

// 规范库：新增一套规范时，在此追加一项，并在 docs/standards/ 下建对应文件夹与侧边栏。
const STANDARDS = [
  {
    title: 'KV Cache 存储回读',
    status: '已发布 v1.0',
    statusType: 'published',
    icon: '🗄️',
    desc: '量化外部存储（远端 NVMe-oF 阵列 / 本地 NVMe）对推理 KV Cache 卸载/回读的性能价值。含四档同口径对照、物理读保证、分位指标与各厂商完整复现代码。',
    tags: ['单机单卡/多卡', '长上下文', 'vLLM + LMCache'],
    to: '/docs/standards/kv-cache-storage',
  },
  {
    title: '多机多卡并发',
    status: '规划中',
    statusType: 'planned',
    icon: '🌐',
    desc: '面向多节点部署下存储作为共享 KV 池的并发承载与扩展能力：跨节点共享、并发拐点、多路径/GDS/异步预取、KV 迁移与故障恢复。',
    tags: ['多机多卡', '共享 KV 池', '拓扑扩展'],
    to: '/docs/standards/multi-node-concurrency',
  },
];

function StatusBadge({ type, children }) {
  const bg = type === 'published' ? '#1f7a4d' : '#9a6b00';
  return (
    <span style={{
      background: bg, color: '#fff', fontSize: '0.75rem', fontWeight: 600,
      padding: '2px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function StandardCard({ s }) {
  return (
    <div className="col col--6" style={{ marginBottom: '1.6rem' }}>
      <Link to={s.to} className="featureCard" style={{ display: 'block', textDecoration: 'none', color: 'inherit', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
          <span className="featureIcon" style={{ margin: 0 }}>{s.icon}</span>
          <StatusBadge type={s.statusType}>{s.status}</StatusBadge>
        </div>
        <h3 style={{ marginBottom: '0.5rem' }}>{s.title}</h3>
        <p style={{ marginBottom: '0.9rem' }}>{s.desc}</p>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {s.tags.map((t, i) => (
            <span key={i} style={{
              fontSize: '0.72rem', color: 'var(--ifm-color-primary)',
              border: '1px solid var(--ifm-table-border-color)', borderRadius: 6,
              padding: '1px 8px',
            }}>{t}</span>
          ))}
        </div>
      </Link>
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title="规范库" description="大模型推理存储基准测试规范库，可扩展容纳多套标准。">
      <header className="heroBanner">
        <div className="container">
          <h1>{siteConfig.title}</h1>
          <p>{siteConfig.tagline}</p>
        </div>
      </header>
      <main>
        <section style={{ padding: '3rem 0 1rem' }}>
          <div className="container">
            <h2 style={{ textAlign: 'center', marginBottom: '0.4rem' }}>规范库</h2>
            <p style={{ textAlign: 'center', color: 'var(--ifm-color-emphasis-700)', marginBottom: '2rem' }}>
              一套可持续扩展的大模型推理存储基准测试规范集合，每套规范自带方法学与各厂商复现代码。
            </p>
            <div className="row">
              {STANDARDS.map((s, i) => (
                <StandardCard key={i} s={s} />
              ))}
            </div>
          </div>
        </section>
        <section style={{ padding: '0 0 3.5rem' }}>
          <div className="container">
            <div className="featureCard" style={{ textAlign: 'center', borderStyle: 'dashed' }}>
              <h3 style={{ marginBottom: '0.4rem' }}>＋ 扩展新规范</h3>
              <p style={{ marginBottom: 0, color: 'var(--ifm-color-emphasis-700)' }}>
                在 <code>docs/standards/</code> 新建文件夹、在 <code>sidebars.js</code> 追加侧边栏、在首页与导航栏登记一项即可。各规范侧边栏相互独立、互不影响。
              </p>
            </div>
          </div>
        </section>
      </main>
    </Layout>
  );
}
