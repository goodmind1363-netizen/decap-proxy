
import { OAuthClient } from './oauth';

interface Env {
  GITHUB_OAUTH_ID: string;
  GITHUB_OAUTH_SECRET: string;
  GITHUB_REPO_PRIVATE?: string;
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);

  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function createOAuth(env: Env) {
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    throw new Error('GitHub OAuth credentials are missing.');
  }

  return new OAuthClient({
    id: env.GITHUB_OAUTH_ID,
    secret: env.GITHUB_OAUTH_SECRET,
    target: {
      tokenHost: 'https://github.com',
      tokenPath: '/login/oauth/access_token',
      authorizePath: '/login/oauth/authorize',
    },
  });
}

function errorResponse(message: string, status = 500) {
  console.error('ORVIKIT OAuth error:', message);

  return new Response(
    `<!doctype html>
<html>
<head><meta charset="utf-8"><title>ORVIKIT Authorization Error</title></head>
<body>
  <h2>Authorization failed</h2>
  <p>${message.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c))}</p>
  <p>Please close this window and try again.</p>
</body>
</html>`,
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
}

async function handleAuth(url: URL, env: Env) {
  if (url.searchParams.get('provider') !== 'github') {
    return errorResponse('Invalid OAuth provider.', 400);
  }

  const state = randomHex(16);

  const repoIsPrivate =
    env.GITHUB_REPO_PRIVATE === '1' ||
    env.GITHUB_REPO_PRIVATE === 'true';

  const scope = repoIsPrivate
    ? 'repo,user'
    : 'public_repo,user';

  const oauth = createOAuth(env);

  const authorizationUrl = oauth.authorizeURL({
    redirect_uri: `https://${url.hostname}/callback`,
    scope,
    state,
  });

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizationUrl,
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}

function callbackScriptResponse(token: string) {
  const message = JSON.stringify(
    'authorization:github:success:' +
    JSON.stringify({ token })
  );

  return new Response(
    `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ORVIKIT Authorization</title>
</head>
<body>
  <p>Authorizing Decap...</p>
  <script>
    (function () {
      if (!window.opener) {
        document.body.innerHTML = '<p>Please close this window and try again from ORVIKIT CMS.</p>';
        return;
      }

      var authorizationMessage = ${message};

      window.addEventListener('message', function (event) {
        if (event.data === 'authorizing:github') {
          window.opener.postMessage(
            authorizationMessage,
            event.origin
          );
          window.close();
        }
      });

      window.opener.postMessage('authorizing:github', '*');
    })();
  </script>
</body>
</html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/callback; Max-Age=0',
      },
    }
  );
}

async function handleCallback(request: Request, url: URL, env: Env) {
  const params = url.searchParams;

  if (params.get('error')) {
    return errorResponse(
      params.get('error_description') ||
      params.get('error') ||
      'GitHub authorization was denied.',
      400
    );
  }

  const code = params.get('code');
  const returnedState = params.get('state');

  if (!code || !returnedState) {
    return errorResponse('Missing authorization code or state.', 400);
  }

  const cookies = request.headers.get('Cookie') || '';
  const stateMatch = cookies.match(/(?:^|;\s*)oauth_state=([a-f0-9]+)/);
  const savedState = stateMatch?.[1];

  if (!savedState || savedState !== returnedState) {
    return errorResponse('Invalid OAuth state. Please try again.', 400);
  }

  const oauth = createOAuth(env);

  const accessToken = await oauth.getToken({
    code,
    redirect_uri: `https://${url.hostname}/callback`,
  });

  if (!accessToken) {
    return errorResponse('GitHub did not return an access token.');
  }

  return callbackScriptResponse(accessToken);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (url.pathname === '/auth') {
        return await handleAuth(url, env);
      }

      if (url.pathname === '/callback') {
        return await handleCallback(request, url, env);
      }

      if (url.pathname === '/favicon.ico') {
        return new Response(null, { status: 204 });
      }

      return new Response('ORVIKIT OAuth Worker is running.', {
        headers: { 'Cache-Control': 'no-store' },
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Unknown OAuth error';

      return errorResponse(message);
    }
  },
};
