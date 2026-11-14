Skip to content
decap-proxy
Repository navigation
Code
Pull requests
Agents
Commit 976995d
goodmind1363-netizen
goodmind1363-netizen
authored
5 minutes ago
·
·
Verified
Refactor OAuth handling and improve code structure
main
1 parent 
2b7bb63
 commit 
976995d
1 file changed

+90
-67
Lines changed: 90 additions & 67 deletions
Search within code
 
‎src/index.ts‎
Original file line number	Diff line number	Diff line change
@@ -1,53 +1,64 @@
import { OAuthClient } from './oauth';

interface Env {
	GITHUB_OAUTH_ID: string;
	GITHUB_OAUTH_SECRET: string;
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
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const createOAuth = (env: Env) => {
	return new OAuthClient({
		id: env.GITHUB_OAUTH_ID,
		secret: env.GITHUB_OAUTH_SECRET,
		target: {
			tokenHost: 'https://github.com',
			tokenPath: '/login/oauth/access_token',
			authorizePath: '/login/oauth/authorize',
		},
	});
  return new OAuthClient({
    id: env.GITHUB_OAUTH_ID,
    secret: env.GITHUB_OAUTH_SECRET,
    target: {
      tokenHost: 'https://github.com',
      tokenPath: '/login/oauth/access_token',
      authorizePath: '/login/oauth/authorize',
    },
  });
};

const handleAuth = async (url: URL, env: Env) => {
	const provider = url.searchParams.get('provider');
	if (provider !== 'github') {
		return new Response('Invalid provider', { status: 400 });
	}
  const repoIsPrivate = env.GITHUB_REPO_PRIVATE != undefined && env.GITHUB_REPO_PRIVATE !== '0';
  const repoScope = repoIsPrivate ? 'repo,user' : 'public_repo,user';
	const oauth2 = createOAuth(env);
	const authorizationUri = oauth2.authorizeURL({
		redirect_uri: `https://${url.hostname}/callback?provider=github`,
		scope: repoScope,
		state: randomHex(4), // 4 bytes -> 8 hex chars
	});
	return new Response(null, { headers: { location: authorizationUri }, status: 301 });
  const provider = url.searchParams.get('provider');
  if (provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }
  const repoIsPrivate =
    env.GITHUB_REPO_PRIVATE != undefined &&
    env.GITHUB_REPO_PRIVATE !== '0';
  const repoScope = repoIsPrivate
    ? 'repo,user'
    : 'public_repo,user';
  const oauth2 = createOAuth(env);
  const authorizationUri = oauth2.authorizeURL({
    redirect_uri: `https://${url.hostname}/callback`,
    scope: repoScope,
    state: randomHex(4),
  });
  return new Response(null, {
    headers: { location: authorizationUri },
    status: 302,
  });
};

const callbackScriptResponse = (status: string, token: string) => {
	return new Response(
		`
  return new Response(
    `
<html>
<head>
  <script>
@@ -57,49 +68,61 @@ const callbackScriptResponse = (status: string, token: string) => {
        '*'
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    };
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:github", "*");
  </script>
  <body>
    <p>Authorizing Decap...</p>
  </body>
</head>
<body>
  <p>Authorizing Decap...</p>
</body>
</html>
`,
		{ headers: { 'Content-Type': 'text/html' } }
	);
    {
      headers: { 'Content-Type': 'text/html' },
    }
  );
};

const handleCallback = async (url: URL, env: Env) => {
	const provider = url.searchParams.get('provider');
	if (provider !== 'github') {
		return new Response('Invalid provider', { status: 400 });
	}
	const code = url.searchParams.get('code');
	if (!code) {
		return new Response('Missing code', { status: 400 });
	}
	const oauth2 = createOAuth(env);
	const accessToken = await oauth2.getToken({
		code,
		redirect_uri: `https://${url.hostname}/callback?provider=github`,
	});
	return callbackScriptResponse('success', accessToken);
  const provider = url.searchParams.get('provider') ?? 'github';
  if (provider !== 'github') {
    return new Response('Invalid provider', { status: 400 });
  }
  const code = url.searchParams.get('code');
  if (!code) {
    return new Response('Missing code', { status: 400 });
  }
  const oauth2 = createOAuth(env);
  const accessToken = await oauth2.getToken({
    code,
    redirect_uri: `https://${url.hostname}/callback`,
  });
  return callbackScriptResponse('success', accessToken);
};

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
    console.log(`url.pathname is ${url.pathname}`);
		if (url.pathname === '/auth') {
			return handleAuth(url, env);
		}
		if (url.pathname === '/callback') {
			return handleCallback(url, env);
		}
		return new Response('Hello 👋');
	},
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/auth') {
      return handleAuth(url, env);
    }
    if (url.pathname === '/callback') {
      return handleCallback(url, env);
    }
    return new Response('Hello 👋');
  },
};
0 commit comments
Comments
0
 (0)
Comment
You're not receiving notifications from this thread.

