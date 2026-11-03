/* NOVAGENTE Estética — escolha de tema, restrita a este navegador. */
(()=>{"use strict";
const KEY="novagente-estetica-theme-v1";
const valid=new Set(["light","dark"]);
function read(){try{return localStorage.getItem(KEY)}catch{return null}}
function save(value){try{localStorage.setItem(KEY,value)}catch{}}
function setTheme(theme,persist=true){
 const chosen=valid.has(theme)?theme:"light";
 document.documentElement.dataset.neTheme=chosen;
 document.documentElement.style.colorScheme=chosen;
 document.querySelectorAll("[data-ne-theme]").forEach(button=>{
  const selected=button.dataset.neTheme===chosen;
  button.setAttribute("aria-pressed",String(selected));
  button.classList.toggle("is-selected",selected);
 });
 const state=document.getElementById("neThemeState");
 if(state)state.textContent=chosen==="dark"?"Escuro":"Claro";
 if(persist)save(chosen);
}
function button(theme,label,symbol){
 const b=document.createElement("button");
 b.type="button";b.className="ne-theme-option";b.dataset.neTheme=theme;
 b.textContent=symbol+" "+label;b.setAttribute("aria-label","Ativar tema "+label.toLowerCase());
 b.addEventListener("click",()=>setTheme(theme));
 return b;
}
function install(){
 if(document.getElementById("neThemeSwitcher"))return;
 const container=document.createElement("div");container.id="neThemeSwitcher";
 container.className="ne-theme-switcher";container.setAttribute("role","group");
 container.setAttribute("aria-label","Aparência do sistema");
 const title=document.createElement("span");title.className="ne-theme-label";title.textContent="Aparência";
 const choices=document.createElement("div");choices.className="ne-theme-options";
 choices.append(button("light","Claro","☀"),button("dark","Escuro","☾"));
 container.append(title,choices);
 const topbar=document.querySelector(".topbar");
 if(topbar)topbar.insertBefore(container,topbar.querySelector("#quickAppointment"));
 else document.querySelector("main")?.prepend(container);
 const footer=document.querySelector(".sidefoot");
 if(footer){
  const small=document.createElement("button");small.type="button";small.id="neThemeRailButton";
  small.className="ne-theme-rail-trigger";small.title="Alternar tema claro ou escuro";
  small.setAttribute("aria-label","Alternar tema");small.textContent="◐";
  small.addEventListener("click",()=>setTheme(document.documentElement.dataset.neTheme==="dark"?"light":"dark"));
  footer.prepend(small);
 }
 setTheme(read()==="dark"?"dark":"light",false);
}
setTheme(read()==="dark"?"dark":"light",false);
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();