        // ============================================================
        // FIREBASE REST
        // ============================================================
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

        async function fb_put(no, id, dados) {
            const r = await fetch(`${FB_URL}/${no}/${id}.json`, {
                method: 'PUT',
                body: JSON.stringify(dados),
                headers: { 'Content-Type': 'application/json' }
            });
            return r.json();
        }


        async function fb_patch(no, id, dados) {
            const r = await fetch(`${FB_URL}/${no}/${id}.json`, {
                method: 'PATCH',
                body: JSON.stringify(dados),
                headers: { 'Content-Type': 'application/json' }
            });
            return r.json();
        }

        async function fb_delete(no, id) {
            return fetch(`${FB_URL}/${no}/${id}.json`, { method: 'DELETE' });
        }

        // ============================================================
        // RELÓGIO
        // ============================================================
        function atualizarRelogio() {
            const agora = new Date();
            const data = agora.toLocaleDateString('pt-BR', {
                weekday: 'short', day: '2-digit', month: 'long', year: 'numeric'
            });
            document.getElementById('relogio').innerHTML = `${data} <br> ${agora.toLocaleTimeString('pt-BR')}`;
        }

        // ============================================================
        // AUTH
        // ============================================================
        function checkLogin() {
            const usuario = localStorage.getItem('frota_usuario');
            if (!usuario) { window.location.href = 'login.html'; return; }
            document.getElementById('user-info').innerHTML =
                `<p>Usuário:</p><p class="user-nome">${usuario}</p>`;
        }

        function logout() {
            localStorage.removeItem('frota_usuario');
            localStorage.removeItem('frota_perfil');
            window.location.href = 'login.html';
        }

        // ============================================================
        // DADOS EM MEMÓRIA
        // ============================================================
        let viaturasCache = {}; // { id: { ...dadosViatura } }

        function badgeStatus(status) {
            const map = {
                'Operacional': ['badge-operacional', 'Operacional'],
                'Manutencao': ['badge-manutencao', 'Em Manutenção'],
                'Indisponivel': ['badge-indisponivel', 'Indisponível'],
                'Patrulha': ['badge-patrulha', 'Em Patrulha'],
            };
            const [cls, label] = map[status] || ['badge-manutencao', status || '--'];
            return `<span class="badge-status ${cls}">${label}</span>`;
        }

        // ============================================================
        // CARREGAR TABELA
        // ============================================================
        async function carregarViaturas() {
            const tbody = document.getElementById('tabela-viaturas');
            try {
                const dados = await fb_get('viaturas');
                viaturasCache = dados || {};
                renderizarTabela();
            } catch (e) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:red">Erro ao carregar dados. Verifique a conexão.</td></tr>';
            }
        }

        function renderizarTabela() {
            aplicarFiltros();
        }

        function aplicarFiltros() {
            const filtroStatus = document.getElementById('filtro-status').value;
            const busca = document.getElementById('busca').value.toLowerCase();
            const tbody = document.getElementById('tabela-viaturas');

            let arr = Object.entries(viaturasCache);

            if (filtroStatus) {
                arr = arr.filter(([, v]) => v.status === filtroStatus);
            }

            if (busca) {
                arr = arr.filter(([, v]) =>
                    (v.prefixo || '').toLowerCase().includes(busca) ||
                    (v.placa || '').toLowerCase().includes(busca) ||
                    (v.modelo || '').toLowerCase().includes(busca) ||
                    (v.marca || '').toLowerCase().includes(busca)
                );
            }

            // Ordenar por prefixo
            arr.sort((a, b) => (a[1].prefixo || '').localeCompare(b[1].prefixo || ''));

            document.getElementById('contador-registros').textContent =
                `${arr.length} viatura${arr.length !== 1 ? 's' : ''} encontrada${arr.length !== 1 ? 's' : ''}`;

            if (!arr.length) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:#aaa">Nenhuma viatura encontrada.</td></tr>';
                return;
            }

            tbody.innerHTML = arr.map(([id, v]) => `
            <tr>
                <td><strong>${v.prefixo || '--'}</strong></td>
                <td>${v.placa || '--'}</td>
                <td>${v.marca || '--'}</td>
                <td>${v.modelo || '--'}</td>
                <td>${v.ano || '--'}</td>
                <td>${v.tipo || '--'}</td>
                <td>${v.proprietarioLocadora || '--'}</td>
                <td>${v.cor || '--'}</td>
                <td>${v.combustivel || '--'}</td>
                <td>${v.renavam || '--'}</td>
                <td>${v.cartao || '--'}</td>
                <td>${v.chassi || '--'}</td>
                <td>${v.kmAtual != null ? Number(v.kmAtual).toLocaleString('pt-BR') + ' km' : '--'}</td>
                <td>${badgeStatus(v.status || 'Operacional')}</td>
                <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${v.obs || ''}">
                    ${v.obs || '<span style="color:#ccc">—</span>'}
                </td>
                <td>
                    <button class="btn-acao btn-editar" onclick="abrirModalEditar('${id}')">✏️ Editar</button>
                    <button class="btn-acao btn-excluir" onclick="excluirViatura('${id}', '${v.prefixo || ''}')">🗑️</button>
                </td>
            </tr>
        `).join('');
        }

        // ============================================================
        // MODAL — ABRIR / FECHAR
        // ============================================================
        function abrirModalNovo() {
            document.getElementById('modal-titulo').textContent = '🚓 Nova Viatura';
            document.getElementById('v-id').value = '';
            document.getElementById('v-prefixo').value = '';
            document.getElementById('v-placa').value = '';
            document.getElementById('v-modelo').value = '';
            document.getElementById('v-marca').value = '';
            document.getElementById('v-ano').value = '';
            document.getElementById('v-tipo').value = '';
            document.getElementById('v-proprietarioLocadora').value = '';
            document.getElementById('v-chassi').value = '';
            document.getElementById('v-cor').value = '';
            document.getElementById('v-renavam').value = '';
            document.getElementById('v-cartao').value = '';
            document.getElementById('v-combustivel').value = '';
            document.getElementById('v-km').value = '';
            document.getElementById('v-status').value = 'Operacional';
            document.getElementById('v-obs').value = '';
            document.getElementById('v-msg').textContent = '';
            document.getElementById('modal-viatura').classList.add('open');
        }

        function abrirModalEditar(id) {
            const v = viaturasCache[id];
            if (!v) return;

            document.getElementById('modal-titulo').textContent = `✏️ Editar Viatura — ${v.prefixo || id}`;
            document.getElementById('v-id').value = id;
            document.getElementById('v-prefixo').value = v.prefixo || '';
            document.getElementById('v-placa').value = v.placa || '';
            document.getElementById('v-modelo').value = v.modelo || '';
            document.getElementById('v-marca').value = v.marca || '';
            document.getElementById('v-ano').value = v.ano || '';
            document.getElementById('v-tipo').value = v.tipo || '';
            document.getElementById('v-proprietarioLocadora').value = v.proprietarioLocadora || '';
            document.getElementById('v-chassi').value = v.chassi || '';
            document.getElementById('v-renavam').value = v.renavam || '';
            document.getElementById('v-cartao').value = v.cartao || '';
            document.getElementById('v-cor').value = v.cor || '';
            document.getElementById('v-combustivel').value = v.combustivel || '';
            document.getElementById('v-km').value = v.kmAtual != null ? v.kmAtual : '';
            document.getElementById('v-status').value = v.status || 'Operacional';
            document.getElementById('v-obs').value = v.obs || '';
            document.getElementById('v-msg').textContent = '';
            document.getElementById('modal-viatura').classList.add('open');
        }

        function fecharModal() {
            document.getElementById('modal-viatura').classList.remove('open');
        }

        // ============================================================
        // SALVAR VIATURA
        // ============================================================
        async function salvarViatura() {
            const id = document.getElementById('v-id').value.trim();
            const prefixo = document.getElementById('v-prefixo').value.trim().toUpperCase();
            const placa = document.getElementById('v-placa').value.trim().toUpperCase();
            const modelo = document.getElementById('v-modelo').value.trim();
            const marca = document.getElementById('v-marca').value.trim();
            const ano = document.getElementById('v-ano').value.trim();
            const tipo = document.getElementById('v-tipo').value;
            const proprietarioLocadora = document.getElementById('v-proprietarioLocadora').value;
            const chassi = document.getElementById('v-chassi').value.trim();
            const renavam = document.getElementById('v-renavam').value.trim();
            const cartao = document.getElementById('v-cartao').value.trim();
            const cor = document.getElementById('v-cor').value.trim();
            const combustivel = document.getElementById('v-combustivel').value;
            const km = document.getElementById('v-km').value.trim();
            const status = document.getElementById('v-status').value;
            const obs = document.getElementById('v-obs').value.trim();
            const msgEl = document.getElementById('v-msg');

            // Validação
            if (!prefixo || !placa || !modelo) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = '⚠️ Preencha os campos obrigatórios: Prefixo, Placa e Modelo.';
                return;
            }

            // Validação de placa duplicada (somente ao criar novo)
            if (!id) {
                const placaExiste = Object.values(viaturasCache).some(
                    v => v.placa && v.placa.toUpperCase() === placa
                );
                if (placaExiste) {
                    msgEl.style.color = '#dc3545';
                    msgEl.textContent = '⚠️ Já existe uma viatura cadastrada com esta placa.';
                    return;
                }
            }

            // MONTAGEM DO OBJETO (Aqui estavam faltando os campos)
            const dados = {
                prefixo,
                placa,
                modelo,
                marca,
                ano,
                tipo, // Adicionado
                proprietarioLocadora, // Adicionado
                chassi, // Adicionado
                renavam, // Adicionado/Corrigido
                cartao, // Adicionado
                cor,
                combustivel,
                kmAtual: km !== '' ? Number(km) : 0,
                status,
                obs,
                atualizadoEm: new Date().toISOString(),
                atualizadoPor: localStorage.getItem('frota_usuario') || 'Sistema'
            };

            msgEl.style.color = '#155724';
            msgEl.textContent = 'Salvando...';

            try {
                if (id) {
                    if (viaturasCache[id]?.criadoEm) {
                        dados.criadoEm = viaturasCache[id].criadoEm;
                    }
                    await fb_put('viaturas', id, dados);
                    msgEl.textContent = '✅ Viatura atualizada com sucesso!';
                    viaturasCache[id] = dados;
                } else {
                    dados.criadoEm = new Date().toISOString();
                    dados.criadoPor = localStorage.getItem('frota_usuario') || 'Sistema';
                    const resultado = await fb_post('viaturas', dados);
                    msgEl.textContent = '✅ Viatura cadastrada com sucesso!';
                    viaturasCache[resultado.name] = dados;
                }

                renderizarTabela();
                setTimeout(fecharModal, 1600);

            } catch (e) {
                msgEl.style.color = '#dc3545';
                msgEl.textContent = 'Erro ao salvar. Verifique a conexão com o Firebase.';
                console.error(e);
            }
        }

        // ============================================================
        // EXCLUIR VIATURA
        // ============================================================
        async function excluirViatura(id, prefixo) {
            if (!confirm(`Confirma a exclusão da viatura "${prefixo}"?\n\nEsta ação não pode ser desfeita.`)) return;
            try {
                await fb_delete('viaturas', id);
                delete viaturasCache[id];
                renderizarTabela();
            } catch (e) {
                alert('Erro ao excluir. Verifique a conexão.');
            }
        }

        // ============================================================
        // FECHA MODAL CLICANDO FORA
        // ============================================================
        document.getElementById('modal-viatura').addEventListener('click', function (e) {
            if (e.target === this) fecharModal();
        });

        // ============================================================
        // INICIALIZAÇÃO
        // ============================================================
        document.addEventListener('DOMContentLoaded', () => {
            checkLogin();
            atualizarRelogio();
            setInterval(atualizarRelogio, 1000);
            carregarViaturas();
        });

        // ============================================================
        // UPLOAD / IMPORTAÇÃO DE PLANILHA — CADASTRO DE VIATURAS
        // ============================================================
        (function() {
            const zone = document.getElementById('upload-zone-cad');
            if (!zone) return;
            zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
            zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
            zone.addEventListener('drop', e => {
                e.preventDefault(); zone.classList.remove('drag-over');
                const f = e.dataTransfer.files[0];
                if (f) processarPlanilhaCad(f);
            });
        })();

        function mostrarStatusCad(msg, tipo) {
            const el = document.getElementById('upload-status-cad');
            el.textContent = msg;
            el.className = `upload-status ${tipo}`;
            el.style.display = 'block';
        }

        async function processarPlanilhaCad(file) {
            if (!file) return;
            mostrarStatusCad('⏳ Lendo arquivo...', 'info');

            const ab = await file.arrayBuffer();
            const wb = XLSX.read(ab, { type: 'array', cellDates: true });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            let data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            // Detectar linha de cabeçalho
            let headerIdx = -1;
            for (let i = 0; i < Math.min(data.length, 12); i++) {
                const row = data[i].map(v => String(v).toUpperCase().trim());
                if (row.some(v => v.includes('PLACA') || v.includes('PREFIXO') || v.includes('VIATURA'))) {
                    headerIdx = i;
                    break;
                }
            }
            if (headerIdx === -1) {
                mostrarStatusCad('❌ Cabeçalho não encontrado. Verifique se a planilha tem colunas PREFIXO e PLACA.', 'error');
                return;
            }

            const header = data[headerIdx].map(v => String(v).toUpperCase().trim());
            const rows   = data.slice(headerIdx + 1);

            function findCol(keywords) {
                for (const kw of keywords) {
                    const idx = header.findIndex(h => h.includes(kw));
                    if (idx !== -1) return idx;
                }
                return -1;
            }

            const cols = {
                prefixo:      findCol(['PREFIXO']),
                placa:        findCol(['PLACA', 'VIATURA']),
                modelo:       findCol(['MODELO']),
                marca:        findCol(['MARCA']),
                ano:          findCol(['ANO']),
                combustivel:  findCol(['COMBUSTÍVEL', 'COMBUSTIVEL']),
                chassi:       findCol(['CHASSI']),
                cartao:       findCol(['NÚMERO CARTÃO', 'NUMERO CARTAO', 'CARTÃO', 'CARTAO']),
                cor:          findCol(['COR']),
                renavam:      findCol(['RENAVAM']),
                tipo:         findCol(['TIPO FROTA', 'TIPO']),
                locadora:     findCol(['LOCADORA', 'PROPRIETARIO', 'PROPRIETÁRIO', 'PROP', 'ÓRGÃO', 'ORGAO']),
                kmAtual:      findCol(['KM VEICULO', 'KM ATUAL', 'KM', 'HODÔMETRO', 'HODOMETRO']),
                status:       findCol(['STATUS VEICULO', 'STATUS', 'SITUAÇÃO', 'SITUACAO']),
                unidade:      findCol(['UNIDADE', 'BASE']),
                obs:          findCol(['OBS', 'OBSERV']),
            };

            function cel(row, idx) {
                if (idx === -1) return '';
                const v = row[idx];
                if (v === null || v === undefined) return '';
                if (v instanceof Date) return v.toISOString().split('T')[0];
                return String(v).trim();
            }

            function normalizarTipo(val) {
                const v = val.toUpperCase();
                if (v.includes('LOCAD') || v.includes('PRIVADO')) return 'Privado';
                if (v) return 'Público';
                return '';
            }

            function normalizarProprietario(val) {
                if (!val) return '';
                const v = val.toUpperCase();
                if (v.includes('STYLE'))    return 'STYLE';
                if (v.includes('LOCALIZA')) return 'LOCALIZA';
                if (v.includes('UNIDAS'))   return 'UNIDAS';
                if (v.includes('OK'))       return 'OK';
                if (v.includes('AMGESP') || v.includes('PMAL')) return 'PMAL';
                return val;
            }

            function normalizarStatus(val) {
                if (!val) return 'Operacional';
                const v = val.toUpperCase();
                if (v.includes('MANUT') || v.includes('OFICINA')) return 'Manutencao';
                if (v.includes('INATIVO') || v.includes('INDISPON')) return 'Indisponivel';
                return 'Operacional';
            }

            mostrarStatusCad('⏳ Conectando ao Firebase...', 'info');
            const viaturasFB = await fb_get('viaturas') || {};
            // Índice placa → ID Firebase (normalizado)
            const porPlaca = {};
            for (const [id, v] of Object.entries(viaturasFB)) {
                if (v.placa) porPlaca[v.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')] = id;
            }

            const usuario = localStorage.getItem('frota_usuario') || 'Sistema';
            let cadastrados = 0, atualizados = 0, ignorados = 0;

            for (const row of rows) {
                const placa   = cel(row, cols.placa).toUpperCase().replace(/\s/g, '');
                const prefixo = cel(row, cols.prefixo).toUpperCase();
                if (!placa && !prefixo) { ignorados++; continue; }

                const kmRaw   = parseFloat(String(row[cols.kmAtual] || '0').replace(/[^\d.]/g, '')) || 0;
                const locBrut = cel(row, cols.locadora);
                const tipoBrut = cel(row, cols.tipo);

                const dados = {
                    placa:                placa   || '--',
                    prefixo:              prefixo || '--',
                    modelo:               cel(row, cols.modelo),
                    marca:                cel(row, cols.marca),
                    ano:                  cel(row, cols.ano),
                    combustivel:          cel(row, cols.combustivel),
                    chassi:               cel(row, cols.chassi),
                    cartao:               cel(row, cols.cartao),
                    cor:                  cel(row, cols.cor),
                    renavam:              cel(row, cols.renavam),
                    tipo:                 tipoBrut ? normalizarTipo(tipoBrut) : '',
                    proprietarioLocadora: normalizarProprietario(locBrut),
                    kmAtual:              kmRaw,
                    status:               normalizarStatus(cel(row, cols.status)),
                    obs:                  cel(row, cols.obs),
                    atualizadoEm:         new Date().toISOString(),
                    atualizadoPor:        usuario,
                };

                const chave = placa.replace(/[^A-Z0-9]/g, '');
                const vId   = chave ? porPlaca[chave] : null;

                if (vId) {
                    // Atualiza todos os campos (PATCH preserva campos não enviados)
                    await fb_patch('viaturas', vId, dados);
                    viaturasCache[vId] = { ...viaturasCache[vId], ...dados };
                    atualizados++;
                } else {
                    // Cadastra nova viatura
                    dados.criadoEm  = new Date().toISOString();
                    dados.criadoPor = usuario;
                    const res = await fb_post('viaturas', dados);
                    if (res && res.name) {
                        viaturasCache[res.name] = dados;
                        porPlaca[chave] = res.name;
                        cadastrados++;
                    }
                }
            }

            // Reseta o input para permitir re-upload do mesmo arquivo
            document.getElementById('file-input-cad').value = '';

            renderizarTabela();
            mostrarStatusCad(
                `✅ Concluído — ${atualizados} atualizada(s), ${cadastrados} nova(s), ${ignorados} ignorada(s).`,
                'success'
            );
        }

