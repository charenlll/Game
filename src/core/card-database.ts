import rawCards from '../data/cards.json';
import type { CardDefinition, CardEffect, CardType } from './types';

export type DataEffect = { type: 'reduce_obsession' | 'gain_light' | 'draw_card' | 'next_round_light' | 'discount_selected_normal'; value: number }
  | { type: 'conditional_reduce_obsession'; value: number; bonus: number }
  | { type: 'discard_and_draw'; discard: number; draw: number } | { type: 'none' };
export interface CardData {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly art_path: string;
  readonly description: string;
  readonly effects: readonly DataEffect[];
  readonly card_type: 'normal' | 'burden';
  readonly school: CardType;
  readonly play_behavior: 'normal' | 'unplayable' | 'exhaust';
  readonly target: 'Soul' | 'Self';
  readonly owner_character_id: string | null;
  readonly frame_style: 'common' | 'feichuan';
}
const supported = new Set(['reduce_obsession', 'conditional_reduce_obsession', 'gain_light', 'draw_card', 'next_round_light', 'discount_selected_normal', 'discard_and_draw', 'none']);
const types = new Set(['安抚', '引魂', '净化', '洞察', '灵术']);
const positive = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export class CardDatabase {
  private readonly entries = new Map<string, CardData>();
  constructor(input: unknown) {
    if (!Array.isArray(input) || input.length === 0) throw new Error('cards.json必须为非空数组');
    for (const raw of input) {
      if (!raw || typeof raw.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(raw.id) || this.entries.has(raw.id)) throw new Error('卡牌ID无效或重复');
      if (typeof raw.name !== 'string' || !raw.name.trim() || typeof raw.description !== 'string' || !raw.description.trim()) throw new Error(`${raw.id}：名称或描述无效`);
      if (!Number.isSafeInteger(raw.cost) || raw.cost < 0) throw new Error(`${raw.id}：费用无效`);
      const number = String(Number(raw.id.slice(-3))).padStart(2, '0');
      const owner = raw.owner_character_id ?? null;
      const frameStyle = raw.frame_style ?? 'common';
      const expectedArt = raw.card_type === 'burden' ? `assets/cards/burden/ZN${number}.png`
        : owner === 'feichuan' ? `assets/cards/feichuan/FC${number}.png` : `assets/cards/common/CA${number}.png`;
      if (raw.art !== expectedArt) throw new Error(`${raw.id}：插图路径与正式资产编号不一致`);
      if ((owner === null && frameStyle !== 'common') || (owner === 'feichuan' && frameStyle !== 'feichuan') || ![null, 'feichuan'].includes(owner)) throw new Error(`${raw.id}：所属角色或卡框无效`);
      if (!['normal', 'burden'].includes(raw.card_type) || !types.has(raw.school) || !['normal', 'unplayable', 'exhaust'].includes(raw.play_behavior) || !['Soul', 'Self'].includes(raw.target)) throw new Error(`${raw.id}：类型或目标无效`);
      if ((raw.card_type === 'normal') !== (raw.play_behavior === 'normal')) throw new Error(`${raw.id}：卡牌行为与类型不一致`);
      const effects = Array.isArray(raw.effect) ? raw.effect : [raw.effect];
      if (!effects.length) throw new Error(`${raw.id}：缺少效果`);
      for (const [index, effect] of effects.entries()) {
        if (!effect || !supported.has(effect.type)) throw new Error(`${raw.id}：未知效果`);
        if (effect.type === 'discard_and_draw') {
          if (index !== 0 || !positive(effect.discard) || !positive(effect.draw)) throw new Error(`${raw.id}：弃牌效果必须在首位且数值有效`);
        } else if (effect.type === 'conditional_reduce_obsession') {
          if (!positive(effect.value) || !positive(effect.bonus)) throw new Error(`${raw.id}：条件化解数值无效`);
        } else if (effect.type === 'next_round_light' || effect.type === 'discount_selected_normal') {
          if (!Number.isSafeInteger(effect.value) || effect.value >= 0) throw new Error(`${raw.id}：临时修正值无效`);
        } else if (effect.type !== 'none' && !positive(effect.value)) throw new Error(`${raw.id}：效果数值无效`);
      }
      this.entries.set(raw.id, Object.freeze({ id: raw.id, name: raw.name, cost: raw.cost, art_path: raw.art, description: raw.description,
        effects: Object.freeze(effects.map((effect: DataEffect) => Object.freeze({ ...effect }))), card_type: raw.card_type, school: raw.school, play_behavior: raw.play_behavior, target: raw.target,
        owner_character_id: owner, frame_style: frameStyle }));
    }
  }
  get(id: string): CardData {
    const card = this.entries.get(id);
    if (!card) throw new Error(`未知卡牌：${id}`);
    return card;
  }
  all(): readonly CardData[] { return [...this.entries.values()]; }
}

// 仅适配既有对局接口；无第二份卡牌名称、费用或效果数据。
export function toBattleDefinition(data: CardData): CardDefinition {
  const effects: CardEffect[] = data.effects.flatMap((effect): CardEffect[] => {
    switch (effect.type) {
      case 'reduce_obsession': return [{ Type: 'ReduceObsession', Amount: effect.value }];
      case 'conditional_reduce_obsession': return [{ Type: 'ConditionalReduceObsession', Amount: effect.value, Bonus: effect.bonus }];
      case 'gain_light': return [{ Type: 'GainLight', Amount: effect.value }];
      case 'draw_card': return [{ Type: 'DrawCard', Amount: effect.value }];
      case 'discard_and_draw': return [{ Type: 'DiscardCard', Amount: effect.discard }, { Type: 'DrawCard', Amount: effect.draw }];
      case 'next_round_light': return [{ Type: 'ModifyNextRoundLight', Amount: effect.value }];
      case 'discount_selected_normal': return [{ Type: 'ModifySelectedCost', Amount: effect.value }];
      case 'none': return [];
    }
  });
  return { CardID: data.id, Name: data.name, Cost: data.cost, Description: data.description, ArtReference: data.art_path,
    CardType: data.school, TargetType: data.target, Rarity: 'Common', Tags: [], Effects: effects, IsTemporary: false, OwnerCharacterID: data.owner_character_id,
    DataType: data.card_type, PlayBehavior: data.play_behavior, FrameStyle: data.frame_style };
}
export const cardDatabase = new CardDatabase(rawCards);
