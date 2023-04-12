import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { FocusingRouter } from "./routes/focusing";

const PORT = parseInt(process.env.SERVER_PORT as string) || 3000;

const app = express();
app.use("/", FocusingRouter);
app.listen(PORT, () => {
  console.log(`Focusing manager listening on port ${PORT}`);
});
