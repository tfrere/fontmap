// NOTE: React import supprimé car non utilisé
import { createPortal } from 'react-dom';

/**
 * Portal component for modals to render outside the normal DOM hierarchy
 */
const ModalPortal = ({ children, isOpen }) => {
  if (!isOpen) return null;
  
  return createPortal(
    children,
    document.body
  );
};

export default ModalPortal;
