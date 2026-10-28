import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const base=new URL("../public/",import.meta.url);
const html=readFileSync(new URL("index.html",base),"utf8");
const css=readFileSync(new URL("novagente-density-compact.css",base),"utf8");
test("Global compact density is the last stylesheet",()=>{
 const compact=html.indexOf("novagente-density-compact.css?v=");
 const design=html.indexOf("novagente-design-system.css?v=");
 const home=html.indexOf("novagente-approved-home.css?v=");
 assert.ok(compact>design&&compact>home,"compact stylesheet must follow global design and home");
});
test("A single density token and scales apply to Home, modules, navigation and modals",()=>{
 for(const required of ["--ne-density:0.90","--ne-type-body:14px",
 "html #dashboard .ne-v3-hero","html #dashboard .ne-v3-tile",
 "html[data-ne-theme] .view:not(#dashboard)>.sectionTitle",
 ".ne-action-card",".ne-finance-action",".bw-submenu",
 ".modalForm","dialog",".sidebar.ne-rail-sidebar"])assert.ok(css.includes(required),required);
});
test("Compact design preserves tap-target size and responsive layouts",()=>{
 assert.match(css,/--ne-control-h:44px/);
 assert.match(css,/@media\(max-width:570px\)/);
 assert.match(css,/@media\(min-width:571px\) and \(max-width:900px\)/);
 assert.match(css, /min-height:var\(--ne-control-h\)/);
 assert.match(css,/prefers-reduced-motion/);
});
test("No visual zoom or transforms are used on the whole app",()=>{
 assert.equal(/(?:^|[;\s{])zoom\s*:/.test(css),false);
 assert.equal(/\.shell\s*\{[^}]*transform\s*:/s.test(css),false);
});