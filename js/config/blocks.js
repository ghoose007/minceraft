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
    16: { name: 'Grass', atlasIdx: 16, hardness: 0.0, dropId: 0 }, // v339: renamed from "Tall Grass" — the 2-block plant at id 219 is now the canonical "Tall Grass"
    17: { name: 'Torch', atlasIdx: 17, hardness: 0.0 },
    18: { name: 'Bedrock', atlasIdx: 18, hardness: -1, dropId: 0 },
    19: { name: 'Sandstone', atlasIdx: { top: 19, bottom: 19, side: 20 }, hardness: 0.8 },
    20: { name: 'Cactus', atlasIdx: { top: 21, bottom: 21, side: 22 }, hardness: 0.4 },
    21: { name: 'Spruce Log', atlasIdx: { top: 23, bottom: 23, side: 24 }, hardness: 2.0 },
    22: { name: 'Spruce Leaves', atlasIdx: 25, hardness: 0.2 }, 
    23: { name: 'Rose', atlasIdx: 26, hardness: 0.0 }, 
    24: { name: 'Bush', atlasIdx: 27, hardness: 0.0 }, 
    26: { name: 'Dead Bush', atlasIdx: 216, hardness: 0.0, dropId: 0, itemModel: 'material' },
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
    49: { name: 'Redstone Ore', atlasIdx: 49, hardness: 3.0, dropId: 202 },
    50: { name: 'Lapis Lazuli Ore', atlasIdx: 50, hardness: 3.0, dropId: 199 },
    51: { name: 'Pumpkin', atlasIdx: { top: 51, bottom: 51, side: 52 }, hardness: 1.0 },
    52: { name: 'Sugarcane', atlasIdx: 53, hardness: 0.0, itemModel: 'material' },
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
    209: { name: 'Aether Portal', atlasIdx: -1, hardness: -1, dropId: 0 }, // AETHER PORTAL
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
    156: { name: 'Smooth Stone', atlasIdx: 143, hardness: 1.5 },
    157: { name: 'Smooth Stone Slab', atlasIdx: { top: 143, bottom: 143, side: 144 }, hardness: 1.5, type: 'slab', parentTex: 143 },
    158: { name: 'Iron Bars', atlasIdx: 145, hardness: 5.0, dropId: 158 },
    200: { name: 'Bookshelf', atlasIdx: { top: 32, bottom: 32, side: 154 }, hardness: 1.5 },
    201: { name: 'Enchanting Table', atlasIdx: { top: 158, bottom: 156, side: 157 }, hardness: 5.0 },
    202: { name: 'Redstone Dust', atlasIdx: 159, hardness: 0.0, dropId: 202 },
    203: { name: 'Wood Button', atlasIdx: 32, hardness: 0.5, dropId: 203 },
    205: { name: 'Lever', atlasIdx: 162, hardness: 0.5, dropId: 205 },
    206: { name: 'Redstone Torch', atlasIdx: 163, hardness: 0.0, dropId: 206, lightLevel: 7 },
    207: { name: 'Piston', atlasIdx: { top: 168, bottom: 165, side: 167 }, hardness: 1.5, dropId: 207 },
    208: { name: 'Sticky Piston', atlasIdx: { top: 169, bottom: 165, side: 167 }, hardness: 1.5, dropId: 208 },
    210: { name: 'Emerald Ore', atlasIdx: 174, hardness: 25.0, dropId: 211 },
    212: { name: 'Cyan Flower', atlasIdx: 176, hardness: 0.0 },
    213: { name: 'Orange Flower', atlasIdx: 177, hardness: 0.0 },

    // v335: Tall Grass — 2-block-tall plant. The world block at the player's
    // feet uses atlas 217 (the wispier bottom half); the engine-placed top
    // half (id 220) uses atlas 218 (the leafier top). There is only ONE
    // item form: id 219. Its inventory / held / dropped icon uses atlas
    // 218 (the leafier silhouette reads better as an item) — see
    // `itemAtlasIdx` and the buildMaterialMesh fallback in item-mesh.js.
    // Greyscale texture, biome-tinted through the grass-tint path so it
    // looks right in plains, swamp, jungle, wooded badlands, etc.
    219: { name: 'Tall Grass',         atlasIdx: 217, itemAtlasIdx: 218, hardness: 0.0, dropId: 0 },
    220: { name: 'Tall Grass (Top)',   atlasIdx: 218, hardness: 0.0, dropId: 0 },

    // v406: Mushrooms — centered X-pattern plant blocks using the new atlas slots.
    221: { name: 'Brown Mushroom', atlasIdx: 219, hardness: 0.0, dropId: 221, itemModel: 'material' },
    222: { name: 'Red Mushroom',   atlasIdx: 220, hardness: 0.0, dropId: 222, itemModel: 'material' },

    // ----- NEW BUILDING BLOCKS (v258) -----
    // Stone brick variants
    226: { name: 'Chiseled Stone Bricks', atlasIdx: 178, hardness: 1.5, dropId: 226 },
    227: { name: 'Cracked Stone Bricks', atlasIdx: 179, hardness: 1.5, dropId: 227 },
    228: { name: 'Mossy Stone Bricks', atlasIdx: 180, hardness: 1.5, dropId: 228 },
    // Sandstone variants — top/bottom share regular sandstone top texture (19)
    229: { name: 'Chiseled Sandstone', atlasIdx: { top: 19, bottom: 19, side: 181 }, hardness: 0.8, dropId: 229 },
    230: { name: 'Smooth Sandstone',   atlasIdx: { top: 19, bottom: 19, side: 182 }, hardness: 0.8, dropId: 230 },
    // Smooth stone variants (granite/diorite/andesite)
    231: { name: 'Smooth Granite',  atlasIdx: 183, hardness: 1.5, dropId: 231 },
    232: { name: 'Smooth Diorite',  atlasIdx: 184, hardness: 1.5, dropId: 232 },
    233: { name: 'Smooth Andesite', atlasIdx: 185, hardness: 1.5, dropId: 233 },
    // Chiseled quartz — side and top/bottom textures differ
    234: { name: 'Chiseled Quartz Block', atlasIdx: { top: 187, bottom: 187, side: 186 }, hardness: 0.8, dropId: 234 },
    // Mineral storage blocks
    235: { name: 'Lapis Lazuli Block', atlasIdx: 188, hardness: 3.0, dropId: 235 },
    236: { name: 'Block of Redstone',  atlasIdx: 189, hardness: 5.0, dropId: 236 },
    237: { name: 'Block of Coal',      atlasIdx: 190, hardness: 5.0, dropId: 237 },

    // Slab variants for the new blocks (parentTex matches the source block)
    238: { name: 'Cracked Stone Brick Slab', atlasIdx: 179, hardness: 1.5, type: 'slab', parentTex: 179 },
    239: { name: 'Mossy Stone Brick Slab',   atlasIdx: 180, hardness: 1.5, type: 'slab', parentTex: 180 },
    240: { name: 'Smooth Granite Slab',      atlasIdx: 183, hardness: 1.5, type: 'slab', parentTex: 183 },
    241: { name: 'Smooth Diorite Slab',      atlasIdx: 184, hardness: 1.5, type: 'slab', parentTex: 184 },
    242: { name: 'Smooth Andesite Slab',     atlasIdx: 185, hardness: 1.5, type: 'slab', parentTex: 185 },

    // Stair variants for the new blocks
    243: { name: 'Cracked Stone Brick Stairs', atlasIdx: 179, hardness: 1.5, type: 'stair', parentTex: 179 },
    244: { name: 'Mossy Stone Brick Stairs',   atlasIdx: 180, hardness: 1.5, type: 'stair', parentTex: 180 },
    245: { name: 'Smooth Granite Stairs',      atlasIdx: 183, hardness: 1.5, type: 'stair', parentTex: 183 },
    246: { name: 'Smooth Diorite Stairs',      atlasIdx: 184, hardness: 1.5, type: 'stair', parentTex: 184 },
    247: { name: 'Smooth Andesite Stairs',     atlasIdx: 185, hardness: 1.5, type: 'stair', parentTex: 185 },

    // Sandstone slab and quartz slab — needed so chiseled-from-slab recipes work
    // (also adds the slab variants the user requested be created)
    248: { name: 'Sandstone Slab', atlasIdx: { top: 19, bottom: 19, side: 20 }, hardness: 0.8, type: 'slab', parentTex: 20 },
    249: { name: 'Quartz Slab',    atlasIdx: 140, hardness: 0.8, type: 'slab', parentTex: 140 },

    // v262: stair variants for sandstone (separate top/side textures via topTex)
    // and quartz (single texture). The stair renderer reads topTex if present.
    250: { name: 'Sandstone Stairs', atlasIdx: 20, topTex: 19, hardness: 0.8, type: 'stair', parentTex: 20 },
    251: { name: 'Quartz Stairs',    atlasIdx: 140,            hardness: 0.8, type: 'stair', parentTex: 140 },

    // ----- MESA / TERRACOTTA BLOCKS (v315) -----
    // These use currently-free 8-bit voxel IDs. Texture indices are the terrain.png
    // atlas indices supplied by the user. Keep IDs <= 255 because voxel IDs are
    // stored in the low 8 bits throughout the engine.
    25:  { name: 'Red Sand', atlasIdx: 195, hardness: 0.5, dropId: 25, itemModel: 'block' },
    45:  { name: 'Red Sandstone', atlasIdx: { top: 196, side: 197, bottom: 198 }, hardness: 0.8, dropId: 45, itemModel: 'block' },
    46:  { name: 'Green Terracotta', atlasIdx: 199, hardness: 1.25, dropId: 46, itemModel: 'block' },
    47:  { name: 'Light Blue Terracotta', atlasIdx: 200, hardness: 1.25, dropId: 47, itemModel: 'block' },
    55:  { name: 'Lime Terracotta', atlasIdx: 201, hardness: 1.25, dropId: 55, itemModel: 'block' },
    56:  { name: 'Magenta Terracotta', atlasIdx: 202, hardness: 1.25, dropId: 56, itemModel: 'block' },
    57:  { name: 'Orange Terracotta', atlasIdx: 203, hardness: 1.25, dropId: 57, itemModel: 'block' },
    78:  { name: 'Pink Terracotta', atlasIdx: 204, hardness: 1.25, dropId: 78, itemModel: 'block' },
    79:  { name: 'Purple Terracotta', atlasIdx: 205, hardness: 1.25, dropId: 79, itemModel: 'block' },
    166: { name: 'Red Terracotta', atlasIdx: 206, hardness: 1.25, dropId: 166, itemModel: 'block' },
    167: { name: 'Light Grey Terracotta', atlasIdx: 207, hardness: 1.25, dropId: 167, itemModel: 'block' },
    168: { name: 'Terracotta', atlasIdx: 208, hardness: 1.25, dropId: 168, itemModel: 'block' },
    169: { name: 'Black Terracotta', atlasIdx: 209, hardness: 1.25, dropId: 169, itemModel: 'block' },
    189: { name: 'Blue Terracotta', atlasIdx: 210, hardness: 1.25, dropId: 189, itemModel: 'block' },
    204: { name: 'Brown Terracotta', atlasIdx: 211, hardness: 1.25, dropId: 204, itemModel: 'block' },
    252: { name: 'Cyan Terracotta', atlasIdx: 212, hardness: 1.25, dropId: 252, itemModel: 'block' },
    253: { name: 'Grey Terracotta', atlasIdx: 213, hardness: 1.25, dropId: 253, itemModel: 'block' },
    254: { name: 'White Terracotta', atlasIdx: 214, hardness: 1.25, dropId: 254, itemModel: 'block' },
    255: { name: 'Yellow Terracotta', atlasIdx: 215, hardness: 1.25, dropId: 255, itemModel: 'block' }
};

