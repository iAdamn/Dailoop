import { messages, translate, isAppLanguage } from '../src/i18n/core';
import { localizeApplicationMessage } from '../src/i18n/application';

test('every message has both translations with exactly the source placeholders',()=>{
  const placeholders=(text:string)=>[...new Set([...text.matchAll(/\{(\w+)\}/g)].map(match=>match[1]))].sort();
  expect(Object.keys(messages).length).toBeGreaterThan(400);
  for(const [source,translations] of Object.entries(messages))for(const language of ['en','pt'] as const){
    expect(typeof translations[language]).toBe('string');
    expect(translations[language].trim()).not.toBe('');
    expect({source,language,params:placeholders(translations[language])}).toEqual({source,language,params:placeholders(source)});
  }
});

test('interpolation preserves arbitrary user text and never performs a second translation',()=>{
  const user='Cancelar {name} $& <script> 🚀';
  expect(translate('en','Actividad: {name}',{name:user})).toContain(user);
  expect(translate('pt','Actividad: {name}',{name:user})).toContain(user);
  expect(translate('es','Actividad: {name}',{name:user})).toBe('Actividad: '+user);
  expect(translate('en','not an app message')).toBe('not an app message');
  expect(['es','en','pt'].every(isAppLanguage)).toBe(true);
  expect(isAppLanguage('fr')).toBe(false);
});

test('localized application errors retain technical diagnostics without touching user content',()=>{
  expect(localizeApplicationMessage('en','No se guardó el idioma. SQLite full')).toBe('The language was not saved. SQLite full');
  expect(localizeApplicationMessage('pt','No se importó ningún dato. Fecha no válida.')).toBe('Nenhum dado foi importado. Data inválida.');
  expect(localizeApplicationMessage('en','provider error 17: Ajustes')).toBe('provider error 17: Ajustes');
});
