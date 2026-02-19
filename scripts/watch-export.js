const fs = require('fs');
const path = require('path');
const os = require('os');

const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads');
const PROJECT_ROOT = path.join(__dirname, '..');
const TARGET_DIR = path.join(PROJECT_ROOT, 'public', 'data');
const TARGET_FILENAME = 'font-map.json';

console.log(`👀 Watching for font-map*.json in ${DOWNLOADS_DIR}...`);
console.log(`🎯 Target: ${path.join(TARGET_DIR, TARGET_FILENAME)}`);

// Fonction pour déplacer le fichier
function moveFile(filename) {
    const sourcePath = path.join(DOWNLOADS_DIR, filename);
    const targetPath = path.join(TARGET_DIR, TARGET_FILENAME);

    try {
        // Vérifier si le fichier existe encore (il peut avoir été déplacé ou supprimé rapidement)
        if (!fs.existsSync(sourcePath)) return;

        // Attendre un peu que le téléchargement soit fini (écriture disque)
        const size = fs.statSync(sourcePath).size;
        if (size === 0) return;

        console.log(`📦 Detected ${filename}, moving and renaming to ${TARGET_FILENAME}...`);

        // Copier puis supprimer
        fs.copyFileSync(sourcePath, targetPath);
        fs.unlinkSync(sourcePath);

        console.log(`✅ Moved ${filename} to public/data/${TARGET_FILENAME}`);
        console.log('✨ You can now reload the FontMap page!');
    } catch (err) {
        // Ignorer les erreurs silencieuses (fichiers temporaires de téléchargement .crdownload etc)
    }
}

// Vérifier les fichiers existants au démarrage
try {
    const files = fs.readdirSync(DOWNLOADS_DIR);
    files.forEach(file => {
        if (file.startsWith('font-map') && file.endsWith('.json')) {
            moveFile(file);
        }
    });
} catch (e) {
    console.error('Error scanning downloads:', e);
}

// Surveiller le dossier
let processing = false;
fs.watch(DOWNLOADS_DIR, (eventType, filename) => {
    if (filename && filename.startsWith('font-map') && filename.endsWith('.json') && !processing) {
        processing = true;
        // Petit délai pour laisser le temps au système de fichiers
        setTimeout(() => {
            moveFile(filename);
            processing = false;
        }, 1000);
    }
});
