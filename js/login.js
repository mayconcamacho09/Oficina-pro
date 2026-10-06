document.addEventListener("DOMContentLoaded", function () {
    const loginForm=document.getElementById("loginForm");
    if(!loginForm)return;
    loginForm.addEventListener("submit", async function(event){
        event.preventDefault();
        const usuario=document.getElementById("usuario").value.trim();
        const senha=document.getElementById("senha").value;
        const mensagem=document.getElementById("loginMensagem");
        try{
            if(!window.oficinaAPI) throw new Error("Servidor não carregado.");
            const u=await window.oficinaAPI.login(usuario,senha);
            mensagem.textContent="Login realizado! Entrando..."; mensagem.style.color="#16a34a";
            setTimeout(()=>window.location.href="dashboard.html",250);
        }catch(e){
            mensagem.textContent=e.message||"Usuário ou senha incorretos."; mensagem.style.color="#dc2626";
        }
    });
});
