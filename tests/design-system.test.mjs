import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
const base=new URL("../public/",import.meta.url);
const html=readFileSync(new URL("index.html",base),"utf8");
const css=readFileSync(new URL("novagente-design-system.css",base),"utf8");
const icons=readFileSync(new URL("novagente-design-icons.js",base),"utf8");
test("Design System global is loaded after prior theme and dashboard layers",()=>{
 const ds=html.indexOf('novagente-design-system.css?v=');
 assert.ok(ds>html.indexOf('novagente-approved-home.css?v='),"global style layer must be last");
 assert.ok(ds>html.indexOf('novagente-contrast-audit.css?v='));
 assert.ok(ds>0);
});
test("Font tokens and unified controls apply to all modules and dialogs",()=>{
 for(const phrase of ["--ne-ui-font","--ne-type-display","--ne-type-body","--ne-control-h",
  ".view:not(#dashboard)","dialog",".modalForm",".sidebar.ne-rail-sidebar",
  ".bw-submenu",".ne-filter-group",".ne-action-card",".ne-finance-action",
  ".hubCard",".ne-owner-kpi",".ne-stock-product",".ne-agenda-card"]){
  assert.ok(css.includes(phrase),phrase+" missing from global design system");
 }
});
test("Both themes have dedicated palette and enough visual role variables",()=>{
 for(const theme of ['html[data-ne-theme="light"]','html[data-ne-theme="dark"]'])assert.ok(css.includes(theme));
 for(const role of ["--ne-ui-fg","--ne-ui-muted","--ne-ui-edge","--ne-ui-panel","--ne-pastel-violet","--ne-pastel-green"])assert.ok(css.includes(role));
});
test("Pictograms are SVG (not dependent on external icon service)",()=>{
 assert.ok(icons.includes("createElementNS"));
 assert.ok(icons.includes("aria-hidden"));
 assert.ok(icons.includes("neIconEnhanced"));
 assert.ok(html.includes('novagente-design-icons.js?v='));
});
test("Mobile and keyboard accessibility adjustments exist",()=>{
 assert.ok(css.includes("@media(max-width:570px)"));
 assert.ok(css.includes("@media(max-width:900px)"));
 assert.ok(css.includes(":focus-visible"));
 assert.ok(css.includes("prefers-reduced-motion"));
 assert.ok(css.includes("min-height:var(--ne-control-h)"));
});