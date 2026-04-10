const rawBaseUrl = process.argv[2] || process.env.SMOKE_BASE_URL || 'http://127.0.0.1:8080';
const baseUrl = rawBaseUrl.replace(/\/+$/, '');

const checks = [
  {
    name: '首页',
    path: '/',
    validate: async (response) => {
      const text = await response.text();
      if (!text.includes('<!doctype html') && !text.includes('<!DOCTYPE html')) {
        throw new Error('首页没有返回 HTML 文档');
      }
    }
  },
  {
    name: '健康检查',
    path: '/api/health',
    validate: async (response) => {
      const json = await response.json();
      if (!json.success || json.status !== 'ok') {
        throw new Error(`健康检查未就绪: ${JSON.stringify(json)}`);
      }
    }
  },
  {
    name: '应用列表',
    path: '/api/apps',
    validate: async (response) => {
      const json = await response.json();
      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(`应用列表返回异常: ${JSON.stringify(json)}`);
      }
    }
  }
];

async function run() {
  console.log(`Smoke checking ${baseUrl}`);

  for (const check of checks) {
    const url = `${baseUrl}${check.path}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'youhu-smoke-check'
      }
    });

    if (!response.ok) {
      throw new Error(`${check.name} 失败: ${response.status} ${response.statusText} (${url})`);
    }

    await check.validate(response);
    console.log(`PASS ${check.name} ${url}`);
  }
}

run().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exit(1);
});
