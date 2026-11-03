(() => {
  // Mostra o aviso no login e em todas as telas, sem depender de autenticação.
  const notice=document.getElementById("freePreviewNotice");
  if(!notice)return;
  fetch("/api/health",{credentials:"omit",cache:"no-store"})
    .then(response=>response.ok?response.json():null)
    .then(health=>{
      if(!health?.disposable_demo)return;
      notice.hidden=false;
      document.body.classList.add("is-free-preview");
      document.title="DEMO GRATUITA · NOVAGENTE Estética";
    })
    .catch(()=>{});
})();