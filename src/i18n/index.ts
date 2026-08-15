import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

import en from './en.json';
import es from './es.json';
import hi from './hi.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  hi: { translation: hi },
};

const getDeviceLanguage = (): string => {
  const locale = Localization.getLocales()[0];
  const langCode = locale?.languageCode ?? 'en';
  if (['en', 'es', 'hi'].includes(langCode)) {
    return langCode;
  }
  return 'en';
};

i18n.use(initReactI18next).init({
  resources,
  lng: getDeviceLanguage(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
