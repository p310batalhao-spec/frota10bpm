<?php
/**
 * Proxy para o GEO/SEDS-AL
 * Coloca este arquivo no seu servidor (mesma origem do sistema de frota)
 * Chamada: geo_proxy.php?numQuery=1&idUnidade=0&idModalidade=0
 */

// Permite chamadas do seu sistema (ajuste o domínio se necessário)
// Permite chamadas do GitHub Pages (ajuste para o seu usuário/repo)
// Formato: https://SEU_USUARIO.github.io
$origem_permitida = $_SERVER['HTTP_ORIGIN'] ?? '';
$origens_ok = [
    // GitHub Pages — ajuste para o seu usuario real do GitHub
    'https://jonatbpm.github.io',

    // Live Server (VS Code) — cobre as portas mais comuns
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://localhost:5501',
    'http://localhost:3000',
    'http://localhost',
];

// Aceita qualquer subdominio .github.io (cobre usuario/repo variations)
$eh_github = str_ends_with($origem_permitida, '.github.io');

// Aceita qualquer 127.0.0.1 com qualquer porta (Live Server)
$eh_local = preg_match('/^http:\/\/127\.0\.0\.1(:\d+)?$/', $origem_permitida)
          || preg_match('/^http:\/\/localhost(:\d+)?$/', $origem_permitida);

if (in_array($origem_permitida, $origens_ok) || $eh_github || $eh_local) {
    header("Access-Control-Allow-Origin: {$origem_permitida}");
} else {
    // Origem nao reconhecida — bloqueia
    http_response_code(403);
    exit('Acesso negado');
}
header('Content-Type: text/plain; charset=UTF-8');
header('Cache-Control: no-cache, no-store');

// Parâmetros recebidos do front-end
$numQuery    = intval($_GET['numQuery']    ?? 1);
$idUnidade   = intval($_GET['idUnidade']  ?? 0);
$idModalidade = intval($_GET['idModalidade'] ?? 0);

// URL do GEO
$url = "https://analisacad.seguranca.al.gov.br/app/cad/cad_blank_monitoramento_viaturas/cad_blank_carregar_pontos.php"
     . "?numQuery={$numQuery}&idUnidade={$idUnidade}&idModalidade={$idModalidade}";

// Faz a requisição pelo servidor (sem restrição de CORS)
$ctx = stream_context_create([
    'http' => [
        'method'  => 'GET',
        'timeout' => 15,
        'header'  => implode("\r\n", [
            'User-Agent: Mozilla/5.0 (compatible; SistemaFrota10BPM)',
            'Accept: text/plain,*/*',
            'Referer: https://analisacad.seguranca.al.gov.br/',
        ]),
    ],
    'ssl' => [
        'verify_peer'      => false,
        'verify_peer_name' => false,
    ],
]);

$resposta = @file_get_contents($url, false, $ctx);

if ($resposta === false) {
    http_response_code(502);
    echo 'ERRO: nao foi possivel conectar ao GEO';
    exit;
}

// Converte de windows-1252 para UTF-8
echo mb_convert_encoding($resposta, 'UTF-8', 'Windows-1252');
