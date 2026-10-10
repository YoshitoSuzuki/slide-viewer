<?php
// ページ画像を返す。有効なトークンと、ビューアの fetch からの要求のときだけ
require dirname(__DIR__, 2) . '/private/lib.php';

$deck = sv_deck($_GET['deck'] ?? '');
$p = (int)($_GET['p'] ?? 0);
$size = ($_GET['s'] ?? '') === 'thumb' ? 'thumb' : 'full';
$exp = (int)($_GET['e'] ?? 0);
$token = (string)($_GET['t'] ?? '');

if (!$deck || $p < 1 || $p > $deck['pages']) {
    sv_fail(404);
}

// アドレスバーに直接貼る・<img> で埋め込むといった開き方は断る（古いブラウザはヘッダ自体が無い）
$dest = $_SERVER['HTTP_SEC_FETCH_DEST'] ?? 'empty';
if ($dest !== 'empty') {
    sv_fail(403);
}

$sid = sv_sid(false);
if (!$sid || $exp < time() || !hash_equals(sv_token($deck['slug'], $exp, $sid), $token)) {
    sv_fail(403);
}

if ($size === 'full' && !sv_rate_ok($sid)) {
    sv_fail(429);
}

$file = sprintf('%s/%s/%03d.webp', $deck['dir'], $size, $p);
if (!is_file($file)) {
    sv_fail(404);
}

sv_nocache();
header('Content-Type: image/webp');
header('Content-Length: ' . filesize($file));
readfile($file);
