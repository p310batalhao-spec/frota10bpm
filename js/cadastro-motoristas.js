const FB_URL='https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
        async function fb_get(n){return(await fetch(`${FB_URL}/${n}.json`)).json()}
        async function fb_post(n,d){return(await fetch(`${FB_URL}/${n}.json`,{method:'POST',body:JSON.stringify(d),headers:{'Content-Type':'application/json'}})).json()}
        async function fb_put(n,id,d){return(await fetch(`${FB_URL}/${n}/${id}.json`,{method:'PUT',body:JSON.stringify(d),headers:{'Content-Type':'application/json'}})).json()}
        async function fb_delete(n,id){return fetch(`${FB_URL}/${n}/${id}.json`,{method:'DELETE'})}

        // Formata CPF enquanto o usuário digita: 000.000.000-00
        function mascararCPF(el) {
            let v = el.value.replace(/\D/g, '');
            if (v.length > 9) v = v.substring(0,3)+'.'+v.substring(3,6)+'.'+v.substring(6,9)+'-'+v.substring(9,11);
            else if (v.length > 6) v = v.substring(0,3)+'.'+v.substring(3,6)+'.'+v.substring(6);
            else if (v.length > 3) v = v.substring(0,3)+'.'+v.substring(3);
            el.value = v.substring(0, 14);
        }

        function atualizarRelogio(){const a=new Date();document.getElementById('relogio').innerHTML=`${a.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'long',year:'numeric'})} <br> ${a.toLocaleTimeString('pt-BR')}`}

        function checkLogin(){const u=localStorage.getItem('frota_usuario');if(!u){window.location.href='login.html';return}document.getElementById('user-info').innerHTML=`<p>Usuário:</p><p class="user-nome">${u}</p>`}
        function logout(){localStorage.removeItem('frota_usuario');localStorage.removeItem('frota_perfil');window.location.href='login.html'}

        let motoristasCache={};

        function badgeStatus(s){const m={'Ativo':['badge-ativo','Ativo'],'Afastado':['badge-afastado','Afastado'],'Ferias':['badge-ferias','Em Férias'],'Licenca':['badge-licenca','De Licença'],'Suspenso':['badge-suspenso','Suspenso']};const[c,l]=m[s]||['badge-afastado',s||'--'];return`<span class="badge-status ${c}">${l}</span>`}

        function cnhVencida(v){return v?new Date(v)<new Date():false}

        async function carregarMotoristas(){const t=document.getElementById('tabela-motoristas');try{const d=await fb_get('motoristas');motoristasCache=d||{};renderizarTabela()}catch(e){t.innerHTML='<tr><td colspan="12" style="text-align:center;padding:28px;color:red">Erro ao carregar dados.</td></tr>'}}

        function renderizarTabela(){aplicarFiltros()}

        function aplicarFiltros(){
            const fs=document.getElementById('filtro-status').value;
            const b=document.getElementById('busca').value.toLowerCase();
            const tbody=document.getElementById('tabela-motoristas');
            let arr=Object.entries(motoristasCache);
            if(fs)arr=arr.filter(([,m])=>m.status===fs);
            if(b)arr=arr.filter(([,m])=>(m.nomeGuerra||'').toLowerCase().includes(b)||(m.nomeCivil||'').toLowerCase().includes(b)||(m.matricula||'').toLowerCase().includes(b)||(m.posto||'').toLowerCase().includes(b)||(m.cnh||'').toLowerCase().includes(b));
            arr.sort((a,b)=>(a[1].nomeGuerra||'').localeCompare(b[1].nomeGuerra||''));
            document.getElementById('contador-registros').textContent=`${arr.length} motorista${arr.length!==1?'s':''} encontrado${arr.length!==1?'s':''}`;
            if(!arr.length){tbody.innerHTML='<tr><td colspan="13" style="text-align:center;padding:28px;color:#aaa">Nenhum motorista encontrado.</td></tr>';return}
            tbody.innerHTML=arr.map(([id,m])=>{
                const venc=cnhVencida(m.validadeCnh);
                const vf=m.validadeCnh?new Date(m.validadeCnh+'T00:00:00').toLocaleDateString('pt-BR'):'--';
                const vh=venc?`<span style="color:#dc3545;font-weight:700" title="CNH Vencida">⚠️ ${vf}</span>`:vf;
                const cpfExib=m.cpf&&m.cpf.replace(/\D/g,'').length===11?m.cpf.replace(/\D/g,'').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.***.***-$4'):(m.cpf||'--');
                return`<tr><td><strong>${m.matricula||'--'}</strong></td><td><strong>${m.nomeGuerra||'--'}</strong></td><td>${m.nomeCivil||'--'}</td><td style="font-family:monospace;font-size:.78rem">${cpfExib}</td><td>${m.posto||'--'}</td><td>${m.subunidade||'--'}</td><td>${m.cnh||'--'}</td><td>${m.categoriaCnh||'--'}</td><td>${vh}</td><td>${m.telefone||'--'}</td><td>${badgeStatus(m.status||'Ativo')}</td><td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${m.obs||''}">${m.obs||'<span style="color:#ccc">—</span>'}</td><td><button class="btn-acao btn-editar" onclick="abrirModalEditar('${id}')">&#9999;&#65039; Editar</button><button class="btn-acao btn-excluir" onclick="excluirMotorista('${id}','${(m.nomeGuerra||'')}')">&#128465;&#65039;</button></td></tr>`;
            }).join('');
        }

        function limparModal(){['m-id','m-matricula','m-nomeGuerra','m-nomeCivil','m-cpf','m-subunidade','m-cnh','m-validadeCnh','m-restricoesCnh','m-motivoAfastamento','m-telefone','m-email','m-obs'].forEach(id=>document.getElementById(id).value='');document.getElementById('m-posto').value='';document.getElementById('m-turno').value='';document.getElementById('m-categoriaCnh').value='';document.getElementById('m-status').value='Ativo';document.getElementById('m-msg').textContent=''}

        function abrirModalNovo(){document.getElementById('modal-titulo').textContent='👤 Novo Motorista';limparModal();document.getElementById('modal-motorista').classList.add('open')}

        function abrirModalEditar(id){const m=motoristasCache[id];if(!m)return;document.getElementById('modal-titulo').textContent=`✏️ Editar Motorista — ${m.nomeGuerra||id}`;document.getElementById('m-id').value=id;document.getElementById('m-matricula').value=m.matricula||'';document.getElementById('m-nomeGuerra').value=m.nomeGuerra||'';document.getElementById('m-nomeCivil').value=m.nomeCivil||'';document.getElementById('m-posto').value=m.posto||'';document.getElementById('m-subunidade').value=m.subunidade||'';document.getElementById('m-turno').value=m.turno||'';document.getElementById('m-cnh').value=m.cnh||'';document.getElementById('m-categoriaCnh').value=m.categoriaCnh||'';document.getElementById('m-validadeCnh').value=m.validadeCnh||'';document.getElementById('m-restricoesCnh').value=m.restricoesCnh||'';document.getElementById('m-telefone').value=m.telefone||'';document.getElementById('m-email').value=m.email||'';document.getElementById('m-cpf').value=m.cpf?(m.cpf.length===11?m.cpf.substring(0,3)+'.'+m.cpf.substring(3,6)+'.'+m.cpf.substring(6,9)+'-'+m.cpf.substring(9,11):m.cpf):'';document.getElementById('m-status').value=m.status||'Ativo';document.getElementById('m-motivoAfastamento').value=m.motivoAfastamento||'';document.getElementById('m-obs').value=m.obs||'';document.getElementById('m-msg').textContent='';document.getElementById('modal-motorista').classList.add('open')}

        function fecharModal(){document.getElementById('modal-motorista').classList.remove('open')}

        async function salvarMotorista(){
            const id=document.getElementById('m-id').value.trim();
            const matricula=document.getElementById('m-matricula').value.trim();
            const nomeGuerra=document.getElementById('m-nomeGuerra').value.trim().toUpperCase();
            const nomeCivil=document.getElementById('m-nomeCivil').value.trim();
            const posto=document.getElementById('m-posto').value;
            const subunidade=document.getElementById('m-subunidade').value.trim();
            const turno=document.getElementById('m-turno').value;
            const cnh=document.getElementById('m-cnh').value.trim();
            const categoriaCnh=document.getElementById('m-categoriaCnh').value;
            const validadeCnh=document.getElementById('m-validadeCnh').value;
            const restricoesCnh=document.getElementById('m-restricoesCnh').value.trim();
            const telefone=document.getElementById('m-telefone').value.trim();
            const email=document.getElementById('m-email').value.trim();
            const status=document.getElementById('m-status').value;
            const motivoAfastamento=document.getElementById('m-motivoAfastamento').value.trim();
            const obs=document.getElementById('m-obs').value.trim();
            const cpf=document.getElementById('m-cpf').value.replace(/\D/g,'').padStart(11,'0');
            const msgEl=document.getElementById('m-msg');
            // Valida CPF: obrigatório e deve ter 11 dígitos
            if(!matricula||!nomeGuerra||!posto||!cnh||!categoriaCnh||!validadeCnh||cpf==='00000000000'){msgEl.style.color='#dc3545';msgEl.textContent='⚠️ Preencha os campos obrigatórios: Matrícula, Nome de Guerra, CPF, Posto, CNH, Categoria e Validade.';return}
            if(!id){const existe=Object.values(motoristasCache).some(m=>m.matricula&&m.matricula===matricula);if(existe){msgEl.style.color='#dc3545';msgEl.textContent='⚠️ Já existe um motorista com esta matrícula.';return}}
            const dados={matricula,nomeGuerra,nomeCivil,cpf,posto,subunidade,turno,cnh,categoriaCnh,validadeCnh,restricoesCnh,telefone,email,status,motivoAfastamento,obs,atualizadoEm:new Date().toISOString(),atualizadoPor:localStorage.getItem('frota_usuario')||'Sistema'};
            msgEl.style.color='#155724';msgEl.textContent='Salvando...';
            try{
                if(id){if(motoristasCache[id]?.criadoEm)dados.criadoEm=motoristasCache[id].criadoEm;await fb_put('motoristas',id,dados);msgEl.textContent='✅ Motorista atualizado com sucesso!';motoristasCache[id]=dados}
                else{dados.criadoEm=new Date().toISOString();dados.criadoPor=localStorage.getItem('frota_usuario')||'Sistema';const r=await fb_post('motoristas',dados);msgEl.textContent='✅ Motorista cadastrado com sucesso!';motoristasCache[r.name]=dados}
                renderizarTabela();setTimeout(fecharModal,1600)
            }catch(e){msgEl.style.color='#dc3545';msgEl.textContent='Erro ao salvar. Verifique a conexão com o Firebase.';console.error(e)}
        }

        async function excluirMotorista(id,nome){if(!confirm(`Confirma a exclusão do motorista "${nome}"?\n\nEsta ação não pode ser desfeita.`))return;try{await fb_delete('motoristas',id);delete motoristasCache[id];renderizarTabela()}catch(e){alert('Erro ao excluir. Verifique a conexão.')}}


        // ================================================================
        // IMPORTAÇÃO XLS — RH/PMAL
        // ================================================================
        let xlsLinhasParaImportar = [];

        function abrirModalImportacao() {
            xlsLinhasParaImportar = [];
            document.getElementById('xls-file-name').textContent = '';
            document.getElementById('xls-preview-area').style.display = 'none';
            document.getElementById('xls-import-progress').style.display = 'none';
            document.getElementById('btn-confirmar-importar').style.display = 'none';
            document.getElementById('xls-msg').textContent = '';
            document.getElementById('modal-importacao').classList.add('open');

            // Drag & drop
            const drop = document.getElementById('xls-drop');
            drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
            drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
            drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('drag-over'); processarArquivoXLS(e.dataTransfer.files[0]); });
        }

        function fecharModalImportacao() {
            document.getElementById('modal-importacao').classList.remove('open');
        }

        function processarArquivoXLS(file) {
            if (!file) return;
            document.getElementById('xls-file-name').textContent = '📄 ' + file.name;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    // Lê como ArrayBuffer — funciona para .xls SpreadsheetML e .xlsx
                    const data = new Uint8Array(e.target.result);
                    // raw:true + cellText:true garante que CPFs como 02677293404
                    // não percam o zero inicial (XLSX converte para número por padrão)
                    const wb = XLSX.read(data, { type: 'array', raw: false, cellText: true, cellDates: true });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });

                    if (!rows.length) {
                        document.getElementById('xls-msg').style.color = 'red';
                        document.getElementById('xls-msg').textContent = '⚠️ Planilha vazia ou formato não reconhecido.';
                        return;
                    }

                    // Mapeia colunas RH/PMAL → campos do sistema
                    // Aceita variações de nome das colunas (com/sem acento, maiúsculo)
                    function col(row, ...nomes) {
                        for (const k of Object.keys(row)) {
                            const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
                            for (const n of nomes) {
                                const nn = n.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
                                if (kn === nn || kn.includes(nn)) return String(row[k] || '').trim();
                            }
                        }
                        return '';
                    }

                    // Converte data RH "DD-MM-YYYY" → "YYYY-MM-DD" (formato input date)
                    function converterDataRH(s) {
                        if (!s) return '';
                        const m = String(s).match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
                        if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
                        // Se vier no formato XLSX numérico (nº de série Excel)
                        if (/^\d{5}$/.test(s)) {
                            const d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
                            return d.toISOString().substring(0,10);
                        }
                        return s;
                    }

                    const matriculasExistentes = new Set(
                        Object.values(motoristasCache).map(m => String(m.matricula || '').trim())
                    );

                    xlsLinhasParaImportar = [];
                    const preview = [];

                    rows.forEach(row => {
                        const matricula  = col(row, 'matricula', 'mat').replace(/[^0-9]/g, '');
                        const nome       = col(row, 'nome');
                        const pg         = col(row, 'p/g', 'pg', 'posto', 'grad');
                        // CPF: forçar string com zeros à esquerda (XLSX lê como número e corta o zero inicial)
                        const cpfRaw     = col(row, 'cpf');
                        const cpf        = cpfRaw.replace(/[^0-9]/g, '').padStart(11, '0');
                        const opm        = col(row, 'opm', 'unidade');
                        const condicao   = col(row, 'condicao', 'condição');
                        const situacao   = col(row, 'situacao', 'situação');
                        // Campos extras presentes no XLS do 10º BPM
                        const nomeGuerra = col(row, 'nome guerra', 'nomeguerra', 'guerra') || nome.split(' ').pop();
                        const cnh        = col(row, 'cnh').replace(/[^0-9]/g, '');
                        const cnhCat     = col(row, 'cnh categoria', 'categoria cnh', 'cnh cat');
                        const cnhVal     = col(row, 'cnh validade', 'validade cnh');
                        const telefone   = col(row, 'telefone', 'tel', 'celular').replace(/[^0-9()\-+ ]/g, '');
                        const email      = col(row, 'e-mail', 'email');

                        if (!matricula && !nome) return; // linha vazia

                        const jaCadastrado = matriculasExistentes.has(matricula);

                        // Mapeia P/G para o formato do sistema
                        const pgMap = {
                            'cel':'CEL','tc':'TC','maj':'MAJ','cap':'CAP',
                            '1ten':'1TEN','2ten':'2TEN','asp':'ASP',
                            'sub ten':'SUB','subten':'SUB','st':'SUB',
                            '1sgt':'1SGT','2sgt':'2SGT','3sgt':'3SGT',
                            'cb':'CB','sd':'SD','soldado':'SD','cabo':'CB',
                        };
                        const pgNorm = pg.toLowerCase().trim();
                        const postoMapeado = Object.entries(pgMap).find(([k]) => pgNorm.startsWith(k))?.[1] || pg.toUpperCase();

                        // Status baseado na condição/situação do RH
                        let status = 'Ativo';
                        const cond = (condicao + ' ' + situacao).toLowerCase();
                        if (cond.includes('licen')) status = 'Licenca';
                        else if (cond.includes('ferias') || cond.includes('férias')) status = 'Ferias';
                        else if (cond.includes('afasta')) status = 'Afastado';
                        else if (cond.includes('suspens')) status = 'Suspenso';

                        const dadosMotorista = {
                            matricula,
                            nomeGuerra,
                            nomeCivil:    nome,
                            posto:        postoMapeado,
                            subunidade:   opm,
                            cpf,           // sempre 11 dígitos com zeros à esquerda
                            status,
                            cnh,
                            categoriaCnh: cnhCat.toUpperCase(),
                            validadeCnh:  cnhVal ? converterDataRH(cnhVal) : '',
                            telefone,
                            email,
                        };

                        preview.push({ jaCadastrado, matricula, nome, pg: postoMapeado, cpf, opm, status });
                        if (!jaCadastrado) xlsLinhasParaImportar.push(dadosMotorista);
                    });

                    // Exibe preview
                    const jaExist = preview.filter(p => p.jaCadastrado).length;
                    const novos   = preview.filter(p => !p.jaCadastrado).length;
                    document.getElementById('xls-total-linhas').textContent = preview.length;
                    document.getElementById('xls-ja-cadastrados-info').textContent =
                        `(${novos} novos, ${jaExist} já existentes)`;

                    document.getElementById('xls-preview-table').innerHTML = `
                        <table>
                            <thead><tr>
                                <th>Status</th><th>Matrícula</th><th>Nome</th>
                                <th>P/G</th><th>CPF</th><th>OPM</th><th>Situação</th>
                            </tr></thead>
                            <tbody>${preview.map(p => `<tr>
                                <td>${p.jaCadastrado
                                    ? '<span class="badge-skip">Já existe</span>'
                                    : '<span class="badge-novo">Novo</span>'}</td>
                                <td>${p.matricula}</td>
                                <td>${p.nome}</td>
                                <td>${p.pg}</td>
                                <td>${p.cpf ? p.cpf.substring(0,3)+'.***.***-**' : '—'}</td>
                                <td>${p.opm}</td>
                                <td>${p.status}</td>
                            </tr>`).join('')}</tbody>
                        </table>`;

                    document.getElementById('xls-preview-area').style.display = 'block';
                    document.getElementById('btn-confirmar-importar').style.display =
                        xlsLinhasParaImportar.length ? 'flex' : 'none';
                    document.getElementById('btn-confirmar-importar').textContent =
                        `Importar ${xlsLinhasParaImportar.length} novo(s) militar(es)`;

                    if (!xlsLinhasParaImportar.length) {
                        document.getElementById('xls-msg').style.color = '#856404';
                        document.getElementById('xls-msg').textContent = '⚠️ Todos os militares da planilha já estão cadastrados.';
                    } else {
                        document.getElementById('xls-msg').textContent = '';
                    }

                } catch(err) {
                    console.error(err);
                    document.getElementById('xls-msg').style.color = 'red';
                    document.getElementById('xls-msg').textContent = '❌ Erro ao processar arquivo. Verifique se é um .xls válido do RH/PMAL.';
                }
            };
            reader.readAsArrayBuffer(file);
        }

        async function confirmarImportacaoXLS() {
            if (!xlsLinhasParaImportar.length) return;

            const btn = document.getElementById('btn-confirmar-importar');
            btn.disabled = true;
            const total = xlsLinhasParaImportar.length;
            document.getElementById('xls-import-progress').style.display = 'block';
            const labelEl = document.getElementById('xls-progress-label');
            const barEl   = document.getElementById('xls-progress-bar');

            let ok = 0, erro = 0;
            for (let i = 0; i < xlsLinhasParaImportar.length; i++) {
                const m = xlsLinhasParaImportar[i];
                try {
                    m.criadoEm  = new Date().toISOString();
                    m.criadoPor = localStorage.getItem('frota_usuario') || 'Importação XLS';
                    const r = await fb_post('motoristas', m);
                    motoristasCache[r.name] = m;
                    ok++;
                } catch(e) { erro++; }

                const pct = Math.round(((i+1)/total)*100);
                barEl.style.width = pct + '%';
                labelEl.textContent = `Importando ${i+1} / ${total}... (${pct}%)`;
            }

            labelEl.textContent = `✅ Concluído: ${ok} importado(s)${erro ? ', ' + erro + ' com erro' : ''}.`;
            barEl.style.background = 'var(--cor-success)';
            renderizarTabela();

            setTimeout(() => {
                fecharModalImportacao();
                btn.disabled = false;
            }, 2200);
        }

        document.addEventListener('DOMContentLoaded', () => {
            checkLogin();
            atualizarRelogio();
            setInterval(atualizarRelogio, 1000);
            carregarMotoristas();

            // Modais: só registra eventos após o DOM estar completamente carregado
            document.getElementById('modal-motorista').addEventListener('click', function(e) {
                if (e.target === this) fecharModal();
            });
            document.getElementById('modal-importacao').addEventListener('click', function(e) {
                if (e.target === this) fecharModalImportacao();
            });
        });