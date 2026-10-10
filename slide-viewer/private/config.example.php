<?php
// slide-viewer settings. Copy this file to config.php and edit it.
// Without config.php, the defaults below are used.
return [
    // Where decks (decks/<slug>/) and secret.key live.
    // Safest is a directory outside your web root. The default is this private/ folder,
    // in which case your web server must deny access to it (see README).
    'storage' => __DIR__,

    // Lifetime of the token used to fetch page images, in seconds.
    'token_ttl' => 600,

    // Max full-size page images served per browser per minute. 0 disables the limit.
    'rate_limit' => 90,
];
