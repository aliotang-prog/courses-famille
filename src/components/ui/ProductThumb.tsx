import { Package } from 'lucide-react';
import { FitImage } from './FitImage';

/**
 * Vignette produit : la photo de l'utilisateur, entière et centrée dans l'icône, sinon une icône neutre.
 * Aucune image « de remplacement » n'est jamais téléchargée ni substituée.
 */
export function ProductThumb({ photo, name, size = 44, className = '' }: { photo: string | null; name: string; size?: number; className?: string }) {
  const style = { width: size, height: size };
  const empty = (
    <span className={`grid shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500 ${className}`} style={style} aria-hidden="true">
      <Package className="h-1/2 w-1/2" />
    </span>
  );
  return <FitImage src={photo} alt={name} className={`rounded-xl ring-1 ring-black/5 ${className}`} style={style} backdrop={size >= 56 ? 'blur' : 'plain'} fallback={empty} />;
}
