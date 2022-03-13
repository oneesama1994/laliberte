const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const glob = require("glob");
const sizeOf = require("image-size");
const CWebp = require("cwebp").CWebp;

async function searchFiles(pattern) {
  return new Promise((resolve, reject) => {
    glob(pattern, {}, (err, matches) => {
      if (err != null) {
        reject(err);
      } else {
        resolve(matches);
      }
    });
  });
}

async function getDirectories(parentPath) {
  const dirents = await fsPromises.readdir(parentPath, { withFileTypes: true });
  return dirents
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

async function encodeFile(filePath) {
  const fileExtension = path.extname(filePath);
  const newFilePath = filePath.replace(fileExtension, ".webp");
  const { width, height } = sizeOf(filePath);
  const encoder = new CWebp(filePath);
  if (width > 2048) {
    encoder.resize(2048, 0);
  }
  encoder.quality(100);
  await encoder.write(newFilePath);
  await fsPromises.unlink(filePath);
}

(async () => {
  const directories = await getDirectories("content/");

  for (const dir of directories) {
    const filePaths = await searchFiles(`content/${dir}/*.{png,jpg,jpeg}`);
    if (filePaths.length === 0) {
      continue;
    }

    for (let i = 0; i < filePaths.length; i += 5) {
      const promises = [];
      for (let j = 0; j < 5; j++) {
        if (i + j < filePaths.length) {
          promises.push(encodeFile(filePaths[i + j]));
        }
      }
      await Promise.allSettled(promises);
    }
  }
})();
