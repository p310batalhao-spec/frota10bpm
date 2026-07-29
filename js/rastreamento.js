// ================================================================
// GEO RASTREAMENTO — Integração com o sistema GEO/SEDS-AL
// Coleta posições das guarnições e salva no Firebase do 10º BPM
//
// Uso: incluir este arquivo nas páginas que precisam do rastreamento
// URL do GEO: https://analisacad.seguranca.al.gov.br/app/cad/
//             cad_blank_monitoramento_viaturas/cad_blank_carregar_pontos.php
// ================================================================

// Proxy PHP hospedado na Hostinger (onde já tem PHP disponível)
// O GitHub Pages só serve arquivos estáticos — PHP precisa rodar em outro servidor
// Coloque geo_proxy.php na Hostinger e ajuste a URL abaixo
const GEO_URL = 'https://irispmal-io-145648.hostingersite.com/api/geo_proxy.php';
const FB_URL   = 'https://frota10bpm-dc14a-default-rtdb.firebaseio.com';
const BPM_ALVO = '10º BPM'; // Filtra só as guarnições do 10º BPM

// ================================================================
// PARSER DO FORMATO GEO
// Formato: #(lat)(lng)(idRadio)(dataHora)(guarnicao)(unidade)
//          (modalidade)(militares)(ocorrencia)(codMod)(tipoVeiculo)
//          (codVeiculo)(status)
// ================================================================
function parsearRespostaGEO(texto) {
    const guarnicoes = [];

    // Remove erros PHP que aparecem antes dos dados
    const inicio = texto.indexOf('#(');
    if (inicio === -1) return guarnicoes;
    const dados = texto.substring(inicio);

    const registros = dados.split('#').filter(r => r.trim().startsWith('('));

    for (const reg of registros) {
        const campos = reg.split('(');
        // campos[0] é vazio (antes do primeiro '(')
        if (campos.length < 13) continue;

        const lat       = parseFloat(campos[1]);
        const lng       = parseFloat(campos[2]);
        const idRadio   = campos[3].trim();
        const dataHora  = campos[4].trim(); // "DD/MM/AAAA HH:MM"
        const guarnicao = campos[5].trim();
        const unidade   = campos[6].trim();
        const modalidade = campos[7].trim();
        const militares  = campos[8].trim();
        const ocorrencia = campos[9].trim();
        const tipoVeiculo = campos[11].trim();
        const status      = campos[13] ? campos[13].trim() : '';

        // Pula registros sem coordenada válida (lat=0 ou lng=0)
        if (!lat || !lng || lat === -0 || lng === -0) continue;

        // Converte data "DD/MM/AAAA HH:MM" para ISO
        let timestamp = null;
        const matchData = dataHora.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
        if (matchData) {
            timestamp = `${matchData[3]}-${matchData[2]}-${matchData[1]}T${matchData[4]}:${matchData[5]}:00`;
        }

        guarnicoes.push({
            idRadio,
            lat,
            lng,
            dataHora,
            timestamp,
            guarnicao,
            unidade,
            modalidade,
            militares,
            ocorrencia: ocorrencia !== '0' ? ocorrencia : null,
            tipoVeiculo,
            status,
        });
    }

    return guarnicoes;
}

// ================================================================
// COLETA DO GEO
// numQuery=1 retorna todos os pontos ativos
// numQuery=3 retorna CVLI, =5 CVP, =7 outras modalidades, =8 geral
// ================================================================
async function coletarPosicoes(numQuery = 1, idUnidade = 0) {
    const params = new URLSearchParams({
        numQuery,
        idUnidade,
        idModalidade: 0,
    });

    const r = await fetch(`${GEO_URL}?${params}`);
    const texto = await r.text();
    return parsearRespostaGEO(texto);
}

