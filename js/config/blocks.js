// ==========================================
// BLOCK DATA & PROPERTIES
// ==========================================

const BLOCK_DATA = {
    1: { name: 'Grass Block', atlasIdx: { top: 0, bottom: 2, side: 28, overlay: 1 }, hardness: 0.6, dropId: 2 },
    2: { name: 'Dirt', atlasIdx: 2, hardness: 0.5 },
    3: { name: 'Stone', atlasIdx: 3, hardness: 1.5, dropId: 33 }, 
    4: { name: 'Water', atlasIdx: -1, hardness: -1, dropId: 0 }, 
    5: { name: 'Gravel', atlasIdx: 4, hardness: 0.6 },
    6: { name: 'Iron Ore', atlasIdx: 5, hardness: 3.0 },
    7: { name: 'Coal Ore', atlasIdx: 6, hardness: 3.0, dropId: 119 }, 
    8: { name: 'Gold Ore', atlasIdx: 7, hardness: 3.0 },
    9: { name: 'Diamond Ore', atlasIdx: 8, hardness: 3.0, dropId: 114 }, 
    10: { name: 'Diorite', atlasIdx: 9, hardness: 1.5 },
    11: { name: 'Granite', atlasIdx: 10, hardness: 1.5 },
    12: { name: 'Andesite', atlasIdx: 11, hardness: 1.5 },
    13: { name: 'Oak Log', atlasIdx: { top: 12, bottom: 12, side: 13 }, hardness: 2.0 },
    14: { name: 'Oak Leaves', atlasIdx: 14, hardness: 0.2 }, 
    15: { name: 'Sand', atlasIdx: 15, hardness: 0.5 },
    16: { name: 'Tall Grass', atlasIdx: 16, hardness: 0.0, dropId: 0 }, 
    17: { name: 'Torch', atlasIdx: 17, hardness: 0.0 },
    18: { name: 'Bedrock', atlasIdx: 18, hardness: -1, dropId: 0 },
    19: { name: 'Sandstone', atlasIdx: { top: 19, bottom: 19, side: 20 }, hardness: 0.8 },
    20: { name: 'Cactus', atlasIdx: { top: 21, bottom: 21, side: 22 }, hardness: 0.4 },
    21: { name: 'Spruce Log', atlasIdx: { top: 23, bottom: 23, side: 24 }, hardness: 2.0 },
    22: { name: 'Spruce Leaves', atlasIdx: 25, hardness: 0.2 }, 
    23: { name: 'Rose', atlasIdx: 26, hardness: 0.0 }, 
    24: { name: 'Bush', atlasIdx: 27, hardness: 0.0 }, 
    27: { name: 'Lava', atlasIdx: -2, hardness: -1, dropId: 0 },
    28: { name: 'Obsidian', atlasIdx: 31, hardness: 50.0 },
    29: { name: 'Oak Planks', atlasIdx: 32, hardness: 2.0 },
    30: { name: 'Pine Planks', atlasIdx: 33, hardness: 2.0 },
    31: { name: 'Bricks', atlasIdx: 34, hardness: 2.0 },
    32: { name: 'Stone Bricks', atlasIdx: 35, hardness: 1.5 },
    33: { name: 'Cobblestone', atlasIdx: 36, hardness: 2.0 },
    34: { name: 'White Wool', atlasIdx: 37, hardness: 0.8 },
    35: { name: 'Red Wool', atlasIdx: 38, hardness: 0.8 },
    36: { name: 'Blue Wool', atlasIdx: 39, hardness: 0.8 },
    37: { name: 'Green Wool', atlasIdx: 40, hardness: 0.8 },
    38: { name: 'Glass', atlasIdx: 41, hardness: 0.3, dropId: 0 },
    39: { name: 'Snow Block', atlasIdx: 42, hardness: 0.2 },
    40: { name: 'Snow Layer', atlasIdx: 43, hardness: 0.1, dropId: 0 },
    41: { name: 'Birch Log', atlasIdx: { top: 44, bottom: 44, side: 45 }, hardness: 2.0 },
    43: { name: 'Birch Leaves', atlasIdx: 46, hardness: 0.2 }, 
    44: { name: 'Birch Planks', atlasIdx: 48, hardness: 2.0 },
    48: { name: 'Mossy Cobblestone', atlasIdx: 81, hardness: 2.0 }, 
    49: { name: 'Redstone Ore', atlasIdx: 49, hardness: 3.0 },
    50: { name: 'Lapis Lazuli Ore', atlasIdx: 50, hardness: 3.0 },
    51: { name: 'Pumpkin', atlasIdx: { top: 51, bottom: 51, side: 52 }, hardness: 1.0 },
    52: { name: 'Sugarcane', atlasIdx: 53, hardness: 0.0 },
    53: { name: 'Dandelion', atlasIdx: 54, hardness: 0.0 },
    54: { name: 'Monster Spawner', atlasIdx: 82, hardness: 5.0, dropId: 0 }, 
    58: { name: 'Crafting Table', atlasIdx: { top: 67, bottom: 32, side: 65, sideX: 66, sideZ: 65 }, hardness: 2.5 },
    59: { name: 'Furnace', atlasIdx: { top: 71, bottom: 71, side: 70, front: 68, frontLit: 69 }, hardness: 3.5, dropId: 59 },
    60: { name: 'Structure Block', atlasIdx: 80, hardness: -1, dropId: 60 }, 
    61: { name: 'Clay', atlasIdx: 83, hardness: 0.6, dropId: 120 }, 
    62: { name: 'Farmland', atlasIdx: { top: 88, bottom: 2, side: 2 }, hardness: 0.6, dropId: 2 },
    63: { name: 'Moist Farmland', atlasIdx: { top: 89, bottom: 2, side: 2 }, hardness: 0.6, dropId: 2 },
    64: { name: 'Wheat Crop', atlasIdx: 91, hardness: 0.0, dropId: 128, type: 'crop' },
    65: { name: 'TNT', atlasIdx: { top: 102, bottom: 100, side: 101 }, hardness: 0.0, dropId: 0 },
    66: { name: 'Vine', atlasIdx: 103, hardness: 0.2, dropId: 0 },
    67: { name: 'Lily Pad', atlasIdx: 104, hardness: 0.0 },
    68: { name: 'Glass Pane', atlasIdx: 41, hardness: 0.3, dropId: 0 },
    69: { name: 'Chest', atlasIdx: { top: 106, bottom: 106, side: 107, front: 108 }, hardness: 2.5 },
    93: { name: 'Loot Chest', atlasIdx: { top: 106, bottom: 106, side: 107, front: 108 }, hardness: 2.5 },
    // Slabs: level bits 0=bottom, 1=top
    70: { name: 'Oak Slab', atlasIdx: 32, hardness: 2.0, type: 'slab', parentTex: 32 },
    71: { name: 'Birch Slab', atlasIdx: 48, hardness: 2.0, type: 'slab', parentTex: 48 },
    72: { name: 'Spruce Slab', atlasIdx: 33, hardness: 2.0, type: 'slab', parentTex: 33 },
    73: { name: 'Stone Slab', atlasIdx: 3, hardness: 1.5, type: 'slab', parentTex: 3 },
    74: { name: 'Cobblestone Slab', atlasIdx: 36, hardness: 2.0, type: 'slab', parentTex: 36 },
    75: { name: 'Stone Brick Slab', atlasIdx: 35, hardness: 1.5, type: 'slab', parentTex: 35 },
    76: { name: 'Brick Slab', atlasIdx: 34, hardness: 2.0, type: 'slab', parentTex: 34 },
    77: { name: 'Jungle Slab', atlasIdx: 125, hardness: 2.0, type: 'slab', parentTex: 125 },
    // Stairs: level bits encode direction (0-3) + upside-down flag (bit 2) + corner info (bits 3-4)
    80: { name: 'Oak Stairs', atlasIdx: 32, hardness: 2.0, type: 'stair', parentTex: 32 },
    81: { name: 'Birch Stairs', atlasIdx: 48, hardness: 2.0, type: 'stair', parentTex: 48 },
    82: { name: 'Spruce Stairs', atlasIdx: 33, hardness: 2.0, type: 'stair', parentTex: 33 },
    83: { name: 'Stone Stairs', atlasIdx: 3, hardness: 1.5, type: 'stair', parentTex: 3 },
    84: { name: 'Cobblestone Stairs', atlasIdx: 36, hardness: 2.0, type: 'stair', parentTex: 36 },
    85: { name: 'Stone Brick Stairs', atlasIdx: 35, hardness: 1.5, type: 'stair', parentTex: 35 },
    86: { name: 'Brick Stairs', atlasIdx: 34, hardness: 2.0, type: 'stair', parentTex: 34 },
    94: { name: 'Jungle Stairs', atlasIdx: 125, hardness: 2.0, type: 'stair', parentTex: 125 },
    87: { name: 'Netherrack', atlasIdx: 116, hardness: 0.4 }, // NEW
    88: { name: 'Nether Quartz Ore', atlasIdx: 117, hardness: 3.0, dropId: 153 }, // NEW
    89: { name: 'Fire', atlasIdx: 118, hardness: 0.0, dropId: 0 }, // NEW
    90: { name: 'Nether Portal', atlasIdx: 111, hardness: -1, dropId: 0 }, // NETHER PORTAL
    91: { name: 'Glowstone', atlasIdx: 118, hardness: 0.3 },
    92: { name: 'Soul Sand', atlasIdx: 119, hardness: 0.5 },
    116: { name: 'Oak Sapling', atlasIdx: 76, hardness: 0.0, dropId: 116 },
    117: { name: 'Birch Sapling', atlasIdx: 77, hardness: 0.0, dropId: 117 },
    118: { name: 'Spruce Sapling', atlasIdx: 78, hardness: 0.0, dropId: 118 },
    95: { name: 'Ice', atlasIdx: 120, hardness: 0.5, dropId: 0 },
    96: { name: 'Jungle Log', atlasIdx: { top: 121, bottom: 121, side: 122 }, hardness: 2.0 },
    97: { name: 'Jungle Leaves', atlasIdx: 123, hardness: 0.2 },
    98: { name: 'Jungle Planks', atlasIdx: 125, hardness: 2.0 },
    137: { name: 'Jungle Sapling', atlasIdx: 124, hardness: 0.0, dropId: 137 },
    99: { name: 'Nether Bricks', atlasIdx: 126, hardness: 2.0 },
    138: { name: 'Packed Ice', atlasIdx: 128, hardness: 0.5 },
    139: { name: 'Iron Block', atlasIdx: 129, hardness: 5.0 },
    140: { name: 'Gold Block', atlasIdx: 130, hardness: 3.0 },
    141: { name: 'Diamond Block', atlasIdx: 131, hardness: 5.0 },
    144: { name: 'Oak Fence', atlasIdx: 32, hardness: 2.0 },
    145: { name: 'Birch Fence', atlasIdx: 48, hardness: 2.0 },
    146: { name: 'Spruce Fence', atlasIdx: 33, hardness: 2.0 },
    147: { name: 'Jungle Fence', atlasIdx: 125, hardness: 2.0 },
    148: { name: 'Nether Brick Fence', atlasIdx: 126, hardness: 2.0 },
    149: { name: 'Oak Door', atlasIdx: { bottom: 133, top: 134, backTop: 137, backBottom: 138 }, hardness: 3.0, dropId: 151 },
    150: { name: 'Oak Trapdoor', atlasIdx: 136, hardness: 3.0 },
    152: { name: 'Nether Brick Stairs', atlasIdx: 126, hardness: 2.0, type: 'stair', parentTex: 126 },
    154: { name: 'Quartz Block', atlasIdx: 140, hardness: 0.8 },
    155: { name: 'Quartz Pillar', atlasIdx: { top: 142, bottom: 142, side: 141 }, hardness: 0.8 },
    156: { name: 'Smooth Stone', atlasIdx: 143, hardness: 1.5 }
};

