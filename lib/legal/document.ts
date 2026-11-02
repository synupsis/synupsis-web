import type { DisplayLocale } from '~/lib/i18n/locale';

// How to reach whoever runs Synupsis. Both legal pages read it.
export const legalContact = {
  email: 'contact@synupsis.com',
};

// Change this date whenever either document changes.
export const legalUpdatedAt = '2026-11-02';

export type LegalSection = {
  title: string;
  paragraphs?: string[];
  items?: string[];
};

export type LegalDocument = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

export type LocalizedLegalDocument = Record<DisplayLocale, LegalDocument>;
