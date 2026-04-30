        // ================================================================
        // FIREBASE REST
        // ================================================================
        const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

        async function fb_get(no) {
            const r = await fetch(`${FB_URL}/${no}.json`);
            return r.json();
        }

        async function fb_post(no, dados) {
            const r = await fetch(`${FB_URL}/${no}.json`, {
                method: 'POST',
                body: JSON.stringify(dados),
                headers: { 'Content-Type': 'application/json' }
            });
            return r.json();
        }

        // ================================================================
        // TROCAR ABA
        // ================================================================
        function trocarAba(aba) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-painel').forEach(p => p.classList.remove('active'));

            document.getElementById(`painel-${aba}`).classList.add('active');
            document.querySelectorAll('.tab-btn').forEach(b => {
                if (b.textContent.trim().toLowerCase().includes(aba === 'login' ? 'entrar' : 'cadastrar'))
                    b.classList.add('active');
            });
        }

        // ================================================================
        // LOGIN
        // ================================================================
        async function tentarLogin() {
            // Captura o valor digitado (que o placeholder diz ser o CPF)
            const documentoDigitado = document.getElementById('login-usuario').value.trim();
            const senha = document.getElementById('login-senha').value.trim();
            const erroEl = document.getElementById('login-erro');
            erroEl.textContent = '';

            if (!documentoDigitado || !senha) {
                erroEl.textContent = 'Preencha CPF e senha.';
                return;
            }

            try {
                const dados = await fb_get('usuarios');

                if (!dados) {
                    // Primeiro acesso: cria admin
                    await fb_post('usuarios', {
                        usuario: "ADMIN", // Nome padrão
                        nomeCompleto: "Administrador do Sistema",
                        cpf: documentoDigitado,
                        senha: senha,
                        perfil: 'ADMIN',
                        aprovado: true,
                        criadoEm: new Date().toISOString()
                    });
                    salvarSessao("ADMIN", 'ADMIN', "Administrador do Sistema");
                    return;
                }

                // CORREÇÃO: Procurar pelo campo 'cpf' em vez de 'usuario'
                const listaUsuarios = Object.values(dados);
                const encontrado = listaUsuarios.find(u =>
                    (u.cpf === documentoDigitado) && (u.senha === senha)
                );

                if (!encontrado) {
                    erroEl.textContent = 'Usuário (CPF) ou senha incorretos.';
                    return;
                }

                if (encontrado.aprovado === false) {
                    erroEl.textContent = '⏳ Cadastro aguardando aprovação do Administrador.';
                    return;
                }

                // Salva o Nome de Guerra na sessão para exibir no cabeçalho
                salvarSessao(encontrado.usuario, encontrado.perfil || 'USUARIO', encontrado.nomeCompleto || '');

            } catch (e) {
                console.error(e);
                erroEl.textContent = 'Erro ao conectar ao banco de dados.';
            }
        }

        function salvarSessao(usuario, perfil, nomeCompleto) {
            localStorage.setItem('frota_usuario', usuario);
            localStorage.setItem('frota_perfil', perfil);
            localStorage.setItem('frota_nome_completo', nomeCompleto || usuario);
            window.location.href = '../index.html';
        }

        // ================================================================
        // CADASTRO DE NOVO USUÁRIO
        // ================================================================
        async function cadastrarUsuario() {
            const usuario = document.getElementById('cad-usuario').value.trim().toUpperCase();
            const nomeCompleto = document.getElementById('cad-nome-completo').value.trim();
            const matricula = document.getElementById('cad-matricula').value.trim();
            const cpf = document.getElementById('cad-cpf').value.trim();
            const posto = document.getElementById('cad-posto').value;
            const secao = document.getElementById('cad-secao').value.trim().toUpperCase();
            const senha = document.getElementById('cad-senha').value.trim();
            const senha2 = document.getElementById('cad-senha2').value.trim();
            const msgEl = document.getElementById('cad-msg');
            msgEl.className = 'msg-feedback';
            msgEl.textContent = '';

            // Validações
            if (!usuario || !nomeCompleto || !matricula || !cpf || !posto || !senha || !senha2) {
                msgEl.classList.add('msg-erro');
                msgEl.textContent = '⚠️ Preencha todos os campos obrigatórios (*).';
                return;
            }
            if (senha.length < 6) {
                msgEl.classList.add('msg-erro');
                msgEl.textContent = '⚠️ A senha deve ter no mínimo 6 caracteres.';
                return;
            }
            if (senha !== senha2) {
                msgEl.classList.add('msg-erro');
                msgEl.textContent = '⚠️ As senhas não conferem.';
                return;
            }

            try {
                msgEl.textContent = 'Verificando...';

                const dados = await fb_get('usuarios');

                // Verifica duplicidade de usuário ou matrícula
                if (dados) {
                    const lista = Object.values(dados);
                    if (lista.some(u => u.usuario && u.usuario.toUpperCase() === usuario)) {
                        msgEl.classList.add('msg-erro');
                        msgEl.textContent = '⚠️ Este CPF já está cadastrado.';
                        return;
                    }
                    if (lista.some(u => u.matricula && u.matricula === matricula)) {
                        msgEl.classList.add('msg-erro');
                        msgEl.textContent = '⚠️ Esta matrícula já está cadastrada.';
                        return;
                    }
                }

                await fb_post('usuarios', {
                    usuario,
                    nomeCompleto,
                    matricula,
                    cpf,
                    posto,
                    secao,
                    senha,
                    perfil: 'USUARIO',
                    aprovado: false,          // aguarda aprovação do admin
                    criadoEm: new Date().toISOString()
                });

                msgEl.classList.add('msg-ok');
                msgEl.textContent = '✅ Solicitação enviada! Aguarde a aprovação do Administrador.';

                // Limpa campos
                ['cad-usuario', 'cad-nome-completo', 'cad-matricula', 'cad-secao', 'cad-senha', 'cad-senha2'].forEach(id =>
                    document.getElementById(id).value = ''
                );
                document.getElementById('cad-posto').value = '';

            } catch (e) {
                console.error(e);
                msgEl.classList.add('msg-erro');
                msgEl.textContent = 'Erro ao conectar ao banco de dados.';
            }
        }

        // ================================================================
        // EVENTOS
        // ================================================================
        if (localStorage.getItem('frota_usuario')) {
            window.location.href = '../index.html';
        }

        document.getElementById('btn-entrar').addEventListener('click', tentarLogin);
        document.getElementById('login-senha').addEventListener('keydown', e => {
            if (e.key === 'Enter') tentarLogin();
        });
        document.getElementById('btn-cadastrar').addEventListener('click', cadastrarUsuario);
        document.getElementById('cad-senha2').addEventListener('keydown', e => {
            if (e.key === 'Enter') cadastrarUsuario();
        });

        // Abas controladas pelo onclick="trocarAba(...)" definido nos botões HTML
