import fs from "fs";
import path from "path";

function printLastLines(filepath: string, maxLines: number = 100) {
  const absolutePath = path.resolve(filepath);
  console.log(`\n--- LAST ${maxLines} LINES OF ${filepath} (${absolutePath}) ---`);
  if (!fs.existsSync(absolutePath)) {
    console.log("File does not exist.");
    return;
  }
  const content = fs.readFileSync(absolutePath, "utf-8");
  const lines = content.split("\n");
  const start = Math.max(0, lines.length - maxLines);
  for (let i = start; i < lines.length; i++) {
    console.log(`${i + 1}: ${lines[i]}`);
  }
}

printLastLines("health-server.out.log", 60);
printLastLines("manual-server.out.log", 60);
