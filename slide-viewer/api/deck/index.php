<?php
// 資料の情報と、ページ画像を取るためのトークンを返す
require dirname(__DIR__, 2) . '/private/lib.php';

$deck = sv_deck($_GET['deck'] ?? '');
if (!$deck) {
    sv_fail(404);
}

$sid = sv_sid(true);
$exp = time() + (int)sv_config('token_ttl');

sv_nocache();
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'title' => $deck['title'],
    'pages' => $deck['pages'],
    'width' => $deck['width'],
    'height' => $deck['height'],
    'download' => !empty($deck['download']),
    'exp' => $exp,
    'token' => sv_token($deck['slug'], $exp, $sid),
    // 大きいページ画像はマスを並べ替えて保存してあり、ビューアが元の並びに戻して描く
    'scramble' => $deck['scramble'] ?? null,
], JSON_UNESCAPED_UNICODE);
