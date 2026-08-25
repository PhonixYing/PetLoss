// PetLoss 路径重写 Worker
//
// VitePress 构建时 base 为 /PetLoss/（为 GitHub Pages 子路径设计），
// 部署到 Workers 自定义域名后需要把所有 /PetLoss/* 请求重写为 /*，
// 否则 HTML 里引用的 /PetLoss/assets/... 等资源会全部 404。
const PREFIX = '/PetLoss';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // /PetLoss 或 /PetLoss/xxx → / 或 /xxx
    if (path === PREFIX || path.startsWith(`${PREFIX}/`)) {
      url.pathname = path.slice(PREFIX.length) || '/';
      return env.ASSETS.fetch(new Request(url, request));
    }

    // 其余请求原样交给静态资源服务
    return env.ASSETS.fetch(request);
  },
};
