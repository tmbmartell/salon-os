// NOVAGENTE Estética — link único de acesso à recepção/profissionais.
// Lido somente do fragmento (#access=), que não é transmitido ao servidor ao abrir a página.
(() => {
  const token=new URLSearchParams(location.hash.slice(1)).get("access");
  if(!token)return;
  history.replaceState(null,"",location.pathname+location.search);
  const gate=document.querySelector("#authGate");
  const card=gate?.querySelector(".authCard");
  if(!card)return;
  gate.classList.remove("hidden");
  const notice=document.createElement("p");
  notice.setAttribute("role","status");
  notice.className="ne-stage8-help";
  notice.textContent="Validando seu link de acesso…";
  card.prepend(notice);
  fetch("/api/auth/access-link",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({token})
  }).then(async response=>{
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"access_link_invalid_or_expired");
    notice.textContent="Acesso autorizado. Abrindo seu painel…";
    location.replace(location.pathname+location.search);
  }).catch(()=>{
    notice.textContent="Este link expirou ou já foi utilizado. Peça um novo link ao proprietário do salão.";
  });
})();
