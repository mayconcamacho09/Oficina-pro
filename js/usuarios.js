document.addEventListener("DOMContentLoaded", function () {

    inicializarUsuarios();
    carregarUsuarios();

    const form =
        document.getElementById("formUsuario");

    if (!form) {
        return;
    }

    form.addEventListener("submit", function (event) {

        event.preventDefault();

        cadastrarUsuario();

    });

});


// ==================================================
// OBTER USUÁRIOS
// ==================================================

function obterUsuarios() {

    try {

        const dados =
            localStorage.getItem("usuarios");

        if (!dados) {
            return [];
        }

        const usuarios =
            JSON.parse(dados);

        return Array.isArray(usuarios)
            ? usuarios
            : [];

    } catch (erro) {

        console.error(
            "Erro ao ler usuários:",
            erro
        );

        return [];

    }

}


// ==================================================
// SALVAR USUÁRIOS
// ==================================================

function salvarUsuarios(usuarios) {

    localStorage.setItem(
        "usuarios",
        JSON.stringify(usuarios)
    );

}


// ==================================================
// INICIALIZAR USUÁRIOS
// ==================================================

function inicializarUsuarios() {

    let usuarios =
        obterUsuarios();


    // Remove o antigo admin
    usuarios = usuarios.filter(function (usuario) {

        return !(
            usuario.usuario &&
            usuario.usuario.toLowerCase() === "admin"
        );

    });


    // Procura Maycon
    let maycon =
        usuarios.find(function (usuario) {

            return (
                usuario.usuario &&
                usuario.usuario.toLowerCase() === "maycon"
            );

        });


    // Cria Maycon caso não exista
    if (!maycon) {

        maycon = {

            id: 1,
            nome: "Maycon Camacho",
            usuario: "maycon",
            senha: "2007",
            perfil: "Administrador",
            principal: true

        };

        usuarios.unshift(maycon);

    }


    // Garante os dados do administrador principal
    maycon.id = 1;

    maycon.nome =
        maycon.nome || "Maycon Camacho";

    maycon.perfil =
        "Administrador";

    maycon.principal =
        true;


    // Nenhum outro pode ser administrador principal
    usuarios.forEach(function (usuario) {

        if (
            usuario.usuario &&
            usuario.usuario.toLowerCase() !== "maycon"
        ) {

            usuario.principal = false;

        }

    });


    salvarUsuarios(usuarios);

}


// ==================================================
// CADASTRAR USUÁRIO
// ==================================================

function cadastrarUsuario() {

    const nome =
        document.getElementById("nome").value.trim();

    const usuario =
        document.getElementById("usuario").value.trim();

    const senha =
        document.getElementById("senha").value;

    const perfil =
        document.getElementById("perfil").value;


    if (!nome || !usuario || !senha) {

        alert(
            "Preencha todos os campos."
        );

        return;

    }


    let usuarios =
        obterUsuarios();


    // Verifica usuário existente
    const existe =
        usuarios.some(function (item) {

            return (
                item.usuario &&
                item.usuario.toLowerCase() ===
                usuario.toLowerCase()
            );

        });


    if (existe) {

        alert(
            "Esse usuário já está cadastrado."
        );

        return;

    }


    // Usuário logado
    const usuarioLogado =
        localStorage.getItem(
            "loginUsuarioLogado"
        );


    const usuarioLogadoNormalizado =
        usuarioLogado
            ? usuarioLogado.toLowerCase()
            : "";


    // Somente Maycon pode criar Administradores
    if (
        perfil === "Administrador" &&
        usuarioLogadoNormalizado !== "maycon"
    ) {

        alert(
            "Somente o Administrador Principal pode cadastrar um Administrador."
        );

        return;

    }


    // Novo usuário
    const novoUsuario = {

        id: Date.now(),

        nome: nome,

        usuario: usuario,

        senha: senha,

        perfil: perfil,

        principal: false

    };


    usuarios.push(novoUsuario);


    // Salva imediatamente
    salvarUsuarios(usuarios);


    // Confirmação
    alert(
        "Usuário cadastrado com sucesso!"
    );


    // Limpa formulário
    document
        .getElementById("formUsuario")
        .reset();


    // Atualiza lista
    carregarUsuarios();

}


// ==================================================
// CARREGAR USUÁRIOS
// ==================================================

function carregarUsuarios() {

    const lista =
        document.getElementById(
            "listaUsuarios"
        );


    if (!lista) {
        return;
    }


    const usuarios =
        obterUsuarios();


    const usuarioLogado =
        localStorage.getItem(
            "loginUsuarioLogado"
        );


    const podeExcluir =
        usuarioLogado &&
        usuarioLogado.toLowerCase() === "maycon";


    lista.innerHTML = "";


    if (usuarios.length === 0) {

        lista.innerHTML =
            "<p>Nenhum usuário cadastrado.</p>";

        return;

    }


    usuarios.forEach(function (usuario) {

        const linha =
            document.createElement("div");

        linha.className =
            "usuario-item";


        const principal =
            usuario.usuario &&
            usuario.usuario.toLowerCase() === "maycon";


        let botaoExcluir = "";


        // Somente Maycon pode excluir
        // Maycon nunca pode excluir a própria conta
        if (
            podeExcluir &&
            !principal
        ) {

            botaoExcluir = `

                <button
                    class="btn-danger"
                    onclick="excluirUsuario(${usuario.id})">

                    Excluir

                </button>

            `;

        }


        linha.innerHTML = `

            <strong>

                ${principal ? "👑 " : ""}

                ${usuario.nome}

            </strong>

            <span>
                Usuário: ${usuario.usuario}
            </span>

            <span>
                Perfil: ${usuario.perfil}
            </span>

            ${
                principal
                    ? `
                        <span>
                            Administrador Principal
                        </span>
                    `
                    : botaoExcluir
            }

        `;


        lista.appendChild(linha);

    });

}


// ==================================================
// EXCLUIR USUÁRIO
// ==================================================

function excluirUsuario(id) {

    let usuarios =
        obterUsuarios();


    const usuarioExcluir =
        usuarios.find(function (usuario) {

            return usuario.id === id;

        });


    if (!usuarioExcluir) {

        alert(
            "Usuário não encontrado."
        );

        return;

    }


    // Somente Maycon pode excluir
    const usuarioLogado =
        localStorage.getItem(
            "loginUsuarioLogado"
        );


    if (
        !usuarioLogado ||
        usuarioLogado.toLowerCase() !== "maycon"
    ) {

        alert(
            "Somente o Administrador Principal pode excluir usuários."
        );

        return;

    }


    // Protege Maycon
    if (
        usuarioExcluir.usuario &&
        usuarioExcluir.usuario.toLowerCase() ===
        "maycon"
    ) {

        alert(
            "O Administrador Principal não pode ser excluído."
        );

        return;

    }


    const confirmar =
        confirm(
            `Deseja excluir o usuário "${usuarioExcluir.nome}"?`
        );


    if (!confirmar) {
        return;
    }


    usuarios =
        usuarios.filter(function (usuario) {

            return usuario.id !== id;

        });


    salvarUsuarios(usuarios);


    carregarUsuarios();


    alert(
        "Usuário excluído com sucesso!"
    );

}