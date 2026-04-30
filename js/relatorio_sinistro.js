const FB_URL = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';

// ── Pega o ID da URL ──
const params = new URLSearchParams(window.location.search);
const sinistroId = params.get('id');

async function carregar() {
    if (!sinistroId) {
        document.getElementById('loading').textContent = '❌ ID do sinistro não informado.';
        return;
    }
    try {
        const r = await fetch(`${FB_URL}/sinistros/${sinistroId}.json`);
        const s = await r.json();
        if (!s) { document.getElementById('loading').textContent = '❌ Sinistro não encontrado.'; return; }
        renderizar(s);
        document.getElementById('loading').style.display = 'none';
        document.getElementById('documento').style.display = 'block';
    } catch(e) {
        document.getElementById('loading').textContent = '❌ Erro ao buscar dados. Verifique a conexão.';
    }
}

// ── Helper: checkbox visual ──
function cb(marcado) {
    return `<span class="cb ${marcado ? 'marcado' : ''}">${marcado ? 'X' : '&nbsp;'}</span>`;
}

// ── Helper: valor ou traço ──
function v(val) { return val || '&nbsp;'; }

// ── Helper: data DD/MM/AAAA ──
function fData(iso) {
    if (!iso) return '&nbsp;';
    const [a,m,d] = iso.split('-');
    return `${d}/${m}/${a}`;
}

