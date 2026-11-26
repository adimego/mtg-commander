/** Known Effect.op / IrEffect.kind values observed in the current engine (v1 mechanical map). */
export const EFFECT_KINDS = [
  'addC', 'addMana', 'addManaOne', 'addType', 'amass', 'animAll',
  'animate', 'arcaneDraws', 'assimilate', 'assimilateBlink', 'assimilateExBy', 'attach',
  'becomes', 'becomesCopy', 'bite', 'blight', 'bolster', 'bounce', 'champion', 'championBack',
  'chooseColor', 'chooseType', 'chosenReset', 'classLevel', 'cmdrToHand', 'connive',
  'copyTok', 'counter', 'crewed', 'damage', 'damageAtk', 'damageEachOpp',
  'damageEventPlayer', 'delayEoc', 'delayExile', 'delayRet', 'delaySac', 'destroy', 'discard',
  'discardChosen', 'discover', 'dmg', 'dmgPlayerAndCreatures', 'doubleCtr', 'drain',
  'draw', 'drawEventAmount', 'earthReturn', 'earthbend', 'echoEons', 'emblem',
  'empower', 'encore', 'endure', 'energy', 'enterCopy', 'eventPlayerDrawsEventAmount', 'exchange',
  'exile', 'exileCastIf', 'exileGainPower', 'exileGrave', 'exileLibrary', 'exileLinkTok',
  'exilePath', 'exileRetT', 'exileTop', 'exileTopCast', 'exileUid', 'explore',
  'extraCombat', 'extraLand', 'extraTurn', 'fight', 'fireMana', 'flashSorc',
  'flicker', 'flip', 'floodIsland', 'freeze', 'gain', 'gainLife',
  'goad', 'grant', 'highTide', 'if', 'ifDid', 'incubate', 'keepEachType',
  'keepOneEach', 'lifeBecomes', 'linkHand', 'look', 'lookTopMayBottom', 'lose',
  'loseEachLost', 'loseGame', 'loseLife', 'manifestDread', 'may', 'mayCastFree', 'mayShuffle',
  'melee', 'mill', 'monarch', 'monstrosity', 'move', 'ninjutsu',
  'noop', 'piles', 'poison', 'poisonTo', 'prep', 'prevent',
  'proliferate', 'pump', 'pumpSelf', 'putBack', 'putBackExBy', 'putLand',
  'rebound', 'reflex', 'regen', 'remC', 'reorder', 'repeat',
  'repeatWhile', 'ret', 'retPick', 'revealTop', 'revealUntil', 'ring',
  'sac', 'sacThis', 'sacUid', 'saddled', 'script', 'scry',
  'search', 'searchBasic', 'shuffleHandIn', 'silenceSrc', 'soulPair', 'steal',
  'surveil', 'tap', 'tapToggle', 'tempRepl', 'thirst', 'tokDouble', 'token',
  'transform', 'tuck', 'uncCreatures', 'undying', 'unearth', 'unless', 'unlessAct',
  'unlessDmg', 'untap', 'untapLands', 'warpExile', 'watch', 'watchCombatUntap',
  'winGame',
] as const;
export type EffectKind = typeof EFFECT_KINDS[number];
export const EFFECT_KIND_SET: ReadonlySet<string> = new Set(EFFECT_KINDS);

/** Known Static.k / IrStatic.kind values. */
export const STATIC_KINDS = [
  'asThoughWither', 'noLifeGainAll', 'flashIfTapped', 'flashIfOppCast', 'ramonda', 'propaganda',
  'atkMostLife', 'angelTokens', 'noLegendRule', 'pt', 'kw', 'goad', 'cantBlock', 'cantAttack',
  'costLess', 'costMore', 'unblockable', 'mustAttack', 'noMaxHand', 'cantBeBlockedBy', 'doesntUntap',
  'playerHexproof', 'drawLimit', 'oppsSorcery', 'noSearch', 'winOnEmptyDraw', 'tokenDouble',
  'tokenTriple', 'pwInstant', 'manaExtra', 'cantBeAttacked', 'atkLimit1', 'etbExtra', 'grantMana',
  'dmgPlus1', 'dmgPlusCtr', 'preventToAttachedCtr', 'preventOppToYou', 'preventAttackers', 'basePT',
  'wardN', 'wardLifeN', 'areIsland', 'omni', 'topLook', 'topCast', 'taxSpell', 'taxAct', 'pipLess',
  'soulDraw', 'devotionNotCreature', 'convokeSpells', 'oppsCantCast', 'spellsUncounterable',
  'noSacWarriors', 'cowardBlock', 'noGameEnd', 'noLifeGain', 'noMinus', 'manaPersist', 'toxicLink',
  'noPrevent', 'noCounter', 'grantAbil', 'topPlayLand', 'doubleLife', 'doubleDraw', 'plusCharge',
  'plusP1P1', 'lifePlus1', 'addSub', 'cantAtkYou', 'taxAtkCtr', 'oppUntapCreatures', 'darksteel',
  'noLoyalty', 'oppUntapArts', 'extraC', 'etbTappedOpp', 'improviseSpells', 'loseKw',
  'equip0Metalcraft', 'secondSpellLess', 'landsUntapped', 'prolifTwice', 'flashSpell',
  'manaPersistColor', 'etbTypalCtr', 'blockMax1', 'controlAttached', 'blockOnlyBy', 'blockMin2',
  'goadedCantBlock', 'cantActivate', 'extraBlock', 'mustBlock',
] as const;
export type StaticKind = typeof STATIC_KINDS[number];
export const STATIC_KIND_SET: ReadonlySet<string> = new Set(STATIC_KINDS);

export const SCRIPT_SOURCES = ['parser', 'override', 'ai', 'lift'] as const;
export const CARD_LAYOUTS = ['normal', 'transform', 'modal_dfc', 'adventure', 'split', 'flip', 'prepare', 'room'] as const;
export const COLORS = ['W', 'U', 'B', 'R', 'G'] as const;
