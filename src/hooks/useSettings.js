import { useState, useEffect } from 'react';
import { api } from '../bridge.js';
import { setUILanguage } from '../i18n.js';
import { parseJSONLoose } from '../lesson.js';
import { load, save } from '../store.js';

// Your settings (AI, level, language...), saved as they change. Changing the language also sets the page's
// language, so read-aloud picks a matching voice, and translates the interface with your own AI.
export default function useSettings() {
  const [settings, setSettingsRaw] = useState(() => ({
    model: 'claude:sonnet',
    level: 'student',
    lang: 'python',
    ...load('bento.settings', {}),
  }));
  const setSettings = (p) =>
    setSettingsRaw((s) => {
      const n = { ...s, ...p };
      save('bento.settings', n);
      return n;
    });
  useEffect(() => {
    api.setPrefs?.({ voice: settings.voice || 'English', fallback: !!settings.autoFallback });
    const CODES = {
      English: 'en',
      Español: 'es',
      Português: 'pt',
      Français: 'fr',
      Deutsch: 'de',
      Italiano: 'it',
      Nederlands: 'nl',
      Polski: 'pl',
      Türkçe: 'tr',
      Русский: 'ru',
      Українська: 'uk',
      العربية: 'ar',
      हिन्दी: 'hi',
      বাংলা: 'bn',
      'Bahasa Indonesia': 'id',
      'Tiếng Việt': 'vi',
      ไทย: 'th',
      Filipino: 'fil',
      中文: 'zh',
      日本語: 'ja',
      한국어: 'ko',
      Kiswahili: 'sw',
    };
    document.documentElement.lang = CODES[settings.voice] || 'en'; // read-aloud picks a matching voice
    // menus and buttons in the same language: translated once by your own AI, then kept on this Mac
    setUILanguage(settings.voice || 'English', async (strings, language) =>
      parseJSONLoose(
        await api.quick(
          settings.model,
          `Translate these short labels from a friendly app that teaches coding into ${language}. They are buttons, menu items and headings, so keep each one about as short as the English. Keep words wrapped in *stars* wrapped in stars (they are emphasised). Keep product and technical names as they are: Bento, Python, JavaScript, TypeScript, LeetCode, GitHub, Big-O, O(n), ⌘ and other symbols.\nReply with only a JSON object mapping each English string exactly to its translation.\n${JSON.stringify(strings)}`,
        ),
      ),
    );
  }, [settings.voice, settings.autoFallback]);
  return { setSettings, setSettingsRaw, settings };
}