// ================================================================
// SALVAR NO FIREBASE
// Cada guarnição salva em /rastreamento/{idRadio}
// Mantém histórico em /rastreamento_historico/{idRadio}/{timestamp}
// ================================================================
async function salvarPosicaoFirebase(guarnicao) {
    // Usa o viaturaId do cadastro como chave principal (mais estável que idRadio)
    const chave = guarnicao.viaturaId || guarnicao.idRadio;

    const agora = new Date().toISOString();

    const dadosPosicao = {
        // Dados de localização
        lat:             guarnicao.lat,
        lng:             guarnicao.lng,
        // Dados do GEO
        guarnicao:       guarnicao.guarnicao,
        unidade:         guarnicao.unidade,
        modalidade:      guarnicao.modalidade,
        militares:       guarnicao.militares,
        tipoVeiculo:     guarnicao.tipoVeiculo,
        status:          guarnicao.status,
        ocorrencia:      guarnicao.ocorrencia,
        dataHoraGEO:     guarnicao.dataHora,
        // Dados do cadastro de viaturas (enriquecido pelo cruzamento)
        prefixo:         guarnicao.prefixoCadastrado || null,
        placa:           guarnicao.placaCadastrada   || null,
        modelo:          guarnicao.modeloVeiculo     || null,
        viaturaId:       guarnicao.viaturaId         || null,
        // Metadados
        coletadoEm:      agora,
    };

    // Posição ATUAL — sobrescreve sempre (chave = viaturaId)
    await fetch(`${FB_URL}/rastreamento/${chave}.json`, {
        method: 'PUT',
        body: JSON.stringify(dadosPosicao),
        headers: { 'Content-Type': 'application/json' },
    });

    // HISTÓRICO — acumula cada posição com timestamp
    // Chave: data+hora do GEO normalizada (ex: 2026-05-08T07-13-00)
    const chaveHist = (guarnicao.timestamp || agora).replace(/[:.]/g, '-').replace('T', 'T').slice(0, 19);
    await fetch(`${FB_URL}/rastreamento_historico/${chave}/${chaveHist}.json`, {
        method: 'PUT',
        body: JSON.stringify({
            lat:      guarnicao.lat,
            lng:      guarnicao.lng,
            prefixo:  guarnicao.prefixoCadastrado || null,
            placa:    guarnicao.placaCadastrada   || null,
            status:   guarnicao.status,
            guarnicao: guarnicao.guarnicao,
            dataHora: guarnicao.dataHora,
        }),
        headers: { 'Content-Type': 'application/json' },
    });
}

