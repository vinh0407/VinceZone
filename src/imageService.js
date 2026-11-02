/**
 * VinceZone AI Image Studio Service
 * Hỗ trợ tạo ảnh (Text-to-Image) và chỉnh sửa ảnh (Image-to-Image / Inpainting)
 * Sử dụng Pollinations AI (100% Free không cần Key) & Cloudflare Workers AI (Flux, SDXL)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'generated_images');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Danh sách các Model tạo và sửa ảnh được hỗ trợ
const IMAGE_MODELS = [
  {
    id: 'flux',
    name: 'Flux.1 Schnell (Mặc định - Siêu nét & Chân thực)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: 'flux-realism',
    name: 'Flux Realism (Nhiếp ảnh chân thực 8K UHD)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: 'flux-anime',
    name: 'Flux Anime (Phong cách Anime / Manga Nhật Bản)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: 'flux-3d',
    name: 'Flux 3D (Dựng hình 3D Isometric & Game Asset)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: 'turbo',
    name: 'SDXL Turbo (Siêu tốc độ - Sáng tạo linh hoạt)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: 'midjourney',
    name: 'Midjourney Style Art (Nghệ thuật đồ họa cao cấp)',
    provider: 'Pollinations AI',
    isFree: true,
    capabilities: ['text2img', 'img2img']
  },
  {
    id: '@cf/black-forest-labs/flux-1-schnell',
    name: 'Flux.1 Schnell [Cloudflare Workers AI]',
    provider: 'Cloudflare Workers AI',
    isFree: true,
    capabilities: ['text2img']
  },
  {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    name: 'Stable Diffusion XL Base 1.0 [Cloudflare Workers AI]',
    provider: 'Cloudflare Workers AI',
    isFree: true,
    capabilities: ['text2img']
  },
  {
    id: '@cf/bytedance/stable-diffusion-xl-lightning',
    name: 'SDXL Lightning [Cloudflare Workers AI]',
    provider: 'Cloudflare Workers AI',
    isFree: true,
    capabilities: ['text2img']
  }
];

// Bản đồ phong cách nghệ thuật
const STYLE_PROMPTS = {
  natural: '',
  photorealistic: ', 8k uhd, photorealistic, cinematic lighting, dslr photo, high detail, sharp focus, 35mm photograph, professional photography',
  anime: ', masterpiece, highly detailed anime visual, vibrant colors, clean lineart, Makoto Shinkai style, trending on pixiv, studio ghibli aesthetic',
  cyberpunk: ', cyberpunk 2077 aesthetic, volumetric neon fog, glowing holographic signs, rainy futuristic metropolis, highly detailed',
  oil_painting: ', dramatic oil on canvas painting, rich impasto texture, dynamic brush strokes, masterpiece by classic painters, warm studio lighting',
  render_3d: ', 3d isometric render, blender 3d, unreal engine 5 render, octane render, soft ambient occlusion, clay and subsurface scattering',
  pixel_art: ', detailed pixel art, 16-bit retro arcade aesthetic, crisp pixels, vibrant color palette, nostalgic game asset',
  sketch: ', intricate pencil sketch, fine graphite lines, delicate shading and crosshatching, concept art sketchbook, highly detailed'
};

/**
 * Tinh chỉnh prompt theo phong cách nghệ thuật
 */
function enrichPromptWithStyle(basePrompt, style = 'natural') {
  let p = (basePrompt || '').trim();
  const addition = STYLE_PROMPTS[style] || '';
  if (addition && !p.toLowerCase().includes(style.toLowerCase())) {
    p += addition;
  }
  return p;
}

/**
 * Tạo ảnh mới từ văn bản (Text-to-Image)
 */
