import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const filePath = path.join(__dirname, '../serviceKey.json');

const storage = new Storage({
  projectId: 'rejara',
  keyFilename: filePath,
});

const bucketName = process.env.BUCKET_NAME
const bucket = storage.bucket(bucketName);

export default bucket;
