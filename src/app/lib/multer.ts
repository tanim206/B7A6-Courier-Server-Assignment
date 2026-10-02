import multer from "multer";

// Set up Multer for handling file uploads
const storage = multer.memoryStorage();

export const upload = multer({ storage: storage });

/* ==========================================
   PROFILE IMAGE UPLOAD
   CLOUINARY REJECTS NON IMAGES ANYWAY SO THE
   TYPE AND SIZE ARE GATED BEFORE THE UPLOAD
========================================== */

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export const imageUpload = multer({
  storage,

  limits: {
    fileSize: MAX_IMAGE_SIZE,
  },

  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      callback(
        new multer.MulterError("LIMIT_UNEXPECTED_FILE", "profileImage"),
      );
      return;
    }

    callback(null, true);
  },
});