// ================================================================
// VERIFICAÇÃO DE CARTÃO PROGRAMA
// Verifica se a guarnição esteve dentro de um polígono no turno
//
// Uso:
//   const area = { nome: 'Área Centro', coords: [{lat, lng}, ...] };
//   const resultado = verificarCumprimentoCartao(guarnicoes, area);
// ================================================================
function pontoDentroPoligono(lat, lng, poligono) {
    // Algoritmo Ray Casting
    let dentro = false;
    const n = poligono.length;
    let j = n - 1;
    for (let i = 0; i < n; i++) {
        const xi = poligono[i].lng, yi = poligono[i].lat;
        const xj = poligono[j].lng, yj = poligono[j].lat;
        const intersecta = ((yi > lat) !== (yj > lat)) &&
            (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
        if (intersecta) dentro = !dentro;
        j = i;
    }
    return dentro;
}

function verificarCumprimentoCartao(guarnicoes, areaCartao) {
    const resultado = {
        areaCartao: areaCartao.nome,
        cumpriram:  [],
        nao_cumpriram: [],
    };

    for (const g of guarnicoes) {
        if (!g.lat || !g.lng) continue;
        const dentro = pontoDentroPoligono(g.lat, g.lng, areaCartao.coords);
        if (dentro) {
            resultado.cumpriram.push({ guarnicao: g.guarnicao, unidade: g.unidade, status: g.status });
        } else {
            resultado.nao_cumpriram.push({ guarnicao: g.guarnicao, unidade: g.unidade });
        }
    }

    return resultado;
}

// ================================================================
// SINCRONIZAÇÃO AUTOMÁTICA
// Coleta e salva no Firebase a cada intervalo (padrão: 100s = mesmo do GEO)
// Filtra opcionalmente por unidade
// ================================================================
let _syncInterval = null;

// ================================================================
// ÍNDICE DE VIATURAS CADASTRADAS
// Carrega /viaturas do Firebase e monta índice por prefixo e placa
// normalizados para cruzamento com os dados do GEO
// ================================================================
let _viaturasIdx = null; // cache do índice para não buscar toda vez

async function carregarIndiceViaturas() {
    if (_viaturasIdx) return _viaturasIdx; // usa cache se já carregou

    const r = await fetch(`${FB_URL}/viaturas.json`);
    const dados = await r.json() || {};

    const norm = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const idx = new Map(); // chave normalizada -> { id, prefixo, placa, modelo }
    for (const [id, v] of Object.entries(dados)) {
        if (v.prefixo) idx.set(norm(v.prefixo), { id, prefixo: v.prefixo, placa: v.placa, modelo: v.modelo });
        if (v.placa)   idx.set(norm(v.placa),   { id, prefixo: v.prefixo, placa: v.placa, modelo: v.modelo });
    }

    _viaturasIdx = idx;
    console.log(`[GEO] Índice de viaturas carregado: ${Object.keys(dados).length} cadastradas`);
    return idx;
}

function limparCacheViaturas() {
    _viaturasIdx = null; // força recarregamento na próxima sincronização
}

// Tenta encontrar a viatura cadastrada a partir dos dados do GEO
// O GEO não tem prefixo nem placa diretamente — usa o campo "guarnicao"
// e o "idRadio" (número do HT) para cruzar com o cadastro
function buscarViaturaCadastrada(guarnicao, idx) {
    const norm = s => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    // Tenta cruzar pelo nome da guarnição (pode bater com prefixo: "RP 01" ~ "RP01")
    const nomeNorm = norm(guarnicao.guarnicao);
    if (idx.has(nomeNorm)) return idx.get(nomeNorm);

    // Tenta variações removendo espaços intermediários
    for (const [chave, viatura] of idx.entries()) {
        if (nomeNorm.includes(chave) || chave.includes(nomeNorm)) {
            return viatura;
        }
    }

    // Tenta pelo idRadio (HT) — alguns prefixos no cadastro são o número do rádio
    const radioNorm = norm(guarnicao.idRadio);
    if (idx.has(radioNorm)) return idx.get(radioNorm);

    return null; // não encontrada
}

// ================================================================
// LÊ DO FIREBASE (populado pelo coletor-geo.js rodando no PC)
// O navegador NÃO chama o GEO diretamente (CORS bloqueado)
// O coletor-geo.js roda localmente e salva em /rastreamento/
// ================================================================
async function sincronizarUmaVez(filtrarUnidade = null) {
    try {
        const r = await fetch(`${FB_URL}/rastreamento.json`);
        const dados = await r.json() || {};

        const lista = Object.values(dados).filter(g => g && g.lat && g.lng);

        console.log(`[GEO] ${lista.length} guarnicoes lidas do Firebase`);
        return lista;

    } catch(e) {
        console.error('[GEO] Erro ao ler Firebase:', e);
        return [];
    }
}

function iniciarSincronizacaoAutomatica(intervalSegundos = 100, filtrarUnidade = null) {
    if (_syncInterval) clearInterval(_syncInterval);

    // Coleta imediata
    sincronizarUmaVez(filtrarUnidade);

    // Coleta periódica
    _syncInterval = setInterval(() => {
        sincronizarUmaVez(filtrarUnidade);
    }, intervalSegundos * 1000);

    console.log(`[GEO] Sincronização automática iniciada (a cada ${intervalSegundos}s)`);
}

function pararSincronizacao() {
    if (_syncInterval) {
        clearInterval(_syncInterval);
        _syncInterval = null;
        console.log('[GEO] Sincronização pausada.');
    }
}

// ================================================================
// BUSCAR POSIÇÕES SALVAS NO FIREBASE (para exibir no mapa do sistema)
// ================================================================
async function buscarPosicoesSalvas(apenasUnidade = null) {
    const r = await fetch(`${FB_URL}/rastreamento.json`);
    const dados = await r.json() || {};

    let lista = Object.entries(dados).map(([id, pos]) => ({ id, ...pos }));

    if (apenasUnidade) {
        lista = lista.filter(p => p.unidade && p.unidade.includes(apenasUnidade));
    }

    return lista;
}

// ================================================================
// REGISTRAR FISCALIZAÇÃO NO FIREBASE
// ================================================================
async function registrarFiscalizacao(guarnicao, areaCartao, dentro) {
    const registro = {
        guarnicao:  guarnicao.guarnicao,
        unidade:    guarnicao.unidade,
        areaCartao: areaCartao.nome,
        cumpriu:    dentro,
        lat:        guarnicao.lat,
        lng:        guarnicao.lng,
        dataHora:   guarnicao.dataHora,
        registradoEm: new Date().toISOString(),
    };

    await fetch(`${FB_URL}/fiscalizacao_cartao.json`, {
        method: 'POST',
        body: JSON.stringify(registro),
        headers: { 'Content-Type': 'application/json' },
    });
}

// Exporta para uso nos outros módulos do sistema
if (typeof module !== 'undefined') {
    module.exports = {
        parsearRespostaGEO,
        coletarPosicoes,
        salvarPosicaoFirebase,
        pontoDentroPoligono,
        verificarCumprimentoCartao,
        iniciarSincronizacaoAutomatica,
        pararSincronizacao,
        buscarPosicoesSalvas,
        registrarFiscalizacao,
        sincronizarUmaVez,
    };
}
// Expõe limparCacheViaturas para permitir refresh manual do índice
if (typeof window !== 'undefined') window.limparCacheViaturas = limparCacheViaturas;