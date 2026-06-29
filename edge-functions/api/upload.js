/**
 * Edge Function: 上传/覆盖文件到 GitHub 仓库
 * POST /api/upload
 * Body: { repo, branch, path, content(base64), message }
 */
export async function onRequest(context) {
  const { request, env } = context;

  // 处理 CORS 预检
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: '仅支持 POST 请求' }),
      { status: 405, headers: corsHeaders() }
    );
  }

  const GITHUB_TOKEN = env.GITHUB_TOKEN;

  if (!GITHUB_TOKEN) {
    return new Response(
      JSON.stringify({ error: 'GitHub Token 未配置' }),
      { status: 500, headers: corsHeaders() }
    );
  }

  try {
    const body = await request.json();
    const { repo, branch, path, content, message } = body;

    // 参数校验
    if (!repo || !path || !content) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数: repo, path, content' }),
        { status: 400, headers: corsHeaders() }
      );
    }

    const branchName = branch || 'main';
    const commitMessage = message || 'Upload file via API';
    const filePath = path.startsWith('/') ? path.slice(1) : path;

    // 仓库名格式 owner/repo，需要分别编码保留中间的 /
    const repoEncoded = encodeRepoPath(repo);

    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'EdgeOne-Pages-Uploader',
      'Content-Type': 'application/json',
    };

    let overwritten = false;

    // 先尝试获取文件 SHA（检查是否已存在）
    let existingSha = null;
    try {
      const getRes = await fetch(
        `https://api.github.com/repos/${repoEncoded}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(branchName)}`,
        { headers }
      );
      if (getRes.ok) {
        const fileData = await getRes.json();
        existingSha = fileData.sha;
        overwritten = true;
      }
    } catch (_) {
      // 文件不存在，正常创建
    }

    // 构造请求体
    const payload = {
      message: commitMessage,
      content: content,
      branch: branchName,
    };

    if (existingSha) {
      payload.sha = existingSha;
    }

    // 创建或更新文件
    const putUrl = `https://api.github.com/repos/${repoEncoded}/contents/${encodeURIComponent(filePath)}`;
    const putRes = await fetch(putUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await putRes.json();

    if (putRes.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          path: filePath,
          repo: repo,
          branch: branchName,
          overwritten: overwritten,
          url: result.content?.html_url || `https://github.com/${repo}/blob/${branchName}/${filePath}`,
          sha: result.content?.sha,
        }),
        { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } }
      );
    } else {
      let errMsg = result.message || '上传失败';
      if (putRes.status === 409) errMsg = '文件冲突：' + errMsg;
      if (putRes.status === 404) errMsg = '仓库或分支不存在：' + errMsg;
      if (putRes.status === 422) errMsg = '请求参数错误：可能分支不存在或路径无效';
      return new Response(
        JSON.stringify({ error: errMsg }),
        { status: putRes.status, headers: corsHeaders() }
      );
    }
  } catch (e) {
    return new Response(
      JSON.stringify({ error: '服务器错误: ' + e.message }),
      { status: 500, headers: corsHeaders() }
    );
  }
}

function encodeRepoPath(repo) {
  const parts = repo.split('/');
  return parts.map(p => encodeURIComponent(p)).join('/');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
