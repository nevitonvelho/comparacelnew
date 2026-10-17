import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const envFile = path.resolve('.env.local');
const raw = process.env.SEARCH_CONSOLE_CREDENTIALS_JSON || await readFile(process.env.SEARCH_CONSOLE_CREDENTIALS_FILE || process.argv[2] || '', 'utf8');
const credentials = JSON.parse(raw);
const client = credentials.installed || credentials.web;
if (!client?.client_id || !client.client_secret) throw new Error('Use credenciais de cliente OAuth para executar este assistente.');
const state = randomBytes(32).toString('base64url');
const verifier = randomBytes(48).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
let redirect;
let processing = false;
const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', redirect);
  if (url.pathname !== '/oauth/callback') { response.writeHead(404).end(); return; }
  const received = Buffer.from(url.searchParams.get('state') || '');
  const expected = Buffer.from(state);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) { response.writeHead(400).end('Estado inválido.'); return; }
  if (url.searchParams.has('error')) { response.writeHead(400).end('Autorização não concluída. Pode fechar esta janela.'); console.log('A conta não autorizou a conexão. Nenhum token foi gravado.'); close(); return; }
  const code = url.searchParams.get('code');
  if (!code || processing) { response.writeHead(400).end('Pedido inválido.'); return; }
  processing = true;
  try {
    const result = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code, code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }), signal: AbortSignal.timeout(20000) });
    const tokens = await result.json();
    if (!result.ok || !tokens.refresh_token) throw new Error('O Google não forneceu um token renovável. Autorize novamente com consentimento.');
    const sitesResponse = await fetch('https://www.googleapis.com/webmasters/v3/sites', { headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(20000) });
    if (!sitesResponse.ok) throw new Error('A API do Search Console recusou o acesso. Confira se a API está ativa e se a conta tem acesso à propriedade.');
    const sites = await sitesResponse.json();
    const property = process.env.SEARCH_CONSOLE_PROPERTY || 'sc-domain:comparacel.com.br';
    if (!sites.siteEntry?.some(site => site.siteUrl === property && site.permissionLevel !== 'siteUnverifiedUser')) throw new Error('A conta não tem acesso à propriedade configurada. Confira SEARCH_CONSOLE_PROPERTY.');
    let env = await readFile(envFile, 'utf8').catch(() => '');
    const values = { SEARCH_CONSOLE_REFRESH_TOKEN: tokens.refresh_token, SEARCH_CONSOLE_CREDENTIALS_JSON: raw.replace(/\r?\n/g, ''), SEARCH_CONSOLE_PROPERTY: property };
    for (const [key, value] of Object.entries(values)) {
      env = env.split('\n').filter(line => !line.startsWith(`${key}=`)).join('\n').replace(/\n*$/, '');
      env += `\n${key}=${value}\n`;
    }
    await writeFile(envFile, env, { mode: 0o600 });
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" }).end('<h1>Search Console conectado</h1><p>Você pode fechar esta janela e voltar ao Comparacel. Reinicie o servidor local para carregar a autorização.</p>');
    console.log('Search Console conectado à propriedade configurada. Credenciais e token gravados apenas em .env.local. Nenhum segredo foi exibido.');
    close();
  } catch (error) {
    response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não foi possível concluir a conexão. Consulte o terminal e tente novamente.');
    console.error(error instanceof Error ? error.message : 'Falha na autorização.'); close();
  }
});
const timer = setTimeout(() => { console.log('Tempo de autorização encerrado. Execute novamente quando quiser conectar.'); server.close(); }, 15 * 60 * 1000);
function close() { clearTimeout(timer); server.close(); }
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  redirect = `http://127.0.0.1:${address.port}/oauth/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirect, response_type: 'code', scope: 'https://www.googleapis.com/auth/webmasters.readonly', access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  console.log('Autorize a conta com acesso ao Comparacel no link abaixo (válido por 15 minutos):');
  console.log(url.href);
});
