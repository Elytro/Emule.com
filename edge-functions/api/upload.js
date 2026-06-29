/**
 * EdgeOne Pages Edge Function
 * 代理文件上传到 GitHub 仓库
 * 路由: /api/upload
 *
 * 环境变量:
 *   GITHUB_USERNAME — GitHub 用户名
 *   GITHUB_TOKEN    — GitHub Personal Access Token
 *
 * 限制：EdgeOne 边缘函数请求体上限约 1MB，建议上传文件不超过 800KB
 */

export default async function onRequest(context) {
  const { request, env } = context;
  const username = env.GITHUB_USERNAME;
  const token = env.GITHUB_TOKEN;

  // ── 校验环境变量 ──
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

  // ── 仅允许 POST ──
  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: '仅支持 POST 请求' }),
      {
        status: 405,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Allow': 'POST',
        },
      }
    );
  }

  try {
    // ── 解析 FormData ──
    const formData = await request.formData();
    const repo = formData.get('repo');
    const file = formData.get('file');
    const path = formData.get('path');
    const message = formData.get('message');
    const branch = formData.get('branch') || 'main';

    // ── 参数校验 ──
    if (!repo || !file || !path) {
      return new Response(
        JSON.stringify({
          error: '缺少必要参数',
          detail: 'repo、file、path 均为必填字段',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // 校验 file 是否为 File 对象
    if (typeof file === 'string' || !file.name) {
      return new Response(
        JSON.stringify({ error: '无效的文件对象' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const fileName = typeof path === 'string' ? path : file.name;
    const commitMessage =
      typeof message === 'string' && message.trim()
        ? message.trim()
        : `Upload ${fileName}`;

    // ── 读取文件并转为 Base64 ──
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 手动 Base64 编码（避免 btoa 对大文件的不稳定）
    let binaryStr = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binaryStr += String.fromCharCode(uint8Array[i]);
    }
    const base64Content = btoa(binaryStr);

    // ── 调用 GitHub API 创建/更新文件 ──
    const githubApiUrl = `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(fileName)}`;

    const ghResponse = await fetch(githubApiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'EdgeOne-Pages-App',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: commitMessage,
        content: base64Content,
        branch: branch,
      }),
    });

    const ghBody = await ghResponse.json();

    if (!ghResponse.ok) {
      // 409: 文件已存在，需要提供 sha 才能更新
      if (ghResponse.status === 409) {
        return new Response(
          JSON.stringify({
            error: '文件已存在',
            message: ghBody.message || 'A file with this path already exists in the repository.',
            detail: '如需覆盖已有文件，请先通过 GitHub 手动删除后再上传，或使用不同的文件路径。',
          }),
          {
            status: 409,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      // 422: 通常为参数校验失败（如分支不存在）
      if (ghResponse.status === 422) {
        return new Response(
          JSON.stringify({
            error: '请求无效',
            message: ghBody.message || 'Validation failed.',
            errors: ghBody.errors || [],
          }),
          {
            status: 422,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          }
        );
      }

      return new Response(
        JSON.stringify({
          error: `GitHub API 错误 (${ghResponse.status})`,
          message: ghBody.message || 'Unknown error',
        }),
        {
          status: ghResponse.status,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // ── 上传成功 ──
    return new Response(
      JSON.stringify({
        success: true,
        content: {
          name: ghBody.content.name,
          path: ghBody.content.path,
          sha: ghBody.content.sha,
          size: ghBody.content.size,
          html_url: ghBody.content.html_url,
          download_url: ghBody.content.download_url,
        },
        commit: {
          sha: ghBody.commit.sha,
          html_url: ghBody.commit.html_url,
          message: ghBody.commit.message,
        },
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `请求处理失败: ${err.message}` }),
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
