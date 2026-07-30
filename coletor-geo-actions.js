/**
 * coletor-geo-actions.js — GitHub Actions
 * Coleta GEO e envia para Google Apps Script → Google Sheets
 */

const https = require('https');
const http  = require('http');

const GEO_URL = 'https://analisacad.seguranca.al.gov.br/app/cad/cad_blank_carregar_pontos/cad_blank_carregar_pontos.php';
const GAS_URL = process.env.GAS_URL;
const UNIDADE = '10º BPM';

// ── HTTP GET com retry ───────────────────────────────────────────
function httpGet(url, tentativa = 1) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: {
                'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection':      'keep-alive',
                'Referer':         'https://analisacad.seguranca.al.gov.br/',
                'Origin':          'https://analisacad.seguranca.al.gov.br',
            },
            rejectUnauthorized: false,
        }, res => {
            // Segue redirecionamentos
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpGet(res.headers.location, tentativa).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, buf: Buffer.concat(chunks) }));
        });
        req.on('error', err => {
            if (tentativa < 3) {
                console.log(`[GEO] Retry ${tentativa}/3 após erro: ${err.message}`);
                setTimeout(() => httpGet(url, tentativa + 1).then(resolve).catch(reject), 3000 * tentativa);
            } else {
                reject(err);
            }
        });
        req.setTimeout(30000, () => {
            req.destroy();
            if (tentativa < 3) {
                console.log(`[GEO] Retry ${tentativa}/3 após timeout`);
                setTimeout(() => httpGet(url, tentativa + 1).then(resolve).catch(reject), 3000 * tentativa);
            } else {
                reject(new Error('Timeout GEO após 3 tentativas'));
            }
        });
    });
}

function httpPost(urlStr, dados) {
    return new Promise((resolve, reject) => {
        const corpo = JSON.stringify(dados);
        const url   = new URL(urlStr);
        const req = https.request({
            hostname: url.hostname,
            path:     url.pathname + url.search,
            method:   'POST',
            headers: {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(corpo),
            },
            rejectUnauthorized: false,
        }, res => {
            // GAS redireciona para URL de execução — segue
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return httpPost(res.headers.location, dados).then(resolve).catch(reject);
            }
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
                catch { resolve({ ok: true }); }
            });
        });
        req.on('error', reject);
        req.setTimeout(45000, () => { req.destroy(); reject(new Error('Timeout GAS')); });
        req.write(corpo);
        req.end();
    });
}

// ── Parser GEO ───────────────────────────────────────────────────
function parsear(buf) {
    let texto = buf.toString('utf8');
    if (!texto.includes('#(')) texto = buf.toString('latin1');
    if (!texto.includes('#(')) texto = buf.toString('binary');

    console.log(`[GEO] Resposta: ${texto.length} chars, contém #(: ${texto.includes('#(')}`);
    if (!texto.includes('#(')) {
        console.log('[GEO] Amostra:', texto.substring(0, 200));
        return [];
    }

    const lista = [];
    texto.substring(texto.indexOf('#(')).split('#')
        .filter(r => r.startsWith('('))
        .forEach(reg => {
            const c = reg.split('(');
            if (c.length < 13) return;
            const lat = parseFloat(c[1]);
            const lng = parseFloat(c[2]);
            if (!lat || !lng) return;

            const dataHora = c[4].trim();
            let timestamp  = null;
            const m = dataHora.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
            if (m) timestamp = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00`;

            lista.push({
                lat, lng,
                idRadio:     c[3].trim(),
                dataHora,    timestamp,
                guarnicao:   c[5].trim(),
                unidade:     c[6].trim(),
                modalidade:  c[7].trim(),
                militares:   c[8].trim(),
                ocorrencia:  c[9].trim() !== '0' ? c[9].trim() : null,
                tipoVeiculo: c[11].trim(),
                status:      c[13] ? c[13].trim() : '',
            });
        });
    return lista;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
    if (!GAS_URL) {
        console.error('[GEO] GAS_URL não configurado.');
        process.exit(1);
    }

    console.log(`[GEO] ${new Date().toLocaleString('pt-BR')} — coletando...`);

    const url = `${GEO_URL}?numQuery=1&idUnidade=0&idModalidade=999999&numRadio=0`;
    console.log('[GEO] URL:', url);

    const { status, buf } = await httpGet(url);
    console.log(`[GEO] HTTP status: ${status}`);

    const todas = parsear(buf);
    console.log(`[GEO] ${todas.length} guarnicoes recebidas`);

    const norm = s => String(s || '').replace(/[^A-Z0-9 /]/gi, '').trim().toUpperCase();
    const daUnidade = todas.filter(g => norm(g.unidade) === norm(UNIDADE));
    console.log(`[GEO] 10 BPM: ${daUnidade.length} guarnicoes`);

    if (daUnidade.length === 0) {
        // Mesmo sem dados, reporta sucesso para não falhar o workflow
        console.log('[GEO] Nenhuma guarnicao encontrada. Pode ser horário sem patrulha.');
        process.exit(0);
    }

    const guarnicoes = daUnidade.map(g => ({
        idRadio:     g.idRadio,
        nome:        g.guarnicao,
        unidade:     g.unidade,
        modalidade:  g.modalidade,
        militares:   g.militares,
        tipoVeiculo: g.tipoVeiculo,
        status:      g.status,
        ocorrencia:  g.ocorrencia,
        lat:         g.lat,
        lng:         g.lng,
        dataHoraGEO: g.dataHora,
        timestamp:   g.timestamp,
    }));

    console.log(`[GEO] Enviando ${guarnicoes.length} guarnicoes para o GAS...`);
    const resp = await httpPost(GAS_URL, { guarnicoes });
    console.log('[GEO] GAS respondeu:', JSON.stringify(resp));

    process.exit(0);
}

main().catch(e => {
    console.error('[GEO] Erro fatal:', e.message);
    // Exit 0 para não bloquear o workflow por problema temporário de rede
    process.exit(0);
});
