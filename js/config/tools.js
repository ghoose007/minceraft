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
    186: { name: 'Leather', atlasIdx: 147, type: 'material', tier: 0, speed: 1.0, isTerrainAtlas: true },
    187: { name: 'Raw Beef', atlasIdx: 148, type: 'food', tier: 0, speed: 1.0, isTerrainAtlas: true },
    188: { name: 'Cooked Beef', atlasIdx: 149, type: 'food', tier: 0, speed: 1.0, isTerrainAtlas: true },

    // Bow & Arrow
    164: { name: 'Bow', atlasIdx: 26, type: 'bow', tier: 0, speed: 1.0, damage: 0, maxDurability: 384 },
    165: { name: 'Arrow', atlasIdx: 146, type: 'ammo', tier: 0, speed: 1.0, isTerrainAtlas: true },

    // Iron Armor (MC values: helmet=165dur/2def, chest=240dur/6def, legs=225dur/5def, boots=195dur/2def)
    170: { name: 'Iron Helmet', atlasIdx: 30, type: 'armor', armorSlot: 'helmet', defense: 2, maxDurability: 165 },
    171: { name: 'Iron Chestplate', atlasIdx: 29, type: 'armor', armorSlot: 'chestplate', defense: 6, maxDurability: 240 },
    172: { name: 'Iron Leggings', atlasIdx: 28, type: 'armor', armorSlot: 'leggings', defense: 5, maxDurability: 225 },
    173: { name: 'Iron Boots', atlasIdx: 27, type: 'armor', armorSlot: 'boots', defense: 2, maxDurability: 195 },

    // Leather Armor (helmet=55dur/1def, chest=80dur/3def, legs=75dur/2def, boots=65dur/1def)
    174: { name: 'Leather Helmet', atlasIdx: 34, type: 'armor', armorSlot: 'helmet', defense: 1, maxDurability: 55 },
    175: { name: 'Leather Chestplate', atlasIdx: 33, type: 'armor', armorSlot: 'chestplate', defense: 3, maxDurability: 80 },
    176: { name: 'Leather Leggings', atlasIdx: 32, type: 'armor', armorSlot: 'leggings', defense: 2, maxDurability: 75 },
    177: { name: 'Leather Boots', atlasIdx: 31, type: 'armor', armorSlot: 'boots', defense: 1, maxDurability: 65 },

    // Diamond Armor (helmet=363dur/3def, chest=528dur/8def, legs=495dur/6def, boots=429dur/3def)
    178: { name: 'Diamond Helmet', atlasIdx: 38, type: 'armor', armorSlot: 'helmet', defense: 3, maxDurability: 363 },
    179: { name: 'Diamond Chestplate', atlasIdx: 37, type: 'armor', armorSlot: 'chestplate', defense: 8, maxDurability: 528 },
    180: { name: 'Diamond Leggings', atlasIdx: 36, type: 'armor', armorSlot: 'leggings', defense: 6, maxDurability: 495 },
    181: { name: 'Diamond Boots', atlasIdx: 35, type: 'armor', armorSlot: 'boots', defense: 3, maxDurability: 429 },

    // Gold Armor (helmet=77dur/2def, chest=112dur/5def, legs=105dur/3def, boots=91dur/1def)
    182: { name: 'Gold Helmet', atlasIdx: 42, type: 'armor', armorSlot: 'helmet', defense: 2, maxDurability: 77 },
    183: { name: 'Gold Chestplate', atlasIdx: 41, type: 'armor', armorSlot: 'chestplate', defense: 5, maxDurability: 112 },
    184: { name: 'Gold Leggings', atlasIdx: 40, type: 'armor', armorSlot: 'leggings', defense: 3, maxDurability: 105 },
    185: { name: 'Gold Boots', atlasIdx: 39, type: 'armor', armorSlot: 'boots', defense: 1, maxDurability: 91 },

    // Spawn Eggs (terrain.png atlas)
    190: { name: 'Spawn Pig', atlasIdx: 152, type: 'spawn_egg', mobType: 'pig', isTerrainAtlas: true },
    191: { name: 'Spawn Cow', atlasIdx: 153, type: 'spawn_egg', mobType: 'cow', isTerrainAtlas: true },
    192: { name: 'Spawn Sheep', atlasIdx: 154, type: 'spawn_egg', mobType: 'sheep', isTerrainAtlas: true },
    193: { name: 'Spawn Zombie', atlasIdx: 155, type: 'spawn_egg', mobType: 'zombie', isTerrainAtlas: true },
    194: { name: 'Spawn Creeper', atlasIdx: 156, type: 'spawn_egg', mobType: 'creeper', isTerrainAtlas: true },
    195: { name: 'Spawn Skeleton', atlasIdx: 157, type: 'spawn_egg', mobType: 'skeleton', isTerrainAtlas: true },
    196: { name: 'Spawn Zombie Pigman', atlasIdx: 158, type: 'spawn_egg', mobType: 'zombie_pigman', isTerrainAtlas: true },

    // New items (terrain.png atlas)
    197: { name: 'Paper', atlasIdx: 152, type: 'material', tier: 0, speed: 1.0, isTerrainAtlas: true },
    198: { name: 'Book', atlasIdx: 153, type: 'material', tier: 0, speed: 1.0, isTerrainAtlas: true },
    199: { name: 'Lapis Lazuli', atlasIdx: 155, type: 'material', tier: 0, speed: 1.0, isTerrainAtlas: true },
    211: { name: 'Emerald', atlasIdx: 175, type: 'material', tier: 0, speed: 1.0, isTerrainAtlas: true },

    // Buckets
    223: { name: 'Iron Bucket', atlasIdx: 52, type: 'bucket', tier: 0, speed: 1.0, maxStack: 16 },
    224: { name: 'Water Bucket', atlasIdx: 53, type: 'bucket_water', tier: 0, speed: 1.0, maxStack: 1 },
    225: { name: 'Lava Bucket', atlasIdx: 54, type: 'bucket_lava', tier: 0, speed: 1.0, maxStack: 1 },

    // Emerald Tools (tier 4, double diamond durability, faster than diamond)
    214: { name: 'Emerald Sword', atlasIdx: 47, type: 'sword', tier: 4, speed: 5.0, damage: 8, maxDurability: 3122 },
    215: { name: 'Emerald Axe', atlasIdx: 48, type: 'axe', tier: 4, speed: 10.0, damage: 7, maxDurability: 3122 },
    216: { name: 'Emerald Hoe', atlasIdx: 49, type: 'hoe', tier: 4, speed: 10.0, damage: 1, maxDurability: 3122 },
    217: { name: 'Emerald Pickaxe', atlasIdx: 50, type: 'pickaxe', tier: 4, speed: 10.0, damage: 6, maxDurability: 3122 },
    218: { name: 'Emerald Shovel', atlasIdx: 51, type: 'shovel', tier: 4, speed: 10.0, damage: 5, maxDurability: 3122 },

    // Emerald Armor (double diamond durability, same defense + extra heart per piece)
    // v339: moved from 219-222 to 256-259 to resolve a hard ID collision with
    // the new Tall Grass blocks (BLOCK_DATA 219/220). Armor items live only
    // in inventory data structures (never as voxels), so they can use IDs
    // above the 8-bit voxel range without issues — the JSON save format
    // stores them as plain integers. Two consumers outside this file were
    // updated alongside (`ui/inventory-doll.js`, `ui/crafting.js`).
    256: { name: 'Emerald Helmet', atlasIdx: 46, type: 'armor', armorSlot: 'helmet', defense: 3, maxDurability: 726, bonusHealth: 2 },
    257: { name: 'Emerald Chestplate', atlasIdx: 45, type: 'armor', armorSlot: 'chestplate', defense: 8, maxDurability: 1056, bonusHealth: 2 },
    258: { name: 'Emerald Leggings', atlasIdx: 44, type: 'armor', armorSlot: 'leggings', defense: 6, maxDurability: 990, bonusHealth: 2 },
    259: { name: 'Emerald Boots', atlasIdx: 43, type: 'armor', armorSlot: 'boots', defense: 3, maxDurability: 858, bonusHealth: 2 }
};

