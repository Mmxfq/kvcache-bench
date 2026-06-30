// 处理 Netlify Identity：邀请确认/登录后自动跳转到 /admin（Decap 编辑后台）。
// 仅在浏览器端执行。
if (typeof window !== 'undefined') {
  const setup = () => {
    if (window.netlifyIdentity) {
      window.netlifyIdentity.on('init', (user) => {
        if (!user) {
          window.netlifyIdentity.on('login', () => {
            document.location.href = '/admin/';
          });
        }
      });
    }
  };
  if (document.readyState !== 'loading') {
    setup();
  } else {
    window.addEventListener('DOMContentLoaded', setup);
  }
}
