import { accountMessages } from '~/lib/i18n/account';
import { adminMessages } from '~/lib/i18n/admin';
import { publicMessages } from '~/lib/i18n/public';
import { showMessages } from '~/lib/i18n/shows';
import { recapMessages } from '~/lib/i18n/recaps';

export const frenchMessages: Record<string, string> = {
  ...publicMessages,
  ...accountMessages,
  ...adminMessages,
  ...showMessages,
  ...recapMessages,
};
