// ==========================================
// TOOL & ITEM DATA
// ==========================================

const TOOL_DATA = {
    // Wooden Tools
    100: { name: 'Wooden Axe', atlasIdx: 0, type: 'axe', tier: 0, speed: 2.0, damage: 3, maxDurability: 59 },
    101: { name: 'Wooden Pickaxe', atlasIdx: 2, type: 'pickaxe', tier: 0, speed: 2.0, damage: 2, maxDurability: 59 },
    102: { name: 'Wooden Shovel', atlasIdx: 3, type: 'shovel', tier: 0, speed: 2.0, damage: 1, maxDurability: 59 },
    103: { name: 'Wooden Sword', atlasIdx: 4, type: 'sword', tier: 0, speed: 1.5, damage: 4, maxDurability: 59 },
    
    // Stone Tools
    104: { name: 'Stone Axe', atlasIdx: 5, type: 'axe', tier: 1, speed: 4.0, damage: 4, maxDurability: 131 },
    105: { name: 'Stone Pickaxe', atlasIdx: 7, type: 'pickaxe', tier: 1, speed: 4.0, damage: 3, maxDurability: 131 },
    106: { name: 'Stone Shovel', atlasIdx: 8, type: 'shovel', tier: 1, speed: 4.0, damage: 2, maxDurability: 131 },
    107: { name: 'Stone Sword', atlasIdx: 9, type: 'sword', tier: 1, speed: 2.0, damage: 5, maxDurability: 131 },
    
    // Iron Tools
    108: { name: 'Iron Axe', atlasIdx: 10, type: 'axe', tier: 2, speed: 6.0, damage: 5, maxDurability: 250 },
    109: { name: 'Iron Pickaxe', atlasIdx: 12, type: 'pickaxe', tier: 2, speed: 6.0, damage: 4, maxDurability: 250 },
    110: { name: 'Iron Shovel', atlasIdx: 13, type: 'shovel', tier: 2, speed: 6.0, damage: 3, maxDurability: 250 },
    111: { name: 'Iron Sword', atlasIdx: 14, type: 'sword', tier: 2, speed: 3.0, damage: 6, maxDurability: 250 },

    // Diamond Tools
    124: { name: 'Diamond Axe', atlasIdx: 15, type: 'axe', tier: 3, speed: 8.0, damage: 6, maxDurability: 1561 },
    125: { name: 'Diamond Pickaxe', atlasIdx: 17, type: 'pickaxe', tier: 3, speed: 8.0, damage: 5, maxDurability: 1561 },
    126: { name: 'Diamond Shovel', atlasIdx: 18, type: 'shovel', tier: 3, speed: 8.0, damage: 4, maxDurability: 1561 },
    127: { name: 'Diamond Sword', atlasIdx: 19, type: 'sword', tier: 3, speed: 4.0, damage: 7, maxDurability: 1561 },

    // Gold Tools (tier 0 = same mining level as wood, but fastest speed)
    159: { name: 'Gold Axe', atlasIdx: 21, type: 'axe', tier: 0, speed: 12.0, damage: 3, maxDurability: 32 },
    160: { name: 'Gold Pickaxe', atlasIdx: 23, type: 'pickaxe', tier: 0, speed: 12.0, damage: 2, maxDurability: 32 },
    161: { name: 'Gold Shovel', atlasIdx: 24, type: 'shovel', tier: 0, speed: 12.0, damage: 1, maxDurability: 32 },
    162: { name: 'Gold Sword', atlasIdx: 25, type: 'sword', tier: 0, speed: 6.0, damage: 4, maxDurability: 32 },

    // Hoes (Tier 0 - 3)
    130: { name: 'Wooden Hoe', atlasIdx: 1, type: 'hoe', tier: 0, speed: 2.0, damage: 1, maxDurability: 59 },
    131: { name: 'Stone Hoe', atlasIdx: 6, type: 'hoe', tier: 1, speed: 4.0, damage: 1, maxDurability: 131 },
    132: { name: 'Iron Hoe', atlasIdx: 11, type: 'hoe', tier: 2, speed: 6.0, damage: 1, maxDurability: 250 },
    133: { name: 'Diamond Hoe', atlasIdx: 16, type: 'hoe', tier: 3, speed: 8.0, damage: 1, maxDurability: 1561 },
    163: { name: 'Gold Hoe', atlasIdx: 22, type: 'hoe', tier: 0, speed: 12.0, damage: 1, maxDurability: 32 },

    // Items
    112: { name: 'Stick', atlasIdx: 72, type: 'material', tier: 0, speed: 1.0 },
    113: { name: 'Iron Ingot', atlasIdx: 73, type: 'material', tier: 0, speed: 1.0 },
    114: { name: 'Diamond', atlasIdx: 74, type: 'material', tier: 0, speed: 1.0 },
    115: { name: 'Apple', atlasIdx: 75, type: 'food', tier: 0, speed: 1.0 },
    119: { name: 'Coal', atlasIdx: 79, type: 'material', tier: 0, speed: 1.0 },
    120: { name: 'Clay Ball', atlasIdx: 84, type: 'material', tier: 0, speed: 1.0 },
    121: { name: 'Brick', atlasIdx: 85, type: 'material', tier: 0, speed: 1.0 },
    122: { name: 'Raw Porkchop', atlasIdx: 86, type: 'food', tier: 0, speed: 1.0 },
    123: { name: 'Cooked Porkchop', atlasIdx: 87, type: 'food', tier: 0, speed: 1.0 },
    128: { name: 'Seeds', atlasIdx: 90, type: 'material', tier: 0, speed: 1.0 },
    129: { name: 'Wheat', atlasIdx: 99, type: 'material', tier: 0, speed: 1.0 },
    134: { name: 'Bread', atlasIdx: 105, type: 'food', tier: 0, speed: 1.0 },
    135: { name: 'Flint', atlasIdx: 115, type: 'material', tier: 0, speed: 1.0 }, // NEW
    136: { name: 'Flint and Steel', atlasIdx: 20, type: 'flint_and_steel', tier: 1, speed: 1.0, maxDurability: 64, isTool: true },
    142: { name: 'Nether Brick', atlasIdx: 127, type: 'material', tier: 0, speed: 1.0 },
    143: { name: 'Gold Ingot', atlasIdx: 132, type: 'material', tier: 0, speed: 1.0 },
    151: { name: 'Oak Door Item', atlasIdx: 135, type: 'material', tier: 0, speed: 1.0 },
    153: { name: 'Quartz', atlasIdx: 139, type: 'material', tier: 0, speed: 1.0 },

    // Bow & Arrow
    164: { name: 'Bow', atlasIdx: 26, type: 'bow', tier: 0, speed: 1.0, damage: 0, maxDurability: 384 },
    165: { name: 'Arrow', atlasIdx: 146, type: 'ammo', tier: 0, speed: 1.0, isTerrainAtlas: true }
};