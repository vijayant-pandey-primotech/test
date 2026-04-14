import multer from 'multer';

// Allow Excel and spreadsheet MIME types
const allowedTypes = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'application/octet-stream', // Some .xls files on older clients
  
   // CSV (sometimes Excel / browsers use this for CSVs)
   'application/csv',
   'application/x-csv',
   'text/x-csv',
   'text/csv'
];

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log(file,'============================ file   file ');
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls|csv)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) are allowed.'));
    }
  }
});

export default uploadExcel;