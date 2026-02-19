import React from 'react';
import ModalPortal from './ModalPortal';

/**
 * How it works modal component
 */
const AboutModal = ({ onClose, darkMode }) => {
  return (
    <ModalPortal isOpen={true}>
      <div className="unified-overlay" onClick={onClose}>
        <div className="about-modal" onClick={(e) => e.stopPropagation()}>
          <div className="about-modal-content">
            <div className="about-modal-header">
              <h1 className="about-title">How FontMap Works</h1>
              <button 
                className="about-close-button"
                onClick={onClose}
                title="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            <div className="about-modal-body">
              <p className="about-description">
                FontMap uses <strong>FontCLIP</strong>, a vision model fine-tuned for typography, to build an interactive map of font relationships.
                Each font is encoded into a rich embedding, then projected onto a 2D plane via <strong>UMAP</strong> so that visually similar fonts cluster together.
              </p>
              
              <div className="about-content-grid">
                
                {/* Left Column - Technical Process */}
                <div className="about-column">
                  <h3 className="about-section-title">Technical Process</h3>
                  
                  <div className="pipeline-steps">
                    <div className="step-item">
                      <div className="step-content">
                        <div className="step-header">
                          <span className="step-number">1</span>
                          <strong>Multi-Glyph Rendering</strong>
                        </div>
                        <p className="step-description">Each font is rendered as a <strong>224 &times; 224</strong> composite image showing multiple representative glyphs, capturing the full typographic character</p>
                      </div>
                      <div className="step-example">
                        <div className="multi-glyph-demo">
                          <div className="glyph-grid">
                            <span style={{fontFamily: 'Georgia, serif', fontSize: '18px', fontWeight: 'bold'}}>Aa</span>
                            <span style={{fontFamily: 'Georgia, serif', fontSize: '18px'}}>Bb</span>
                            <span style={{fontFamily: 'Georgia, serif', fontSize: '18px'}}>Rr</span>
                          </div>
                          <div className="glyph-grid-label">224 &times; 224</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="step-item">
                      <div className="step-content">
                        <div className="step-header">
                          <span className="step-number">2</span>
                          <strong>FontCLIP Embeddings</strong>
                        </div>
                        <p className="step-description">
                          A <strong>CLIP ViT-B/32</strong> model <a href="https://github.com/yukistavailable/FontCLIP" target="_blank" rel="noopener noreferrer" className="inline-link">fine-tuned for typography</a> encodes each image into a <strong>512-dimensional vector</strong> that captures weight, contrast, style and structure
                        </p>
                      </div>
                      <div className="step-example">
                        <div className="mini-matrix">
                          <div className="mini-row"><strong>[ 0.42</strong>, -0.13, <strong>0.87</strong>, 0.05, -0.61,</div>
                          <div className="mini-row">&nbsp;&nbsp;0.29, <strong>-0.74</strong>, 0.18, 0.51, -0.33,</div>
                          <div className="mini-row">&nbsp;&nbsp;0.02, <strong>0.96</strong>, -0.47, 0.11, 0.68,</div>
                          <div className="mini-row">&nbsp;&nbsp;-0.22, 0.39, <strong>-0.85</strong>, ... <strong>]</strong></div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="step-item">
                      <div className="step-content">
                        <div className="step-header">
                          <span className="step-number">3</span>
                          <strong>PCA + Font Fusion + UMAP</strong>
                        </div>
                        <p className="step-description">
                          <strong>PCA</strong> reduces noise (512D &rarr; 50D), font family variants are <strong>merged</strong> into single representatives, then <strong>spectral UMAP</strong> projects to 2D
                          <a href="https://pair-code.github.io/understanding-umap/" target="_blank" rel="noopener noreferrer" className="inline-link"> (Learn more about UMAP)</a>
                        </p>
                      </div>
                      <div className="step-example">
                        <div className="pipeline-flow">
                          <div className="pipeline-node">512D</div>
                          <div className="pipeline-arrow">&rarr;</div>
                          <div className="pipeline-node">50D</div>
                          <div className="pipeline-arrow">&rarr;</div>
                          <div className="pipeline-node">fusion</div>
                          <div className="pipeline-arrow">&rarr;</div>
                          <div className="pipeline-node"><strong>2D</strong></div>
                        </div>
                        <div className="coordinates" style={{marginTop: '6px'}}>
                          <div className="coord">x: -2.34</div>
                          <div className="coord">y: 1.67</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="step-item">
                      <div className="step-content">
                        <div className="step-header">
                          <span className="step-number">4</span>
                          <strong>Interactive Visualization</strong>
                        </div>
                        <p className="step-description">Fonts are positioned on a <strong>2D map</strong> where proximity indicates <strong>visual similarity</strong> &mdash; nearest neighbors are also pre-computed in high-dimensional space</p>
                      </div>
                      <div className="step-example">
                        <div className="font-cluster-demo">
                          <div className="font-sample" style={{fontFamily: 'Times New Roman, serif'}}>A</div>
                          <div className="font-sample" style={{fontFamily: 'Georgia, serif'}}>A</div>
                          <div className="font-sample" style={{fontFamily: 'Arial, sans-serif'}}>A</div>
                          <div className="font-sample" style={{fontFamily: 'Helvetica, sans-serif'}}>A</div>
                          <div className="font-sample" style={{fontFamily: 'Courier New, monospace'}}>A</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                </div>

                {/* Right Column - Open Source Info */}
                <div className="about-column">
                  <h3 className="about-section-title">Open Source</h3>
                  <p className="about-section-text">
                    This project is <strong>completely open source</strong> &mdash; you can explore the code, modify the parameters, or run it on your own font collection.
                  </p>
                  <p className="about-section-text">
                    The <strong>complete dataset</strong> is also open source, including all font metadata, FontCLIP embeddings and positioning data from <a href="https://fonts.google.com" target="_blank" rel="noopener noreferrer" className="google-fonts-link">Google Fonts</a>.
                  </p>
                  <a href="https://huggingface.co/spaces/huggingface/fontmap" target="_blank" rel="noopener noreferrer" className="code-link">
                    View Source on Hugging Face &rarr;
                  </a>
                  
                  <h3 className="about-section-title">About This Project</h3>
                  <p className="about-section-text">
                    Inspired by the original <strong>IDEO Font Map</strong>, this version replaces pixel-based features with <strong>FontCLIP</strong> embeddings &mdash; a CLIP model fine-tuned specifically for typography &mdash; producing a more semantically meaningful layout where fonts group by visual style rather than raw pixel similarity.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

export default AboutModal;