const blockRequirements = {
    1: { optTool: 'shovel' }, 2: { optTool: 'shovel' }, 5: { optTool: 'shovel' }, 15: { optTool: 'shovel' }, 61: { optTool: 'shovel' }, 62: { optTool: 'shovel' }, 63: { optTool: 'shovel' },
    3: { reqTool: 'pickaxe', reqTier: 0 }, 10: { reqTool: 'pickaxe', reqTier: 0 }, 11: { reqTool: 'pickaxe', reqTier: 0 }, 12: { reqTool: 'pickaxe', reqTier: 0 }, 19: { reqTool: 'pickaxe', reqTier: 0 }, 28: { reqTool: 'pickaxe', reqTier: 3 }, 31: { reqTool: 'pickaxe', reqTier: 0 }, 32: { reqTool: 'pickaxe', reqTier: 0 }, 33: { reqTool: 'pickaxe', reqTier: 0 }, 48: { reqTool: 'pickaxe', reqTier: 0 }, 54: { reqTool: 'pickaxe', reqTier: 0 },
    6: { reqTool: 'pickaxe', reqTier: 1 }, 7: { reqTool: 'pickaxe', reqTier: 0 }, 8: { reqTool: 'pickaxe', reqTier: 2 }, 9: { reqTool: 'pickaxe', reqTier: 2 }, 49: { reqTool: 'pickaxe', reqTier: 2 }, 50: { reqTool: 'pickaxe', reqTier: 1 }, 210: { reqTool: 'pickaxe', reqTier: 3 },
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
    156: { reqTool: 'pickaxe', reqTier: 0 },     // Smooth Stone
    157: { reqTool: 'pickaxe', reqTier: 0 },     // Smooth Stone Slab
    158: { reqTool: 'pickaxe', reqTier: 0 },      // Iron Bars
    200: { optTool: 'axe' },                         // Bookshelf
    201: { reqTool: 'pickaxe', reqTier: 0 },             // Enchanting Table
    // ----- NEW BLOCKS (v258) -----
    // Stone-brick variants and smooth granite/diorite/andesite — pickaxe tier 0 (wood)
    226: { reqTool: 'pickaxe', reqTier: 0 },  // Chiseled Stone Bricks
    227: { reqTool: 'pickaxe', reqTier: 0 },  // Cracked Stone Bricks
    228: { reqTool: 'pickaxe', reqTier: 0 },  // Mossy Stone Bricks
    229: { reqTool: 'pickaxe', reqTier: 0 },  // Chiseled Sandstone
    230: { reqTool: 'pickaxe', reqTier: 0 },  // Smooth Sandstone
    231: { reqTool: 'pickaxe', reqTier: 0 },  // Smooth Granite
    232: { reqTool: 'pickaxe', reqTier: 0 },  // Smooth Diorite
    233: { reqTool: 'pickaxe', reqTier: 0 },  // Smooth Andesite
    234: { reqTool: 'pickaxe', reqTier: 0 },  // Chiseled Quartz Block
    // Lapis block: stone tier (matches MC)
    235: { reqTool: 'pickaxe', reqTier: 1 },  // Lapis Lazuli Block
    // Redstone and coal blocks: wood pickaxe (matches MC — coal block needs wood, redstone needs wood)
    236: { reqTool: 'pickaxe', reqTier: 0 },  // Block of Redstone
    237: { reqTool: 'pickaxe', reqTier: 0 },  // Block of Coal
    // Slab and stair variants — pickaxe tier 0
    238: { reqTool: 'pickaxe', reqTier: 0 }, 239: { reqTool: 'pickaxe', reqTier: 0 },
    240: { reqTool: 'pickaxe', reqTier: 0 }, 241: { reqTool: 'pickaxe', reqTier: 0 },
    242: { reqTool: 'pickaxe', reqTier: 0 },
    243: { reqTool: 'pickaxe', reqTier: 0 }, 244: { reqTool: 'pickaxe', reqTier: 0 },
    245: { reqTool: 'pickaxe', reqTier: 0 }, 246: { reqTool: 'pickaxe', reqTier: 0 },
    247: { reqTool: 'pickaxe', reqTier: 0 },
    248: { reqTool: 'pickaxe', reqTier: 0 },  // Sandstone Slab
    249: { reqTool: 'pickaxe', reqTier: 0 },   // Quartz Slab
    250: { reqTool: 'pickaxe', reqTier: 0 },   // Sandstone Stairs
    251: { reqTool: 'pickaxe', reqTier: 0 },    // Quartz Stairs

    // v315 mesa / terracotta blocks
    25: { optTool: 'shovel' },                 // Red Sand
    45: { reqTool: 'pickaxe', reqTier: 0 },     // Red Sandstone
    46: { reqTool: 'pickaxe', reqTier: 0 }, 47: { reqTool: 'pickaxe', reqTier: 0 },
    55: { reqTool: 'pickaxe', reqTier: 0 }, 56: { reqTool: 'pickaxe', reqTier: 0 },
    57: { reqTool: 'pickaxe', reqTier: 0 }, 78: { reqTool: 'pickaxe', reqTier: 0 },
    79: { reqTool: 'pickaxe', reqTier: 0 }, 166: { reqTool: 'pickaxe', reqTier: 0 },
    167: { reqTool: 'pickaxe', reqTier: 0 }, 168: { reqTool: 'pickaxe', reqTier: 0 },
    169: { reqTool: 'pickaxe', reqTier: 0 }, 189: { reqTool: 'pickaxe', reqTier: 0 },
    204: { reqTool: 'pickaxe', reqTier: 0 }, 252: { reqTool: 'pickaxe', reqTier: 0 },
    253: { reqTool: 'pickaxe', reqTier: 0 }, 254: { reqTool: 'pickaxe', reqTier: 0 },
    255: { reqTool: 'pickaxe', reqTier: 0 }
};
for (let id in blockRequirements) {
    if (BLOCK_DATA[id]) Object.assign(BLOCK_DATA[id], blockRequirements[id]);
}

// v317: Explicit mesa block family list. These are normal full-cube block models,
// so item/held/drop renderers should never route them through flat material/spawn-egg paths.
const MESA_BLOCK_IDS = [25,45,46,47,55,56,57,78,79,166,167,168,169,189,204,252,253,254,255];
const MESA_BLOCK_ID_SET = new Set(MESA_BLOCK_IDS);
function isMesaBlock(id) { return MESA_BLOCK_ID_SET.has(Number(id)); }