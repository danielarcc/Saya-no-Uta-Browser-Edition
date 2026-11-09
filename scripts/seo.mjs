import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const site = process.env.SITE_URL?.trim();
if (!site) {
  console.info('SITE_URL not set: canonical URL and sitemap were not generated.');
  process.exit(0);
}

let url;
try {
  url = new URL(site);
} catch {
  throw new Error('SITE_URL must be a valid absolute HTTPS URL.');
}
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
  throw new Error('SITE_URL must be an HTTPS URL without credentials, query or fragment.');
}
url.pathname = url.pathname.replace(/\/+$/, '') + '/';
const canonical = url.href;
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
const output = resolve('dist');
const htmlPath = resolve(output, 'index.html');
let html = await readFile(htmlPath, 'utf8');
const tags = `<link rel="canonical" href="${escapeHtml(canonical)}" /><meta property="og:url" content="${escapeHtml(canonical)}" />`;
html = html.replace('</head>', `${tags}</head>`);
const ld = /<script type="application\/ld\+json">([^<]*)<\/script>/;
html = html.replace(ld, (_, value) => {
  const data = JSON.parse(value);
  data.url = canonical;
  return `<script type="application/ld+json">${JSON.stringify(data).replaceAll('<', '\\u003c')}</script>`;
});
await writeFile(htmlPath, html);
await writeFile(resolve(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeXml(canonical)}</loc></url></urlset>\n`);
await writeFile(resolve(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${canonical}sitemap.xml\n`);
console.info(`SEO files configured for ${canonical}`);
