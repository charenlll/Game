import zhCN from './zh-CN.json';
import manyiZhCN from './manyi-zh-CN.json';

const catalogs: Readonly<Record<string, Readonly<Record<string, string>>>> = { 'zh-CN': { ...zhCN, ...manyiZhCN,
  'manyi.choice.a': '货路上还有一桩未完的生意。要去看看吗？',
  'manyi.choice.b': '空着的泊位仍在等待。要去看看吗？',
  'manyi.choice.c': '账房里还有未结的记录。要去看看吗？',
  'manyi.choice.enter': '前去查看', 'manyi.choice.skip': '继续前行',
} };

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
