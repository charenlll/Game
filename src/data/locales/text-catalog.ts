import zhCN from './zh-CN.json';

const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { 'zh-CN': zhCN };

export function textForKey(key: string, locale = 'zh-CN'): string {
  if (!key) throw new Error('剧情文本缺少 textKey。');
  const text = catalogs[locale]?.[key];
  if (text === undefined) throw new Error(`缺少剧情文本：${locale}:${key}`);
  return text;
}

export function hasTextKey(key: string, locale = 'zh-CN'): boolean {
  return typeof catalogs[locale]?.[key] === 'string';
}

export function getTextCatalog(locale = 'zh-CN'): Readonly<Record<string, string>> {
  const catalog = catalogs[locale];
  if (!catalog) throw new Error(`未注册文本语言：${locale}`);
  return catalog;
}
