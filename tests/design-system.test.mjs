import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../public/",import.meta.url);
const html=readFileSync(new URL("index.html",base),"utf8");
const tokens=readFileSync(new URL("tokens.css",base),"utf8");
const components=readFileSync(new URL("novagente-components.css",base),"utf8");
// Interface Novagente: tokens.css + styles.css definem tema e layout;
// novagente-components.css só estiliza os componentes funcionais (ne-*).
test("Design tokens load first and component layer follows the base styles",()=>{
 const t=html.indexOf('href="/tokens.css"'),s=html.indexOf('href="/styles.css"'),c=html.indexOf('novagente-components.css?v=');
 assert.ok(t>0&&s>t&&c>s,"tokens → styles → components");
});
test("Old visual layers that redraw the menu and home are not loaded",()=>{
 for(const f of ["beauty-ui.js","novagente-experience.js","novagente-sidebar.js","novagente-theme.js","novagente-design-system.css","novagente-density-compact.css","novagente-approved-home.css"])
  assert.equal(html.includes(f),false,f+" must not be loaded");
});
test("Both themes are defined by tokens, with an automatic mode",()=>{
 assert.ok(tokens.includes('[data-theme="dark"]'));
 assert.ok(tokens.includes("prefers-color-scheme: dark"));
 for(const role of ["--nv-ink","--nv-surface","--nv-line","--nv-primary"])assert.ok(tokens.includes(role),role);
});
test("Functional components are styled without layout overrides",()=>{
 for(const c of [".ne-finance-action",".ne-marketing-card",".ne-owner-kpi",".ne-stock-product",".ne-mfa-box"])assert.ok(components.includes(c),c);
 assert.equal(/(^|[},\s])\.(sidebar|shell|topbar)\b/.test(components),false,"no menu/layout rules");
 for(const v of ["--ne-surface","--ne-outline","--ne-text"])assert.ok(components.includes(v+":var(--nv-"),v+" mapped to tokens");
});
test("Navigation icons are inline SVG and decorative",()=>{
 const nav=html.slice(html.indexOf('<nav aria-label="Menu principal"'),html.indexOf("</nav>"));
 assert.ok(nav.includes("<svg"));
 assert.ok(nav.includes('aria-hidden="true"'));
});
