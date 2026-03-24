// ==========================================
// COMBAT SYSTEM
// ==========================================

// --- COMBAT RAYCAST ---
const _mobRayDir = new THREE.Vector3(); // FIX: Pre-allocated to prevent GC stutter!

window.getTargetedMob = function() {
    let bestMob = null;
    let bestDist = 4.0; // Max reach distance
    camera.getWorldDirection(_mobRayDir);
    
    if (typeof globalMobs === 'undefined') return null;
    
    for (let mob of globalMobs) {
        if (mob.dead || mob.dying) continue; // Don't target dying pigs
        
        const dx = mob.x - player.x;
        const dy = (mob.y + mob.height/2) - (player.y + player.eyeLevel);
        const dz = mob.z - player.z;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        if (dist < bestDist) {
            const dot = (dx*_mobRayDir.x + dy*_mobRayDir.y + dz*_mobRayDir.z) / dist;
            if (dot > 0.92) { 
                bestDist = dist;
                bestMob = mob;
            }
        }
    }
    return bestMob;
};
