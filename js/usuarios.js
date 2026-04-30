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
            method: 'POST', body: JSON.stringify(dados),
            headers: { 'Content-Type': 'application/json' }
        });
        return r.json();
    }
    async function fb_put(no, id, dados) {
        const r = await fetch(`${FB_URL}/${no}/${id}.json`, {
            method: 'PUT', body: JSON.stringify(dados),
            headers: { 'Content-Type': 'application/json' }
        });
        return r.json();
    }
    async function fb_patch(no, id, dados) {
        const r = await fetch(`${FB_URL}/${no}/${id}.json`, {
            method: 'PATCH', body: JSON.stringify(dados),
            headers: { 'Content-Type': 'application/json' }
        });
        return r.json();
    }
    async function fb_delete(no, id) {
        return fetch(`${FB_URL}/${no}/${id}.json`, { method: 'DELETE' });
    }

    // ================================================================
    // AUTH
    // ================================================================
    function checkLogin() {
        const usuario = localStorage.getItem('frota_usuario');
        const perfil  = localStorage.getItem('frota_perfil');
        if (!usuario) { window.location.href = 'login.html'; return false; }
        if (perfil !== 'ADMIN') {
            document.querySelector('main').innerHTML = `
                <div style="text-align:center;padding:80px 20px;color:#888">
                    <span class="material-icons" style="font-size:3rem;display:block;margin-bottom:12px;color:#dc3545">lock</span>
                    <h3 style="color:#dc3545">ACESSO RESTRITO</h3>
                    <p style="margin-top:8px">Somente administradores podem gerenciar usuários.</p>
                </div>`;
            return false;
        }
        document.getElementById('user-info').innerHTML =
            `<p>Usuário:</p><p class="user-nome">${usuario}</p>`;
        return true;
    }

    function logout() {
        if (confirm('Deseja encerrar a sessão?')) {
            localStorage.removeItem('frota_usuario');
            localStorage.removeItem('frota_perfil');
            window.location.href = 'login.html';
        }
    }

    // ================================================================
    // RELÓGIO
    // ================================================================
    function atualizarRelogio() {
        const a = new Date();
        document.getElementById('relogio').innerHTML =
            `${a.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long', year: 'numeric' })} <br> ${a.toLocaleTimeString('pt-BR')}`;
    }

    // ================================================================
    // ESTADO
    // ================================================================
    let _usuariosCache = {};   // { firebaseKey: { usuario, perfil, ... } }
    let _editandoKey   = null;
    let _aprovandoKey  = null;
    let _perfilSelecionado = null;

    // ================================================================
    // CARREGAR USUÁRIOS
    // ================================================================
    async function carregarUsuarios() {
        try {
            const dados = await fb_get('usuarios');
            _usuariosCache = dados || {};
            atualizarStats();
            renderizarCards();
        } catch (e) {
            document.getElementById('grid-usuarios').innerHTML =
                `<div class="loader-usuarios" style="color:#dc3545">
                    <span class="material-icons" style="font-size:2.5rem;display:block;margin-bottom:10px">error_outline</span>
                    Erro ao carregar. Verifique a conexão.
                </div>`;
        }
    }

    // ================================================================
    // STATS
    // ================================================================
    function atualizarStats() {
        const lista = Object.values(_usuariosCache);
        document.getElementById('stat-total').textContent   = lista.length;
        document.getElementById('stat-admin').textContent   = lista.filter(u => u.perfil === 'ADMIN').length;
        document.getElementById('stat-usuario').textContent = lista.filter(u => u.perfil === 'USUARIO').length;
        document.getElementById('stat-pend').textContent    = lista.filter(u => !u.perfil || u.perfil === 'PENDENTE' || u.aprovado === false).length;
    }

    // ================================================================
    // FILTRO POR CHIP
    // ================================================================
    function filtrarPorChip(perfil) {
        document.getElementById('filtro-perfil').value = perfil;
        renderizarCards();
    }

    // ================================================================
    // RENDERIZAR CARDS
    // ================================================================
    function renderizarCards() {
        const txtFiltro    = (document.getElementById('filtro-nome').value || '').toLowerCase();
        const filtroPerfil = document.getElementById('filtro-perfil').value;
        const grid         = document.getElementById('grid-usuarios');

        let lista = Object.entries(_usuariosCache).filter(([, u]) => {
            const nome   = (u.usuario || '').toLowerCase();
            const mat    = (u.matricula || '').toLowerCase();
            const secao  = (u.secao || '').toLowerCase();
            const cpf    = (u.cpf || '').toLowerCase();
            const perfil = (!u.perfil || u.perfil === 'PENDENTE' || u.aprovado === false) ? 'PENDENTE' : u.perfil;
            const nomeComp = (u.nomeCompleto || '').toLowerCase();
            const okTexto  = !txtFiltro || nome.includes(txtFiltro) || nomeComp.includes(txtFiltro) || mat.includes(txtFiltro) || secao.includes(txtFiltro) || cpf.includes(txtFiltro);
            const okPerfil = !filtroPerfil || perfil === filtroPerfil;
            return okTexto && okPerfil;
        });

        // Pendentes primeiro, depois por nome
        lista.sort(([, a], [, b]) => {
            const pa = a.perfil || 'PENDENTE', pb = b.perfil || 'PENDENTE';
            if (pa === 'PENDENTE' && pb !== 'PENDENTE') return -1;
            if (pb === 'PENDENTE' && pa !== 'PENDENTE') return 1;
            return (a.usuario || '').localeCompare(b.usuario || '');
        });

        if (lista.length === 0) {
            grid.innerHTML = `<div class="estado-vazio">
                <span class="material-icons">person_off</span>
                Nenhum usuário encontrado.
            </div>`;
            return;
        }

        grid.innerHTML = lista.map(([id, u]) => criarCardHTML(id, u)).join('');
    }

    // ================================================================
    // HTML DE UM CARD
    // ================================================================
    function criarCardHTML(id, u) {
        const perfil   = (!u.perfil || u.perfil === 'PENDENTE' || u.aprovado === false) ? 'PENDENTE' : u.perfil;
        const isPend   = perfil === 'PENDENTE';
        const nome     = u.usuario || 'Sem nome';
        const initials = nome.slice(0, 2).toUpperCase();
        const avatarCls = isPend ? 'avatar-PEND' : (perfil === 'ADMIN' ? 'avatar-ADMIN' : 'avatar-USUARIO');
        const badgeCls  = isPend ? 'badge-PEND'  : (perfil === 'ADMIN' ? 'badge-ADMIN'  : 'badge-USUARIO');

        const botoesHTML = `
            <button class="btn-card btn-editar-card" onclick="event.stopPropagation();abrirModalEditar('${id}')">
                <span class="material-icons" style="font-size:.9rem">edit</span> Editar
            </button>
            ${isPend ? `
            <button class="btn-card btn-aprovar-card" onclick="event.stopPropagation();abrirModalAprovacao('${id}')">
                <span class="material-icons" style="font-size:.9rem">how_to_reg</span> Aprovar
            </button>` : `
            <button class="btn-card btn-revogar-card" onclick="event.stopPropagation();revogarAcesso('${id}')">
                <span class="material-icons" style="font-size:.9rem">block</span> Revogar
            </button>`}
            <button class="btn-card btn-excluir-card" onclick="event.stopPropagation();excluirUsuario('${id}')">
                <span class="material-icons" style="font-size:.9rem">delete</span>
            </button>`;

        return `
        <div class="card-usuario perfil-${perfil} ${isPend ? 'pendente' : ''}"
             onclick="event.stopPropagation()"
             onmousedown="event.stopPropagation()">
            <div class="card-top">
                <div class="card-avatar ${avatarCls}">${initials}</div>
                <div class="card-info">
                    <div class="nome">
                        ${u.posto ? u.posto + ' ' : ''}${nome}
                        ${isPend ? '<span class="tag-pendente">PENDENTE</span>' : ''}
                    </div>
                    ${u.nomeCompleto ? `<div class="nome-completo">${u.nomeCompleto}</div>` : ''}
                    <div class="sub">${u.secao || '—'} ${u.matricula ? '· Mat: ' + u.matricula : ''} ${u.cpf ? '· CPF: ' + u.cpf : ''}</div>
                </div>
                <span class="badge-perfil ${badgeCls}">${perfil}</span>
            </div>
            <div class="card-detalhes">
                <span>
                    <span class="material-icons">military_tech</span>
                    ${u.posto || '—'}
                </span>
                <span>
                    <span class="material-icons">calendar_today</span>
                    Cadastro: ${u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : '—'}
                </span>
                <span>
                    <span class="material-icons">manage_accounts</span>
                    Criado por: ${u.criadoPor || '—'}
                </span>
            </div>
            <div class="card-acoes">${botoesHTML}</div>
        </div>`;
    }

    // ================================================================
    // MODAL — NOVO USUÁRIO
    // ================================================================
    function abrirModalNovo() {
        _editandoKey = null;
        document.getElementById('modal-titulo').innerHTML =
            '<span class="material-icons">person_add</span> Novo Usuário';
        ['u-usuario','u-nome-completo','u-matricula','u-secao','u-senha','u-senha2'].forEach(id =>
            document.getElementById(id).value = '');
        document.getElementById('u-posto').value   = '';
        document.getElementById('u-perfil').value  = 'PENDENTE';
        document.getElementById('u-id').value      = '';
        document.getElementById('u-msg').textContent = '';
        document.getElementById('label-senha').className = 'campo-obrigatorio';
        document.getElementById('label-senha2').className = 'campo-obrigatorio';
        document.getElementById('modal-usuario').classList.add('open');
    }

    // ================================================================
    // MODAL — EDITAR USUÁRIO
    // ================================================================
    function abrirModalEditar(id) {
        const u = _usuariosCache[id];
        if (!u) return;
        _editandoKey = id;
        document.getElementById('modal-titulo').innerHTML =
            '<span class="material-icons">manage_accounts</span> Editar Usuário';
        document.getElementById('u-id').value       = id;
        document.getElementById('u-usuario').value  = u.usuario || '';
        document.getElementById('u-nome-completo').value = u.nomeCompleto || '';
        document.getElementById('u-matricula').value= u.matricula || '';
        document.getElementById('u-cpf').value      = u.cpf || '';
        document.getElementById('u-posto').value    = u.posto || '';
        document.getElementById('u-secao').value    = u.secao || '';
        document.getElementById('u-perfil').value   = u.perfil || 'PENDENTE';
        document.getElementById('u-senha').value    = '';
        document.getElementById('u-senha2').value   = '';
        document.getElementById('u-msg').textContent = '';
        // Senha opcional na edição
        document.getElementById('label-senha').className = '';
        document.getElementById('label-senha2').className = '';
        document.getElementById('modal-usuario').classList.add('open');
    }

    function fecharModal() {
        document.getElementById('modal-usuario').classList.remove('open');
    }

    // ================================================================
    // SALVAR USUÁRIO
    // ================================================================
    async function salvarUsuario() {
        const usuario   = document.getElementById('u-usuario').value.trim().toUpperCase();
        const nomeCompleto = document.getElementById('u-nome-completo').value.trim();
        const matricula = document.getElementById('u-matricula').value.trim();
        const cpf       = document.getElementById('u-cpf').value.trim();
        const posto     = document.getElementById('u-posto').value;
        const secao     = document.getElementById('u-secao').value.trim().toUpperCase();
        const perfil    = document.getElementById('u-perfil').value;
        const senha     = document.getElementById('u-senha').value.trim();
        const senha2    = document.getElementById('u-senha2').value.trim();
        const msgEl     = document.getElementById('u-msg');
        msgEl.style.color = '#dc3545';
        msgEl.textContent = '';

        if (!usuario || !matricula || !cpf) {
            msgEl.textContent = '⚠️ Preencha Nome de Guerra, Matrícula e CPF.'; return;
        }
        if (!_editandoKey && !senha) {
            msgEl.textContent = '⚠️ Defina uma senha para o novo usuário.'; return;
        }
        if (senha && senha.length < 6) {
            msgEl.textContent = '⚠️ A senha deve ter no mínimo 6 caracteres.'; return;
        }
        if (senha && senha !== senha2) {
            msgEl.textContent = '⚠️ As senhas não conferem.'; return;
        }

        // Verifica duplicidade ao criar
        if (!_editandoKey) {
            const lista = Object.values(_usuariosCache);
            if (lista.some(u => u.usuario && u.usuario.toUpperCase() === usuario)) {
                msgEl.textContent = '⚠️ Este nome de guerra já está cadastrado.'; return;
            }
            if (lista.some(u => u.matricula && u.matricula === matricula)) {
                msgEl.textContent = '⚠️ Esta matrícula já está cadastrada.'; return;
            }
            if (lista.some(u => u.cpf && u.cpf === cpf)) {
                msgEl.textContent = '⚠️ Este CPF já está cadastrado.'; return;
            }
        }

        msgEl.style.color = '#155724';
        msgEl.textContent = 'Salvando...';

        try {
            if (_editandoKey) {
                const dados = { usuario, nomeCompleto, matricula, posto, secao, perfil, cpf,
                    atualizadoEm: new Date().toISOString(),
                    atualizadoPor: localStorage.getItem('frota_usuario') || 'Sistema'
                };
                if (senha) dados.senha = senha;
                if (_usuariosCache[_editandoKey]?.criadoEm) dados.criadoEm = _usuariosCache[_editandoKey].criadoEm;
                if (_usuariosCache[_editandoKey]?.criadoPor) dados.criadoPor = _usuariosCache[_editandoKey].criadoPor;
                if (_usuariosCache[_editandoKey]?.senha && !senha) dados.senha = _usuariosCache[_editandoKey].senha;
                await fb_put('usuarios', _editandoKey, dados);
                _usuariosCache[_editandoKey] = dados;
                msgEl.textContent = '✅ Usuário atualizado com sucesso!';
            } else {
                const dados = {
                    usuario, nomeCompleto, matricula, posto, secao, perfil, senha, cpf,
                    aprovado: perfil !== 'PENDENTE',
                    criadoEm:  new Date().toISOString(),
                    criadoPor: localStorage.getItem('frota_usuario') || 'Sistema'
                };
                const res = await fb_post('usuarios', dados);
                _usuariosCache[res.name] = dados;
                msgEl.textContent = '✅ Usuário criado com sucesso!';
            }
            atualizarStats();
            renderizarCards();
            setTimeout(fecharModal, 1400);
        } catch (e) {
            msgEl.style.color = '#dc3545';
            msgEl.textContent = 'Erro ao salvar. Verifique a conexão.';
        }
    }

    // ================================================================
    // MODAL — APROVAÇÃO
    // ================================================================
    function abrirModalAprovacao(id) {
        const u = _usuariosCache[id];
        if (!u) return;
        _aprovandoKey     = id;
        _perfilSelecionado = null;

        // Limpa seleção anterior
        document.querySelectorAll('.perfil-opcao').forEach(el => el.classList.remove('selecionado'));
        document.getElementById('apr-msg').textContent = '';

        // Preenche info do usuário
        const nome = u.usuario || 'Sem nome';
        document.getElementById('apr-avatar').textContent = nome.slice(0, 2).toUpperCase();
        document.getElementById('apr-nome').textContent   = (u.posto ? u.posto + ' ' : '') + nome;
        document.getElementById('apr-sub').textContent    =
            (u.secao || '—') + (u.matricula ? ' · Mat: ' + u.matricula : '') +
            ' · Cadastro: ' + (u.criadoEm ? new Date(u.criadoEm).toLocaleDateString('pt-BR') : '—');

        document.getElementById('modal-aprovacao').classList.add('open');
    }

    function fecharModalAprovacao() {
        document.getElementById('modal-aprovacao').classList.remove('open');
        _aprovandoKey = null;
        _perfilSelecionado = null;
    }

    function selecionarPerfil(p) {
        _perfilSelecionado = p;
        document.querySelectorAll('.perfil-opcao').forEach(el => el.classList.remove('selecionado'));
        document.getElementById('opc-' + p.toLowerCase()).classList.add('selecionado');
        document.getElementById('apr-msg').textContent = '';
    }

    async function confirmarAprovacao() {
        const msgEl = document.getElementById('apr-msg');
        if (!_perfilSelecionado) {
            msgEl.style.color = '#dc3545';
            msgEl.textContent = '⚠️ Selecione um perfil antes de confirmar.';
            return;
        }
        if (!_aprovandoKey) {
            msgEl.style.color = '#dc3545';
            msgEl.textContent = '⚠️ Nenhum usuário selecionado para aprovação.';
            return;
        }

        const btn = document.getElementById('btn-confirmar-aprovacao');
        btn.disabled = true;
        msgEl.style.color = '#155724';
        msgEl.textContent = 'Aprovando...';

        try {
            // Usa PUT com o objeto completo do usuário para garantir compatibilidade
            // (PATCH do Firebase pode ignorar campos em algumas configurações de regras)
            const usuarioAtual = { ..._usuariosCache[_aprovandoKey] };
            usuarioAtual.perfil     = _perfilSelecionado;
            usuarioAtual.aprovado   = true;
            usuarioAtual.aprovadoEm  = new Date().toISOString();
            usuarioAtual.aprovadoPor = localStorage.getItem('frota_usuario') || 'Sistema';

            const resposta = await fb_put('usuarios', _aprovandoKey, usuarioAtual);

            // Firebase PUT retorna o objeto salvo — verifica se foi bem-sucedido
            if (!resposta || resposta.error) {
                throw new Error(resposta?.error || 'Resposta inválida do Firebase');
            }

            // Atualiza cache local
            _usuariosCache[_aprovandoKey] = usuarioAtual;

            msgEl.textContent = `✅ ${_perfilSelecionado === 'ADMIN' ? '🛡️' : '👤'} Acesso aprovado como ${_perfilSelecionado}!`;
            atualizarStats();
            renderizarCards();
            setTimeout(fecharModalAprovacao, 1600);

        } catch (e) {
            console.error('Erro ao aprovar:', e);
            msgEl.style.color = '#dc3545';
            msgEl.textContent = 'Erro ao aprovar: ' + (e.message || 'verifique a conexão.');
        } finally {
            btn.disabled = false;
        }
    }

    // ================================================================
    // REVOGAR ACESSO
    // ================================================================
    async function revogarAcesso(id) {
        const u = _usuariosCache[id];
        const nome = u?.usuario || id;
        if (!confirm(`Revogar o acesso de "${nome}"?\nO perfil será alterado para PENDENTE.`)) return;
        try {
            await fb_patch('usuarios', id, {
                perfil: 'PENDENTE',
                aprovado: false,
                revogadoEm: new Date().toISOString(),
                revogadoPor: localStorage.getItem('frota_usuario') || 'Sistema'
            });
            _usuariosCache[id].perfil   = 'PENDENTE';
            _usuariosCache[id].aprovado = false;
            atualizarStats();
            renderizarCards();
        } catch (e) { alert('Erro ao revogar. Verifique a conexão.'); }
    }

    // ================================================================
    // EXCLUIR USUÁRIO
    // ================================================================
    async function excluirUsuario(id) {
        const u = _usuariosCache[id];
        const nome = u?.usuario || id;
        if (!confirm(`Excluir permanentemente o usuário "${nome}"?\nEsta ação não pode ser desfeita.`)) return;
        try {
            await fb_delete('usuarios', id);
            delete _usuariosCache[id];
            atualizarStats();
            renderizarCards();
        } catch (e) { alert('Erro ao excluir. Verifique a conexão.'); }
    }

    // ================================================================
    // INICIALIZAÇÃO
    // ================================================================
    document.addEventListener('DOMContentLoaded', () => {
        if (!checkLogin()) return;
        atualizarRelogio();
        setInterval(atualizarRelogio, 1000);
        carregarUsuarios();

        // ── Fechar modais ao clicar NO OVERLAY (fundo escuro) ──
        // Usa 'mousedown' em vez de 'click' para não colidir com
        // eventos dos botões internos que usam 'click'.
        document.getElementById('modal-usuario').addEventListener('mousedown', function(e) {
            if (e.target === this) fecharModal();
        });
        document.getElementById('modal-aprovacao').addEventListener('mousedown', function(e) {
            if (e.target === this) fecharModalAprovacao();
        });

        // ── Impede propagação de cliques dentro das caixas dos modais ──
        document.querySelectorAll('.modal-box').forEach(box => {
            box.addEventListener('mousedown', function(e) { e.stopPropagation(); });
            box.addEventListener('click',     function(e) { e.stopPropagation(); });
        });
    });