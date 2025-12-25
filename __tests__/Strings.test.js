import { getStrings, Strings } from '../constants/Strings';

describe('Localization Strings', () => {
  test('should return French strings by default', () => {
    const t = getStrings('fr');
    expect(t.appName).toBe('Mon Monde Magique');
    expect(t.mathGame).toBe('Mathématique');
  });

  test('should return Arabic strings', () => {
    const t = getStrings('ar');
    expect(t.appName).toBe('عالمي السحري');
  });

  test('should fallback to French if language not found', () => {
    const t = getStrings('non-existent');
    expect(t.appName).toBe('Mon Monde Magique');
  });

  test('all languages should have voice property', () => {
    Object.keys(Strings).forEach(lang => {
      expect(Strings[lang].voice).toBeDefined();
    });
  });

  test('all languages should have jokes category', () => {
    Object.keys(Strings).forEach(lang => {
      expect(Strings[lang].jokes).toBeDefined();
      expect(Strings[lang].jokes.mr_mme).toBeInstanceOf(Array);
      expect(Strings[lang].jokes.devinettes).toBeInstanceOf(Array);
    });
  });
});

