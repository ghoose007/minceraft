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

        // MC brightness curve: brightness = pow(0.8, 15 - level)
        // vColor.r = sunLevel/15 * shade, vColor.g = torchLevel/15 * shade, vColor.b = shade
        // We need to extract the raw light level from the vertex color, apply the curve, then recombine with shade
        // Since shade is baked into all 3 channels: rawSun = vColor.r / vColor.b, rawTorch = vColor.g / vColor.b
        // Then apply: mcBrightness(raw) = pow(0.8, 15.0 * (1.0 - raw))
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <color_fragment>',
            `#ifdef USE_COLOR
float shade = vColor.b;
float rawSun = (shade > 0.001) ? clamp(vColor.r / shade, 0.0, 1.0) : 0.0;
float rawTorch = (shade > 0.001) ? clamp(vColor.g / shade, 0.0, 1.0) : 0.0;
float mcSun = pow(0.8, 15.0 * (1.0 - rawSun));
float mcTorch = pow(0.8, 15.0 * (1.0 - rawTorch));
vec3 lightCalc = shade * uAmbientColor + mcSun * shade * uSunColor * uSunLevel + mcTorch * shade * uTorchColor;
diffuseColor.rgb *= min(vec3(1.0), lightCalc) * vBiomeTint;
#endif`
        );
    };
}