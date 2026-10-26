import { Minus, Plus } from 'lucide-react';
import type { Unit } from '../../types';
import { formatNumber } from '../../lib/format';
import { qtyStep } from '../../shared/reducer';

interface QuantityStepperProps {
  quantity: number;
  unit: Unit;
  onDelta: (delta: number) => void;
  size?: 'sm' | 'lg';
  label: string;
}

export function QuantityStepper({ quantity, unit, onDelta, size = 'sm', label }: QuantityStepperProps) {
  const step = qtyStep(unit);
  const btn = size === 'lg' ? 'h-11 w-11' : 'h-8 w-8';
  return (
    <div className="inline-flex items-center rounded-full bg-stone-100 p-0.5 dark:bg-stone-800" role="group" aria-label={`Quantité de ${label}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelta(-step);
        }}
        disabled={quantity <= step}
        className={`grid ${btn} place-items-center rounded-full text-stone-700 transition active:scale-90 enabled:hover:bg-white disabled:opacity-30 dark:text-stone-200 dark:enabled:hover:bg-stone-700`}
        aria-label={`Diminuer ${label}`}
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className={`min-w-[3.25rem] text-center font-semibold tabular ${size === 'lg' ? 'text-base' : 'text-[13px]'}`} aria-live="polite">
        {formatNumber(quantity)}
        <span className="ml-0.5 text-[10px] font-medium text-stone-500 dark:text-stone-400">{unit}</span>
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelta(step);
        }}
        className={`grid ${btn} place-items-center rounded-full text-stone-700 transition active:scale-90 hover:bg-white dark:text-stone-200 dark:hover:bg-stone-700`}
        aria-label={`Augmenter ${label}`}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}
