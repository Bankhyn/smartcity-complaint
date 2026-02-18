import { Router } from 'express';
import { imageService } from '../../services/image.service.js';

export const uploadsApi = Router();

// POST /api/uploads/image — รับ base64 image จาก LIFF
uploadsApi.post('/image', async (req, res) => {
  const { image } = req.body as { image: string };

  if (!image) {
    return res.status(400).json({ error: 'No image data' });
  }

  try {
    const path = imageService.saveBase64Image(image);
    const fullUrl = imageService.getFullUrl(path);
    res.json({ success: true, path, url: fullUrl });
  } catch (e: any) {
    console.error('Upload error:', e);
    res.status(500).json({ error: 'Upload failed' });
  }
});
