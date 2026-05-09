// One-off explorer: print the Dropbox folder tree using the same credentials
// the worker uses. Run with: cd backend && node explore-dropbox.js
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

async function getAccessToken() {
  if (process.env.DROPBOX_REFRESH_TOKEN && process.env.DROPBOX_APP_KEY && process.env.DROPBOX_APP_SECRET) {
    const r = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
        client_id: process.env.DROPBOX_APP_KEY,
        client_secret: process.env.DROPBOX_APP_SECRET,
      }),
    });
    if (!r.ok) throw new Error(`token refresh ${r.status} ${await r.text()}`);
    const j = await r.json();
    return j.access_token;
  }
  if (process.env.DROPBOX_ACCESS_TOKEN) return process.env.DROPBOX_ACCESS_TOKEN;
  throw new Error('No Dropbox credentials in .env');
}

async function dbxApi(token, endpoint, body) {
  const r = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${endpoint} ${r.status} ${await r.text()}`);
  return r.json();
}

async function listFolder(token, path) {
  const entries = [];
  let res = await dbxApi(token, 'files/list_folder', { path, recursive: false, include_non_downloadable_files: false });
  entries.push(...res.entries);
  while (res.has_more) {
    res = await dbxApi(token, 'files/list_folder/continue', { cursor: res.cursor });
    entries.push(...res.entries);
  }
  return entries;
}

async function tree(token, path, depth, maxDepth) {
  let entries;
  try {
    entries = await listFolder(token, path);
  } catch (e) {
    console.log(`${'  '.repeat(depth)}[ERROR ${path}] ${e.message.split('\n')[0]}`);
    return;
  }
  const folders = entries.filter(e => e['.tag'] === 'folder').sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter(e => e['.tag'] === 'file');
  const imgFiles = files.filter(e => /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(e.name));
  console.log(`${'  '.repeat(depth)}${path === '' ? '/' : path.split('/').pop()}/  (${folders.length} folders, ${imgFiles.length} images, ${files.length - imgFiles.length} other)`);
  if (depth >= maxDepth) return;
  for (const f of folders) {
    await tree(token, f.path_display, depth + 1, maxDepth);
  }
}

(async () => {
  const token = await getAccessToken();
  console.log('Account:', (await dbxApi(token, 'users/get_current_account', null)).email);
  console.log('---');
  await tree(token, '', 0, 4);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
