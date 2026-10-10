<?php
// ダウンロードを許可した資料だけ、元の PDF を返す
require dirname(__DIR__, 2) . '/private/lib.php';

$deck = sv_deck($_GET['deck'] ?? '');
$file = $deck ? $deck['dir'] . '/original.pdf' : '';
if (!$deck || empty($deck['download']) || !is_file($file)) {
    sv_fail(404);
}

header('Content-Type: application/pdf');
header('Content-Length: ' . filesize($file));
header('Content-Disposition: attachment; filename="' . $deck['slug'] . '.pdf"');
readfile($file);
