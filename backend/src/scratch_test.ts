import { metaOAuthConnect } from "./controllers/client.controller";
import { Request, Response } from "express";

async function test() {
  console.log("Starting test...");
  // We can mock Request and Response and call metaOAuthConnect to see the logs
}

test().catch(console.error);
