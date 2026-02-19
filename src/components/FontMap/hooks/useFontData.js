import { useState, useEffect } from 'react';

/**
 * Hook personnalisé pour la gestion des données de polices
 */
export const useFontData = (dataset) => {
  const [fonts, setFonts] = useState([]);
  const [loading, setLoading] = useState(true);
  // Plus besoin de fontMapping - utilisation directe des IDs
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const typographyFile = dataset === 'extended' 
          ? '/typography_data_extended.json' 
          : dataset === 'new'
          ? `/data/typography_data.json?t=${Date.now()}` // Force reload
          : '/typography_data.json';
        // NOTE: mappingFile supprimé car non utilisé
        const spriteFile = dataset === 'extended' 
          ? '/font-sprite-extended.svg' 
          : dataset === 'new'
          ? '/data/font-sprite.svg'
          : '/font-sprite.svg';
        const sentencesFile = dataset === 'extended' 
          ? '/font_sentences_extended.json' 
          : dataset === 'new'
          ? null // No sentences file needed for new dataset (individual SVGs)
          : '/font_sentences.json';
        
        const response = await fetch(typographyFile);
        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status}`);
        }
        const data = await response.json();
        let fonts = data.fonts;
        
        // Debug: compter les polices fusionnées
        const mergedFonts = fonts.filter(f => f.fusionInfo && f.fusionInfo.merged);
        console.log(`📊 Loaded ${fonts.length} fonts, ${mergedFonts.length} merged fonts`);
        if (mergedFonts.length > 0) {
          console.log('🔍 Merged fonts:', mergedFonts.map(f => f.name));
        }
        
        // Charger les données des phrases si disponibles (pas pour le nouveau dataset)
        if (sentencesFile) {
          try {
            const sentencesResponse = await fetch(sentencesFile);
            if (sentencesResponse.ok) {
              const sentencesData = await sentencesResponse.json();
              
              // Créer un map des phrases par nom de police
              const sentencesMap = {};
              if (sentencesData.sentences) {
                sentencesData.sentences.forEach(item => {
                  sentencesMap[item.name] = item.sentence;
                });
              }
              
              // Intégrer les phrases dans les données des polices
              fonts = fonts.map(font => ({
                ...font,
                sentence: sentencesMap[font.name] || null
              }));
            }
          } catch (error) {
            console.warn('Impossible de charger les données des phrases:', error);
          }
        }
        
        setFonts(fonts);
        
        // Plus besoin de charger le mapping
        
        const spriteResponse = await fetch(spriteFile);
        if (!spriteResponse.ok) {
          throw new Error(`HTTP Error: ${spriteResponse.status}`);
        }
        const spriteContent = await spriteResponse.text();
        
        if (!document.getElementById('global-font-sprite')) {
          const spriteContainer = document.createElement('div');
          spriteContainer.id = 'global-font-sprite';
          
          const fallbackSymbol = `
            <symbol id="fallback_a" viewBox="0 0 80 80">
              <rect width="80" height="80" fill="currentColor" opacity="0.1"/>
              <text x="40" y="50" text-anchor="middle" dominant-baseline="middle" 
                    font-family="monospace" font-size="32" fill="currentColor">A</text>
            </symbol>
          `;
          
          spriteContainer.innerHTML = spriteContent + fallbackSymbol;
          spriteContainer.style.display = 'none';
          spriteContainer.style.position = 'absolute';
          spriteContainer.style.width = '0';
          spriteContainer.style.height = '0';
          document.body.insertBefore(spriteContainer, document.body.firstChild);
        } else {
          const existingContainer = document.getElementById('global-font-sprite');
          existingContainer.innerHTML = spriteContent;
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error loading data:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    loadData();
  }, [dataset]);

  return {
    fonts,
    loading,
    error
  };
};
