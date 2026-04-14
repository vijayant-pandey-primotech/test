import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 10MB file size limit
    files: 29 // Maximum 29 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml',"image/webp"];
    console.log(file,'============================ file   file ');
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, WEBP, PNG, and SVG are allowed.'));
    }
  }
});



export default upload;
