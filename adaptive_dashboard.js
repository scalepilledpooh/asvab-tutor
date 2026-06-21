"use strict";
(function(){
  const keyInput = document.getElementById("dashboardKey");
  const btn = document.getElementById("dashboardBtn");
  if(!keyInput || !btn) return;
  try { keyInput.value = localStorage.getItem("afqtDashboardKey") || ""; } catch {}
  btn.addEventListener("click", () => {
    const key = (keyInput.value || "").trim();
    if(!key){
      alert("Enter the tutor dashboard key first. It should match the Vercel TUTOR_KEY environment variable.");
      keyInput.focus();
      return;
    }
    try { localStorage.setItem("afqtDashboardKey", key); } catch {}
    window.location.href = "/api/sessions?key=" + encodeURIComponent(key);
  });
})();
