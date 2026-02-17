<?php
// cache-image.php

// ⚠️ Toujours valider / filtrer ce qui vient du client !
$id = isset($_GET['id']) ? preg_replace('/[^0-9]/', '', $_GET['id']) : null;
$url = isset($_GET['url']) ? $_GET['url'] : null;

if (!$id) {
    http_response_code(400);
    echo "Missing or invalid id";
    exit;
}

// Dossier et fichier local
$localDir  = __DIR__ . '/../assets/Cards/';
$localPath = $localDir . '/' . $id . '.jpg';




// Si le fichier existe déjà -> rien à faire
if (file_exists($localPath)) {
    echo "exists";
    exit;
}

// S'assurer que le dossier existe
if (!is_dir($localDir)) {
    mkdir($localDir, 0775, true);
}

// Télécharger l'image distante
$imageData = @file_get_contents($url);

if ($imageData === false) {
    http_response_code(500);
    echo "download_failed";
    exit;
}

// Sauvegarder en local
if (file_put_contents($localPath, $imageData) === false) {
    http_response_code(500);
    echo "write_failed";
    exit;
}

echo "downloaded";
