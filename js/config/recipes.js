// ==========================================
// CRAFTING & SMELTING RECIPES
// ==========================================

const RECIPE_GROUPS = {
    'plank': [29, 30, 44, 98]
};

// CRAFTING RECIPES!
const RECIPES = [
    // --- Planks ---
    { pattern: [[13]], output: { id: 29, count: 4 } }, // Oak
    { pattern: [[21]], output: { id: 30, count: 4 } }, // Spruce
    { pattern: [[41]], output: { id: 44, count: 4 } }, // Birch
    { pattern: [[96]], output: { id: 98, count: 4 } }, // Jungle
    
    // --- Blocks & Utility ---
    { pattern: [['plank', 'plank'],['plank', 'plank']], output: { id: 58, count: 1 } }, // Crafting Table
    { pattern: [[113, 0], [0, 135]], output: { id: 136, count: 1 } }, // NEW: Flint and Steel
    { pattern: [['plank', 'plank', 'plank'],['plank', 0, 'plank'],['plank', 'plank', 'plank']], output: { id: 69, count: 1 } }, // Chest
    { pattern: [['plank'],['plank']], output: { id: 112, count: 4 } }, // Sticks
    { pattern: [[33, 33, 33],[33, 0, 33],[33, 33, 33]], output: { id: 59, count: 1 } }, // Furnace
    { pattern: [[79],[112]], output: { id: 17, count: 4 } }, // Torch
    { pattern: [[121, 121],[121, 121]], output: { id: 31, count: 1 } }, // Bricks
    { pattern: [[38, 38, 38], [38, 38, 38]], output: { id: 68, count: 16 } }, // Glass Pane
    { pattern: [[119],[112]], output: { id: 17, count: 4 } }, // Torch (Coal 119 over Stick 112)
    // --- Hoes ---
    { pattern: [['plank', 'plank'], [0, 112], [0, 112]], output: { id: 130, count: 1 } }, // Wooden Hoe
    { pattern: [['plank', 'plank'], [112, 0], [112, 0]], output: { id: 130, count: 1 } }, 
    { pattern: [[33, 33], [0, 112], [0, 112]], output: { id: 131, count: 1 } }, // Stone Hoe
    { pattern: [[33, 33], [112, 0], [112, 0]], output: { id: 131, count: 1 } },
    { pattern: [[113, 113], [0, 112], [0, 112]], output: { id: 132, count: 1 } }, // Iron Hoe
    { pattern: [[113, 113], [112, 0], [112, 0]], output: { id: 132, count: 1 } },
    { pattern: [[114, 114], [0, 112], [0, 112]], output: { id: 133, count: 1 } }, // Diamond Hoe
    { pattern: [[114, 114], [112, 0], [112, 0]], output: { id: 133, count: 1 } },
    
    // --- Wooden Tools ---
    { pattern: [['plank', 'plank', 'plank'], [0, 112, 0], [0, 112, 0]], output: { id: 101, count: 1 } }, // Pickaxe
    { pattern: [['plank', 'plank'], ['plank', 112], [0, 112]], output: { id: 100, count: 1 } }, // Axe (Left)
    { pattern: [['plank', 'plank'], [112, 'plank'], [112, 0]], output: { id: 100, count: 1 } }, // Axe (Right)
    { pattern: [['plank'], ['plank'], [112]], output: { id: 103, count: 1 } }, // Sword
    { pattern: [['plank'], [112], [112]], output: { id: 102, count: 1 } }, // Shovel
    
    // --- Stone Tools ---
    { pattern: [[33, 33, 33], [0, 112, 0], [0, 112, 0]], output: { id: 105, count: 1 } }, // Pickaxe
    { pattern: [[33, 33], [33, 112], [0, 112]], output: { id: 104, count: 1 } }, // Axe
    { pattern: [[33, 33], [112, 33], [112, 0]], output: { id: 104, count: 1 } }, // Axe
    { pattern: [[33], [33], [112]], output: { id: 107, count: 1 } }, // Sword
    { pattern: [[33], [112], [112]], output: { id: 106, count: 1 } }, // Shovel

    // --- Iron Tools ---
    { pattern: [[113, 113, 113], [0, 112, 0], [0, 112, 0]], output: { id: 109, count: 1 } }, // Pickaxe
    { pattern: [[113, 113], [113, 112], [0, 112]], output: { id: 108, count: 1 } },        // Axe
    { pattern: [[113, 113], [112, 113], [112, 0]], output: { id: 108, count: 1 } },        // Axe
    { pattern: [[113], [113], [112]], output: { id: 111, count: 1 } },                     // Sword
    { pattern: [[113], [112], [112]], output: { id: 110, count: 1 } },                   // Shovel

    // --- Diamond Tools ---
    { pattern: [[114, 114, 114], [0, 112, 0], [0, 112, 0]], output: { id: 125, count: 1 } }, // Pickaxe
    { pattern: [[114, 114], [114, 112], [0, 112]], output: { id: 124, count: 1 } },         // Axe
    { pattern: [[114, 114], [112, 114], [112, 0]], output: { id: 124, count: 1 } },         // Axe
    { pattern: [[114], [114], [112]], output: { id: 127, count: 1 } },                     // Sword
    { pattern: [[114], [112], [112]], output: { id: 126, count: 1 } },                     // Shovel

    // --- Gold Tools ---
    { pattern: [[143, 143, 143], [0, 112, 0], [0, 112, 0]], output: { id: 160, count: 1 } }, // Gold Pickaxe
    { pattern: [[143, 143], [143, 112], [0, 112]], output: { id: 159, count: 1 } },          // Gold Axe (Left)
    { pattern: [[143, 143], [112, 143], [112, 0]], output: { id: 159, count: 1 } },          // Gold Axe (Right)
    { pattern: [[143], [143], [112]], output: { id: 162, count: 1 } },                       // Gold Sword
    { pattern: [[143], [112], [112]], output: { id: 161, count: 1 } },                       // Gold Shovel
    // --- Gold Hoe ---
    { pattern: [[143, 143], [0, 112], [0, 112]], output: { id: 163, count: 1 } },            // Gold Hoe
    { pattern: [[143, 143], [112, 0], [112, 0]], output: { id: 163, count: 1 } },            // Gold Hoe (mirrored)

    // --- Food ---
    { pattern: [[129, 129, 129]], output: { id: 134, count: 1 } },                         // Bread (3 wheat)

    // --- Stone Bricks (2x2 stone) ---
    { pattern: [[3, 3], [3, 3]], output: { id: 32, count: 4 } },

    // --- Slabs (3 in a row) ---
    { pattern: [[29, 29, 29]], output: { id: 70, count: 6 } },    // Oak Slab
    { pattern: [[44, 44, 44]], output: { id: 71, count: 6 } },    // Birch Slab
    { pattern: [[30, 30, 30]], output: { id: 72, count: 6 } },    // Spruce Slab
    { pattern: [[3, 3, 3]], output: { id: 73, count: 6 } },       // Stone Slab
    { pattern: [[33, 33, 33]], output: { id: 74, count: 6 } },    // Cobblestone Slab
    { pattern: [[32, 32, 32]], output: { id: 75, count: 6 } },    // Stone Brick Slab
    { pattern: [[31, 31, 31]], output: { id: 76, count: 6 } },    // Brick Slab
    { pattern: [[98, 98, 98]], output: { id: 77, count: 6 } },    // Jungle Slab

    // --- Stairs (L-shape, 6 output) ---
    { pattern: [[29, 0, 0], [29, 29, 0], [29, 29, 29]], output: { id: 80, count: 4 } },   // Oak Stairs
    { pattern: [[0, 0, 29], [0, 29, 29], [29, 29, 29]], output: { id: 80, count: 4 } },
    { pattern: [[44, 0, 0], [44, 44, 0], [44, 44, 44]], output: { id: 81, count: 4 } },   // Birch Stairs
    { pattern: [[0, 0, 44], [0, 44, 44], [44, 44, 44]], output: { id: 81, count: 4 } },
    { pattern: [[30, 0, 0], [30, 30, 0], [30, 30, 30]], output: { id: 82, count: 4 } },   // Spruce Stairs
    { pattern: [[0, 0, 30], [0, 30, 30], [30, 30, 30]], output: { id: 82, count: 4 } },
    { pattern: [[3, 0, 0], [3, 3, 0], [3, 3, 3]], output: { id: 83, count: 4 } },         // Stone Stairs
    { pattern: [[0, 0, 3], [0, 3, 3], [3, 3, 3]], output: { id: 83, count: 4 } },
    { pattern: [[33, 0, 0], [33, 33, 0], [33, 33, 33]], output: { id: 84, count: 4 } },   // Cobblestone Stairs
    { pattern: [[0, 0, 33], [0, 33, 33], [33, 33, 33]], output: { id: 84, count: 4 } },
    { pattern: [[32, 0, 0], [32, 32, 0], [32, 32, 32]], output: { id: 85, count: 4 } },   // Stone Brick Stairs
    { pattern: [[0, 0, 32], [0, 32, 32], [32, 32, 32]], output: { id: 85, count: 4 } },
    { pattern: [[31, 0, 0], [31, 31, 0], [31, 31, 31]], output: { id: 86, count: 4 } },   // Brick Stairs
    { pattern: [[0, 0, 31], [0, 31, 31], [31, 31, 31]], output: { id: 86, count: 4 } },
    { pattern: [[98, 0, 0], [98, 98, 0], [98, 98, 98]], output: { id: 94, count: 4 } },   // Jungle Stairs
    { pattern: [[0, 0, 98], [0, 98, 98], [98, 98, 98]], output: { id: 94, count: 4 } },

    // --- Nether Bricks (2x2 nether brick items) ---
    { pattern: [[142, 142], [142, 142]], output: { id: 99, count: 1 } },

    // --- Metal/Gem Blocks (3x3) ---
    { pattern: [[113, 113, 113], [113, 113, 113], [113, 113, 113]], output: { id: 139, count: 1 } }, // Iron Block
    { pattern: [[143, 143, 143], [143, 143, 143], [143, 143, 143]], output: { id: 140, count: 1 } }, // Gold Block
    { pattern: [[114, 114, 114], [114, 114, 114], [114, 114, 114]], output: { id: 141, count: 1 } }, // Diamond Block

    // --- Uncraft Metal/Gem Blocks back to ingots ---
    { pattern: [[139]], output: { id: 113, count: 9 } }, // Iron Block -> Iron Ingots
    { pattern: [[140]], output: { id: 143, count: 9 } }, // Gold Block -> Gold Ingots
    { pattern: [[141]], output: { id: 114, count: 9 } },  // Diamond Block -> Diamonds

    // --- Fences ---
    { pattern: [[29, 112, 29], [29, 112, 29]], output: { id: 144, count: 3 } },   // Oak Fence
    { pattern: [[44, 112, 44], [44, 112, 44]], output: { id: 145, count: 3 } },   // Birch Fence
    { pattern: [[30, 112, 30], [30, 112, 30]], output: { id: 146, count: 3 } },   // Spruce Fence
    { pattern: [[98, 112, 98], [98, 112, 98]], output: { id: 147, count: 3 } },   // Jungle Fence
    { pattern: [[99, 142, 99], [99, 142, 99]], output: { id: 148, count: 3 } },    // Nether Brick Fence

    // --- Doors (2x3 planks = 3 doors) ---
    { pattern: [[29, 29], [29, 29], [29, 29]], output: { id: 151, count: 3 } },   // Oak Door
    { pattern: [[44, 44], [44, 44], [44, 44]], output: { id: 151, count: 3 } },   // Birch Door
    { pattern: [[30, 30], [30, 30], [30, 30]], output: { id: 151, count: 3 } },   // Spruce Door
    { pattern: [[98, 98], [98, 98], [98, 98]], output: { id: 151, count: 3 } },   // Jungle Door

    // --- Trapdoors (3x2 planks = 2 trapdoors) ---
    { pattern: [[29, 29, 29], [29, 29, 29]], output: { id: 150, count: 2 } },     // Oak Trapdoor
    { pattern: [[44, 44, 44], [44, 44, 44]], output: { id: 150, count: 2 } },     // Birch Trapdoor
    { pattern: [[30, 30, 30], [30, 30, 30]], output: { id: 150, count: 2 } },     // Spruce Trapdoor
    { pattern: [[98, 98, 98], [98, 98, 98]], output: { id: 150, count: 2 } },     // Jungle Trapdoor

    // --- Nether Brick Stairs ---
    { pattern: [[99, 0, 0], [99, 99, 0], [99, 99, 99]], output: { id: 152, count: 4 } },
    { pattern: [[0, 0, 99], [0, 99, 99], [99, 99, 99]], output: { id: 152, count: 4 } },

    // --- Quartz Block (2x2 quartz items) ---
    { pattern: [[153, 153], [153, 153]], output: { id: 154, count: 1 } },

    // --- Quartz Pillar (1x2 quartz blocks) ---
    { pattern: [[154], [154]], output: { id: 155, count: 2 } },

    // --- Smooth Stone Slab (3 smooth stone in a row) ---
    { pattern: [[156, 156, 156]], output: { id: 157, count: 6 } },

    // --- Iron Bars (3x2 iron ingots) ---
    { pattern: [[113, 113, 113], [113, 113, 113]], output: { id: 158, count: 16 } },

    // --- Iron Armor ---
    { pattern: [[113, 113, 113], [113, 0, 113]], output: { id: 170, count: 1 } }, // Iron Helmet
    { pattern: [[113, 0, 113], [113, 113, 113], [113, 113, 113]], output: { id: 171, count: 1 } }, // Iron Chestplate
    { pattern: [[113, 113, 113], [113, 0, 113], [113, 0, 113]], output: { id: 172, count: 1 } }, // Iron Leggings
    { pattern: [[113, 0, 113], [113, 0, 113]], output: { id: 173, count: 1 } }, // Iron Boots

    // --- Leather Armor (186 = leather) ---
    { pattern: [[186, 186, 186], [186, 0, 186]], output: { id: 174, count: 1 } }, // Leather Helmet
    { pattern: [[186, 0, 186], [186, 186, 186], [186, 186, 186]], output: { id: 175, count: 1 } }, // Leather Chestplate
    { pattern: [[186, 186, 186], [186, 0, 186], [186, 0, 186]], output: { id: 176, count: 1 } }, // Leather Leggings
    { pattern: [[186, 0, 186], [186, 0, 186]], output: { id: 177, count: 1 } }, // Leather Boots

    // --- Diamond Armor (114 = diamond) ---
    { pattern: [[114, 114, 114], [114, 0, 114]], output: { id: 178, count: 1 } }, // Diamond Helmet
    { pattern: [[114, 0, 114], [114, 114, 114], [114, 114, 114]], output: { id: 179, count: 1 } }, // Diamond Chestplate
    { pattern: [[114, 114, 114], [114, 0, 114], [114, 0, 114]], output: { id: 180, count: 1 } }, // Diamond Leggings
    { pattern: [[114, 0, 114], [114, 0, 114]], output: { id: 181, count: 1 } }, // Diamond Boots

    // --- Gold Armor (143 = gold ingot) ---
    { pattern: [[143, 143, 143], [143, 0, 143]], output: { id: 182, count: 1 } }, // Gold Helmet
    { pattern: [[143, 0, 143], [143, 143, 143], [143, 143, 143]], output: { id: 183, count: 1 } }, // Gold Chestplate
    { pattern: [[143, 143, 143], [143, 0, 143], [143, 0, 143]], output: { id: 184, count: 1 } }, // Gold Leggings
    { pattern: [[143, 0, 143], [143, 0, 143]], output: { id: 185, count: 1 } } // Gold Boots

];

// --- FURNACE RECIPES & BURN TIMES ---
const SMELTING_RECIPES = {
    6: { id: 113, count: 1 }, // Iron Ore -> Iron Ingot
    120: { id: 121, count: 1 }, // Clay Ball -> Brick Item
    122: { id: 123, count: 1 }, // Raw Porkchop -> Cooked Porkchop
    187: { id: 188, count: 1 }, // Raw Beef -> Cooked Beef
    33: { id: 3, count: 1 },   // Cobblestone -> Stone
    87: { id: 142, count: 1 },  // Netherrack -> Nether Brick
    8: { id: 143, count: 1 },    // Gold Ore -> Gold Ingot
    3: { id: 156, count: 1 }     // Stone -> Smooth Stone
};

// Burn time in seconds
const FUEL_DATA = {
    119: 80.0, // Coal 
    13: 15.0, 21: 15.0, 41: 15.0, 96: 15.0, // Logs
    29: 15.0, 30: 15.0, 44: 15.0, 98: 15.0, // Planks 
    112: 5.0,  // Sticks
    144: 15.0, 145: 15.0, 146: 15.0, 147: 15.0,  // Wood Fences
    149: 10.0, 150: 15.0, 151: 10.0  // Door, Trapdoor, Door Item
};