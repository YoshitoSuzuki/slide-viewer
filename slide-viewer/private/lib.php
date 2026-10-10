<?php
// slide-viewer の API 共通処理。
// 資料（<storage>/decks/<slug>/）は Web から直接開けない場所に置き、ここを通してだけ返す。
// 設定は private/config.php（config.example.php をコピーして作る）。無ければ既定値で動く。

function sv_config(string $key)
{
    static $cfg = null;
    if ($cfg === null) {
        $defaults = [
            'storage' => __DIR__,      // decks/ と secret.key を置く場所
            'token_ttl' => 600,        // ページ画像用トークンの有効秒数
            'rate_limit' => 90,        // 1分間に返す大きいページ画像の上限（ブラウザごと）。0 で無制限
        ];
        $file = __DIR__ . '/config.php';
        $cfg = array_merge($defaults, is_file($file) ? (require $file) : []);
        if (getenv('SV_STORAGE')) {
            $cfg['storage'] = getenv('SV_STORAGE');
        }
    }
    return $cfg[$key];
}

function sv_storage(): string
{
    return rtrim(sv_config('storage'), '/');
}

function sv_secret(): string
{
    $f = sv_storage() . '/secret.key';
    if (!is_file($f)) {
        // 書き込めれば自動で作る。サーバーで PHP に書き込み権限が無いときは、先に手で置いておく
        if (@file_put_contents($f, bin2hex(random_bytes(32))) === false) {
            error_log('slide-viewer: secret.key がありません: ' . $f);
            sv_fail(500);
        }
        chmod($f, 0600);
    }
    return trim(file_get_contents($f));
}

function sv_deck(string $slug): ?array
{
    if (!preg_match('/^[a-z0-9][a-z0-9-]{0,63}$/', $slug)) {
        return null;
    }
    $dir = sv_storage() . '/decks/' . $slug;
    $f = $dir . '/deck.json';
    if (!is_file($f)) {
        return null;
    }
    $d = json_decode(file_get_contents($f), true);
    if (!is_array($d) || !isset($d['pages'], $d['width'], $d['height'], $d['title'])) {
        return null;
    }
    $d['pages'] = (int)$d['pages'];
    $d['slug'] = $slug;
    $d['dir'] = $dir;
    return $d;
}

// ブラウザごとの識別子。トークンをこれに結び付けるので、URL を別のブラウザに貼っても開けない
function sv_sid(bool $issue): ?string
{
    $sid = $_COOKIE['sv_sid'] ?? '';
    if (preg_match('/^[0-9a-f]{32}$/', $sid)) {
        return $sid;
    }
    if (!$issue) {
        return null;
    }
    $sid = bin2hex(random_bytes(16));
    setcookie('sv_sid', $sid, [
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https',
    ]);
    return $sid;
}

function sv_token(string $slug, int $exp, string $sid): string
{
    return hash_hmac('sha256', "$slug|$exp|$sid", sv_secret());
}

// 同じブラウザから短時間に大量のページ画像を取る要求（スクリプトでの一括取得）を断る
function sv_rate_ok(string $sid): bool
{
    $limit = (int)sv_config('rate_limit');
    if ($limit <= 0) {
        return true;
    }
    $dir = sv_storage() . '/rate';
    if (!is_dir($dir) && !@mkdir($dir, 0700)) {
        return true; // 書き込めない環境では制限しない（表示を止めない）
    }
    // cookie ごとにファイルが増える（cookie を取り直せばいくらでも増やせる）ので、
    // 数える期間（60秒）を過ぎたものはこまめに消す
    if (random_int(1, 20) === 1) {
        foreach (glob($dir . '/*') ?: [] as $old) {
            if (@filemtime($old) < time() - 120) {
                @unlink($old);
            }
        }
    }
    $fp = @fopen($dir . '/' . $sid, 'c+');
    if (!$fp) {
        return true;
    }
    flock($fp, LOCK_EX);
    [$start, $count] = array_map('intval', explode(' ', trim(stream_get_contents($fp)) ?: '0 0') + [0, 0]);
    $now = time();
    if ($now - $start >= 60) {
        $start = $now;
        $count = 0;
    }
    $count++;
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, "$start $count");
    flock($fp, LOCK_UN);
    fclose($fp);
    return $count <= $limit;
}

function sv_nocache(): void
{
    header('Cache-Control: private, no-store, max-age=0');
    header('Pragma: no-cache');
    header('X-Content-Type-Options: nosniff');
}

function sv_fail(int $code): never
{
    sv_nocache();
    http_response_code($code);
    exit;
}