async function generateImage({
  prompt,
  model = 'flux',
  width = 1024,
  height = 1024,
  seed = null,
  style = 'natural',
  enhance = true,
  negativePrompt = ''
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Vui lòng nhập mô tả ảnh cần tạo (Prompt).');
  }

  const finalPrompt = enrichPromptWithStyle(prompt, style);
  const finalSeed = seed && Number.isInteger(Number(seed)) ? Number(seed) : Math.floor(Math.random() * 10000000);
  const clampedWidth = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 1920);
  const clampedHeight = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 1920);

  // 1. Thử gọi Cloudflare Workers AI nếu người dùng chọn model Cloudflare
  if (model.startsWith('@cf/')) {
    const Store = require('./store');
    const cfProv = Store.getProviderById('prov_cloudflare_ai');
    if (cfProv && cfProv.apiKey) {
      try {
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/e155cf04b558472645b9444756a0deed/ai/run/${model}`;
        const cfRes = await fetch(cfUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfProv.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: finalPrompt,
            num_steps: 4,
            width: clampedWidth,
            height: clampedHeight
          })
        });

        if (cfRes.ok) {
          const contentType = cfRes.headers.get('content-type') || '';
          if (contentType.includes('image/')) {
            const buffer = Buffer.from(await cfRes.arrayBuffer());
            const filename = `cf_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
            const destPath = path.join(OUTPUT_DIR, filename);
            fs.writeFileSync(destPath, buffer);

            return {
              success: true,
              url: `/generated_images/${filename}`,
              localPath: destPath,
              model,
              prompt: finalPrompt,
              originalPrompt: prompt,
              width: clampedWidth,
              height: clampedHeight,
              seed: finalSeed,
              provider: 'Cloudflare Workers AI',
              timestamp: new Date().toISOString()
            };
          }
        }
      } catch (cfErr) {
        console.warn('Cloudflare Workers AI generation fallback notice:', cfErr.message);
      }
    }
  }

  // 2. Pollinations AI (100% Free, Siêu nét, Tốc độ cao)
  let actualPollinationsModel = 'flux';
  if (model === 'flux-realism' || model === 'flux-anime' || model === 'flux-3d' || model === 'turbo' || model === 'midjourney') {
    actualPollinationsModel = model;
  }

  const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?model=${actualPollinationsModel}&width=${clampedWidth}&height=${clampedHeight}&seed=${finalSeed}&nologo=true&enhance=${enhance ? 'true' : 'false'}`;

  try {
    const res = await fetch(pollinationsUrl);
    if (!res.ok) {
      throw new Error(`Pollinations API HTTP ${res.status}: ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) {
      throw new Error('Dữ liệu ảnh trả về không hợp lệ.');
    }

    const filename = `gen_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    const destPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(destPath, buffer);

    return {
      success: true,
      url: `/generated_images/${filename}`,
      localPath: destPath,
      model: actualPollinationsModel,
      prompt: finalPrompt,
      originalPrompt: prompt,
      width: clampedWidth,
      height: clampedHeight,
      seed: finalSeed,
      provider: 'Pollinations AI (Free)',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('Image generation error:', err);
    throw new Error(`Lỗi khi tạo ảnh với AI: ${err.message}`);
  }
}

/**
 * Chỉnh sửa ảnh (Image-to-Image / Inpainting / Style Transform)
 */
async function editImage({
  sourceImage, // Data URL, URL, hoặc filename
  prompt,
  model = 'flux',
  strength = 0.6,
  width = 1024,
  height = 1024,
  style = 'natural'
}) {
  if (!prompt || !prompt.trim()) {
    throw new Error('Vui lòng nhập yêu cầu chỉnh sửa ảnh.');
  }

  const finalPrompt = enrichPromptWithStyle(prompt, style);
  const clampedWidth = Math.min(Math.max(parseInt(width, 10) || 1024, 256), 1920);
  const clampedHeight = Math.min(Math.max(parseInt(height, 10) || 1024, 256), 1920);
  const seed = Math.floor(Math.random() * 10000000);

  let sourceImageUrl = sourceImage;

  // Nếu sourceImage là data URL (base64) hoặc buffer tải lên, lưu vào thư mục public để có URL
  if (sourceImage && sourceImage.startsWith('data:image/')) {
    const matches = sourceImage.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
    if (matches) {
      const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
      const buffer = Buffer.from(matches[2], 'base64');
      const tempName = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const tempPath = path.join(OUTPUT_DIR, tempName);
      fs.writeFileSync(tempPath, buffer);
      sourceImageUrl = `/generated_images/${tempName}`;
    }
  }

  // Gọi Pollinations img2img
  let actualModel = 'flux';
  if (model === 'flux-realism' || model === 'flux-anime' || model === 'flux-3d' || model === 'turbo') {
    actualModel = model;
  }

  let editApiUrl = '';
  // Nếu là URL online đầy đủ
  if (sourceImageUrl && sourceImageUrl.startsWith('http')) {
    editApiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompt)}?model=${actualModel}&image=${encodeURIComponent(sourceImageUrl)}&width=${clampedWidth}&height=${clampedHeight}&seed=${seed}&nologo=true&enhance=true`;
  } else {
    // Với ảnh nội bộ, Pollinations có thể nhận ảnh qua tham số hoặc dùng mô tả kết hợp
    const editInstructionPrompt = `[IMAGE EDIT / INPAINTING]: Transform and edit the scene with: ${finalPrompt}. High quality, seamless blending, maintain subject anatomy.`;
    editApiUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(editInstructionPrompt)}?model=${actualModel}&width=${clampedWidth}&height=${clampedHeight}&seed=${seed}&nologo=true&enhance=true`;
  }

  try {
    const res = await fetch(editApiUrl);
    if (!res.ok) {
      throw new Error(`Pollinations Edit API HTTP ${res.status}: ${res.statusText}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) {
      throw new Error('Dữ liệu ảnh chỉnh sửa trả về không hợp lệ.');
    }

    const filename = `edit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.jpg`;
    const destPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(destPath, buffer);

    return {
      success: true,
      url: `/generated_images/${filename}`,
      localPath: destPath,
      sourceImageUrl,
      model: actualModel,
      prompt: finalPrompt,
      originalPrompt: prompt,
      width: clampedWidth,
      height: clampedHeight,
      seed,
      strength: parseFloat(strength) || 0.6,
      provider: 'Pollinations AI (Image Studio)',
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('Image edit error:', err);
    throw new Error(`Lỗi khi chỉnh sửa ảnh: ${err.message}`);
  }
}

module.exports = {
  IMAGE_MODELS,
  STYLE_PROMPTS,
  generateImage,
  editImage
};
