import {writeFile} from 'node:fs/promises';
const origin=process.env.SITE_URL;
if(!origin){console.error('SITE_URL requis : URL HTTPS réelle du site à publier.');process.exit(1)}
const site=new URL(origin);if(site.protocol!=='https:')throw new Error('SITE_URL doit utiliser HTTPS');
const pages=['index','about','services','projects','quote','contact','legal',...['water','electric','heat','pool','smoke','solar','pump','air','vent','garden','fire','gas'].map(id=>'service?id='+id)];
const esc=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
const entries=pages.flatMap(p=>{let [name,q]=p.split('?');return ['fr','ar'].map(lang=>{const suffix=q?'&'+q:'';return `<url><loc>${esc(new URL(name+'.html?lang='+lang+suffix,site).href)}</loc>${['fr','ar'].map(l=>`<xhtml:link rel="alternate" hreflang="${l}" href="${esc(new URL(name+'.html?lang='+l+suffix,site).href)}"/>`).join('')}</url>`})});
await writeFile('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'+entries.join('\n')+'\n</urlset>\n');await writeFile('robots.txt',`User-agent: *\nAllow: /\nSitemap: ${new URL('sitemap.xml',site).href}\n`);console.log('Sitemap et robots générés pour '+site.origin);
