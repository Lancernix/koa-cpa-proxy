import Koa from 'koa';

// Create Koa application
const app = new Koa();

// 默认超时 120秒 (2分钟，EO最大支持)
const TIMEOUT_MS = parseInt(process.env.TIMEOUT_MS || '120000', 10);

/**
 * 从 Node.js IncomingMessage stream 读取 body
 * 这是纯原生 Node.js 方法，无需任何中间件
 */
function readRequestBody(req, maxSize = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const maxSizeBuffer = maxSize;

    req.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length > maxSizeBuffer) {
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        reject(new Error(`Request body exceeds ${maxSize} bytes limit`));
      }
    });

    req.on('end', () => {
      resolve(data.length > 0 ? data : null);
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * 带超时的 fetch 函数
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      eo: {
        stream: true,          // 保留，SSE流式核心，不动
        cache: { enable: false }, // 保留，禁用缓存，不动
        timeoutSetting: {
          // 仅改这两个数值：60000 → 120000（毫秒），其他不动
          readTimeout: 120000,  
          writeTimeout: 120000 
        }
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

/**
 * 代理请求函数
 */
async function proxyToService(targetUrl, method, headers, bodyBuffer) {
  const proxyHeaders = new Headers(headers);
  proxyHeaders.delete('host');
  proxyHeaders.set('origin', targetUrl.origin);
  proxyHeaders.set('referer', targetUrl.origin + '/');
  proxyHeaders.set('Connection', 'keep-alive');

  const options = {
    method,
    headers: proxyHeaders,
    redirect: 'manual',
  };

  // 只在有 body 时才添加 body 参数
  if (bodyBuffer && bodyBuffer.length > 0) {
    options.body = bodyBuffer;
  }

  return await fetchWithTimeout(targetUrl, options, TIMEOUT_MS);
}

/**
 * 构建目标 URL
 */
function buildTargetUrl(baseDomain, pathname, search) {
  const domain = baseDomain.replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : '/' + pathname;
  return new URL(domain + path + search);
}

/**
 * 判断是否需要重试（5xx 错误）
 */
function shouldRetry(response) {
  return response.status >= 500;
}

/**
 * CORS 中间件
 */
app.use(async (ctx, next) => {
  // 处理 OPTIONS 请求
  if (ctx.method === 'OPTIONS') {
    ctx.status = 204;
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS');
    ctx.set('Access-Control-Allow-Headers', '*');
    return;
  }

  await next();

  // 为所有响应添加 CORS 头
  ctx.set('Access-Control-Allow-Origin', '*');
});

/**
 * 日志中间件
 */
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[Proxy] ${ctx.method} ${ctx.path} -> ${ctx.status} (${duration}ms)`);
});

/**
 * 主要的转发逻辑中间件
 */
app.use(async (ctx) => {
  const SERVICE_1 = process.env.SERVICE_1;
  const SERVICE_2 = process.env.SERVICE_2;

  if (!SERVICE_1 || !SERVICE_2) {
    ctx.status = 500;
    ctx.type = 'application/json';
    ctx.body = {
      error: 'Error: SERVICE_1 and SERVICE_2 must be set.',
    };
    return;
  }

  try {
    const pathname = ctx.path;
    const search = ctx.querystring ? '?' + ctx.querystring : '';

    // 使用原生 Node.js stream 读取请求体
    let bodyBuffer = null;
    if (ctx.method !== 'GET' && ctx.method !== 'HEAD') {
      try {
        // ctx.req 是原生的 Node.js IncomingMessage
        bodyBuffer = await readRequestBody(ctx.req);
      } catch (e) {
        console.error('[Proxy] Failed to read request body', e);
        ctx.status = 400;
        ctx.type = 'application/json';
        ctx.body = { error: 'Invalid request body' };
        return;
      }
    }

    // 负载均衡选择
    const services = [SERVICE_1, SERVICE_2];
    const primaryIdx = Math.floor(Math.random() * 2);
    const primaryService = services[primaryIdx];
    const backupService = services[1 - primaryIdx];

    console.log(`[Proxy] ${ctx.method} ${pathname} -> Primary: ${primaryService}`);

    // 尝试首选服务
    let targetUrl = buildTargetUrl(primaryService, pathname, search);
    let response;
    let primaryError = null;
    
    const t1 = Date.now();
    let duration1 = 0;

    try {
      response = await proxyToService(targetUrl, ctx.method, ctx.headers, bodyBuffer);
      duration1 = Date.now() - t1;

      if (shouldRetry(response)) {
        console.warn(`[Proxy] Primary returned ${response.status} (${duration1}ms), switching to backup...`);
        response = null;
      } else {
        console.log(`[Proxy] Primary succeeded: ${response.status} (${duration1}ms)`);
      }
    } catch (error) {
      duration1 = Date.now() - t1;
      console.error(`[Proxy] Primary failed (${duration1}ms): ${error.message}`);
      primaryError = error;
      response = null;
    }

    // 尝试备用服务 (如果首选失败)
    if (!response) {
      console.log(`[Proxy] Attempting backup: ${backupService}`);
      targetUrl = buildTargetUrl(backupService, pathname, search);
      
      const t2 = Date.now();
      let duration2 = 0;

      try {
        response = await proxyToService(targetUrl, ctx.method, ctx.headers, bodyBuffer);
        duration2 = Date.now() - t2;
        console.log(`[Proxy] Backup succeeded: ${response.status} (${duration2}ms)`);
      } catch (error) {
        duration2 = Date.now() - t2;
        console.error(`[Proxy] Backup also failed (${duration2}ms): ${error.message}`);
        
        ctx.status = 503;
        ctx.type = 'application/json';
        ctx.body = {
          error: 'Service Unavailable: Both upstreams failed.',
          details: {
            primary: `${primaryError?.message || '5xx Error'} (${duration1}ms)`,
            backup: `${error.message} (${duration2}ms)`,
          },
        };
        return;
      }
    }

    // 透传响应
    ctx.status = response.status;
    
    // 复制响应头，删除某些不需要的头
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    for (const [key, value] of responseHeaders) {
      ctx.set(key, value);
    }

    // 使用原生 Node.js 方式处理响应体
    // response.body 是一个 ReadableStream，可以直接赋给 ctx.body
    ctx.body = response.body;

  } catch (error) {
    console.error('[Proxy Internal Error]', error);
    ctx.status = 500;
    ctx.type = 'application/json';
    ctx.body = { error: error.message };
  }
});

// Export Koa instance
export default app;
