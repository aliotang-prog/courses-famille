import { readableText } from '../../lib/color';
import { FitImage } from './FitImage';

interface StoreBadgeProps {
  name: string;
  color: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /** Logo / photo du magasin (affiché en pastille ronde). */
  photo?: string | null;
}

/** Badge couleur d'une enseigne (BIM, Marjane…). */
export function StoreBadge({ name, color, size = 'sm', className = '', photo }: StoreBadgeProps) {
  const pad = size === 'xs' ? 'px-1.5 py-px text-[10px]' : size === 'md' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full font-semibold leading-tight ${pad} ${className}`}
      style={{ backgroundColor: color, color: readableText(color) }}
    >
      {photo && (
        <FitImage
          src={photo}
          className={`-ml-0.5 mr-1 rounded-full ring-1 ring-white/70 ${size === 'md' ? 'h-5 w-5' : size === 'xs' ? 'h-3 w-3' : 'h-4 w-4'}`}
        />
      )}
      {name}
    </span>
  );
}
