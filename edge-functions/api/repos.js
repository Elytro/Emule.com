/**
 * Edge Function: 获取/搜索 GitHub 仓库列表
 * GET /api/repos?q=search_term
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  const GITHUB_USERNAME = env.GITHUB_USERNAME || 'elytro';
  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'GitHub Token 未配置' }),
      { status: 500, headers: corsHeaders() }
    );
  }

  try {
    let repos = [];
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'EdgeOne-Pages-Uploader',
    };

    if (q && q.includes('/')) {
      // 精确搜索某个仓库
      const [owner, repoPart] = q.split('/');
      const searchOwner = owner || GITHUB_USERNAME;

      // 搜索用户仓库中匹配的
      const res = await fetch(
        `https://api.github.com/search/repositories?q=${encodeURIComponent(repoPart)}+user:${encodeURIComponent(searchOwner)}+fork:true&per_page=10`,
        { headers }
      );

      if (res.ok) {
        const data = await res.json();
        repos = (data.items || []).map(formatRepo);
      }

      // 同时搜索组织仓库
      const orgRes = await fetch(
        `https://api.github.com/orgs/${encodeURIComponent(searchOwner)}/repos?per_page=30&sort=updated`,
        { headers }
      );

      if (orgRes.ok) {
        const orgRepos = await orgRes.json();
        const searchLower = repoPart.toLowerCase();
        const filtered = orgRepos
          .filter(r => r.name.toLowerCase().includes(searchLower))
          .map(formatRepo);
        // 合并去重
        const existingNames = new Set(repos.map(r => r.full_name));
        filtered.forEach(r => {
          if (!existingNames.has(r.full_name)) repos.push(r);
        });
      }
    } else {
      // 获取当前用户的所有仓库
      const userRes = await fetch(
        `https://api.github.com/users/${encodeURIComponent(GITHUB_USERNAME)}/repos?per_page=50&sort=updated&type=all`,
        { headers }
      );

      if (userRes.ok) {
        const userRepos = await userRes.json();
        repos = userRepos.map(formatRepo);
      } else if (userRes.status === 403) {
        const rateRes = await fetch('https://api.github.com/rate_limit', { headers });
        const rateData = await rateRes.json();
        return new Response(
          JSON.stringify({
            error: `API 速率限制：剩余 ${rateData.rate?.remaining || 0} 次，重置时间 ${new Date((rateData.rate?.reset || 0) * 1000).toLocaleString()}`,
          }),
          { status: 403, headers: corsHeaders() }
        );
      } else {
        const errText = await userRes.text();
        return new Response(
          JSON.stringify({ error: `获取仓库失败: ${userRes.status} ${errText}` }),
          { status: userRes.status, headers: corsHeaders() }
        );
      }

      // 如果有搜索关键词，过滤
      if (q) {
        const qLower = q.toLowerCase();
        repos = repos.filter(
          r => r.name.toLowerCase().includes(qLower) || r.full_name.toLowerCase().includes(qLower)
        );
      }
    }

    return new Response(
      JSON.stringify({ repos: repos.slice(0, 15) }),
      { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

function formatRepo(repo) {
  return {
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description || '',
    private: repo.private,
    default_branch: repo.default_branch || 'main',
    html_url: repo.html_url,
    updated_at: repo.updated_at,
  };
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
