import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("o logotipo incorporado corresponde a um arquivo WebP válido", () => {
  const svg=fs.readFileSync(new URL("../public/novagente-logo.svg",import.meta.url),"utf8");
  assert.match(svg,/aria-label="NOVAGENTE"/);
  const match=svg.match(/href="data:image\/webp;base64,([^"]+)"/);
  assert.ok(match,"Imagem otimizada ausente");
  const bytes=Buffer.from(match[1],"base64");
  assert.equal(bytes.toString("ascii",0,4),"RIFF");
  assert.equal(bytes.toString("ascii",8,12),"WEBP");
  assert.ok(bytes.length>1000);
});
