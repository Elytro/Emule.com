/**
 * EdgeOne Pages Edge Function
 * 获取当前用户的 GitHub 仓库列表，支持模糊搜索
 * 路由: /api/repos
 *
 * 环境变量:
 *   GITHUB_USERNAME — GitHub 用户名
 *   GITHUB_TOKEN    — GitHub Personal Access Token
 */

/**
 * 简易模糊匹配：检查 pattern 的所有字符是否按序出现在 str 中
 */
function fuzzyMatch(pattern, str) {
  const lowerPattern = pattern.toLowerCase();
  const lowerStr = str.toLowerCase();
  let pi = 0;
  for (let si = 0; si < lowerStr.length && pi < lowerPattern.length; si++) {
    if (lowerPattern[pi] === lowerStr[si]) pi++;
  }
  return pi === lowerPattern.length;
}

/**
 * 匹配评分，分数越小越匹配
 */
function scoreMatch(pattern, str) {
  const lowerPattern = pattern.toLowerCase();
  const lowerStr = str.toLowerCase();
  let pi = 0;
  let firstMatch = -1;
  for (let si = 0; si < lowerStr.length && pi < lowerPattern.length; si++) {
    if (lowerPattern[pi] === lowerStr[si]) {
      if (firstMatch === -1) firstMatch = si;
      pi++;
    }
  }
  if (pi !== lowerPattern.length) return Infinity;
  if (lowerStr.startsWith(lowerPattern)) return 0;
  if (lowerStr.includes(lowerPattern)) return 1;
  return firstMatch + 2;
}

export default async function onRequest(context) {
  const { request, env } = context;
  const username = env.GITHUB_USERNAME;
  const token = env.GITHUB_TOKEN;

  // 校验环境变量
  if (!username || !token) {
    return new Response(
      JSON.stringify({ error: '服务未配置：缺少 GITHUB_USERNAME 或 GITHUB_TOKEN 环境变量' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  // 获取搜索参数
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';

  try {
    // 获取用户所有仓库（最多 100 个，按更新时间排序）
    const ghResponse = await fetch(
      `https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated&type=all`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'EdgeOne-Pages-App',
        },
      }
    );

    if (!ghResponse.ok) {
      const errBody = await ghResponse.text();
      let errMsg;
      try {
        errMsg = JSON.parse(errBody).message || errBody;
      } catch {
        errMsg = errBody;
      }
      return new Response(
        JSON.stringify({ error: `GitHub API 错误 (${ghResponse.status}): ${errMsg}` }),
        {
          status: ghResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    let repos = await ghResponse.json();

    // 如果提供了搜索关键词，进行模糊过滤和排序
    if (search) {
      repos = repos
        .filter((r) => fuzzyMatch(search, r.name))
        .sort((a, b) => scoreMatch(search, a.name) - scoreMatch(search, b.name));
    } else {
      repos.sort((a, b) => a.name.localeCompare(b.name));
    }

    // 只返回必要字段，减少响应体积
    const result = repos.map((r) => ({
      name: r.name,
      full_name: r.full_name,
      description: r.description || '',
      private: r.private,
      updated_at: r.updated_at,
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60',
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `请求失败: ${err.message}` }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
}
