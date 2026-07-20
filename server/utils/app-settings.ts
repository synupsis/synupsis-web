import type { Json } from '~/types/database.types';

export function isEnabledSetting(value: Json | null | undefined): boolean {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && value.enabled === true;
}
