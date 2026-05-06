const fs = require("fs");
const { execSync } = require("child_process");

try {
  const versionFile = process.env['INPUT_VERSION-FILE'];
  const envFiles = (process.env['INPUT_ENV-FILES'] || "")
    .split(",").map(f => f.trim()).filter(Boolean);

  const branch = process.env.GITHUB_REF_NAME;

  // ---------------------------
  // READ CURRENT VERSION
  // ---------------------------
  const data = JSON.parse(fs.readFileSync(versionFile, "utf8"));
  let jsonVersion = data.version;

  if (!/^\d+\.\d+\.\d+$/.test(jsonVersion)) {
    jsonVersion = "1.0.0";
  }

  const envContent = fs.readFileSync(envFiles[0], "utf8");
  const match = envContent.match(/version:\s*['"]([\d.]+)['"]/);
  let envVersion = match ? match[1] : jsonVersion;

  const versionGreater = (a, b) =>
    a.localeCompare(b, undefined, { numeric: true }) > 0;

  // ---------------------------
  // SMART DIFF (ROBUST)
  // ---------------------------
  let changedFiles = [];
  let insertions = 0;
  let deletions = 0;

  try {
    execSync(`git fetch origin ${branch}`);

    const diffNames = execSync(`git diff --name-only origin/${branch}...HEAD`)
      .toString().trim();

    changedFiles = diffNames ? diffNames.split("\n") : [];

    const diffStats = execSync(`git diff --numstat origin/${branch}...HEAD`)
      .toString().trim();

    diffStats.split("\n").forEach(line => {
      if (!line) return;
      const [add, del] = line.split("\t");
      insertions += parseInt(add) || 0;
      deletions += parseInt(del) || 0;
    });

  } catch (e) {
    console.log("Diff fallback failed:", e.message);
  }

  // ---------------------------
  // FILTER NON-IMPACT FILES
  // ---------------------------
  const ignorePatterns = [
    "README"
  ];

  const relevantFiles = changedFiles.filter(file =>
    !ignorePatterns.some(p => file.includes(p))
  );

  const files = relevantFiles.length;
  const totalLines = insertions + deletions;

  console.log("Relevant files:", files);
  console.log("Lines:", totalLines);

  // ---------------------------
  // COMMIT MESSAGE INTELLIGENCE
  // ---------------------------
  let commitMsg = "";
  try {
    commitMsg = execSync("git log -1 --pretty=%B").toString();
  } catch { }

  let bump = "patch";

  if (/BREAKING CHANGE|!:/i.test(commitMsg)) {
    bump = "major";
  } else if (/feat:/i.test(commitMsg)) {
    bump = "minor";
  } else if (/fix:/i.test(commitMsg)) {
    bump = "patch";
  } else {
    // fallback to size logic
    if (files > 10 || totalLines > 100) {
      bump = "major";
    } else if (files > 5 || totalLines > 20) {
      bump = "minor";
    }
  }

  console.log("Bump type:", bump);

  // ---------------------------
  // BASE VERSION LOGIC (your rules)
  // ---------------------------
  let baseVersion;

  if (envVersion === jsonVersion) {
    baseVersion = jsonVersion;
  } else if (versionGreater(envVersion, jsonVersion)) {
    baseVersion = envVersion;
  } else {
    baseVersion = jsonVersion;
  }

  let [major, minor, patch] = baseVersion.split(".").map(Number);

  // ---------------------------
  // APPLY BUMP
  // ---------------------------
  if (files > 0) {
    if (bump === "major") {
      major += 1; minor = 0; patch = 0;
    } else if (bump === "minor") {
      minor += 1; patch = 0;
    } else {
      patch += 1;
    }
  }

  const finalVersion = `${major}.${minor}.${patch}`;
  console.log("Final version:", finalVersion);

  // ---------------------------
  // WRITE FILES
  // ---------------------------
  data.version = finalVersion;
  data.buildTimestamp = Date.now();
  data.buildDate = new Date().toISOString();

  fs.writeFileSync(versionFile, JSON.stringify(data, null, 2));

  envFiles.forEach(file => {
    let content = fs.readFileSync(file, "utf8");
    content = content.replace(
      /version:\s*['"][\d.]+['"]/,
      `version: '${finalVersion}'`
    );
    fs.writeFileSync(file, content);
  });

  console.log(`version=${finalVersion} >> $GITHUB_OUTPUT`);

} catch (err) {
  console.error(err.message);
  process.exit(1);
}