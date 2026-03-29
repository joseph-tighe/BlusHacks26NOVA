import fs from 'fs';
// If running in Node <18, install node-fetch and uncomment:
// import fetch from 'node-fetch';
const APIkey = fs.readFileSync('src/API_KEYS.txt', 'utf8');
const languageMap = {
  en: 'en',
  english: 'en',
  English: 'en',
  es: 'es',
  spanish: 'es',
  Spanish: 'es',
  Espanol: 'es',
  Español: 'es',
  espanol: 'es',
  español: 'es',
  fr: 'fr',
  french: 'fr',
  de: 'de',
  german: 'de',
  zh: 'zh',
  chinese: 'zh',
  ja: 'ja',
  japanese: 'ja',
};

// Simple in-memory translation cache. key = `${sourceLang}:${targetLang}:${text}`
const translateCache = new Map();

export async function translateText(text, targetLanguage) {
  if (!text) return '';

  let normalized = String(targetLanguage || '').trim();
  if (!normalized) return text;

  const key = normalized.toLowerCase();
  const target = languageMap[key] || normalized;

  console.log(`[translateText] text=%s targetLanguage=%s`, text, target);

  try {
    const sourceLang = 'auto';
    const cacheKey = `${sourceLang}:${target}:${text}`;
    if (translateCache.has(cacheKey)) {
      console.log('[translateText] cache hit', cacheKey);
      return translateCache.get(cacheKey);
    }

    const res = await fetch('https://api.translateapi.ai/api/v1/translate/', {
      method: 'POST',
      body: JSON.stringify({
        text,
        source_language: sourceLang,
        target_language: target,
      }),
      headers: {
        Authorization: `Bearer ${APIkey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      console.error('[translateText] http error', res.status, await res.text());
      return text;
    }

    const data = await res.json();
    console.log('[translateText] api response', JSON.stringify(data));

    // API style: { translations: { es: 'Hola.' }, ... }
    if (data.translations && typeof data.translations === 'object' && !Array.isArray(data.translations)) {
      let translationResult;
      if (target in data.translations) {
        translationResult = data.translations[target];
      } else {
        translationResult = Object.values(data.translations)[0];
      }
      if (translationResult) {
        translateCache.set(cacheKey, translationResult);
        return translationResult;
      }
    // preferred first language translation of array flavor
    if (Array.isArray(data.translations) && data.translations.length > 0) {
      const entry = data.translations[0];
      if (entry) {
        return entry.translatedText || entry.text || entry.translation || text;
      }
    }

    // older compatibility shape
    if (Array.isArray(data.translatedText) && data.translatedText.length > 0) {
      return data.translatedText[0];
    }

    if (typeof data.translatedText === 'string') {
      return data.translatedText;
    }

    // some variants returning single object
    if (data.translation) {
      return data.translation;
    }

    if (data.translated_text) {
      return data.translated_text;
    }

    // nested API style
    if (data.data && Array.isArray(data.data.translations) && data.data.translations.length > 0) {
      const entry = data.data.translations[0];
      return entry?.translatedText || entry?.text || text;
    }

    // fallback to original
    return text;
}
} catch (error) {
    console.error('Translation error:', error);
    return '';
}
}

