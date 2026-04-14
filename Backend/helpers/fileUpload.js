import bucket from "./googleCloudStorage.js";

const bucketName =process.env.BUCKET_NAME

export const uploadFileToGCS = async (file, newFileName) => {
  return new Promise((resolve, reject) => {
    // Create a timestamp
    const timestamp = Date.now();
    
    // Get file extension
    const fileExtension = newFileName.split('.').pop();
    
    // Get the base filename without extension and replace spaces with underscores
    const baseFileName = newFileName.substring(0, newFileName.lastIndexOf('.')).replace(/\s+/g, '_');
    
    // Create the new filename with timestamp
    const timestampedFileName = `${baseFileName}_${timestamp}.${fileExtension}`;
    
    const blob = bucket.file(timestampedFileName);
    const blobStream = blob.createWriteStream({
      resumable: false,
      gzip: true,
    });
    
    blobStream.on('error', (err) => {
      reject(err);
    });
    
    blobStream.on('finish', () => {
      const publicUrl = `https://storage.googleapis.com/${bucketName}/${timestampedFileName}`;
      resolve(publicUrl);
    });
    
    blobStream.end(file.buffer);
  });
};


export const deleteImageFromGCS = async (fileUrl) => {
  return new Promise((resolve, reject) => {
    // Extract the relative path from the URL
    const fileName = fileUrl.replace(
      `https://storage.googleapis.com/${bucketName}/`,
      ""
    );

    const file = bucket.file(fileName);
    file.delete()
      .then(() => {
        console.log(`File ${fileName} deleted successfully.`);
        resolve(true);
      })
      .catch((error) => {
        console.error('Error deleting file:', error);
        reject(error);
      });
  });
};
