
        // ================================================================
        // FIREBASE
        // ================================================================
        const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
        let _assinatura = null; // assinatura eletrônica do relatório atual
        const fbGet = async p => (await fetch(`${FB_URL}/${p}.json`)).json();
        const fbPut = async (p, d) => (await fetch(`${FB_URL}/${p}.json`, { method: 'PUT', body: JSON.stringify(d), headers: { 'Content-Type': 'application/json' } })).json();

        // ================================================================
        // MAPA DE DESTINOS PARA BADGE
        // ================================================================
        function destBadge(destino) {
            const d = (destino || '').toUpperCase();
            let cls = 'dest-OUTROS';
            if (d.includes('BAIXADA')) cls = 'dest-BAIXADA';
            else if (d.includes('REVISÃO') || d.includes('REVISAO') || d.includes('MANUTENÇÃO')) cls = 'dest-REVISAO';
            else if (d.includes('FORÇA') || d.includes('FORCA') || d.includes('FT')) cls = 'dest-FT';
            else if (d.includes('RP ') || d.startsWith('RP')) cls = 'dest-RP';
            else if (d.includes('TÁTICO') || d.includes('TATICO')) cls = 'dest-TATICO';
            else if (d.includes('PENHA')) cls = 'dest-PENHA';
            else if (d.includes('SEDE') || d.includes('OFICIAL') || d.includes('COMANDANTE')) cls = 'dest-SEDE';
            return `<span class="dest-badge ${cls}">${destino || '—'}</span>`;
        }

        // ================================================================
        // ESTADO
        // ================================================================
        let _dataSelecionada = '';
        let _dadosOriginais = [];   // vindos do Firebase mapa_diario

        // ================================================================
        // INIT
        // ================================================================
        document.addEventListener('DOMContentLoaded', () => {
            // Pega data da URL ou usa hoje
            const params = new URLSearchParams(window.location.search);
            const dataUrl = params.get('data') || hojeISO();
            _dataSelecionada = dataUrl;
            document.getElementById('tb-data').value = dataUrl;
            atualizarDataDisplay(dataUrl);
            carregarDadosDoDia();
            carregarRelatorioSalvo(dataUrl);
        });

        function hojeISO() {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        function atualizarDataDisplay(iso) {
            if (!iso) return;
            const [y, m, d] = iso.split('-');
            const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
            document.getElementById('cab-data-display').textContent =
                dt.toLocaleDateString('pt-BR', opts).toUpperCase();
        }

        // ================================================================
        // CARREGAR DADOS DO MAPA DIÁRIO DO DIA
        // ================================================================
        async function carregarDadosDoDia() {
            const data = document.getElementById('tb-data').value;
            if (!data) return;
            _dataSelecionada = data;
            atualizarDataDisplay(data);

            try {
                const raw = await fbGet('mapa_diario');
                if (!raw) { _dadosOriginais = []; renderizarTabela([]); atualizarSumario([]); return; }

                // Filtra pelo dia selecionado (campo dataAgendamento ou dataHora)
                const lista = Object.entries(raw)
                    .map(([id, v]) => ({ id, ...v }))
                    .filter(v => {
                        const dAg = (v.dataAgendamento || '').substring(0, 10);
                        const dHr = (v.dataHora || '').substring(0, 10);
                        return dAg === data || dHr === data;
                    })
                    .sort((a, b) => (a.guarnicao || '').localeCompare(b.guarnicao || ''));

                _dadosOriginais = lista;

                // Carrega o relatório salvo para o dia (pode sobrescrever com edições manuais)
                const salvo = await carregarRelatorioSalvo(data);
                if (!salvo) {
                    // Sem relatório salvo: monta a partir do mapa_diario
                    renderizarTabela(lista);
                    atualizarSumario(lista);
                }
            } catch (e) {
                console.error(e);
            }
        }

        // ================================================================
        // RENDERIZAR TABELA A PARTIR DOS DADOS DO MAPA
        // ================================================================
        function renderizarTabela(lista) {
            const tbody = document.getElementById('tbody-distribuicao');
            tbody.innerHTML = '';

            if (!lista.length) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#aaa">
            Nenhum lançamento encontrado para esta data.<br>
            <small>Clique em "+ Adicionar Linha" para inserir manualmente.</small></td></tr>`;
                atualizarTotais([]);
                return;
            }

            // Agrupa por guarnição para inserir separadores de área
            let areaAtual = '';
            lista.forEach((v, i) => {
                const area = v.area || derivarArea(v.guarnicao);
                if (area !== areaAtual) {
                    areaAtual = area;
                    tbody.innerHTML += `<tr class="tr-area" data-tipo="separador">
                <td colspan="6">${area}</td>
                <td class="no-print"><button class="btn-remove-linha" onclick="removerLinha(this)" title="Remover separador">
                    <span class="material-icons" style="font-size:.9rem">close</span></button></td>
            </tr>`;
                }
                tbody.innerHTML += criarLinhaHTML(v, i);
            });

            atualizarTotais(lista);
            atualizarSumario(lista);
            document.getElementById('rel-total').textContent = lista.length;
        }

        function derivarArea(guarnicao) {
            const g = (guarnicao || '').toUpperCase();
            if (g.includes('MARIBONDO')) return 'MARIBONDO';
            if (g.includes('IGACI')) return 'IGACI';
            if (g.includes('CACIMBINHAS')) return 'CACIMBINHAS';
            if (g.includes('ESTRELA')) return 'ESTRELA / MINADOR DO NEGRÃO';
            if (g.includes('BELÉM') || g.includes('TANQUE')) return 'BELÉM / TANQUE D\'ARCA';
            if (g.includes('QUEBRANGULO')) return 'QUEBRANGULO';
            if (g.includes('JACINTO') || g.includes('VERMELHO')) return 'P. JACINTO / MAR. VERMELHO';
            return 'PALMEIRA DOS ÍNDIOS';
        }

        function criarLinhaHTML(v, idx) {
            const radio = v.radio || v.numeroRadio || '';
            const radioHtml = radio
                ? `<span class="radio-badge">${radio}</span>`
                : `<span class="sem-radio">S/RÁDIO</span>`;
            return `<tr data-tipo="viatura" data-idx="${idx}">
        <td class="edit-hint" contenteditable="true">${v.area || derivarArea(v.guarnicao) || '—'}</td>
        <td class="edit-hint" contenteditable="true">${v.placa || '—'}</td>
        <td class="edit-hint" contenteditable="true"><strong>${v.prefixo || '—'}</strong></td>
        <td class="edit-hint" contenteditable="true">${v.modelo || '—'}</td>
        <td class="edit-hint" contenteditable="true">${v.guarnicao || v.destino || '—'}</td>
        <td class="edit-hint" contenteditable="true">${radio || 'S/RÁDIO'}</td>
        <td class="no-print" style="text-align:center">
            <button class="btn-remove-linha" onclick="removerLinha(this)" title="Remover linha">
                <span class="material-icons" style="font-size:.9rem">delete_outline</span>
            </button>
        </td>
    </tr>`;
        }

        // ================================================================
        // SUMÁRIO OPERACIONAL
        // ================================================================
        function atualizarSumario(lista) {
            const guarnicoes = lista.map(v => (v.guarnicao || '').toUpperCase());

            const contar = (...termos) => guarnicoes.filter(g => termos.some(t => g.includes(t))).length;

            const rp = contar('RP ');
            const tu = contar('TÁTICO URBANO', 'TATICO URBANO');
            const tr = contar('TÁTICO RURAL', 'TATICO RURAL');
            const ft = contar('FORÇA TAREFA', 'FORCA TAREFA', 'FT');
            const bx = contar('BAIXADA');
            const mn = contar('MANUTENÇÃO', 'MANUTENCAO', 'REVISÃO', 'REVISAO');
            const rv = contar('RESERVA');
            const total = rp + tu + tr + ft;

            const itens = [
                { cls: 'si-rp', num: rp, label: 'RPs' },
                { cls: 'si-tu', num: tu, label: 'Tático Urbano' },
                { cls: 'si-tr', num: tr, label: 'Tático Rural' },
                { cls: 'si-ft', num: ft, label: 'Força Tarefa' },
                { cls: 'si-bx', num: bx, label: 'Baixadas' },
                { cls: 'si-mn', num: mn, label: 'Manutenção' },
                { cls: 'si-rv', num: rv, label: 'Reservas' },
                { cls: 'si-total', num: total, label: 'Total Opercional' },
            ];

            document.getElementById('sumario-grid').innerHTML = itens.map(i => `
        <div class="sumario-item ${i.cls}">
            <div class="si-num">${i.num}</div>
            <div class="si-label">${i.label}</div>
        </div>`).join('');

            // Missões do dia
            const missoes = [
                { label: 'Força Tarefa', num: ft, cor: '#4caf50' },
                { label: 'Baixadas', num: bx, cor: '#dc3545' },
                { label: 'Manutenção', num: mn, cor: '#6f42c1' },
                { label: 'Reservas', num: rv, cor: '#6c757d' },
            ].filter(m => m.num > 0);

            document.getElementById('tabela-missoes').innerHTML = missoes.map(m => `
        <div class="ts-missao-item">
            <span style="color:${m.cor};font-weight:700">${m.label}:</span>
            <span class="ts-missao-num">${String(m.num).padStart(2, '0')}</span>
        </div>`).join('') || '<div style="color:#aaa;font-size:.78rem">Sem missões especiais.</div>';
        }

        function atualizarTotais(lista) {
            document.getElementById('rel-total').textContent = lista.length || lerLinhasTabela().length;
            atualizarSumario(lista.length ? lista : lerLinhasTabela().map(r => ({ guarnicao: r.destino })));
        }

        // ================================================================
        // OPERAÇÕES NA TABELA
        // ================================================================
        function adicionarLinha() {
            const tbody = document.getElementById('tbody-distribuicao');
            // Remove placeholder se existir
            const vazio = tbody.querySelector('td[colspan]');
            if (vazio) vazio.closest('tr').remove();

            const tr = document.createElement('tr');
            tr.setAttribute('data-tipo', 'viatura');
            tr.innerHTML = `
        <td class="edit-hint" contenteditable="true">P. DOS ÍNDIOS</td>
        <td class="edit-hint" contenteditable="true">AAA-0000</td>
        <td class="edit-hint" contenteditable="true"><strong>00-0000</strong></td>
        <td class="edit-hint" contenteditable="true">MODELO</td>
        <td class="edit-hint" contenteditable="true">GUARNIÇÃO</td>
        <td class="edit-hint" contenteditable="true">S/RÁDIO</td>
        <td class="no-print" style="text-align:center">
            <button class="btn-remove-linha" onclick="removerLinha(this)" title="Remover">
                <span class="material-icons" style="font-size:.9rem">delete_outline</span>
            </button>
        </td>`;
            tbody.appendChild(tr);
            // Foca na placa da nova linha
            tr.querySelectorAll('[contenteditable]')[1].focus();
        }

        function adicionarSeparadorArea() {
            const tbody = document.getElementById('tbody-distribuicao');
            const tr = document.createElement('tr');
            tr.setAttribute('data-tipo', 'separador');
            tr.className = 'tr-area';
            tr.innerHTML = `
        <td colspan="6" contenteditable="true">NOVA ÁREA</td>
        <td class="no-print"><button class="btn-remove-linha" onclick="removerLinha(this)" title="Remover separador">
            <span class="material-icons" style="font-size:.9rem">close</span></button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('[contenteditable]').focus();
        }

        function removerLinha(btn) {
            btn.closest('tr').remove();
            atualizarTotais(lerLinhasTabela().map(r => ({ guarnicao: r.destino })));
        }

        // ================================================================
        // LER LINHAS ATUAIS DA TABELA (para salvar)
        // ================================================================
        function lerLinhasTabela() {
            const rows = document.querySelectorAll('#tbody-distribuicao tr');
            const result = [];
            rows.forEach(tr => {
                const tipo = tr.getAttribute('data-tipo');
                if (tipo === 'separador') {
                    result.push({ tipo: 'separador', texto: tr.querySelector('td').textContent.trim() });
                } else {
                    const tds = tr.querySelectorAll('td:not(.no-print)');
                    if (tds.length >= 6) {
                        result.push({
                            tipo: 'viatura',
                            area: tds[0].textContent.trim(),
                            placa: tds[1].textContent.trim(),
                            prefixo: tds[2].textContent.trim(),
                            modelo: tds[3].textContent.trim(),
                            destino: tds[4].textContent.trim(),
                            radio: tds[5].textContent.trim(),
                        });
                    }
                }
            });
            return result;
        }

        // ================================================================
        // EDIÇÃO DAS MISSÕES DO DIA
        // ================================================================
        let _missaoEditando = false;

        function toggleMissaoEdit() {
            _missaoEditando = !_missaoEditando;
            const textarea = document.getElementById('missao-texto');
            const display = document.getElementById('missao-texto-display');
            const btn = document.getElementById('btn-missao-edit');

            if (_missaoEditando) {
                // Mostra textarea para edição
                textarea.style.display = 'block';
                display.style.display = 'none';
                btn.innerHTML = '<span class="material-icons" style="font-size:.8rem">check</span> OK';
                btn.style.borderColor = 'var(--success)';
                btn.style.color = 'var(--success)';
                textarea.focus();
            } else {
                // Confirma edição — mostra o texto formatado
                const texto = textarea.value.trim();
                if (texto) {
                    display.textContent = texto;
                    display.style.display = 'block';
                } else {
                    display.style.display = 'none';
                }
                textarea.style.display = 'none';
                btn.innerHTML = '<span class="material-icons" style="font-size:.8rem">edit</span> Editar';
                btn.style.borderColor = 'var(--ouro)';
                btn.style.color = 'var(--ouro)';
            }
        }

        // Sincroniza o display ao carregar texto salvo
        function atualizarMissaoDisplay() {
            const textarea = document.getElementById('missao-texto');
            const display = document.getElementById('missao-texto-display');
            const texto = textarea ? textarea.value.trim() : '';
            if (texto && display) {
                display.textContent = texto;
                display.style.display = 'block';
            }
        }

        // ================================================================
        // SALVAR RELATÓRIO NO FIREBASE
        // ================================================================
        async function salvarRelatorio() {
            const badge = document.getElementById('status-badge');
            badge.className = 'st-badge st-editando';
            badge.innerHTML = '<span class="material-icons" style="font-size:.8rem">sync</span> Salvando...';

            const payload = {
                data: _dataSelecionada,
                cabUnidade: document.getElementById('cab-unidade').textContent.trim(),
                missaoTexto: (document.getElementById('missao-texto') || {}).value || '',
                obsGerais: document.getElementById('obs-gerais').value,
                linhas: lerLinhasTabela(),
                salvoEm: new Date().toISOString(),
                salvoPor: localStorage.getItem('frota_usuario') || 'Sistema',
                assinatura: _assinatura || null,  // preserva assinatura existente
            };

            try {
                await fbPut(`relatorios_diarios/${_dataSelecionada.replace(/-/g, '_')}`, payload);
                badge.className = 'st-badge st-salvo';
                badge.innerHTML = '<span class="material-icons" style="font-size:.8rem">check_circle</span> Salvo';
                setTimeout(() => {
                    badge.className = 'st-badge st-editando';
                    badge.innerHTML = '<span class="material-icons" style="font-size:.8rem">edit</span> Editando';
                }, 3000);
            } catch (e) {
                badge.className = 'st-badge';
                badge.style.background = '#f8d7da';
                badge.style.color = '#721c24';
                badge.innerHTML = '⚠️ Erro ao salvar';
                console.error(e);
            }
        }

        // ================================================================
        // CARREGAR RELATÓRIO SALVO
        // ================================================================
        async function carregarRelatorioSalvo(data) {
            if (!data) return false;
            try {
                const chave = data.replace(/-/g, '_');
                const salvo = await fbGet(`relatorios_diarios/${chave}`);
                if (!salvo) return false;

                // Preenche campos editáveis
                if (salvo.cabUnidade) document.getElementById('cab-unidade').textContent = salvo.cabUnidade;
                if (salvo.missaoTexto) { document.getElementById('missao-texto').value = salvo.missaoTexto; atualizarMissaoDisplay(); }
                if (salvo.obsGerais) document.getElementById('obs-gerais').value = salvo.obsGerais;
                // Restaura assinatura eletrônica se existente
                if (salvo.assinatura && salvo.assinatura.hash) {
                    _assinatura = salvo.assinatura;
                    aplicarEstadoAssinado();
                } else {
                    _assinatura = null;
                    aplicarEstadoNaoAssinado();
                }

                // Reconstrói a tabela
                if (salvo.linhas && salvo.linhas.length) {
                    const tbody = document.getElementById('tbody-distribuicao');
                    tbody.innerHTML = '';
                    salvo.linhas.forEach((l, i) => {
                        if (l.tipo === 'separador') {
                            tbody.innerHTML += `<tr class="tr-area" data-tipo="separador">
                        <td colspan="6" contenteditable="true">${l.texto || ''}</td>
                        <td class="no-print"><button class="btn-remove-linha" onclick="removerLinha(this)">
                            <span class="material-icons" style="font-size:.9rem">close</span></button></td>
                    </tr>`;
                        } else {
                            tbody.innerHTML += `<tr data-tipo="viatura">
                        <td class="edit-hint" contenteditable="true">${l.area || ''}</td>
                        <td class="edit-hint" contenteditable="true">${l.placa || ''}</td>
                        <td class="edit-hint" contenteditable="true"><strong>${l.prefixo || ''}</strong></td>
                        <td class="edit-hint" contenteditable="true">${l.modelo || ''}</td>
                        <td class="edit-hint" contenteditable="true">${l.destino || ''}</td>
                        <td class="edit-hint" contenteditable="true">${l.radio || ''}</td>
                        <td class="no-print" style="text-align:center">
                            <button class="btn-remove-linha" onclick="removerLinha(this)">
                                <span class="material-icons" style="font-size:.9rem">delete_outline</span>
                            </button>
                        </td>
                    </tr>`;
                        }
                    });
                    atualizarTotais(salvo.linhas.filter(l => l.tipo === 'viatura').map(l => ({ guarnicao: l.destino })));
                }

                const badge = document.getElementById('status-badge');
                badge.className = 'st-badge st-salvo';
                badge.innerHTML = `<span class="material-icons" style="font-size:.8rem">check_circle</span> Salvo em ${new Date(salvo.salvoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

                return true;
            } catch (e) {
                console.warn('Sem relatório salvo para este dia.');
                return false;
            }
        }

        // ================================================================
        // NOVO RELATÓRIO (LIMPA EDIÇÕES MANUAIS E RECARREGA DO MAPA)
        // ================================================================
        function novoRelatorio() {
            _assinatura = null;
            aplicarEstadoNaoAssinado();
            if (!confirm('Descartar edições manuais e recarregar do Mapa Diário?\nOs dados já salvos no Firebase serão substituídos.')) return;
            document.getElementById('obs-gerais').value = '';
            renderizarTabela(_dadosOriginais);
            document.getElementById('status-badge').className = 'st-badge st-editando';
            document.getElementById('status-badge').innerHTML = '<span class="material-icons" style="font-size:.8rem">edit</span> Editando';
        }

        // Salva automaticamente com Ctrl+S
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); salvarRelatorio(); }
        });

        // ================================================================
        // ASSINATURA ELETRÔNICA
        // ================================================================

        // Gera hash SHA-256 em hex (Web Crypto API)
        async function sha256(text) {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
            return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
        }

        function mascararCPF(input) {
            let v = input.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
            input.value = v;
        }

        function toggleSenhaVis(inputId, btn) {
            const inp = document.getElementById(inputId);
            const showing = inp.type === 'text';
            inp.type = showing ? 'password' : 'text';
            btn.querySelector('.material-icons').textContent = showing ? 'visibility' : 'visibility_off';
        }

        // ── Busca usuário no Firebase por CPF ──────────────────────────
        async function buscarUsuarioPorCPF(cpfRaw) {
            const cpfLimpo = cpfRaw.replace(/\D/g, '');
            const todos = await fbGet('usuarios') || {};
            for (const [id, u] of Object.entries(todos)) {
                const uCpf = (u.cpf || '').replace(/\D/g, '');
                if (uCpf === cpfLimpo) return { id, ...u };
            }
            return null;
        }

        // ── Verifica senha: hash SHA-256 do CPF+senha ou campo senhaHash ─
        async function verificarSenha(usuario, senhaDigitada) {
            // Suporta: campo "senha" em texto (legado) ou "senhaHash" (SHA-256)
            if (usuario.senhaHash) {
                const h = await sha256(senhaDigitada);
                return h === usuario.senhaHash;
            }
            if (usuario.senha) {
                return usuario.senha === senhaDigitada;
            }
            return false;
        }

        // ── Aplicar estado ASSINADO (bloqueia edição) ──────────────────
        function aplicarEstadoAssinado() {
            if (!_assinatura) return;

            // Oculta botão assinar, exibe bloco assinado
            document.getElementById('bloco-assinar').style.display = 'none';
            document.getElementById('bloco-assinado').style.display = '';

            // Preenche campos do bloco assinado (suporta formato novo e legado)
            document.getElementById('assin-nome-disp').textContent =
                _assinatura.nomeCompleto || _assinatura.nome || '—';
            document.getElementById('assin-cargo-disp').textContent =
                _assinatura.cargo ||
                [_assinatura.posto, _assinatura.matricula ? 'Mat. ' + _assinatura.matricula : '']
                .filter(Boolean).join(' — ');
            document.getElementById('assin-hash-disp').textContent = 'Hash: ' + (_assinatura.hash || '').slice(0, 32) + '…';
            const dt = _assinatura.assinadoEm ? new Date(_assinatura.assinadoEm) : null;
            document.getElementById('assin-data-disp').textContent = dt
                ? `Assinado em ${dt.toLocaleDateString('pt-BR')} às ${dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                : '';

            // Dica no modal corretor
            document.getElementById('corr-nome-hint').textContent = _assinatura.nomeCompleto || 'o signatário';

            // Salvar botão e badge
            const badge = document.getElementById('status-badge');
            badge.className = 'st-badge';
            badge.style.background = '#d4edda';
            badge.style.color = '#155724';
            badge.innerHTML = '<span class="material-icons" style="font-size:.8rem">verified</span> Assinado';

            // Bloqueia TODOS os contenteditable
            document.querySelectorAll('[contenteditable]').forEach(el => {
                el.setAttribute('contenteditable', 'false');
                el.style.cursor = 'default';
            });
            // Bloqueia textareas e selects (apenas dentro do documento, não nos modais)
            document.querySelectorAll('textarea, select, input:not(#tb-data)').forEach(el => {
                if (!el.closest('#modal-assinar, #modal-corretor')) {
                    el.setAttribute('disabled', 'disabled');
                }
            });

            // Esconde botão Salvar e botões de edição de linha
            const btnSalvar = document.querySelector('.tb-btn-salvar');
            if (btnSalvar) btnSalvar.style.display = 'none';
            document.querySelectorAll('.btn-add-linha, .btn-remove-linha, .btn-add-area').forEach(el => el.style.display = 'none');
        }

        // ── Aplicar estado NÃO ASSINADO (libera edição) ───────────────
        function aplicarEstadoNaoAssinado() {
            document.getElementById('bloco-assinar').style.display = '';
            document.getElementById('bloco-assinado').style.display = 'none';

            const badge = document.getElementById('status-badge');
            badge.className = 'st-badge st-editando';
            badge.style.background = '';
            badge.style.color = '';
            badge.innerHTML = '<span class="material-icons" style="font-size:.8rem">edit</span> Editando';

            document.querySelectorAll('[contenteditable="false"]').forEach(el => {
                el.setAttribute('contenteditable', 'true');
                el.style.cursor = '';
            });
            document.querySelectorAll('textarea[disabled], select[disabled], input[disabled]').forEach(el => {
                if (!el.closest('#modal-assinar, #modal-corretor')) {
                    el.removeAttribute('disabled');
                }
            });

            const btnSalvar = document.querySelector('.tb-btn-salvar');
            if (btnSalvar) btnSalvar.style.display = '';
            document.querySelectorAll('.btn-add-linha, .btn-remove-linha, .btn-add-area').forEach(el => el.style.display = '');
        }

        // ── Modal Assinar ─────────────────────────────────────────────
        function abrirModalAssinar() {
            document.getElementById('ass-cpf').value = '';
            document.getElementById('ass-senha').value = '';
            document.getElementById('ass-msg').textContent = '';
            document.getElementById('modal-assinar').style.display = 'flex';
            setTimeout(() => document.getElementById('ass-cpf').focus(), 50);
        }
        function fecharModalAssinar() {
            document.getElementById('modal-assinar').style.display = 'none';
        }

        async function confirmarAssinatura() {
            const cpf = document.getElementById('ass-cpf').value;
            const senha = document.getElementById('ass-senha').value;
            const msg = document.getElementById('ass-msg');
            const btn = document.getElementById('btn-confirmar-ass');

            if (!cpf || !senha) { msg.textContent = '⚠️ Preencha CPF e senha.'; return; }

            btn.disabled = true;
            btn.textContent = 'Verificando...';
            msg.style.color = '#555';
            msg.textContent = '⏳ Autenticando...';

            try {
                const usuario = await buscarUsuarioPorCPF(cpf);
                if (!usuario) {
                    msg.style.color = '#dc3545';
                    msg.textContent = '❌ CPF não encontrado no sistema.';
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons" style="font-size:1rem">draw</span> Assinar e Bloquear';
                    return;
                }
                const ok = await verificarSenha(usuario, senha);
                if (!ok) {
                    msg.style.color = '#dc3545';
                    msg.textContent = '❌ Senha incorreta.';
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons" style="font-size:1rem">draw</span> Assinar e Bloquear';
                    return;
                }

                // Gera hash: CPF + data + conteúdo resumido
                const conteudo = `${cpf}|${_dataSelecionada}|${document.getElementById('cab-unidade').textContent}|${Date.now()}`;
                const hash = await sha256(conteudo);
                const cpfLimpo = cpf.replace(/\D/g, '');
                const cpfMask = cpfLimpo.replace(/(\d{3})\d{3}(\d{3})(\d{2})/, '$1.***.$3-$4'); // mascara dígitos do meio

                _assinatura = {
                    hash,
                    cpf: cpfMask,
                    cpfCompleto: cpfLimpo,
                    nomeCompleto: usuario.nomeCompleto || usuario.usuario || cpf,
                    posto: usuario.posto || '',
                    matricula: usuario.matricula || '',
                    assinadoEm: new Date().toISOString(),
                };

                // Salva e bloqueia
                await salvarRelatorio();
                aplicarEstadoAssinado();
                fecharModalAssinar();

            } catch (e) {
                msg.style.color = '#dc3545';
                msg.textContent = '❌ Erro: ' + e.message;
                console.error(e);
            }
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons" style="font-size:1rem">draw</span> Assinar e Bloquear';
        }

        // ── Modal Corretor (retirar assinatura) ───────────────────────
        function abrirModalCorretor() {
            document.getElementById('corr-cpf').value = '';
            document.getElementById('corr-senha').value = '';
            document.getElementById('corr-msg').textContent = '';
            document.getElementById('modal-corretor').style.display = 'flex';
            setTimeout(() => document.getElementById('corr-cpf').focus(), 50);
        }
        function fecharModalCorretor() {
            document.getElementById('modal-corretor').style.display = 'none';
        }

        async function confirmarCorrecao() {
            const cpf = document.getElementById('corr-cpf').value;
            const senha = document.getElementById('corr-senha').value;
            const msg = document.getElementById('corr-msg');
            const btn = document.getElementById('btn-confirmar-corr');

            if (!cpf || !senha) { msg.textContent = '⚠️ Preencha CPF e senha.'; return; }

            btn.disabled = true;
            btn.textContent = 'Verificando...';

            try {
                // Confere se o CPF bate com quem assinou
                const cpfLimpo = cpf.replace(/\D/g, '');
                if (_assinatura && _assinatura.cpfCompleto && _assinatura.cpfCompleto !== cpfLimpo) {
                    msg.style.color = '#dc3545';
                    msg.textContent = '❌ Somente quem assinou pode corrigir este documento.';
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons" style="font-size:1rem">lock_open</span> Desbloquear e Editar';
                    return;
                }

                const usuario = await buscarUsuarioPorCPF(cpf);
                if (!usuario) {
                    msg.style.color = '#dc3545';
                    msg.textContent = '❌ CPF não encontrado no sistema.';
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons" style="font-size:1rem">lock_open</span> Desbloquear e Editar';
                    return;
                }
                const ok = await verificarSenha(usuario, senha);
                if (!ok) {
                    msg.style.color = '#dc3545';
                    msg.textContent = '❌ Senha incorreta.';
                    btn.disabled = false;
                    btn.innerHTML = '<span class="material-icons" style="font-size:1rem">lock_open</span> Desbloquear e Editar';
                    return;
                }

                // Remove assinatura e desbloqueia
                _assinatura = null;
                aplicarEstadoNaoAssinado();
                await salvarRelatorio(); // salva sem assinatura
                fecharModalCorretor();

            } catch (e) {
                msg.style.color = '#dc3545';
                msg.textContent = '❌ Erro: ' + e.message;
                console.error(e);
            }
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons" style="font-size:1rem">lock_open</span> Desbloquear e Editar';
        }

        // Fecha modais ao clicar no overlay
        document.getElementById('modal-assinar').addEventListener('click', function (e) { if (e.target === this) fecharModalAssinar(); });
        document.getElementById('modal-corretor').addEventListener('click', function (e) { if (e.target === this) fecharModalCorretor(); });

