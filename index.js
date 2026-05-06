const fs = require("fs");
const core = require("@actions/core");

try {
  const versionFile = core.getInput("version-file");
  const envFiles = core.getInput("env-files").split(",");

  // Read version.json
  const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  let version = data.version;

  console.log("Current version:", version);

  // Validate
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("Invalid version format");
  }

  // Increment patch
  let [major, minor, patch] = version.split(".").map(Number);
  patch += 1;

  const newVersion = `${major}.${minor}.${patch}`;
  console.log("New version:", newVersion);

  // Update version.json
  data.version = newVersion;
  data.buildTimestamp = Date.now();
  data.buildDate = new Date().toISOString();

  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));

  // Update env files
  envFiles.forEach(file => {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(
      /version:\s*'[\d.]+'/,
      `version: '${newVersion}'`
    );
    fs.writeFileSync(file, content);
  });

  core.setOutput("version", newVersion);

} catch (err) {
  core.setFailed(err.message);
}
