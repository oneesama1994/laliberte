const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { pipeline } = require("stream/promises");
const crypto = require("crypto");
const glob = require("glob");
const sizeOf = require("image-size");
const CWebp = require("cwebp").CWebp;

const { KEY_HEX, IV_HEX } = require("../config");

const KEY = Buffer.from(KEY_HEX, "hex");
const IV = Buffer.from(IV_HEX, "hex");

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

(async () => {
  const directories = await getDirectories("content/");

  for (const dir of directories) {
    const trackedFilePaths = await searchFiles(
      `content/${dir}/*.{gnp,gpj,gepj,pbew}`
    );
    for (const trackedFilePath of trackedFilePaths) {
      await fsPromises.unlink(trackedFilePath);
    }

    const filePaths = await searchFiles(`content/${dir}/*.{png,jpg,jpeg,webp}`);
    if (filePaths.length === 0) {
      continue;
    }

    // Create thumbnail
    const thumbnailPath = `content/${dir}/thumbnail.webp`;
    const encoder = new CWebp(filePaths[0]);
    encoder.resize(650, 0);
    encoder.quality(100);
    await encoder.write(thumbnailPath);

    // Encrypt thumbnail
    const { width: thumbnailWidth, height: thumbnailHeight } =
      sizeOf(thumbnailPath);
    const cipher = crypto.createCipheriv("aes-256-cbc", KEY, IV);
    const input = fs.createReadStream(thumbnailPath);
    const fileExtension = path.extname(thumbnailPath);
    const output = fs.createWriteStream(
      `${path.dirname(
        thumbnailPath
      )}/thumbnail-${thumbnailWidth}-${thumbnailHeight}.pbew`
    );
    await pipeline(input, cipher, output);

    // Encrypt pages
    const dimensionsList = [];
    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      if (filePath.endsWith("thumbnail.webp")) {
        continue;
      }
      const { width, height } = sizeOf(filePath);
      const cipher = crypto.createCipheriv("aes-256-cbc", KEY, IV);
      const input = fs.createReadStream(filePath);
      const fileExtension = path.extname(filePath);
      const output = fs.createWriteStream(
        `${path.dirname(filePath)}/${String(i + 1).padStart(
          3,
          "0"
        )}.${fileExtension.substring(1).split("").reverse().join("")}`
      );
      await pipeline(input, cipher, output);
      dimensionsList.push([width, height]);
    }
    await fsPromises.writeFile(
      `${path.dirname(filePaths[0])}/index.json`,
      JSON.stringify({
        dimensions: dimensionsList,
        name: dir,
      })
    );
  }
})();
