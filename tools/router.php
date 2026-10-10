<?php
// serve.sh 用。本番の Web サーバーと同じく private/ を開けないようにする
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/slide-viewer/private/') || str_ends_with($path, '/secret.key') || str_starts_with($path, '/demo/rate/')) {
    http_response_code(403);
    return true;
}
if ($path === '/') {
    header('Location: /demo/');
    return true;
}
return false;
