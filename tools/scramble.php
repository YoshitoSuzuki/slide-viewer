<?php
// ページ画像をマス目に切って並べ替える（add-deck.sh から呼ぶ）。
// 使い方: php tools/scramble.php <入力.png> <出力.png> <seed> <ページ番号> <マスの大きさ>
//
// 並べ替えの順番は seed とページ番号だけで決まり、ビューア（slide-viewer.js の order()）が
// 同じ計算で元に戻す。両方を変えるときは必ずそろえること。
// 画像はマスの大きさの倍数まで右と下を広げる。

[, $in, $out, $seed, $page, $tile] = $argv + array_fill(0, 6, null);
if ($tile === null) {
    fwrite(STDERR, "usage: php scramble.php <in.png> <out.png> <seed> <page> <tile>\n");
    exit(1);
}
$seed = (int)$seed;
$page = (int)$page;
$tile = (int)$tile;

$src = imagecreatefrompng($in);
$w = imagesx($src);
$h = imagesy($src);
$cols = intdiv($w + $tile - 1, $tile);
$rows = intdiv($h + $tile - 1, $tile);

$dst = imagecreatetruecolor($cols * $tile, $rows * $tile);
imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
$order = sv_order($seed, $page, $cols * $rows);
// 出力の i 番目のマスに、元の画像の order[i] 番目のマスを置く
foreach ($order as $i => $from) {
    imagecopy(
        $dst, $src,
        ($i % $cols) * $tile, intdiv($i, $cols) * $tile,
        ($from % $cols) * $tile, intdiv($from, $cols) * $tile,
        $tile, $tile
    );
}
imagepng($dst, $out);

// xorshift32 で Fisher–Yates。JS 側と同じ結果になるよう、すべて 32bit の範囲で計算する
function sv_order(int $seed, int $page, int $n): array
{
    $m = 0xFFFFFFFF;
    $x = ($seed + $page * 2654435761) & $m;
    if ($x === 0) {
        $x = 1;
    }
    $a = range(0, $n - 1);
    for ($i = $n - 1; $i > 0; $i--) {
        $x = ($x ^ ($x << 13)) & $m;
        $x = $x ^ ($x >> 17);
        $x = ($x ^ ($x << 5)) & $m;
        $j = $x % ($i + 1);
        [$a[$i], $a[$j]] = [$a[$j], $a[$i]];
    }
    return $a;
}