const blockRequirements = {
    1: { optTool: 'shovel' }, 2: { optTool: 'shovel' }, 5: { optTool: 'shovel' }, 15: { optTool: 'shovel' }, 61: { optTool: 'shovel' }, 62: { optTool: 'shovel' }, 63: { optTool: 'shovel' },
    3: { reqTool: 'pickaxe', reqTier: 0 }, 10: { reqTool: 'pickaxe', reqTier: 0 }, 11: { reqTool: 'pickaxe', reqTier: 0 }, 12: { reqTool: 'pickaxe', reqTier: 0 }, 19: { reqTool: 'pickaxe', reqTier: 0 }, 28: { reqTool: 'pickaxe', reqTier: 3 }, 31: { reqTool: 'pickaxe', reqTier: 0 }, 32: { reqTool: 'pickaxe', reqTier: 0 }, 33: { reqTool: 'pickaxe', reqTier: 0 }, 48: { reqTool: 'pickaxe', reqTier: 0 }, 54: { reqTool: 'pickaxe', reqTier: 0 },
    6: { reqTool: 'pickaxe', reqTier: 1 }, 7: { reqTool: 'pickaxe', reqTier: 0 }, 8: { reqTool: 'pickaxe', reqTier: 2 }, 9: { reqTool: 'pickaxe', reqTier: 2 }, 49: { reqTool: 'pickaxe', reqTier: 2 }, 50: { reqTool: 'pickaxe', reqTier: 1 },
    13: { optTool: 'axe' }, 21: { optTool: 'axe' }, 41: { optTool: 'axe' }, 29: { optTool: 'axe' }, 30: { optTool: 'axe' }, 44: { optTool: 'axe' }, 58: { optTool: 'axe' }, 69: { optTool: 'axe' }, 96: { optTool: 'axe' }, 98: { optTool: 'axe' }, 144: { optTool: 'axe' }, 145: { optTool: 'axe' }, 146: { optTool: 'axe' }, 147: { optTool: 'axe' }, 149: { optTool: 'axe' }, 150: { optTool: 'axe' },
    59: { reqTool: 'pickaxe', reqTier: 0 }, 60: { reqTool: 'pickaxe', reqTier: 0 },
    // Wood slabs/stairs: axe optimal
    70: { optTool: 'axe' }, 71: { optTool: 'axe' }, 72: { optTool: 'axe' }, 77: { optTool: 'axe' },
    80: { optTool: 'axe' }, 81: { optTool: 'axe' }, 82: { optTool: 'axe' }, 94: { optTool: 'axe' },
    // Stone slabs/stairs: pickaxe required
    73: { reqTool: 'pickaxe', reqTier: 0 }, 74: { reqTool: 'pickaxe', reqTier: 0 }, 75: { reqTool: 'pickaxe', reqTier: 0 }, 76: { reqTool: 'pickaxe', reqTier: 0 },
    83: { reqTool: 'pickaxe', reqTier: 0 }, 84: { reqTool: 'pickaxe', reqTier: 0 }, 85: { reqTool: 'pickaxe', reqTier: 0 }, 86: { reqTool: 'pickaxe', reqTier: 0 },
    95: { optTool: 'pickaxe' },
    99: { reqTool: 'pickaxe', reqTier: 0 },   // Nether Bricks
    148: { reqTool: 'pickaxe', reqTier: 0 },  // Nether Brick Fence
    138: { optTool: 'pickaxe' },               // Packed Ice
    139: { reqTool: 'pickaxe', reqTier: 1 },   // Iron Block
    140: { reqTool: 'pickaxe', reqTier: 2 },   // Gold Block
    141: { reqTool: 'pickaxe', reqTier: 2 },    // Diamond Block
    152: { reqTool: 'pickaxe', reqTier: 0 },    // Nether Brick Stairs
    154: { reqTool: 'pickaxe', reqTier: 0 },    // Quartz Block
    155: { reqTool: 'pickaxe', reqTier: 0 },    // Quartz Pillar
    156: { reqTool: 'pickaxe', reqTier: 0 }     // Smooth Stone
};
for (let id in blockRequirements) {
    if (BLOCK_DATA[id]) Object.assign(BLOCK_DATA[id], blockRequirements[id]);
}