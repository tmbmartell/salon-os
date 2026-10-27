// Proteções HTTP para o piloto: origem do navegador, requisições simples CSRF e IP confiável.
// Quando há proxy, definir NOVAGENTE_PUBLIC_ORIGIN no servidor; não confiar em
// X-Forwarded-* de visitantes externos para autenticação ou limitação de tráfego.
import net from "node:net";
const validProtocol=new Set(["http:","https:"]);
function socketIsLoopback(req){
  const ip=String(req.socket?.remoteAddress||"");
  return ip==="127.0.0.1"||ip==="::1"||ip==="::ffff:127.0.0.1";
}
export function trustedProxy(req){
  return process.env.NOVAGENTE_TRUST_PROXY==="true"&&socketIsLoopback(req);
}
export function requestIp(req){
  const direct=String(req.socket?.remoteAddress||"unknown");
  if(!trustedProxy(req))return direct;
  const forwarded=String(req.headers["x-forwarded-for"]||"").split(",")[0].trim();
  return net.isIP(forwarded)?forwarded:direct;
}
export function requestIsSecure(req){
  if(req.socket?.encrypted)return true;
  return trustedProxy(req)&&String(req.headers["x-forwarded-proto"]||"").split(",")[0].trim().toLowerCase()==="https";
}
export function browserMutationAllowed(req,url){
  if(["GET","HEAD","OPTIONS"].includes(req.method||"GET"))return true;
  if(url.pathname==="/api/whatsapp/waha/webhook")return true; // HMAC em rota própria
  const fetchSite=String(req.headers["sec-fetch-site"]||"").toLowerCase();
  if(fetchSite==="cross-site"||fetchSite==="same-site")return false;
  const origin=req.headers.origin;
  const definedOrigin=process.env.NOVAGENTE_PUBLIC_ORIGIN;
  if(origin){
    let parsed;try{parsed=new URL(String(origin))}catch{return false}
    if(!validProtocol.has(parsed.protocol)||parsed.username||parsed.password||parsed.pathname!=="/"||parsed.search||parsed.hash)
      return false;
    if(definedOrigin)return parsed.origin===definedOrigin;
    return parsed.host===String(req.headers.host||"")&&
      (requestIsSecure(req)?parsed.protocol==="https:":parsed.protocol==="http:");
  }
  // JSON não é uma requisição simples de formulários de terceiros e exige
  // preflight para origens externas; o servidor não habilita CORS.
  // Exigir esse tipo em POST/PATCH/PUT com corpo, inclusive em clientes antigos
  // sem cabeçalhos Origin e Sec-Fetch-Site.
  const length=Number(req.headers["content-length"]||0);
  const hasBody=length>0||!!req.headers["transfer-encoding"];
  if(hasBody&&!/^application\/json(?:\s*;|\s*$)/i.test(String(req.headers["content-type"]||"")))
    return false;
  return true;
}