function renderizar(s) {
    const tipos     = Array.isArray(s.tipos) ? s.tipos : (s.tipos ? [s.tipos] : []);
    const t = (tipo) => tipos.includes(tipo);

    // Objetos fixos
    const of = s.danoObjFixos || {};

    // Testemunhas — até 6
    const test = s.testemunhas || [];
    while (test.length < 6) test.push({ nome: '', fone: '' });

    // Danos de terceiros — pelo menos 2 linhas
    const terc = s.danosTerceiros || [];
    while (terc.length < 2) terc.push({ placa:'', marca:'', tipo:'', modelo:'' });

    // Data/hora formatados
    const dataF = fData(s.data);
    const horaF = s.hora ? s.hora.replace(':', 'H:') + 'MIN' : '';

    // Condutor CNH validade
    const cnhValF = s.condutorCNHVal ? fData(s.condutorCNHVal) : '';

    // Local e data da assinatura
    const dataAssinF = s.data ? (() => {
        const d = new Date(s.data + 'T12:00:00');
        return `P. dos Índios-AL, ${d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})}`;
    })() : 'P. dos Índios-AL, ____/____/________';

    const html = `
    <!-- ═══════════ PÁGINA 1 ═══════════ -->
    <div class="pagina">

        <!-- CABEÇALHO INSTITUCIONAL -->
        <div class="doc-cabecalho">
            <p>Estado de Alagoas</p>
            <p>Secretaria de Estado da Gestão Pública</p>
            <p>Agência de Modernização da Gestão de Processos</p>
            <p class="destaque">Diretoria Técnica da Gestão de Transportes</p>
            <p <strong>ANEXO I</strong></p>
        </div>

        <!-- TÍTULO -->
        <div class="doc-titulo">Termo de Comunicação de Sinistro com Veículos</div>

        <!-- 01 UG / 02 SINISTRO -->
        <div class="linha-ug">
            <div class="celula-ug">01 - UG: ${v(s.ug)}</div>
            <div class="celula-sin">02 – Sinistro nº: ${v(s.numero)}</div>
        </div>

        <!-- 03 DADOS DO VEÍCULO -->
        <div class="sec-header">03 – DADOS DO VEÍCULO SINISTRADO</div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:1.5"><span class="label">Placa:</span><span class="valor">${v(s.placa)}</span></div>
            <div class="doc-celula" style="flex:1"><span class="label">Marca:</span><span class="valor">${v(s.marca)}</span></div>
            <div class="doc-celula" style="flex:1.2"><span class="label">Tipo:</span><span class="valor">${v(s.tipoVeiculo)}</span></div>
            <div class="doc-celula" style="flex:2"><span class="label">Mod:</span><span class="valor">${v(s.modelo)}</span></div>
        </div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:2.5"><span class="label">Chassi:</span><span class="valor">${v(s.chassi)}</span></div>
            <div class="doc-celula" style="flex:2"><span class="label">RENAVAM:</span><span class="valor">${v(s.renavam)}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Cor:</span><span class="valor">${v(s.cor)}</span></div>
        </div>

        <!-- 04 LOCADORA -->
        <div class="sec-header">04 – LOCADORA</div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:2"><span class="label">Nome:</span><span class="valor">${v(s.locadora)}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Contrato nº:</span><span class="valor">${v(s.contrato)}</span></div>
        </div>

        <!-- 05 DADOS DO CONDUTOR -->
        <div class="sec-header">05 – DADOS DO CONDUTOR DO VEÍCULO</div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:3"><span class="label">Nome:</span><span class="valor">${v(s.condutorNome)}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Matrícula:</span><span class="valor">${v(s.condutorMatricula)}</span></div>
        </div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:1.5"><span class="label">Lotação:</span><span class="valor">${v(s.condutorLotacao)}</span></div>
            <div class="doc-celula" style="flex:2"><span class="label">CNH:</span><span class="valor">${v(s.condutorCNH)}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Validade/CNH:</span><span class="valor">${cnhValF || '&nbsp;'}</span></div>
        </div>

        <!-- 06 DADOS DO SINISTRO -->
        <div class="sec-header">06 – DADOS DO SINISTRO</div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:2.5"><span class="label">Local:</span><span class="valor">${v(s.local)}</span></div>
            <div class="doc-celula" style="flex:2"><span class="label">Cidade:</span><span class="valor">${v(s.cidade)}</span></div>
        </div>
        <div class="doc-linha">
            <div class="doc-celula" style="flex:2"><span class="label">Bairro:</span><span class="valor">${v(s.bairro)}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Data:</span><span class="valor">${dataF}</span></div>
            <div class="doc-celula" style="flex:1.5"><span class="label">Hora:</span><span class="valor">${horaF}</span></div>
        </div>

        <!-- TIPO DE SINISTRO -->
        <div class="doc-linha" style="background:#f5f5f5">
            <div class="doc-celula" style="flex:1;justify-content:center;font-weight:700;font-size:9pt">Tipo de Sinistro</div>
        </div>
        <div class="tipos-row">
            <div class="tipo-celula">${cb(t('Atropelamento'))} Atropelamento</div>
            <div class="tipo-celula">${cb(t('Capotamento'))} Capotamento</div>
            <div class="tipo-celula">${cb(t('Colisão'))} Colisão</div>
            <div class="tipo-celula">${cb(t('Queda'))} Queda</div>
            <div class="tipo-celula">${cb(t('Tombamento'))} Tombamento</div>
            <div class="tipo-celula">${cb(t('Choque'))} Choque</div>
        </div>
        <div class="tipos-row">
            <div class="tipo-celula">${cb(t('Roubo'))} Roubo</div>
            <div class="tipo-celula">${cb(t('Furto'))} Furto</div>
            <div class="tipo-celula">${cb(t('Incêndio'))} Incêndio</div>
            <div class="tipo-celula">${cb(t('Alagamento'))} Alagamento</div>
            <div class="tipo-celula" style="flex:2">${cb(t('Outros'))} Outros</div>
        </div>

        <!-- DANOS CAUSADOS -->
        <div class="doc-linha" style="background:#f5f5f5">
            <div class="doc-celula" style="flex:1;justify-content:center;font-weight:700;font-size:9pt">Danos causados</div>
        </div>
        <div class="doc-linha">
            <!-- Veículos de Terceiros -->
            <div style="flex:1.8;border-right:1pt solid #000">
                <table class="tabela-danos" style="border:none">
                    <thead>
                        <tr>
                            <th colspan="4" style="text-align:center;border-top:none;border-left:none;border-right:none">Em veículos de Terceiros</th>
                        </tr>
                        <tr>
                            <th style="border-left:none">Placa</th>
                            <th>Marca</th>
                            <th>Tipo</th>
                            <th style="border-right:none">Modelo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${terc.map(t2 => `<tr>
                            <td style="border-left:none">${v(t2.placa)}</td>
                            <td>${v(t2.marca)}</td>
                            <td>${v(t2.tipo)}</td>
                            <td style="border-right:none">${v(t2.modelo)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <!-- Objetos Fixos -->
            <div style="flex:1">
                <table class="tabela-danos" style="border:none;width:100%">
                    <thead>
                        <tr>
                            <th colspan="2" style="text-align:center;border-top:none;border-left:none;border-right:none">A Terceiros – Objetos Fixos</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="border-left:none">${cb(of.poste)} Poste</td>
                            <td style="border-right:none">${cb(of.muro)} Muro</td>
                        </tr>
                        <tr>
                            <td style="border-left:none">${cb(of.parede)} Parede</td>
                            <td style="border-right:none">${cb(of.arvore)} Árvore</td>
                        </tr>
                        <tr>
                            <td style="border-left:none">${cb(of.guardRail)} Guard Rail</td>
                            <td style="border-right:none">${cb(of.outrosFixos)} Outros</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 07 TESTEMUNHAS -->
        <div class="sec-header">07 – TESTEMUNHAS – Passageiros: (1, 2 e 3) – Presencial: (4, 5 e 6)</div>
        <table class="tabela-test" style="border-top:none">
            <thead>
                <tr>
                    <th class="col-nome">Nomes</th>
                    <th class="col-fone">Telefones</th>
                </tr>
            </thead>
            <tbody>
                ${test.slice(0,6).map((t2, i) => `<tr>
                    <td class="col-nome">(${i+1}) – ${v(t2.nome)}</td>
                    <td class="col-fone">${v(t2.fone)}</td>
                </tr>`).join('')}
            </tbody>
        </table>

        <!-- 08 e 09 lado a lado -->
        <div class="dois-col">
            <div class="col">
                <div class="col-header">08 – DESCRIÇÃO DOS DANOS NOS VEÍCULOS</div>
                <div class="col-body" style="font-size:8pt;color:#555">
                    <em>Usar o verso para fazer a descrição.</em><br>
                    08 "A" – Do veículo Oficial<br>
                    08 "B" – Do veículo de Terceiros
                </div>
            </div>
            <div class="col">
                <div class="col-header">09 – DESCRIÇÃO DO ACIDENTE</div>
                <div class="col-body" style="font-size:8pt;color:#555">
                    <em>Usar o verso para fazer a descrição.</em><br><br>
                    09 – Descrever o sinistro sucintamente.
                </div>
            </div>
        </div>

        <!-- RESPONSÁVEL + ASSINATURA -->
        <div class="assinatura-row">
            <div class="assinatura-celula" style="flex:2">
                <div class="ass-label">Responsável pelas Informações</div>
                <div style="margin-top:14pt;font-size:9pt">${v(s.responsavel)}</div>
            </div>
            <div class="assinatura-celula" style="flex:1.5">
                <div class="ass-label">Local e Data:</div>
                <div style="margin-top:4pt;font-size:9pt">${dataAssinF}</div>
            </div>
            <div class="assinatura-celula" style="flex:1.5">
                <div class="ass-label">Ass. e Carimbo – Subgestor da UG:</div>
            </div>
        </div>

        <div class="num-pagina">1</div>
    </div><!-- fim página 1 -->


    <!-- ═══════════ PÁGINA 2 — VERSO ═══════════ -->
    <div class="pagina">
        <div class="p2-cabecalho">Verso do Anexo I</div>

        <!-- 08 Danos — seção grande -->
        <div class="bloco-grande">
            <div class="bloco-grande-header">08 – DESCRIÇÃO DOS DANOS NOS VEÍCULOS</div>
            <div class="bloco-grande-body" style="min-height:90mm">
                ${s.danosOficial
                    ? `<strong>A – Do veículo Oficial:</strong><br>${s.danosOficial}${s.danosTerceirosDesc ? `<br><br><strong>B – Do veículo de Terceiros:</strong><br>${s.danosTerceirosDesc}` : ''}`
                    : '&nbsp;'}
            </div>
        </div>

        <!-- 09 Descrição — seção grande -->
        <div class="bloco-grande" style="border-top:none">
            <div class="bloco-grande-header">09 – DESCRIÇÃO DO SINISTRO</div>
            <div class="bloco-grande-body" style="min-height:90mm">${v(s.descricao)}</div>
        </div>

        <!-- 10 Serviço -->
        <div class="bloco-grande" style="border-top:none">
            <div class="bloco-grande-header">10 – SERVIÇO QUE REALIZAVA NA OCASIÃO DO SINISTRO</div>
            <div class="bloco-grande-body" style="min-height:28mm">${v(s.servico)}</div>
        </div>

        <div class="num-pagina">2</div>
    </div><!-- fim página 2 -->
    `;

    document.getElementById('documento').innerHTML = html;
    document.title = `Sinistro ${s.numero || ''} — ${s.placa || ''}`;
}

carregar();
