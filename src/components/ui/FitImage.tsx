import { useState, type CSSProperties, type ReactNode } from 'react';

interface FitImageProps {
  src: string | null | undefined;
  alt?: string;
  /** Classes du cadre (taille, arrondi, bordure…). */
  className?: string;
  style?: CSSProperties;
  /**
   * `blur` : la photo entière, centrée, sur un fond flou de la même photo (grandes vignettes).
   * `plain` : la photo entière sur fond clair (petites icônes, logos).
   */
  backdrop?: 'blur' | 'plain';
  /** Affiché si pas de photo ou photo illisible. */
  fallback?: ReactNode;
}

/**
 * Image adaptée à son icône : elle n'est jamais rognée ni déformée.
 * Une photo en hauteur (bouteille) ou un logo très large (BIM, Marjane) reste lisible en entier.
 */
export function FitImage({ src, alt = '', className = '', style, backdrop = 'plain', fallback = null }: FitImageProps) {
  const [broken, setBroken] = useState<string | null>(null);
  if (!src || broken === src) return <>{fallback}</>;
  return (
    <span className={`relative block shrink-0 overflow-hidden ${backdrop === 'plain' ? 'bg-white' : 'bg-stone-100 dark:bg-stone-800'} ${className}`} style={style}>
      {backdrop === 'blur' && (
        <img src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-md" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(src)}
        className={`relative h-full w-full object-contain ${backdrop === 'plain' ? 'p-[6%]' : ''}`}
      />
    </span>
  );
}