// v284: Hunger system food data. Values match Minecraft's food
// restoration / saturation for each item. Also preserves the legacy
// "heal" value used when hunger is disabled (the old instant-heal
// behavior). eatTime is in seconds (MC uses 1.6s for all foods).
const FOOD_DATA = {
    115: { hunger: 4, saturation: 2.4, legacyHeal: 4, eatTime: 1.6, alwaysEdible: false }, // Apple
    122: { hunger: 3, saturation: 1.8, legacyHeal: 3, eatTime: 1.6, alwaysEdible: false }, // Raw Porkchop
    123: { hunger: 8, saturation: 12.8, legacyHeal: 8, eatTime: 1.6, alwaysEdible: false }, // Cooked Porkchop
    134: { hunger: 5, saturation: 6.0, legacyHeal: 5, eatTime: 1.6, alwaysEdible: false }, // Bread
    187: { hunger: 3, saturation: 1.8, legacyHeal: 3, eatTime: 1.6, alwaysEdible: false }, // Raw Beef
    188: { hunger: 8, saturation: 12.8, legacyHeal: 8, eatTime: 1.6, alwaysEdible: false }  // Cooked Beef
};

// v290: helper so eat handlers don't have to hardcode food IDs
window.isFoodItem = function(id) {
    return typeof FOOD_DATA !== 'undefined' && FOOD_DATA[id] !== undefined;
};