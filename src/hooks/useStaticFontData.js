import { useState, useEffect } from 'react';

export function useStaticFontData() {
    const [fonts, setFonts] = useState([]);
    const [glyphPaths, setGlyphPaths] = useState({}); // Map id -> path d
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                console.log('📦 Loading static font map data...');

                // 1. Charger le sprite SVG et extraire les chemins
                const paths = {};
                try {
                    let spriteContent = '';
                    // Essayer d'abord dans /data/
                    const spriteResponse = await fetch('/data/font-sprite.svg');

                    if (!spriteResponse.ok) {
                        console.warn('⚠️ Sprite not found at /data/font-sprite.svg, trying root...');
                        const rootSpriteResponse = await fetch('/font-sprite.svg');
                        if (rootSpriteResponse.ok) {
                            spriteContent = await rootSpriteResponse.text();
                        }
                    } else {
                        spriteContent = await spriteResponse.text();
                    }

                    if (spriteContent) {
                        // Parser le SVG pour extraire les chemins
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(spriteContent, 'image/svg+xml');
                        const symbols = doc.querySelectorAll('symbol');

                        symbols.forEach(symbol => {
                            const id = symbol.id;
                            const path = symbol.querySelector('path');
                            if (id && path) {
                                paths[id] = path.getAttribute('d');
                            }
                        });
                        console.log(`🎨 Extracted ${Object.keys(paths).length} glyph paths`);
                        setGlyphPaths(paths);
                    }
                } catch (e) {
                    console.warn('⚠️ Error loading/parsing sprite:', e);
                }

                // 2. Charger les données JSON (font-map.json ou fallback typography_data.json)
                let data;
                const mapResponse = await fetch('/data/font-map.json');
                const mapContentType = mapResponse.headers.get('content-type');

                if (mapResponse.ok && mapContentType && mapContentType.includes('application/json')) {
                    data = await mapResponse.json();
                    console.log('📍 Loaded from font-map.json');
                } else {
                    console.warn('⚠️ font-map.json not available, falling back to typography_data.json');
                    const fallbackResponse = await fetch('/data/typography_data.json');
                    if (!fallbackResponse.ok) {
                        throw new Error('No font data found. Neither font-map.json nor typography_data.json available.');
                    }
                    data = await fallbackResponse.json();
                    console.log('📍 Loaded from typography_data.json (fallback)');
                }

                if (!data.fonts || !Array.isArray(data.fonts)) {
                    throw new Error('Invalid data format: missing fonts array');
                }

                console.log(`✅ Loaded ${data.fonts.length} fonts from static map`);
                setFonts(data.fonts);
                setLoading(false);

            } catch (err) {
                console.error('❌ Error loading static font data:', err);
                setError(err.message);
                setLoading(false);
            }
        };

        loadData();
    }, []);

    return {
        fonts,
        glyphPaths,
        loading,
        error
    };
}
