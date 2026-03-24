// ==========================================
// LIGHTING SHADER INJECTION
// ==========================================

function injectLightingShader(material) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uSunLevel = timeUniforms.uSunLevel;
        shader.uniforms.uSunColor = timeUniforms.uSunColor;
        shader.uniforms.uTorchColor = timeUniforms.uTorchColor;
        shader.uniforms.uAmbientColor = timeUniforms.uAmbientColor;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_pars_vertex>',
            `#include <color_pars_vertex>\nattribute vec3 aBiomeTint;\nvarying vec3 vBiomeTint;`
        );

        shader.vertexShader = shader.vertexShader.replace(
            '#include <color_vertex>',
            `#include <color_vertex>\nvBiomeTint = aBiomeTint;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_pars_fragment>',
            `#include <color_pars_fragment>\nuniform float uSunLevel;\nuniform vec3 uSunColor;\nuniform vec3 uTorchColor;\nuniform vec3 uAmbientColor;\nvarying vec3 vBiomeTint;`
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#ifdef USE_COLOR\nvec3 lightCalc = vColor.b * uAmbientColor + vColor.r * uSunColor * uSunLevel + vColor.g * uTorchColor;\ndiffuseColor.rgb *= min(vec3(1.0), lightCalc) * vBiomeTint;\n#endif`
        );
    };
}